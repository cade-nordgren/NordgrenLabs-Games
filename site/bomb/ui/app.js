// Bomb: setup, saves, the one-phone driver and the online driver. Rules live in ../engine; screens in ./screens.js
// draw from a view plus a send(action). One phone sends to the engine here; online sends through ./net.js.
import { MAX_PLAYERS, MIN_PLAYERS, allowedDecks } from '../engine/cards.js';
import { createGame, reduce } from '../engine/reducer.js';
import { viewFor } from '../engine/view.js';
import { STYLES, style, styleLabel, freeStyle } from './styles.js';
import { toggle, keepPlayable, canPlaySel, readGame, cleanArt, decksFor, listOf, plural, minutes, MAX_NAME,
  choosingSeat, leavers, firstLine, rankName } from './logic.js';
import { $, el, still, say, back, toast, handoffScreen, chooseScreen, waitScreen, tableScreen,
  snapshot, animate, clearFlyers, resultsScreen, stopResults, DECKS, deckPreview, avatar } from './screens.js';
import { createNet, browserAuth, reasonText } from './net.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] | 0;
const nowIso = () => new Date().toISOString();
const tpl = id => $(id).content.firstElementChild.cloneNode(true);

// ---- State, autosaved on every render. It belongs to whoever was signed in (owner), so a game in progress never
// shows to the next person on this browser. game holds the engine state, names, styles and screen flags.
const KEY = 'nl-bomb-v1', ROOM = 'nl-bomb-room';
const fresh = () => ({ v: 1, owner: NL.person(), mode: 'local', roster: [], decks: null, art: cleanArt(), me: { name: '', style: 'cobalt' }, oDecks: null, game: null });
let S = fresh();
const okPerson = p => p && typeof p.name === 'string' && p.name.length <= MAX_NAME && !!style(p.style);
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && s.v === 1 && (!s.owner || s.owner === S.owner)) { // another person's autosave stays unread
    if (s.mode === 'online') S.mode = 'online';
    if (Array.isArray(s.roster)) S.roster = s.roster.filter(okPerson).slice(0, MAX_PLAYERS).map(p => ({ name: p.name, style: p.style }));
    S.roster = S.roster.filter((p, i) => S.roster.findIndex(q => q.style === p.style) === i);
    if ([1, 2, 3, 4].includes(s.decks)) S.decks = s.decks;
    S.art = cleanArt(s.art);
    if ([1, 2, 3, 4].includes(s.oDecks)) S.oDecks = s.oDecks;
    if (okPerson(s.me)) S.me = { name: s.me.name, style: s.me.style };
    S.game = readGame(s.game); // stored data is a trust boundary: checkState and the roster are checked
  }
} catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const me0 = NL.identity();
const prefill = i => {
  if (!i?.displayName) return;
  const n = i.displayName.slice(0, MAX_NAME);
  if (!S.roster.length && !S.game) S.roster.push({ name: n, style: 'cobalt' });
  if (!S.me.name) S.me.name = n;
};
prefill(me0);
NL.ready.then(i => { if (!me0) { prefill(i); render(); } });
NL.account($('account'));

// ---- Screen flags that are never saved: whoever holds the phone has not pressed Ready after a load.
let ready = false, from = null, sel = [], choose = { key: '', picks: [null, null, null, null], on: null };
let holdUntil = 0, revealPending = false, prevView = null, busy = false;

// ---- One phone
function startLocal(names, styles, decks, art) {
  stopResults();
  S.game = { g: createGame({ players: names.length, decks, seed: newSeed() }), names, styles, art: cleanArt(art), desc: names.map(() => false),
    saveId: null, createdAt: null, startedAt: null, endedAt: null };
  ready = false; from = null; sel = []; prevView = null; holdUntil = 0;
  render();
}
const people = () => S.game.names.map((name, i) => ({ name, style: S.game.styles[i] }));

function localSend(action) {
  const G = S.game, g = G.g;
  const seat = g.phase === 'choose' ? choosingSeat(g) : g.turn;
  const a = action.type === 'next' ? action : { ...action, seat };
  const n = reduce(g, a);
  if (n === g) return false;
  // Hide the hand when the phone changes hands: Next Turn to another seat, or a confirmed face-up choice.
  if (a.type === 'next' && g.pending.next !== g.turn) { ready = false; from = g.turn; }
  if (a.type === 'confirm') { ready = false; from = seat; }
  if (g.phase === 'choose' && n.phase === 'play') G.startedAt = nowIso();
  if (g.phase !== 'over' && n.phase === 'over') { G.endedAt = nowIso(); endingSoon(); if (G.saveId) saveGame().catch(() => {}); }
  G.g = n;
  sel = [];
  render();
  return true;
}
// The last move plays out on the table before the results (no Next Turn needed).
function endingSoon() {
  revealPending = true;
  holdUntil = Date.now() + (still() ? 600 : 2400); // room for a face-down flip and the full BOMB!
  setTimeout(render, holdUntil - Date.now() + 20);
}

function localScreen() {
  const G = S.game, g = G.g, ps = people();
  if (g.phase === 'choose') {
    const seat = choosingSeat(g);
    if (!ready) return { page: 'handoff', view: viewFor(g, null), ps, seat, choosing: true };
    return { page: 'choose', view: viewFor(g, seat), ps, seat };
  }
  if (g.phase === 'over') {
    if (Date.now() < holdUntil) return { page: 'table', view: viewFor(g, g.winner), ps, seat: g.winner };
    return { page: 'results', view: viewFor(g, null), ps, seat: null };
  }
  if (!ready) return { page: 'handoff', view: viewFor(g, null), ps, seat: g.turn };
  return { page: 'table', view: viewFor(g, g.turn), ps, seat: g.turn };
}

// ---- Online. The server holds the game; this browser keeps the room it is in (to offer a rejoin) and its view.
let O = { view: null, error: '', notice: '', net: 'ok' };
const net = createNet({
  fetch: (...a) => fetch(...a), auth: browserAuth, doc: document, win: window,
  onView: view => {
    if (!view) return;
    const was = O.view?.game, now = view.game;
    if (was && now && was.phase === 'play' && now.phase === 'over') endingSoon();
    if (was && now && was.phase === 'choose' && now.phase === 'play') toast(firstLine(now, view.room.seats.map(s => s.name), view.you));
    const gone = leavers(O.view?.room, view.room);
    if (gone.length) { O.notice = `${listOf(gone)} left.${view.room.phase === 'lobby' && O.view.room.phase !== 'lobby' ? ' Back in the lobby.' : ''}`; say(O.notice); }
    else if (O.view?.room.seats.length !== view.room.seats.length) O.notice = '';
    O.view = view;
    remember({ id: view.room.id, code: view.room.code });
    render();
  },
  onState: s => { O.net = s; render(); },
  // Signed out or no server: the seat is still there, so keep the room to rejoin. 404: the room is gone for good.
  onGone: why => { leaveRoom(why ? reasonText(why) : 'That room is gone: everyone left, or it was idle for a day.', !!why); },
});
const roomMemory = () => { try { const r = JSON.parse(localStorage.getItem(ROOM)); return r && UUID.test(r.id) && /^[A-Z]{6}$/.test(r.code) ? r : null; } catch { return null; } };
function remember(r) {
  try {
    localStorage.setItem(ROOM, JSON.stringify(r));
    sessionStorage.setItem('nl-bomb-in-room', r.id);
  } catch {}
}
function forgetRoom() { try { localStorage.removeItem(ROOM); sessionStorage.removeItem('nl-bomb-in-room'); } catch {} }
function leaveRoom(message = '', keep = false) {
  net.close();
  if (!keep) forgetRoom();
  O = { view: null, error: message, notice: '', net: 'ok' };
  sel = []; prevView = null;
  render();
}
const onlinePeople = () => O.view.room.seats.map(s => ({ name: s.name, style: s.style }));

function onlineScreen() {
  const v = O.view, g = v.game, ps = onlinePeople();
  if (v.room.phase === 'lobby' || !g) return { page: 'lobby', ps };
  if (g.phase === 'choose') {
    return g.you.canArrange ? { page: 'choose', view: g, ps, seat: v.you } : { page: 'wait', view: g, ps, seat: v.you };
  }
  if (g.phase === 'over' && Date.now() >= holdUntil) return { page: 'results', view: g, ps, seat: v.you };
  return { page: 'table', view: g, ps, seat: v.you };
}

async function onlineSend(action) {
  if (busy) return false;
  busy = true;
  let r = await net.send(action);
  // Everyone chooses face-up cards at once, so another seat's choice often lands first; this seat's own choice still
  // applies to the new version, so send it once more.
  if (!r.ok && r.reason === 'stale' && (action.type === 'arrange' || action.type === 'confirm')) r = await net.send(action);
  busy = false;
  if (!r.ok) { O.error = reasonText(r.reason); say(O.error); render(); }
  return r.ok;
}
const send = action => inRoom() ? onlineSend(action) : localSend(action);
const inRoom = () => S.mode === 'online' && !!O.view;

async function enterRoom(kind) {
  const name = S.me.name.trim();
  if (!name) { O.error = 'Enter your name first.'; render(); $('meName').focus(); return; }
  if (busy) return;
  busy = true; O.error = ''; render();
  const code = $('joinCode').value.trim().toUpperCase();
  const r = kind === 'create' ? await net.create({ name, style: S.me.style, decks: S.oDecks || 1 })
    : await net.join({ code, name, style: S.me.style });
  busy = false;
  if (!r.ok) { O.error = reasonText(r.reason); render(); return; }
  O.error = '';
  render();
}

// ---- Rendering
const PAGES = ['setupPage', 'lobbyPage', 'handoffPage', 'choosePage', 'waitPage', 'tablePage', 'resultsPage'];
let lastPage = '';
function render() {
  save();
  const keep = document.activeElement?.closest('main') ? document.activeElement.dataset.k || document.activeElement.id : null;
  const scr = inRoom() ? onlineScreen() : S.game && S.mode === 'local' ? localScreen() : { page: 'setup' };
  const page = scr.page + 'Page';
  const snap = page === 'tablePage' ? snapshot() : null;
  for (const id of PAGES) $(id).hidden = id !== page;
  const local = !inRoom() && !!S.game;
  $('exitBtn').hidden = !local;
  $('restart').hidden = !local || S.game.g.phase === 'over';
  $('leaveBtn').hidden = !inRoom();
  $('conn').hidden = !(inRoom() && O.net === 'offline');
  $('rulesModeTitle').textContent = inRoom() ? 'Online' : 'On one phone';
  $('rulesMode').textContent = inRoom() ? 'Everyone plays on their own phone. Your turn passes on by itself as soon as you play or pick up.'
    : 'After you play, your cards lock. Tap Next turn and pass the phone; the next player taps Ready to play. After a 2, a 10 or a bomb you keep the phone and play on.';
  // Private cards leave the DOM with their screen, so a hidden page never holds the last player's hand.
  if (page !== 'tablePage') { prevView = null; $('tray').replaceChildren(); $('mySpots').replaceChildren(); clearFlyers(); }
  if (page !== 'choosePage') { $('chooseNine').replaceChildren(); $('chooseTable').replaceChildren(); }
  ({ setup: renderSetup, lobby: renderLobby, handoff: renderHandoff, choose: renderChoose, wait: renderWait,
    table: () => renderTable(scr, snap), results: renderResults })[scr.page](scr);
  if (page !== lastPage) { window.scrollTo(0, 0); if (lastPage) focusPage(page); }
  else if (keep) { const k = document.querySelector(`#${page} [data-k="${keep}"]`) || $(keep); if (k && document.activeElement !== k && !k.hidden) k.focus({ preventScroll: true }); }
  lastPage = page;
}
// A new screen: focus its main control, so keyboard and screen reader users land somewhere useful.
function focusPage(page) {
  if (document.querySelector('dialog[open]')) return;
  const t = { handoffPage: 'ready', choosePage: 'chooseTitle', tablePage: 'status', resultsPage: 'winTitle', lobbyPage: 'roomCode' }[page];
  const e = t && $(t);
  if (!e || e.hidden) return;
  if (!/^(BUTTON|INPUT|A)$/.test(e.tagName)) e.tabIndex = -1;
  e.focus({ preventScroll: true });
}

// ---- Setup
const showMode = NL.segmented($('modeSeg'), v => { S.mode = v; O.error = ''; render(); if (v === 'online') $('meName').value ||= S.me.name; });
function renderSetup() {
  showMode(S.mode);
  $('localSetup').hidden = S.mode !== 'local';
  $('onlineSetup').hidden = S.mode !== 'online';
  S.mode === 'local' ? renderLocalSetup() : renderOnlineSetup();
}
function styleButton(btn, person, label) {
  btn.replaceChildren(avatar(el('span', 'av'), person));
  btn.setAttribute('aria-label', `${label}: ${styleLabel(style(person.style))}. Change`);
}
function renderLocalSetup() {
  const n = S.roster.length;
  $('roster').replaceChildren(...S.roster.map((p, i) => {
    const li = el('li'), pick = el('button', 'pick'), input = el('input'), rm = el('button', 'circle remove');
    styleButton(pick, p, `${p.name || `Player ${i + 1}`}'s colour`);
    pick.dataset.k = `style${i}`;
    pick.onclick = () => openStyles(p.style, S.roster.filter((_, j) => j !== i), id => { p.style = id; render(); }, p.name || `Player ${i + 1}`);
    input.value = p.name; input.maxLength = MAX_NAME;
    input.dataset.k = `name${i}`;
    input.setAttribute('aria-label', `Player ${i + 1} name`);
    input.oninput = () => { p.name = input.value; save(); gate(); };
    rm.append(tpl('xIcon'));
    rm.dataset.k = `rm${i}`;
    rm.setAttribute('aria-label', `Remove ${p.name || 'player ' + (i + 1)}`);
    rm.onclick = () => { S.roster.splice(i, 1); render(); };
    li.append(pick, input, rm);
    return li;
  }));
  $('add').hidden = n >= MAX_PLAYERS;
  $('rosterCount').textContent = `${n} of ${MAX_PLAYERS}`;
  const d = decksFor(n, S.decks), ok = allowedDecks(Math.max(MIN_PLAYERS, n));
  $('decksOut').textContent = d;
  $('decksDown').disabled = d <= ok[0];
  $('decksUp').disabled = d >= ok.at(-1);
  $('decksNote').textContent = `${d * 52} cards. Every player needs 13, so 1 deck suits 2 or 3 players and 2 decks suit 4 to 6. Up to 4 decks.`;
  drawArt($('artSlots'), d, S.art, i => openDecks(i, S.art[i], id => { S.art[i] = id; render(); }));
  gate();
  drawSaves();
  function gate() {
    const ok2 = S.roster.length >= MIN_PLAYERS && S.roster.every(p => p.name.trim());
    $('start').disabled = !ok2;
    $('startHint').textContent = S.roster.length < MIN_PLAYERS ? `Add ${MIN_PLAYERS - S.roster.length === 2 ? 'two players' : 'one more player'} to start.`
      : !ok2 ? 'Every player needs a name.' : 'Digital cards only. Whoever holds the most 3s after choosing goes first.';
  }
}
function stepDecks(dir, n, cur) {
  const ok = allowedDecks(Math.max(MIN_PLAYERS, n)), i = ok.indexOf(cur);
  return ok[Math.max(0, Math.min(ok.length - 1, i + dir))];
}
$('decksDown').onclick = () => { S.decks = stepDecks(-1, S.roster.length, decksFor(S.roster.length, S.decks)); render(); };
$('decksUp').onclick = () => { S.decks = stepDecks(1, S.roster.length, decksFor(S.roster.length, S.decks)); render(); };
$('add').onsubmit = e => {
  e.preventDefault();
  const name = $('newName').value.trim();
  if (!name || S.roster.length >= MAX_PLAYERS) return;
  S.roster.push({ name: name.slice(0, MAX_NAME), style: freeStyle(S.roster.map(p => p.style)) });
  $('newName').value = '';
  render();
  if (S.roster.length < MAX_PLAYERS) $('newName').focus();
};
$('start').onclick = () => {
  const r = S.roster.map(p => ({ ...p, name: p.name.trim() }));
  if (r.length < MIN_PLAYERS || r.some(p => !p.name)) return;
  S.roster = r;
  startLocal(r.map(p => p.name), r.map(p => p.style), decksFor(r.length, S.decks), S.art);
};

function renderOnlineSetup() {
  const mem = roomMemory();
  $('onlineNote').textContent = O.error;
  $('onlineNote').hidden = !O.error;
  $('onlineNote').classList.toggle('err', !!O.error);
  $('rejoinBox').hidden = !mem;
  if (mem) $('rejoinNote').textContent = `You were in room ${mem.code}. Your seat is kept while the game lasts.`;
  styleButton($('mePick'), S.me, 'Your colour');
  if (document.activeElement !== $('meName')) $('meName').value = S.me.name;
  const d = S.oDecks || 1;
  $('oDecksOut').textContent = d;
  $('oDecksDown').disabled = d <= 1;
  $('oDecksUp').disabled = d >= 4;
  for (const id of ['create', 'join', 'rejoin']) $(id).disabled = busy;
}
$('meName').oninput = () => { S.me.name = $('meName').value; save(); };
$('mePick').onclick = () => openStyles(S.me.style, [], id => { S.me.style = id; render(); }, 'You');
$('oDecksDown').onclick = () => { S.oDecks = Math.max(1, (S.oDecks || 1) - 1); render(); };
$('oDecksUp').onclick = () => { S.oDecks = Math.min(4, (S.oDecks || 1) + 1); render(); };
$('create').onclick = () => enterRoom('create');
$('joinRow').onsubmit = e => {
  e.preventDefault();
  if (!/^[A-Za-z]{6}$/.test($('joinCode').value.trim())) { O.error = 'A room code is six letters.'; render(); return; }
  enterRoom('join');
};
$('rejoin').onclick = () => { const m = roomMemory(); if (m) { O.error = ''; net.open(m.id); } };
$('forget').onclick = () => { forgetRoom(); render(); };

// ---- Style picker: twelve real card backs; styles other players hold are disabled and say who has them.
let onStyle = null;
function openStyles(current, others, pick, who) {
  onStyle = pick;
  $('styleNote').textContent = `${who}. Standard decks show this colour on that player's face-down cards.`;
  $('styleGrid').replaceChildren(...STYLES.map(s => {
    const by = others.find(o => o.style === s.id);
    const b = el('button', 'opt'), c = back(s.id);
    b.setAttribute('aria-pressed', s.id === current);
    b.disabled = !!by && s.id !== current;
    b.setAttribute('aria-label', `${styleLabel(s)}${by ? `, taken by ${by.name || 'another player'}` : ''}${s.id === current ? ', chosen' : ''}`);
    b.append(c, el('b', '', s.name), el('small', '', by ? `Taken: ${by.name || 'player'}` : s.pattern));
    if (s.id === current) { const t = el('span', 'tick'); t.append(tpl('tickIcon')); b.append(t); }
    b.onclick = () => { onStyle?.(s.id); $('styleSheet').close(); };
    return b;
  }));
  $('styleSheet').showModal();
}
$('styleDone').onclick = () => $('styleSheet').close();

// ---- Lobby
function renderLobby() {
  const v = O.view, r = v.room, host = v.you === r.host, n = r.seats.length;
  $('roomCode').textContent = r.code;
  $('roomCode').setAttribute('aria-label', `Room code ${[...r.code].join(' ')}`);
  $('seatCount').textContent = `${n} of ${MAX_PLAYERS} seated`;
  const rows = r.seats.map((s, i) => {
    const li = el('li'), name = el('strong', '', s.name);
    let pick;
    if (i === v.you) {
      name.append(el('span', '', ' (you)'));
      pick = el('button', 'pick');
      styleButton(pick, s, 'Your colour');
      pick.dataset.k = 'myStyle';
      pick.onclick = () => openStyles(s.style, r.seats.filter((_, j) => j !== i), id => onlineSend({ type: 'SET_PLAYER', name: s.name, style: id }), 'You');
    } else {
      pick = el('span', 'pick');
      pick.append(avatar(el('span', 'av'), s));
      if (!s.connected) li.classList.add('off');
    }
    li.append(pick, name, el('span', 'pill', i === r.host ? 'Host' : s.connected ? 'Ready' : 'Away'));
    return li;
  });
  if (n < MAX_PLAYERS) {
    const li = el('li'), p = el('span', 'pick');
    p.append(el('span', 'open-seat'));
    li.append(p, el('span', 'cap', `Waiting for a player${n < MAX_PLAYERS - 1 ? `, ${MAX_PLAYERS - n} seats open` : ''}`));
    rows.push(li);
  }
  $('lobbySeats').replaceChildren(...rows);
  const ok = allowedDecks(Math.max(MIN_PLAYERS, n));
  $('lDecksOut').textContent = r.decks;
  $('lDecksDown').hidden = $('lDecksUp').hidden = !host;
  $('lDecksDown').disabled = busy || r.decks <= ok[0];
  $('lDecksUp').disabled = busy || r.decks >= ok.at(-1);
  $('lDecksNote').textContent = host ? `${r.decks * 52} cards. 1 deck for 2 or 3 players, 2 decks for 4 to 6.` : `${r.decks * 52} cards. The host chooses.`;
  const art = cleanArt(r.art);
  drawArt($('lArtSlots'), r.decks, art, host && !busy ? i => openDecks(i, art[i], id => onlineSend({ type: 'SET_ART', art: art.map((a, k) => k === i ? id : a) })) : null);
  $('startRoom').hidden = !host;
  $('startRoom').disabled = busy || n < 2;
  $('startRoom').textContent = n < 2 ? 'Waiting for players' : `Start game with ${n}`;
  $('lobbyWait').hidden = host;
  $('lobbyWaitText').textContent = `Waiting for ${r.seats[r.host]?.name || 'the host'} to start`;
  $('lobbyErr').textContent = O.error || O.notice;
  $('lobbyErr').classList.toggle('err', !!O.error);
  $('lobbyErr').hidden = !$('lobbyErr').textContent;
}
$('lDecksDown').onclick = () => { const r = O.view.room; onlineSend({ type: 'SET_DECKS', decks: stepDecks(-1, r.seats.length, r.decks) }); };
$('lDecksUp').onclick = () => { const r = O.view.room; onlineSend({ type: 'SET_DECKS', decks: stepDecks(1, r.seats.length, r.decks) }); };
$('startRoom').onclick = () => { O.error = ''; onlineSend({ type: 'START' }); };
// Leaving the lobby or a finished game frees the seat on the server, so nobody waits for this player.
async function leaveSeat() {
  if (busy) return;
  busy = true;
  const r = await net.send({ type: 'LEAVE' });
  busy = false;
  if (r.ok || r.reason === 'not_found') leaveRoom();
  else { O.error = reasonText(r.reason); say(O.error); render(); }
}
$('leaveLobby').onclick = leaveSeat;
const roomLink = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}?room=${O.view.room.code}`;
$('share').onclick = async () => {
  const url = roomLink();
  try {
    if (navigator.share) { await navigator.share({ title: 'Bomb', text: `Join my Bomb game: room ${O.view.room.code}`, url }); return; }
    await navigator.clipboard.writeText(url);
    note('Link copied.');
  } catch (e) { if (e?.name !== 'AbortError') note(`Copy this link: ${url}`); }
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(O.view.room.code); note('Code copied.'); } catch { note(`The code is ${O.view.room.code}.`); }
};
function note(text) { $('shareNote').textContent = text; $('shareNote').hidden = false; }

// ---- Handoff
function renderHandoff(scr) {
  handoffScreen(scr.view, scr.ps, scr.seat, { choosing: !!scr.choosing, from });
}
$('ready').onclick = () => { ready = true; sel = []; render(); };

// ---- Face-up choice
function renderChoose(scr) {
  // The nine cards tell one deal apart from the next (a rematch), so picks reset only for a new deal.
  const mine = scr.view.players[scr.seat], key = [...scr.view.you.hand, ...(mine.up || [])].map(c => c.id).sort().join();
  if (choose.key !== key) choose = { key, picks: mine.up?.length === 4 ? mine.up.map(c => c.id) : [null, null, null, null], on: null };
  const waitingNames = inRoom() ? scr.view.players.map((q, i) => !q.ready && i !== scr.seat ? scr.ps[i].name : null).filter(Boolean) : [];
  chooseScreen(scr.view, scr.ps, scr.seat, choose, {
    online: inRoom(), waitingNames, desc: handDesc(scr.seat), art: curArt(),
    onPick: id => {
      const at = choose.picks.indexOf(id);
      if (at >= 0) { choose.picks[at] = null; choose.on = null; }
      else if (choose.on !== null) { choose.picks[choose.on] = id; choose.on = null; }
      else if (choose.picks.includes(null)) choose.picks[choose.picks.indexOf(null)] = id;
      else say('Four are chosen. Tap one of them to put it back, or a table card to swap it out.');
      render();
    },
    onSlot: i => {
      if (choose.on === null) { if (choose.picks[i]) choose.on = i; }
      else if (choose.on === i) choose.on = null;
      else { [choose.picks[i], choose.picks[choose.on]] = [choose.picks[choose.on], choose.picks[i]]; choose.on = null; }
      render();
    },
    onConfirm: async () => {
      const ids = choose.picks;
      if (ids.includes(null)) return;
      if (await send({ type: 'arrange', ids })) await send({ type: 'confirm' });
    },
  });
  if (O.error && inRoom()) $('chooseNote').textContent = O.error;
}
function renderWait(scr) { waitScreen(scr.view, scr.ps, scr.seat); }

// ---- Hand order, low to high unless the player chose high to low: per player in the local game, per device online.
const ORDER = 'nl-bomb-order';
const handDesc = seat => {
  if (!inRoom()) return !!S.game.desc?.[seat];
  try { return localStorage.getItem(ORDER) === 'desc'; } catch { return false; }
};
function flipOrder(seat) {
  if (!inRoom()) { S.game.desc ||= S.game.names.map(() => false); S.game.desc[seat] = !S.game.desc[seat]; }
  else try { localStorage.setItem(ORDER, handDesc(seat) ? 'asc' : 'desc'); } catch {}
  render();
}

// ---- Table
const curArt = () => inRoom() ? cleanArt(O.view.room.art) : S.game?.art || cleanArt();
function renderTable(scr, snap) {
  const view = scr.view, me = scr.seat;
  sel = view.you ? keepPlayable(sel, view.you.playable) : [];
  const info = inRoom() ? `Room ${O.view.room.code} · ${plural(scr.ps.length, 'player')} · ${plural(view.decks, 'deck')}`
    : `${plural(scr.ps.length, 'player')} · ${plural(view.decks, 'deck')} · turn ${view.turns + 1}`;
  tableScreen({
    view, people: scr.ps, me, online: inRoom(), sel, info, desc: handDesc(me), art: curArt(), side: sideOn(), onSort: () => flipOrder(me),
    onCard: (c, ok) => {
      if (!ok && view.opening && view.turn === me) { say(`Open with your ${rankName(view.opening)}s first.`); return; }
      if (!ok) { if (view.you.source === 'hand' || view.you.source === 'up') say(`${c.rank === 2 || c.rank === 10 ? '' : 'Too low. '}That card can't be played now.`); return; }
      sel = toggle(sel, c, view.you.playable);
      render();
    },
    onSlot: slot => send({ type: 'playDown', slot }),
    onPlay: () => { if (canPlaySel(sel, view.you.playable)) { const ids = sel.map(c => c.id); sel = []; send({ type: 'play', ids }); } },
    onPick: () => { sel = []; send({ type: 'pickUp' }); },
    onNext: () => localSend({ type: 'next' }),
  });
  if (O.error && inRoom()) { say(O.error); O.error = ''; }
  const prev = prevView;
  prevView = view;
  if (snap && prev) animate(prev, view, snap, me);
}

// ---- Results
function renderResults(scr) {
  const view = scr.view, animate = revealPending;
  revealPending = false;
  const G = S.game;
  const r0 = inRoom() && O.view.room, iso = ms => new Date(ms).toISOString();
  const time = r0 ? (r0.startedAt && r0.endedAt ? minutes(iso(r0.startedAt), iso(r0.endedAt)) : '')
    : G?.startedAt && G?.endedAt ? minutes(G.startedAt, G.endedAt) : '';
  resultsScreen(view, scr.ps, { animate, time, me: inRoom() ? O.view.you : null });
  if (inRoom()) {
    const r = O.view.room, voted = r.rematch || [], mine = voted.includes(O.view.you);
    const yes = voted.map(i => r.seats[i].name), no = r.seats.map((s, i) => voted.includes(i) ? null : s.name).filter(Boolean);
    $('votes').textContent = voted.length ? `Ready for a rematch: ${listOf(yes)}.${no.length ? ` Waiting for ${listOf(no)}.` : ''}` : 'Rematch starts when everyone taps it.';
    $('rematch').disabled = mine || busy;
    $('rematch').textContent = mine ? 'Waiting for the others' : 'Rematch';
  } else {
    $('votes').textContent = '';
    $('rematch').disabled = false;
    $('rematch').textContent = 'Rematch';
  }
}
$('rematch').onclick = () => {
  if (inRoom()) return onlineSend({ type: 'REMATCH' });
  const G = S.game;
  startLocal(G.names, G.styles, G.g.decks, G.art);
};
$('newGame').onclick = () => {
  if (inRoom()) return leaveSeat();
  toSetup();
};
function toSetup() {
  stopResults();
  S.game = null; ready = false; sel = []; prevView = null;
  render();
  refreshSaves();
}

// ---- Saved games (one phone), through NL.saves: put() writes to this browser at once and uploads in the background.
async function saveGame() {
  const G = S.game, now = nowIso();
  if (!G.saveId) Object.assign(G, { saveId: crypto.randomUUID(), createdAt: now }); // before any await, so a double tap updates one record
  if (!G.createdAt) G.createdAt = (await NL.saves.get(G.saveId).catch(() => null))?.createdAt || now;
  return NL.saves.put({
    schemaVersion: 1, id: G.saveId, game: 'bomb', personPublicId: NL.person(),
    title: listOf(G.names), status: G.g.phase === 'over' ? 'finished' : 'in_progress',
    createdAt: G.createdAt, updatedAt: now, state: { game: G },
  });
}
async function saveNow(noteEl) {
  let saved;
  try { saved = await saveGame(); } catch { noteEl.textContent = 'Could not save on this device.'; return false; }
  shown = NL.saves.cached('bomb') || [saved, ...(shown || []).filter(x => x.id !== saved.id)];
  loadingSaves = false;
  return true;
}
const okRecord = r => !!r && !!readGame(r.state?.game);
async function resume(id) {
  const r = await NL.saves.get(id).catch(() => null); // a signed-in save can fail to load when the server is unreachable
  const G = okRecord(r) && readGame(r.state.game);
  if (!G) { savesNote = 'Could not open that save. Check your connection and try again.'; return drawSaves(); }
  Object.assign(G, { saveId: r.id, createdAt: r.createdAt });
  stopResults();
  S.game = G; ready = false; from = null; sel = []; prevView = null; holdUntil = 0;
  render();
}
function saveStatus(G) {
  const g = G.g;
  if (g.phase === 'over') return `Finished, ${G.names[g.winner]} won`;
  if (g.phase === 'choose') return 'Choosing face-up cards';
  return `${plural(G.names.length, 'player')}, turn ${g.turns + 1}`;
}
let shown = NL.saves.cached('bomb'), loadingSaves = !shown, savesNote = '';
const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const NOT_SYNCED = { save_limit: 'Not synced: 200 saves is the limit, delete one', too_large: 'Not synced: too large to upload', refused: 'Not synced: the server refused it' };
async function refreshSaves() {
  try { shown = await NL.saves.list('bomb'); savesNote = ''; }
  catch { savesNote = shown ? 'Could not reach the server. Showing the last known list.' : 'Could not load saved games.'; } // never invent an empty list
  loadingSaves = false;
  drawSaves();
}
addEventListener('nl-saves', () => { if (!S.game) refreshSaves(); });
const OPEN_KEY = 'nl-bomb-saved-open';
try { $('savedGroup').open = sessionStorage.getItem(OPEN_KEY) === '1'; } catch {}
$('savedGroup').ontoggle = () => { try { sessionStorage.setItem(OPEN_KEY, $('savedGroup').open ? '1' : '0'); } catch {} };
function drawSaves() {
  const recs = (shown || []).filter(okRecord), group = $('savedGroup');
  group.hidden = !loadingSaves && !savesNote && !recs.length;
  group.setAttribute('aria-busy', loadingSaves);
  $('savedSummary').replaceChildren('Saved games', loadingSaves ? el('span', 'skeleton count') : recs.length ? ` (${recs.length})` : '');
  $('savedNote').textContent = savesNote;
  $('savedNote').hidden = !savesNote;
  if (savesNote && !shown) {
    const retry = el('button', 'btn', 'Try again');
    retry.onclick = () => { loadingSaves = true; savesNote = ''; drawSaves(); refreshSaves(); };
    $('saves').replaceChildren(retry);
    return;
  }
  const skeleton = () => { const li = el('li', 'loading'); li.append(el('span', 'skeleton line')); return li; };
  $('saves').replaceChildren(...(loadingSaves ? [skeleton(), skeleton()] : recs.map(saveRow)));
}
// Two taps in place: the first arms the button until the second tap, a tap anywhere else, or 4 seconds.
// Not focus and blur: Safari on iOS drops focus from a tapped button before the second tap's click arrives.
function twoTap(btn, label, armed, run) {
  let disarm = null;
  const arm = on => {
    disarm?.();
    disarm = null;
    label(on);
    if (!on) return;
    const away = e => { if (!btn.contains(e.target)) arm(false); };
    const timer = setTimeout(() => arm(false), 4000);
    document.addEventListener('pointerdown', away, true);
    disarm = () => { clearTimeout(timer); document.removeEventListener('pointerdown', away, true); };
  };
  btn.onclick = () => {
    if (!disarm && armed()) return arm(true);
    arm(false);
    run();
  };
  arm(false);
}
function saveRow(r) {
  const li = el('li'), open = el('button', 'resume'), del = el('button'), G = readGame(r.state.game);
  const when = new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const sync = r.pending ? ` · ${NOT_SYNCED[r.pending] || 'Not synced yet'}` : '';
  open.append(el('strong', '', r.title), el('span', '', `${saveStatus(G)} · ${when}${sync}`));
  open.onclick = () => resume(r.id);
  twoTap(del, on => {
    del.className = on ? 'btn danger' : 'circle remove';
    del.replaceChildren(on ? 'Delete' : tpl('xIcon'));
    del.setAttribute('aria-label', on ? `Confirm delete ${r.title}` : `Delete ${r.title}`);
  }, () => true, () => removeSave(r));
  li.append(open, del);
  return li;
}
async function removeSave(r) {
  shown = (shown || []).filter(x => x.id !== r.id);
  savesNote = '';
  drawSaves();
  try { await NL.saves.remove(r.id); shown = (shown || []).filter(x => x.id !== r.id); }
  catch {
    shown = [...(shown || []).filter(x => x.id !== r.id), r].sort(newestFirst);
    savesNote = 'Could not delete that save. Check your connection and try again.';
  }
  drawSaves();
}

// ---- Menu and sheets
NL.menu($('menu'));
const closeMenu = () => { if ($('menu').classList.contains('open')) $('menu').querySelector('.menu-trigger').click(); };
const showTheme = NL.segmented($('themeSeg'), v => { NL.theme.set(v); showTheme(v); });
twoTap($('restart'), on => { $('restart').querySelector('span').textContent = on ? 'Tap again to restart' : 'Restart'; },
  () => !!S.game, () => { closeMenu(); const G = S.game; if (G) startLocal(G.names, G.styles, G.g.decks, G.art); });
$('exitBtn').onclick = () => {
  const fin = S.game?.g.phase === 'over';
  $('endTitle').textContent = fin ? 'Leave the results?' : 'End this game?';
  $('endNote').textContent = fin ? 'Save the result to see it again later.' : 'Save it to pick up later from Saved games. It reopens on a handoff screen.';
  $('discard').textContent = fin ? 'Exit without saving' : 'End without saving';
  $('keep').textContent = fin ? 'Back to results' : 'Keep playing';
  $('endSheet').showModal();
};
$('saveExit').onclick = async () => { if (await saveNow($('endNote'))) { $('endSheet').close(); toSetup(); } };
$('discard').onclick = () => { $('endSheet').close(); toSetup(); };
$('keep').onclick = () => $('endSheet').close();
$('leaveBtn').onclick = () => {
  const lobby = O.view?.room.phase !== 'game';
  $('leaveNote').textContent = lobby ? 'Your seat goes to whoever joins next. The others stay in the room.'
    : 'Your seat stays in the game, but the others cannot finish without you. You can rejoin with the room code while the game lasts.';
  $('leaveSheet').showModal();
};
$('leaveYes').onclick = async () => {
  $('leaveSheet').close();
  if (O.view?.room.phase !== 'game') return leaveSeat();
  leaveRoom();
};
$('leaveNo').onclick = () => $('leaveSheet').close();
$('rulesBtn').onclick = () => $('rulesSheet').showModal();
const SIDE_KEY = 'nl-bomb-specials';
const sideOn = () => { try { return localStorage.getItem(SIDE_KEY) !== 'off'; } catch { return true; } }; // on unless switched off
const showSide = NL.segmented($('sideSeg'), v => { try { localStorage.setItem(SIDE_KEY, v); } catch {} showSide(v); render(); });
$('settingsBtn').onclick = () => { showTheme(NL.theme.get()); showSide(sideOn() ? 'on' : 'off'); $('settingsSheet').showModal(); };

// ---- Deck art: one choice per deck in the game. The decks are shuffled together and each card keeps its own deck's
// back and face. The picker and the setup row show each deck's back or its ace of spades (a toggle kept per device).
const ART_CHOICES = [{ id: '', name: 'Standard' }, ...DECKS];
const artName = id => ART_CHOICES.find(d => d.id === id)?.name || 'Standard';
const VIEW_KEY = 'nl-bomb-deck-view';
let artShow = (() => { try { return localStorage.getItem(VIEW_KEY) === 'ace' ? 'ace' : 'back'; } catch { return 'back'; } })();
function drawArt(box, n, art, onPick) {
  box.replaceChildren(...Array.from({ length: n }, (_, i) => {
    const b = el(onPick ? 'button' : 'div', 'opt');
    if (onPick) { b.type = 'button'; b.onclick = () => onPick(i); b.dataset.k = `${box.id}${i}`; }
    b.setAttribute('aria-label', `Deck ${i + 1}: ${artName(art[i])}${onPick ? '. Change' : ''}`);
    b.append(deckPreview(art[i], artShow), el('b', '', `Deck ${i + 1}`), el('small', '', artName(art[i])));
    return b;
  }));
}
let onArt = null, artFor = 0, artCur = '';
function openDecks(i, current, pick) {
  onArt = pick; artFor = i; artCur = current;
  $('deckTitle').textContent = `Deck ${i + 1}`;
  showArtView(artShow);
  drawDeckGrid();
  $('deckSheet').showModal();
}
function drawDeckGrid() {
  $('deckGrid').replaceChildren(...ART_CHOICES.map(d => {
    const b = el('button', 'opt');
    b.type = 'button';
    b.setAttribute('aria-pressed', d.id === artCur);
    b.append(deckPreview(d.id, artShow), el('b', '', d.name), el('small', '', d.id ? 'picture deck' : 'colour backs'));
    if (d.id === artCur) { const t = el('span', 'tick'); t.append(tpl('tickIcon')); b.append(t); }
    b.onclick = () => { $('deckSheet').close(); onArt?.(d.id); };
    return b;
  }));
}
const showArtView = NL.segmented($('deckView'), v => {
  artShow = v; try { localStorage.setItem(VIEW_KEY, v); } catch {}
  showArtView(v); drawDeckGrid(); render();
});
$('deckDone').onclick = () => $('deckSheet').close();
$('rulesDone').onclick = () => $('rulesSheet').close();
$('settingsDone').onclick = () => $('settingsSheet').close();
for (const d of document.querySelectorAll('dialog')) d.onclick = e => { if (e.target === d) d.close(); };
for (const d of document.querySelectorAll('dialog.sheet')) { const h = d.querySelector('h2'); if (h) { h.tabIndex = -1; h.autofocus = true; } }

// Rotation and resizing change card sizes: refit the hand tray.
let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(function again() { if ($('tablePage').hidden) return; if (document.querySelector('.fly, .boom')) resizeTimer = setTimeout(again, 200); else render(); }, 120); });

// ---- Start: a room link joins (or pre-fills the code); a refresh while in a room reopens it.
const linkCode = new URLSearchParams(location.search).get('room');
if (linkCode && /^[A-Za-z]{6}$/.test(linkCode)) {
  history.replaceState(null, '', location.pathname);
  S.mode = 'online';
  $('joinCode').value = linkCode.toUpperCase();
  render();
  if (S.me.name.trim()) enterRoom('join');
  else { O.error = 'Enter your name, then tap Join.'; render(); $('meName').focus(); }
} else {
  let again = null;
  try { again = sessionStorage.getItem('nl-bomb-in-room'); } catch {}
  const mem = roomMemory();
  if (S.mode === 'online' && mem && again === mem.id) net.open(mem.id);
  render();
  if (!S.game) refreshSaves();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: '/bomb/' }).catch(() => {});
