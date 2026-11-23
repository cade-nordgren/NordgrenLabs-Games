// Crossix screens. All rules live in ../engine; this file dispatches actions and draws state.
import { LANES, LAST, POINTS, MARKS_BEFORE_LAST, MAX_PENALTIES, MAX_PLAYERS, MAX_ONLINE, score, standings } from '../engine/lanes.js';
import { canMark, isSkipped, cellChoice, pickedCells, canEnd, whiteSum, noPicks } from '../engine/moves.js';
import { newGame, reduce, validState, endReason } from '../engine/reducer.js';
import { record, undo as undoHist, cleanHist, SAVE_CAP } from '../engine/history.js';
import { mountDie, showDie } from './dice.js';
import { createNet, browserAuth, reasonText } from '../../bomb/ui/net.js'; // Bomb's long-poll client, pointed at our rooms

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent, never innerHTML: names are user input
  return e;
};
const tpl = id => $(id).content.firstElementChild.cloneNode(true);
const listOf = names => new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MODE_WORD = { physical: 'Physical dice', digital: 'Digital dice' };
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] | 0;

// ---- Per-browser preferences (not game state).
const PREFS = 'nl-crossix-prefs';
let prefs = { haptics: 'on', picker: 'off', scores: 'live' }; // scores: live (while playing) or end (hidden until the end)
try {
  const p = JSON.parse(localStorage.getItem(PREFS));
  if (p?.haptics === 'off') prefs.haptics = 'off';
  if (p?.picker === 'on') prefs.picker = 'on';
  if (p?.scores === 'end') prefs.scores = 'end';
} catch {}
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
// Only after a real tap: Chrome logs an error for vibrate() before any user activation.
// iPhone Safari has no vibrate(); since iOS 18 toggling a switch checkbox gives one system tick, so tap a hidden one.
// shortcut: iOS gets one tick for any pattern, and only inside a tap; revisit if Safari ships vibrate().
const tick = () => {
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox'; input.setAttribute('switch', ''); label.ariaHidden = 'true'; label.style.display = 'none';
  label.append(input); document.head.append(label); label.click(); label.remove();
};
const buzz = p => {
  if (prefs.haptics !== 'on' || navigator.userActivation?.hasBeenActive === false) return;
  if (navigator.vibrate) navigator.vibrate(p); else tick();
};
const narrow = matchMedia('(max-width: 359px)');
// Digital only: with your own dice a tap always crosses off.
const pickerOn = () => S.g?.mode === 'digital' && (prefs.picker === 'on' || narrow.matches);

// ---- State, autosaved on every render. It belongs to whoever was signed in (owner), so a game in progress never
// shows to the next person on this browser.
const KEY = 'nl-crossix-v1';
const fresh = () => ({ v: 1, owner: NL.person(), names: [], mode: 'physical', g: null, hist: [], saveId: null, createdAt: null, sel: 0, compact: false, myName: '' });
let S = fresh();
const me = NL.identity();
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && s.v === 1 && (!s.owner || s.owner === S.owner)) { // another person's autosave stays unread
    if (Array.isArray(s.names)) S.names = s.names.filter(n => typeof n === 'string').slice(0, MAX_PLAYERS).map(n => n.slice(0, 20));
    if (MODE_WORD[s.mode] || s.mode === 'online') S.mode = s.mode;
    if (typeof s.myName === 'string') S.myName = s.myName.slice(0, 20);
    S.compact = s.compact === true;
    if (s.g && validState(s.g)) { // stored data is a trust boundary
      S.g = s.g;
      S.hist = cleanHist(s.hist);
      if (UUID.test(s.saveId)) S.saveId = s.saveId;
      if (ISO.test(s.createdAt)) S.createdAt = s.createdAt;
      if (Number.isInteger(s.sel) && s.sel >= 0 && s.sel < s.g.players.length) S.sel = s.sel;
    }
  }
} catch {}
if (me?.displayName && !S.names.length && !S.g) S.names.push(me.displayName.slice(0, 20));
if (me?.displayName && !S.myName) S.myName = me.displayName.slice(0, 20);
// An online game lives on the server: it is never autosaved here, so a reload cannot turn it into a local game.
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(inRoom() ? { ...S, g: null, hist: [] } : S)); } catch {} };
NL.ready.then(i => {
  if (!me && i?.displayName && !S.names.length && !S.g) S.names.push(i.displayName.slice(0, 20));
  if (!me && i?.displayName && !S.myName) S.myName = i.displayName.slice(0, 20);
  if (!S.g) render();
});
NL.account($('account'));

let rolling = false, popMarks = false; // popMarks: animate new crosses only right after a move
// The end-of-game count plays once, right after the move that ended the game; a reload shows the final state.
let revealPending = false, revealing = false, revealToken = 0;
const stopReveal = () => { revealToken++; revealing = revealPending = false; };
// Setting "At the end": no running score shows anywhere until the game is over.
const hideScores = () => prefs.scores === 'end' && S.g?.status === 'playing';

// Digital: the roller. Everyone chooses at once after a roll, so this only marks who rolled and who risks a penalty.
const mover = g => g.turn ? g.turn.active : null;
const fixSel = () => { if (S.g && !(S.sel >= 0 && S.sel < S.g.players.length)) S.sel = 0; };

// Which sheet to show after an action: the roller's after a roll or a resolve, the next player still choosing after
// someone taps Done (pass-and-play; any chip still switches sheets).
function follow(action) {
  const g = S.g, t = g?.turn;
  if (!t || g.status !== 'playing') return fixSel();
  if (action?.type === 'roll' || t.phase === 'roll') S.sel = t.active;
  else if (action?.type === 'done' && action.value !== false) {
    const n = g.players.length, next = [...Array(n).keys()].map(k => (action.player + 1 + k) % n).find(i => !t.done[i]);
    if (next != null) S.sel = next;
  }
  fixSel();
}

// Every game action goes through here: snapshot for undo, reduce, render. Illegal actions change nothing.
// Online: only this seat's tentative picks come here; they stay on this phone, with no undo, until Done sends them.
function change(action) {
  const next = reduce(S.g, action);
  if (next === S.g) return false;
  if (S.g.status === 'playing' && next.status === 'over') revealPending = true;
  if (inRoom()) O.mine = next.turn.picks[O.view.you];
  else S.hist = record(S.hist, S.g);
  S.g = next;
  if (!inRoom()) follow(action);
  popMarks = true;
  render();
  popMarks = false;
  return true;
}
function undo() {
  const u = undoHist(S.hist);
  if (!u) return;
  stopReveal();
  // Show the sheet the undone change was on (a mark, a pick or a Done).
  // Undoing a resolve changes every sheet: prefer the one that is choosing again (not done).
  const key = (g, i) => JSON.stringify([g.players[i], g.turn?.picks[i], g.turn?.done[i] ?? false]);
  const diff = u.g.players.map((_, i) => key(u.g, i) !== key(S.g, i));
  let p = diff.findIndex((d, i) => d && !u.g.turn?.done[i]);
  if (p < 0) p = diff.indexOf(true);
  if (p >= 0) S.sel = p;
  S.g = u.g;
  S.hist = u.hist;
  rolling = false;
  fixSel();
  buzz(6);
  render();
}

function start() {
  const names = S.names.map(n => n.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
  if (!names.length) return render();
  S.names = names;
  Object.assign(S, { g: newGame({ mode: S.mode, names, seed: newSeed() }), hist: [], saveId: null, createdAt: null, sel: 0 });
  render();
}
function restart() {
  stopReveal();
  const names = S.g.players.map(p => p.name);
  Object.assign(S, { g: newGame({ mode: S.g.mode, names, seed: newSeed() }), hist: [], saveId: null, createdAt: null, sel: 0 });
  render();
}
function toSetup() {
  stopReveal();
  Object.assign(S, { g: null, hist: [], saveId: null, createdAt: null, sel: 0 });
  rolling = false;
  render();
  refreshSaves();
}

// ---- Saved games, through NL.saves. put() writes to this browser at once and uploads in the background.
async function saveGame() {
  const now = new Date().toISOString();
  if (!S.saveId) Object.assign(S, { saveId: crypto.randomUUID(), createdAt: now }); // before any await, so a double tap updates one record
  if (!S.createdAt) S.createdAt = (await NL.saves.get(S.saveId).catch(() => null))?.createdAt || now;
  return NL.saves.put({
    schemaVersion: 1, id: S.saveId, game: 'crossix', personPublicId: NL.person(),
    title: listOf(S.g.players.map(p => p.name)), status: S.g.status === 'over' ? 'finished' : 'in_progress',
    createdAt: S.createdAt, updatedAt: now,
    state: { g: S.g, hist: S.hist.slice(-SAVE_CAP), sel: S.sel },
  });
}
// Saves the current game; on failure says so in the sheet's note and returns false.
async function saveNow(noteEl) {
  let saved;
  try { saved = await saveGame(); } catch { noteEl.textContent = 'Could not save on this device.'; return false; }
  shown = NL.saves.cached('crossix') || [saved, ...(shown || []).filter(x => x.id !== saved.id)];
  loadingSaves = false;
  return true;
}
const okRecord = r => !!r && validState(r.state?.g);
async function resume(id) {
  const r = await NL.saves.get(id).catch(() => null); // a signed-in save can fail to load when the server is unreachable
  if (!okRecord(r)) { savesNote = 'Could not open that save. Check your connection and try again.'; return drawSaves(); }
  const g = r.state.g;
  Object.assign(S, { g, hist: cleanHist(r.state.hist), saveId: r.id, createdAt: r.createdAt, mode: g.mode, names: g.players.map(p => p.name),
    sel: Number.isInteger(r.state.sel) && r.state.sel >= 0 && r.state.sel < g.players.length ? r.state.sel : 0 });
  fixSel();
  render();
}
function saveStatus(g) {
  const top = standings(g.players)[0];
  if (g.status === 'over') return `Finished, ${g.players[top.i].name} ${top.total}`;
  return `${MODE_WORD[g.mode]}${g.turn ? `, turn ${g.turn.n}` : ''}`;
}

let shown = NL.saves.cached('crossix'), loadingSaves = !shown, savesNote = '';
const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const NOT_SYNCED = { save_limit: 'Not synced: 200 saves is the limit, delete one', too_large: 'Not synced: too large to upload', refused: 'Not synced: the server refused it' };
async function refreshSaves() {
  try {
    shown = await NL.saves.list('crossix');
    savesNote = '';
  } catch {
    savesNote = shown ? 'Could not reach the server. Showing the last known list.' : 'Could not load saved games.'; // never invent an empty list
  }
  loadingSaves = false;
  drawSaves();
}
addEventListener('nl-saves', () => { if (!S.g) refreshSaves(); });
const OPEN_KEY = 'nl-crossix-saved-open';
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
function twoTap(btn, label, armed, ready, run) {
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
    if (ready()) run();
  };
  arm(false);
  return arm;
}

function saveRow(r) {
  const li = el('li'), open = el('button', 'resume'), del = el('button');
  const when = new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const sync = r.pending ? ` · ${NOT_SYNCED[r.pending] || 'Not synced yet'}` : '';
  open.append(el('strong', '', r.title), el('span', '', `${saveStatus(r.state.g)} · ${when}${sync}`));
  open.onclick = () => resume(r.id);
  twoTap(del, on => {
    del.className = on ? 'btn danger' : 'circle remove';
    del.replaceChildren(on ? 'Delete' : tpl('xIcon'));
    del.setAttribute('aria-label', on ? `Confirm delete ${r.title}` : `Delete ${r.title}`);
  }, () => true, () => true, () => removeSave(r));
  li.append(open, del);
  return li;
}
async function removeSave(r) {
  shown = (shown || []).filter(x => x.id !== r.id);
  savesNote = '';
  drawSaves();
  try {
    await NL.saves.remove(r.id);
    shown = (shown || []).filter(x => x.id !== r.id);
  } catch {
    shown = [...(shown || []).filter(x => x.id !== r.id), r].sort(newestFirst);
    savesNote = 'Could not delete that save. Check your connection and try again.';
  }
  drawSaves();
}

// ---- Online (docs/plans/crossix-online-contract.md). The server holds the game and rolls; this phone keeps the room
// it is in (to offer a rejoin), the server's view for its seat, and its own tentative picks (O.mine) until Done.
const ROOM = 'nl-crossix-room', IN_ROOM = 'nl-crossix-in-room';
const REASONS = {
  full: 'That room is full: eight players is the most.', not_your_turn: 'It is not your roll.',
  not_away: 'They are back, so they can play their own turn.', not_started: 'The game has not started.',
  stale: 'That roll is over. Here is the table now.', illegal: 'That is not allowed now.',
};
const why = r => REASONS[r] || reasonText(r);
let O = { view: null, mine: null, error: '', notice: '', net: 'ok' }, busy = false;
const inRoom = () => !!O.view;
const net = createNet({
  base: '/api/crossix/rooms', fetch: (...a) => fetch(...a), auth: browserAuth, doc: document, win: window,
  onView: adoptView,
  onState: s => { O.net = s; render(); },
  // Signed out or no server: the seat is still there, so keep the room to rejoin. 404: the room is gone for good.
  onGone: w => leaveRoom(w ? why(w) : 'That room is gone: everyone left, or it was idle for a day.', !!w),
});
const roomMemory = () => { try { const r = JSON.parse(localStorage.getItem(ROOM)); return r && UUID.test(r.id) && /^[A-Z]{6}$/.test(r.code) ? r : null; } catch { return null; } };
const remember = r => { try { localStorage.setItem(ROOM, JSON.stringify(r)); sessionStorage.setItem(IN_ROOM, r.id); } catch {} };
const forgetRoom = () => { try { localStorage.removeItem(ROOM); sessionStorage.removeItem(IN_ROOM); } catch {} };
function leaveRoom(message = '', keep = false) {
  net.close();
  if (!keep) forgetRoom();
  stopReveal();
  O = { view: null, mine: null, error: message, notice: '', net: 'ok' };
  Object.assign(S, { g: null, sel: 0 });
  rolling = false;
  render();
}

// The phone's copy of the game: the view with this seat's tentative picks, and none for the others (hidden until the
// roll resolves; nothing here reads them). Seed and rng never come from the server and are never used here.
function gameOf(v) {
  const t = v.game.turn;
  const picks = t.phase === 'choose' ? t.picks.map((k, i) => i === v.you ? O.mine ?? k ?? noPicks() : noPicks()) : [];
  return { ...v.game, seed: 0, rng: 0, turn: { ...t, picks } };
}
function adoptView(view) {
  if (!view) return;
  const was = O.view?.game, g = view.game, t = g?.turn, sameRoll = was?.turn.phase === 'choose' && was.turn.n === t?.n;
  const left = (O.view?.room.seats || []).filter(s => !view.room.seats.some(x => x.name === s.name)).map(s => s.name);
  if (left.length) O.notice = `${listOf(left)} left.`;
  O.view = view;
  remember({ id: view.room.id, code: view.room.code });
  if (!g) { stopReveal(); Object.assign(S, { g: null, sel: 0 }); return render(); }
  // A new roll or a reopened Done: start from what the server holds (nothing, or the picks sent with Done).
  if (t.phase !== 'choose' || !sameRoll || t.done[view.you]) O.mine = t.phase === 'choose' ? t.picks[view.you] : null;
  if (!was || was.status === 'over' && g.status === 'playing') { stopReveal(); S.sel = view.you; } // joined, or a rematch
  if (was?.status === 'playing' && g.status === 'over') revealPending = true;
  const spinNow = was && t.phase === 'choose' && !sameRoll;
  if (spinNow) S.sel = view.you; // everyone starts on their own sheet
  S.g = gameOf(view);
  fixSel();
  if (spinNow) return spin();
  popMarks = !!was && was.turn.n !== t.n;
  render();
  popMarks = false;
}

async function onlineSend(action) {
  if (busy) return false;
  busy = true;
  O.error = '';
  const r = await net.send(action);
  busy = false;
  if (!r.ok) O.error = why(r.reason);
  render();
  return r.ok;
}
async function enterRoom(kind) {
  const name = S.myName.trim();
  if (!name) { O.error = 'Enter your name first.'; render(); $('meName').focus(); return; }
  if (busy) return;
  busy = true; O.error = ''; render();
  const r = kind === 'create' ? await net.create({ name }) : await net.join({ code: $('joinCode').value.trim().toUpperCase(), name });
  busy = false;
  O.error = r.ok ? '' : r.reason === 'not_found' && kind === 'join' ? 'No room with that code. Check the letters and try again.' : why(r.reason);
  render();
}
// Leaving the lobby or a finished game frees the seat on the server, so nobody waits for this player.
async function leaveSeat() {
  if (busy) return;
  busy = true;
  const r = await net.send({ type: 'LEAVE' });
  busy = false;
  if (r.ok || r.reason === 'not_found') leaveRoom();
  else { O.error = why(r.reason); render(); }
}

function renderOnlineSetup() {
  const mem = roomMemory();
  $('onlineNote').textContent = O.error;
  $('onlineNote').hidden = !O.error;
  $('rejoinBox').hidden = !mem;
  if (mem) $('rejoinNote').textContent = `You were in room ${mem.code}. Your seat is kept while the game lasts.`;
  if (document.activeElement !== $('meName')) $('meName').value = S.myName;
  for (const id of ['create', 'join', 'rejoin']) $(id).disabled = busy;
}
$('meName').oninput = () => { S.myName = $('meName').value; save(); };
$('create').onclick = () => enterRoom('create');
$('joinRow').onsubmit = e => {
  e.preventDefault();
  if (!/^[A-Za-z]{6}$/.test($('joinCode').value.trim())) { O.error = 'A room code is six letters.'; render(); return; }
  enterRoom('join');
};
$('rejoin').onclick = () => { const m = roomMemory(); if (m) { O.error = ''; net.open(m.id); } };
$('forget').onclick = () => { forgetRoom(); render(); };

function renderLobby() {
  const v = O.view, r = v.room, host = v.you === r.host, n = r.seats.length;
  $('roomCode').textContent = r.code;
  $('roomCode').setAttribute('aria-label', `Room code ${[...r.code].join(' ')}`);
  $('seatCount').textContent = `${n} of ${MAX_ONLINE} seated`;
  const rows = r.seats.map((s, i) => {
    const li = el('li'), name = el('strong', '', s.name);
    if (i === v.you) name.append(el('span', '', ' (you)'));
    else if (!s.connected) li.classList.add('off');
    li.append(el('span', 'seat', i + 1), name, el('span', 'pill', i === r.host ? 'Host' : s.connected ? 'Ready' : 'Away'));
    return li;
  });
  if (n < MAX_ONLINE) {
    const li = el('li');
    li.append(el('span', 'seat open'), el('span', 'note', `Waiting for a player${n < MAX_ONLINE - 1 ? `, ${MAX_ONLINE - n} seats open` : ''}`));
    li.lastChild.style.margin = '0';
    rows.push(li);
  }
  $('lobbySeats').replaceChildren(...rows);
  $('startRoom').hidden = !host;
  $('startRoom').disabled = busy || n < 2;
  $('startRoom').textContent = n < 2 ? 'Waiting for players' : `Start game with ${n}`;
  $('lobbyWait').hidden = host;
  $('lobbyWaitText').textContent = `Waiting for ${r.seats[r.host]?.name || 'the host'} to start`;
  $('lobbyErr').textContent = O.error || O.notice;
  $('lobbyErr').classList.toggle('err', !!O.error);
  $('lobbyErr').hidden = !$('lobbyErr').textContent;
}
$('startRoom').onclick = () => onlineSend({ type: 'START' });
$('leaveLobby').onclick = leaveSeat;
const roomLink = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}?room=${O.view.room.code}`;
const shareNote = text => { $('shareNote').textContent = text; $('shareNote').hidden = false; };
$('share').onclick = async () => {
  const url = roomLink();
  try {
    if (navigator.share) { await navigator.share({ title: 'Crossix', text: `Join my Crossix game: room ${O.view.room.code}`, url }); return; }
    await navigator.clipboard.writeText(url);
    shareNote('Link copied.');
  } catch (e) { if (e?.name !== 'AbortError') shareNote(`Copy this link: ${url}`); }
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(O.view.room.code); shareNote('Code copied.'); } catch { shareNote(`The code is ${O.view.room.code}.`); }
};

// The host's way past a phone that has gone quiet (the server allows it after a minute unseen): roll for that player,
// or end their choice with nothing crossed. No timers and no kicking.
function renderSkips() {
  const v = O.view, t = S.g.turn, box = $('skips');
  const who = inRoom() && v.you === v.room.host && S.g.status === 'playing' && !rolling
    ? v.room.seats.map((s, i) => i).filter(i => i !== v.you && !v.room.seats[i].connected && (t.phase === 'roll' ? i === t.active : !t.done[i])) : [];
  box.replaceChildren(...who.map(i => {
    const b = el('button', 'btn', `Skip ${v.room.seats[i].name}`);
    b.disabled = busy;
    b.onclick = () => onlineSend({ type: 'skip', seat: i });
    return b;
  }));
  box.hidden = !who.length;
}

// ---- Build the fixed parts of the sheet once; render() only updates them, so focus stays put.
const laneEls = [], cellEls = [];
LANES.forEach((lane, l) => {
  const row = el('div', `lane ${lane.id}`);
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', `${lane.name} lane`);
  cellEls[l] = [];
  // Ten numbers, then the last number and its lock in one wider cell (index LAST): crossing it counts twice.
  for (let i = 0; i <= LAST; i++) {
    const b = el('button', i === LAST ? 'cell lock' : 'cell');
    b.onclick = () => tapCell(l, i);
    row.append(b);
    cellEls[l].push(b);
  }
  row.onclick = () => { if (row.classList.contains('pickable')) openPicker(l); }; // cells ignore pointers in picker mode
  row.onkeydown = e => { if (row.classList.contains('pickable') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPicker(l); } };
  $('lanes').append(row);
  laneEls.push(row);
});
$('points').append(...POINTS.slice(1).map((_, k) => el('span', '', `${k + 1}x`)), ...POINTS.slice(1).map(p => el('span', '', p)));
const penEls = Array.from({ length: MAX_PENALTIES }, (_, k) => {
  const b = el('button', 'pbox');
  b.onclick = () => {
    const g = S.g, p = g.players[S.sel];
    // Digital: the roller ticks or unticks this turn's penalty (applied when the roll resolves). Physical: add or remove one.
    const add = g.turn ? !g.turn.picks[S.sel]?.penalty : k >= p.penalties;
    if (change({ type: 'penalty', player: S.sel, add })) buzz(20);
  };
  $('penBoxes').append(b);
  return b;
});
const eqEls = (() => {
  const box = (c, label) => { const s = el('span', 't'); if (c) s.style.setProperty('--c', c); s.setAttribute('aria-label', label); return s; };
  const parts = LANES.map(l => box(`var(--${l.id})`, l.name));
  const pen = box(null, 'Penalties'), total = el('span', 't total');
  $('eq').append(parts[0], '+', parts[1], '+', parts[2], '+', parts[3], '−', pen, '=', total);
  return { parts, pen, total };
})();
const SLOTS = [['w', 'White'], ['w', 'White'], ...LANES.map(l => [l.id, l.name])];
const dieEls = SLOTS.map(([id, name], k) => {
  const slot = el('div', k < 2 ? 'slot w' : 'slot c');
  if (k >= 2) slot.style.setProperty('--lane', `var(--${id})`);
  slot.setAttribute('role', 'img');
  $('dice').append(slot);
  const die = mountDie(slot);
  showDie(die, k + 1);
  return { slot, die, name };
});

// ---- Taps on the sheet.
function tapCell(l, i) {
  const g = S.g;
  if (!g || g.status !== 'playing') return;
  const idx = i, p = S.sel;
  let ok = false;
  if (g.mode === 'physical') {
    // The last cell below five marks closes (or reopens) the colour as locked by someone away from this device.
    if (i === LAST && !canMark(g.players[p], g.closed, l, LAST)) ok = change({ type: 'close', lane: l });
    else ok = change({ type: 'mark', player: p, lane: l, index: idx });
  } else {
    if (!choosingNow()) return;
    ok = change({ type: 'choose', player: p, lane: l, index: idx }); // add, move, swap or take back (engine cellChoice)
  }
  if (ok) { buzz(10); if ($('picker').open) $('picker').close(); }
}
// Digital: the selected player can pick right now.
// Online: only on this phone's own sheet; the others are there to look at.
const choosingNow = () => { const t = S.g?.turn; return !!t && !rolling && S.g.status === 'playing' && t.phase === 'choose' && !t.done[S.sel] && (!inRoom() || S.sel === O.view.you); };

function paintCell(b, l, i) {
  const g = S.g, sheet = g.players[S.sel], lane = LANES[l], lock = i === LAST, playing = g.status === 'playing';
  const marked = sheet.marks[l].includes(i);
  const skip = !lock && isSkipped(sheet, l, i);
  // Digital: pick (an accent X), legal (ring), swap (muted, dashed ring: tapping it replaces what conflicts), none.
  const choice = g.mode === 'digital' && choosingNow() ? cellChoice(g, S.sel, l, i).state : 'none';
  const t = g.turn, mine = t && t.phase === 'choose' && !rolling ? pickedCells(t.dice, t.picks[S.sel]).find(c => c.lane === l && c.index === i) : null;
  // Coloured only while the player is still choosing; once they end their turn the pick shows as a plain X.
  const shownPick = !!mine && !t.done[S.sel], ended = !!mine && !shownPick;
  const wasX = b.classList.contains('x');
  b.classList.toggle('x', marked || ended);
  b.classList.toggle('pop', (marked || ended) && !wasX && popMarks);
  b.classList.toggle('skip', skip);
  b.classList.toggle('legal', choice === 'legal');
  b.classList.toggle('swap', choice === 'swap');
  b.classList.toggle('pick', shownPick);
  // A tentative X shows which dice made it: styled like a white die for the white sum, the lane's colour for white plus colour.
  b.classList.toggle('pw', shownPick && mine.kind === 'white');
  b.classList.toggle('pc', shownPick && mine.kind === 'colour');
  b.classList.toggle('held', lock && (marked || ended));
  let label;
  if (lock) {
    const closed = g.closed[l], left = MARKS_BEFORE_LAST - sheet.marks[l].length;
    b.replaceChildren(el('span', 'n', lane.nums[i]), tpl(closed || marked || ended ? 'lockIcon' : 'openIcon'));
    if (!closed && !marked && left > 0) b.append(el('small', '', `${sheet.marks[l].length}/${MARKS_BEFORE_LAST}`));
    label = `${lane.name} ${lane.nums[i]} and lock` + (marked || ended ? ', crossed, locked by this player' : closed ? ', closed' : left > 0 ? `, needs ${left} more marks` : ', ready');
  } else {
    if (b.firstChild?.textContent !== String(lane.nums[i])) b.replaceChildren(el('span', 'n', lane.nums[i]));
    label = `${lane.name} ${lane.nums[i]}` + (marked || ended ? ', crossed' : skip ? ', skipped' : '');
  }
  if (shownPick) label += `, picked with ${mine.kind === 'white' ? 'the white dice' : `a white and the ${lane.name.toLowerCase()} die`}, tap to take back`;
  else if (choice === 'swap') label += ', conflicts with a pick, tap to swap';
  b.setAttribute('aria-label', label);
  let can;
  if (!playing) can = false;
  else if (g.mode === 'physical') can = canMark(sheet, g.closed, l, i) || (lock && !g.players.some(p => p.locks[l]));
  else can = choice !== 'none';
  b.disabled = !can;
}

// Closed lanes sink below the open ones (each group in its usual order), sliding there (FLIP) when the order changes.
function placeLanes(g) {
  const want = [...laneEls.filter((_, l) => !g.closed[l]), ...laneEls.filter((_, l) => g.closed[l])];
  const box = $('lanes');
  if (want.every((row, k) => box.children[k] === row)) return;
  const before = new Map(laneEls.map(r => [r, r.getBoundingClientRect().top]));
  box.append(...want);
  if (still() || box.offsetParent === null) return;
  for (const r of laneEls) {
    const dy = before.get(r) - r.getBoundingClientRect().top;
    if (dy) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
}

// ---- Rendering
function render() {
  save();
  const playing = !!S.g, lobby = inRoom() && !playing;
  $('setupPage').hidden = playing || lobby;
  $('lobbyPage').hidden = !lobby;
  $('gamePage').hidden = !playing;
  $('gamesLink').hidden = playing;
  $('undo').hidden = !playing || inRoom(); // online: no undo
  $('undo').disabled = !S.hist.length;
  for (const id of ['scoresBtn', 'exitBtn']) $(id).hidden = !playing;
  for (const id of ['newBtn', 'restart']) $(id).hidden = !playing || inRoom();
  $('conn').hidden = !(inRoom() && O.net === 'offline');
  lobby ? renderLobby() : playing ? renderGame() : renderSetup();
  if ($('scoresSheet').open) renderScores();
}

const showMode = NL.segmented($('modeSeg'), v => { S.mode = v; O.error = ''; render(); });
function renderSetup() {
  showMode(S.mode);
  const online = S.mode === 'online';
  for (const id of ['rosterGroup', 'start']) $(id).hidden = online;
  for (const id of ['meGroup', 'joinGroup']) $(id).hidden = !online;
  if (online) { $('startHint').hidden = true; $('modeNote').textContent = 'Everyone plays on their own phone in a room, two to eight players. Dice roll on screen.'; renderOnlineSetup(); drawSaves(); return; }
  $('rejoinBox').hidden = $('onlineNote').hidden = true;
  $('modeNote').textContent = S.mode === 'physical'
    ? 'Roll your own dice at the table and tap what you cross off. Everyone can keep a sheet here, or just you.'
    : 'Roll six dice on screen. Everyone picks on this device, then taps Done. The game checks every move.';
  const waiting = !NL.settled && !S.names.length;
  const placeholder = () => { const li = el('li', 'loading'); li.setAttribute('aria-hidden', 'true'); li.append(el('span', 'skeleton line')); return li; };
  $('roster').replaceChildren(...(waiting ? [placeholder()] : []), ...S.names.map((n, i) => {
    const li = el('li'), input = el('input'), rm = el('button', 'circle remove');
    input.value = n; input.maxLength = 20;
    input.setAttribute('aria-label', `Player ${i + 1} name`);
    input.oninput = () => { S.names[i] = input.value; save(); gateStart(); };
    rm.append(tpl('xIcon'));
    rm.setAttribute('aria-label', `Remove ${n || 'player ' + (i + 1)}`);
    rm.onclick = () => { S.names.splice(i, 1); render(); };
    li.append(el('span', 'seat', i + 1), input, rm);
    return li;
  }));
  $('add').hidden = S.names.length >= MAX_PLAYERS;
  gateStart();
  drawSaves();
}
function gateStart() {
  const n = S.names.filter(x => x.trim()).length;
  $('start').disabled = !n;
  $('startHint').hidden = !!n;
  $('rosterNote').textContent = n === 1 ? 'One player: just your own sheet.' : n >= MAX_PLAYERS ? 'Five players is the most.' : 'Up to five players, in seating order.';
}

function renderChips() {
  const g = S.g, box = $('chips'), digital = !!g.turn, m = g.status === 'playing' ? mover(g) : null;
  const choosing = digital && g.turn.phase === 'choose';
  if (box.children.length !== g.players.length) {
    box.replaceChildren(...g.players.map((_, i) => {
      const c = el('button', 'chip');
      c.append(el('span'), el('b'));
      c.onclick = () => { S.sel = i; render(); };
      return c;
    }));
  }
  [...box.children].forEach((c, i) => {
    const p = g.players[i], t = score(p).total;
    c.firstChild.textContent = p.name;
    c.lastChild.textContent = hideScores() ? '' : t;
    c.setAttribute('aria-pressed', S.sel === i);
    c.classList.toggle('mover', digital && m === i);
    c.classList.toggle('done', choosing && g.turn.done[i]);
    const off = inRoom() && !O.view.room.seats[i]?.connected;
    c.classList.toggle('off', off);
    c.setAttribute('aria-label', `${p.name}${inRoom() && i === O.view.you ? ' (you)' : ''}${hideScores() ? '' : `, ${t} points`}${digital && m === i ? ', rolling player' : ''}${choosing && g.turn.done[i] ? ', turn ended' : ''}${off ? ', away' : ''}`);
  });
  box.hidden = g.players.length < 2 || g.status === 'over'; // results show everyone at once
}

function renderGame() {
  const g = S.g, over = g.status === 'over', digital = !!g.turn;
  renderChips();
  $('results').hidden = !over;
  $('board').hidden = over;
  $('gamePage').classList.toggle('digital', digital && !over);
  $('tray').hidden = !digital || over;
  // One player with their own dice has no chips: a title keeps the header from looking empty.
  $('status').textContent = g.players.length === 1 && !digital && !over ? 'Your sheet' : '';
  $('status').hidden = !$('status').textContent;
  if (over) return renderResults();

  const sheet = g.players[S.sel];
  if (digital) renderTray();
  renderSkips();

  const picker = pickerOn();
  $('lanes').classList.toggle('choosing', digital && choosingNow());
  placeLanes(g);
  laneEls.forEach((row, l) => {
    row.classList.toggle('closed', g.closed[l]);
    row.classList.toggle('pickable', picker);
    if (picker) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `${LANES[l].name} lane, open large`); }
    else { row.removeAttribute('tabindex'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', `${LANES[l].name} lane`); }
    cellEls[l].forEach((b, i) => { paintCell(b, l, i); if (picker) b.tabIndex = -1; else b.removeAttribute('tabindex'); });
  });
  if ($('picker').open) paintPicker();

  // Digital: only the roller, while choosing, may tick the next box; a ticked one is tentative (accent) until the roll
  // resolves. When the roller has nothing to end the turn with, that box is offered (dashed ring): it is the way out.
  const t = g.turn, tent = digital && t.phase === 'choose' && !!t.picks[S.sel]?.penalty;
  const canTick = digital && choosingNow() && S.sel === t.active;
  penEls.forEach((b, k) => {
    const next = k === sheet.penalties;
    b.classList.toggle('on', k < sheet.penalties || (next && tent));
    b.classList.toggle('tent', next && tent);
    b.classList.toggle('offer', next && canTick && !canEnd(g, S.sel));
    b.disabled = digital ? !(next && canTick) : k > sheet.penalties; // physical: tap the next box to add, the last taken one to remove
    b.setAttribute('aria-label', `Penalty ${k + 1}${k < sheet.penalties ? ', taken' : next && tent ? ', ticked this turn' : ''}`);
  });
  $('eq').hidden = hideScores();
  const sc = score(sheet);
  sc.lanes.forEach((v, l) => { eqEls.parts[l].textContent = v; });
  eqEls.pen.textContent = sc.penalty;
  eqEls.total.replaceChildren(el('small', '', 'Total'), String(sc.total));
}

function renderTray() {
  const g = S.g, t = g.turn, dice = t.dice;
  $('tray').classList.toggle('compact', S.compact);
  $('trayToggle').setAttribute('aria-expanded', !S.compact);
  $('trayToggle').setAttribute('aria-label', S.compact ? 'Bigger dice' : 'Smaller dice');
  const fresh = t.phase === 'choose';
  dieEls.forEach(({ slot, die, name }, k) => {
    const v = dice ? (k < 2 ? dice.w[k] : dice.c[k - 2]) : null;
    const gone = k >= 2 && g.closed[k - 2] && (v == null || !fresh);
    slot.classList.toggle('gone', gone);
    slot.classList.toggle('idle', !fresh && !gone);
    slot.setAttribute('aria-label', gone ? `${name} die, out of the game` : v ? `${name} die, ${v}` : `${name} die`);
    if (!rolling && v && die.dataset.shown !== String(v)) { showDie(die, v); die.dataset.shown = v; }
  });
  $('sum').textContent = dice && fresh && !rolling ? whiteSum(dice) : '';
  const myRoll = inRoom() && O.view.you === t.active;
  $('sumLabel').textContent = fresh ? 'White sum' : g.players.length === 1 ? 'Ready to roll' : myRoll ? 'Your roll' : `${g.players[t.active].name} rolls`;
  $('roll').hidden = t.phase !== 'roll' || (inRoom() && !myRoll); // online: only the roller's phone rolls
  $('roll').disabled = rolling || busy;
  // End turn: the roller needs a pick or a ticked penalty first; anyone else may end with nothing. Online it is always
  // this phone's own turn, whichever sheet is showing.
  const done = $('doneBtn'), p = inRoom() ? O.view.you : S.sel, mine = fresh && t.done[p];
  done.hidden = !fresh;
  done.disabled = rolling || busy || (fresh && !mine && !canEnd(g, p));
  done.classList.toggle('reopen', !!mine);
  done.textContent = mine ? 'Change picks' : 'End turn';
}

async function roll() {
  if (rolling) return;
  if (inRoom()) return onlineSend({ type: 'roll' }); // the server rolls; its view spins the dice on every phone
  // rolling goes up before the change renders, or that render would set the new faces at once (a flash before the spin)
  rolling = true;
  if (!change({ type: 'roll' })) { rolling = false; return; }
  return spin();
}
async function spin() {
  const d = S.g.turn.dice;
  rolling = true;
  buzz([8, 40, 8]);
  render();
  await Promise.all(dieEls.map(({ die }, k) => {
    const v = k < 2 ? d.w[k] : d.c[k - 2];
    if (v == null) return null;
    die.dataset.shown = v;
    return showDie(die, v, 2, k);
  }));
  if (!rolling) return; // undone mid-roll
  rolling = false;
  render();
  $('sum').classList.remove('pop'); void $('sum').offsetWidth; $('sum').classList.add('pop');
}
function doneTap() {
  const t = S.g?.turn;
  if (!t || rolling || t.phase !== 'choose') return;
  if (inRoom()) { // one request: this phone's final picks, or reopening them
    const you = O.view.you, k = t.picks[you];
    buzz(8);
    return onlineSend(t.done[you] ? { type: 'reopen', n: t.n } : { type: 'done', n: t.n, picks: { white: k.white, colour: k.colour, penalty: !!k.penalty } });
  }
  if (change({ type: 'done', player: S.sel, value: !t.done[S.sel] })) buzz(8);
}

// ---- Big lane picker: one lane, large, in order: the first six, then the next four and the last number with its lock.
let pickLane = 0;
const bigCells = Array.from({ length: LAST + 1 }, (_, i) => {
  const b = el('button', i === LAST ? 'cell lock' : 'cell');
  b.onclick = () => tapCell(pickLane, i);
  $('pickerCells').append(b);
  return b;
});
function openPicker(l) {
  if (!S.g || S.g.status !== 'playing') return;
  pickLane = l;
  $('pickerCells').style.setProperty('--lane', `var(--${LANES[l].id})`);
  $('pickerName').textContent = `${LANES[l].name} lane`;
  $('picker').style.setProperty('--lane', `var(--${LANES[l].id})`);
  paintPicker();
  $('picker').showModal();
}
function paintPicker() {
  const g = S.g;
  bigCells.forEach((b, i) => paintCell(b, pickLane, i));
  $('pickerNote').textContent = `${g.players[S.sel].name}. ${g.closed[pickLane] ? 'This colour is closed.' : 'Tap a number to cross it off.'}`;
}
$('pickerDone').onclick = () => $('picker').close();

// ---- Standings, for the Scores sheet and the results.
function standingsList(list, g) {
  const rows = standings(g.players);
  list.replaceChildren(...rows.map(r => {
    const li = el('li', r.rank === 1 ? 'glass first' : 'glass'), subs = el('div', 'subs');
    r.lanes.forEach((v, l) => {
      const s = el('span', '', v);
      s.style.setProperty('--c', `var(--${LANES[l].id})`);
      s.setAttribute('aria-label', `${LANES[l].name} ${v}`);
      subs.append(s);
    });
    const pen = el('span', '', r.penalty ? `−${r.penalty}` : '0');
    pen.setAttribute('aria-label', `Penalties ${r.penalty}`);
    subs.append(pen);
    li.append(el('span', 'rank', r.rank), el('span', 'who', g.players[r.i].name), el('span', 'tot', r.total), subs);
    return li;
  }));
}
function winnersLine(g) {
  const rows = standings(g.players), top = rows.filter(r => r.rank === 1).map(r => g.players[r.i].name);
  return g.players.length === 1 ? `${rows[0].total} points` : top.length > 1 ? `Tie between ${listOf(top)}` : `${top[0]} wins`;
}
function renderResults() {
  const g = S.g;
  const fourth = g.players.filter(p => p.penalties >= MAX_PENALTIES).map(p => p.name);
  $('resultsWhy').textContent = endReason(g) === 'penalties'
    ? `${g.players.length === 1 ? 'A' : `${listOf(fourth)} took a`} fourth penalty.`
    : `Two colours are locked: ${listOf(LANES.filter((_, l) => g.closed[l]).map(l => l.name.toLowerCase()))}.`;
  // Online: Play again is a rematch vote (it starts when everyone has tapped it), Change players leaves the room.
  const r = inRoom() && O.view.room, voted = r ? r.rematch : [], mine = r && voted.includes(O.view.you);
  $('again').textContent = !r ? 'Play again' : mine ? 'Waiting for the others' : 'Rematch';
  $('again').disabled = !!mine || busy;
  $('players').textContent = r ? 'Leave' : 'Change players';
  const yes = voted.map(i => r.seats[i].name), no = r ? r.seats.filter((_, i) => !voted.includes(i)).map(s => s.name) : [];
  $('votes').textContent = !r ? '' : O.error || (voted.length ? `Ready for a rematch: ${listOf(yes)}.${no.length ? ` Waiting for ${listOf(no)}.` : ''}` : 'Rematch starts when everyone taps it.');
  $('votes').hidden = !r;
  if (revealing) return; // the count is running; leave its rows alone
  const rows = revealRows(g);
  if (revealPending && !still()) { revealPending = false; runReveal(g, rows); return; }
  revealPending = false;
  finishReveal(g, rows);
}

// ---- Finish screen: one row per player (rank, name, red + yellow + green + blue - penalties = total), which is also
// the ranking. On the move that ends the game it counts up one column at a time for everyone at once, 1 s a column
// with the counting box white, then a 0.5 s beat in which the rows re-sort by the score so far. Tap or Skip to jump.
const COLS = 6, COUNT_MS = 1000, BEAT_MS = 500;
function revealRows(g) {
  return g.players.map((p, i) => {
    const row = el('li', 'rrow glass'), eq = el('div', 'eq');
    const box = (c, label) => { const b = el('span', 't', '0'); if (c) b.style.setProperty('--c', c); b.setAttribute('aria-label', label); return b; };
    const parts = LANES.map(l => box(`var(--${l.id})`, l.name)), pen = box(null, 'Penalties'), total = box(null, 'Total');
    total.classList.add('total');
    const op = t => el('i', 'op', t);
    eq.append(parts[0], op('+'), parts[1], op('+'), parts[2], op('+'), parts[3], op('−'), pen, op('='), total);
    const rank = el('span', 'rank', '');
    row.append(rank, el('span', 'who', p.name), eq);
    const { lanes, penalty, total: sum } = score(p);
    return { row, rank, boxes: [...parts, pen, total], target: [...lanes, penalty, sum], i };
  });
}
const showBox = (r, col, v) => { r.boxes[col].textContent = col === 4 ? (v ? `−${v}` : '0') : v; };
// Score from the columns counted so far (penalties subtract; the total column is the total).
const soFar = (r, cols) => cols >= COLS ? r.target[5] : r.target.slice(0, Math.min(cols, 4)).reduce((a, b) => a + b, 0) - (cols > 4 ? r.target[4] : 0);
// Puts the rows in order of the score so far (ties keep seating order), sliding them there (FLIP), and updates ranks.
function placeRows(rows, cols, slide) {
  const list = $('reveal'), before = new Map(rows.map(r => [r, r.row.getBoundingClientRect().top]));
  const sorted = [...rows].sort((a, b) => soFar(b, cols) - soFar(a, cols) || a.i - b.i);
  list.append(...sorted.map(r => r.row));
  sorted.forEach(r => { r.rank.textContent = cols ? 1 + rows.filter(o => soFar(o, cols) > soFar(r, cols)).length : ''; });
  if (!slide || still()) return;
  for (const r of rows) {
    const dy = before.get(r) - r.row.getBoundingClientRect().top;
    if (dy) r.row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
}
function finishReveal(g, rows) {
  $('reveal').replaceChildren(...rows.map(r => r.row));
  const best = Math.max(...rows.map(r => r.target[5]));
  rows.forEach(r => {
    r.target.forEach((v, col) => showBox(r, col, v));
    r.boxes.forEach(b => b.classList.remove('now', 'mute'));
    const win = r.target[5] === best;
    r.row.classList.toggle('win', win);
    r.row.classList.toggle('dim', !win && g.players.length > 1);
    r.rank.classList.toggle('first', win);
  });
  placeRows(rows, COLS, false);
  $('resultsTitle').textContent = winnersLine(g);
  $('skip').hidden = true;
  $('after').hidden = false;
}
async function runReveal(g, rows) {
  const my = ++revealToken;
  revealing = true;
  $('reveal').replaceChildren(...rows.map(r => r.row));
  rows.forEach(r => r.boxes.forEach(b => b.classList.add('mute')));
  $('resultsTitle').textContent = 'Final count';
  $('skip').hidden = false;
  $('after').hidden = true;
  const live = () => my === revealToken;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(400);
  for (let col = 0; col < COLS && live(); col++) {
    buzz(6);
    rows.forEach(r => { r.boxes[col].classList.remove('mute'); r.boxes[col].classList.add('now'); });
    // Every box ticks up one point at a time at a shared pace, so the column lands in exactly COUNT_MS.
    const max = Math.max(1, ...rows.map(r => Math.abs(r.target[col])));
    await new Promise(done => {
      const t0 = performance.now();
      const tick = () => {
        if (!live()) return done();
        const p = Math.min(1, (performance.now() - t0) / COUNT_MS), v = Math.floor(p * max);
        rows.forEach(r => showBox(r, col, Math.sign(r.target[col]) * Math.min(Math.abs(r.target[col]), v)));
        p < 1 ? setTimeout(tick, 16) : done(); // timers, so the count still finishes in a background tab
      };
      tick();
    });
    if (!live()) return;
    rows.forEach(r => { r.boxes[col].classList.remove('now'); r.boxes[col].classList.add('mute'); });
    placeRows(rows, col + 1, true);
    await wait(BEAT_MS);
  }
  if (!live()) return;
  revealing = false;
  finishReveal(g, rows);
  buzz([10, 60, 10]);
}
function skipReveal() {
  if (!revealing) return;
  stopReveal();
  renderResults();
}
$('skip').onclick = e => { e.stopPropagation(); skipReveal(); };
$('results').onclick = skipReveal; // tap anywhere on the reveal

function renderScores() {
  const g = S.g;
  $('scoreList').hidden = !g || hideScores();
  $('scoresLede').textContent = !g ? 'Start a game to see the scores here.'
    : hideScores() ? 'Scores are hidden until the end. Change this in Settings.'
    : g.status === 'over' ? 'Final scores.'
    : g.turn ? `Turn ${g.turn.n}. Lanes, penalties and totals for everyone.` : 'Lanes, penalties and totals for everyone, live.';
  if (g) standingsList($('scoreList'), g);
}

const showTheme = NL.segmented($('themeSeg'), v => { NL.theme.set(v); showTheme(v); });
const showHaptics = NL.segmented($('hapticsSeg'), v => { prefs.haptics = v; savePrefs(); showHaptics(v); buzz(10); });
const showPicker = NL.segmented($('pickerSeg'), v => { prefs.picker = v; savePrefs(); showPicker(v); render(); });
const showScoresPref = NL.segmented($('scoresSeg'), v => { prefs.scores = v; savePrefs(); showScoresPref(v); render(); });
NL.menu($('menu'));
const closeMenu = () => { if ($('menu').classList.contains('open')) $('menu').querySelector('.menu-trigger').click(); };
const inProgress = () => !!S.g && S.g.status === 'playing' && S.hist.length > 0;
// Restart and New game stay in the open menu for their second tap (data-keep-open), then close it.
const chip = id => $(id).querySelector('span');
twoTap($('restart'), on => { chip('restart').textContent = on ? 'Tap again to restart' : 'Restart'; }, inProgress, () => !!S.g, () => { closeMenu(); restart(); });
// Exit (Bank's End game) and New game confirm in a sheet, so they need no second tap.
$('exitBtn').onclick = () => {
  const fin = S.g?.status === 'over', online = inRoom();
  $('endTitle').textContent = online ? (fin ? 'Leave the room?' : 'Leave this game?') : fin ? 'Leave the final scores?' : 'End this game?';
  // Online games are not saved here: the server holds them, and a seat is kept while the game lasts.
  $('endNote').textContent = online ? (fin ? 'Your seat goes to whoever joins next.' : 'Your seat stays in the game, and the host can skip your turns. Rejoin from Online while the game lasts.')
    : fin ? 'Save the result to see it again later.' : 'Save it to pick up later from Saved games.';
  $('saveExit').hidden = online;
  $('discard').textContent = online ? 'Leave' : fin ? 'Exit without saving' : 'End without saving';
  $('keep').textContent = fin ? 'Back to scores' : 'Keep playing';
  $('endSheet').showModal();
};
// Back to the start screen at once with the save in the list; the upload finishes in the background.
$('saveExit').onclick = async () => {
  if (await saveNow($('endNote'))) { $('endSheet').close(); toSetup(); }
};
$('discard').onclick = () => {
  $('endSheet').close();
  if (!inRoom()) return toSetup();
  if (S.g?.status === 'over') return leaveSeat();
  leaveRoom('', true); // mid-game: the seat stays, so keep the room to rejoin
};
$('keep').onclick = () => $('endSheet').close();
$('newBtn').onclick = () => { $('newNote').textContent = 'Same players and dice, fresh sheets. Save this game to pick it up later from Saved games.'; $('newSheet').showModal(); };
$('saveNew').onclick = async () => {
  if (await saveNow($('newNote'))) { $('newSheet').close(); restart(); }
};
$('newNoSave').onclick = () => { $('newSheet').close(); restart(); };
$('newKeep').onclick = () => $('newSheet').close();

// ---- Sheets: Esc and a backdrop click close them.
for (const d of document.querySelectorAll('dialog')) d.onclick = e => { if (e.target === d) d.close(); };
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Sheets swipe away like an iPhone's: that lives in the shared platform.js.
for (const d of document.querySelectorAll('dialog.sheet')) {
  const h = d.querySelector('h2'); // focus the title on open, so a tall sheet opens at its top, not scrolled to its Done button
  if (h) { h.tabIndex = -1; h.autofocus = true; }
}
$('scoresBtn').onclick = () => { renderScores(); $('scoresSheet').showModal(); };
$('rulesBtn').onclick = () => $('rulesSheet').showModal();
$('settingsBtn').onclick = () => { showTheme(NL.theme.get()); showHaptics(prefs.haptics); showPicker(prefs.picker); showScoresPref(prefs.scores); $('settingsSheet').showModal(); };
for (const id of ['scores', 'rules', 'settings']) $(`${id}Done`).onclick = () => $(`${id}Sheet`).close();

// ---- Wiring
$('add').onsubmit = e => {
  e.preventDefault();
  const n = $('newName').value.trim();
  if (!n || S.names.length >= MAX_PLAYERS) return;
  S.names.push(n);
  $('newName').value = '';
  render();
  if (S.names.length < MAX_PLAYERS) $('newName').focus(); // stay put so several names can be typed in a row
};
$('start').onclick = start;
$('undo').onclick = undo;
$('roll').onclick = roll;
$('doneBtn').onclick = doneTap;
$('again').onclick = () => inRoom() ? onlineSend({ type: 'REMATCH' }) : restart();
$('players').onclick = () => inRoom() ? leaveSeat() : toSetup();
$('trayToggle').onclick = () => { S.compact = !S.compact; render(); };
narrow.addEventListener('change', render);

// ---- Start: a room link joins (or fills in the code); a reload while in a room reopens it.
const linkCode = new URLSearchParams(location.search).get('room');
if (linkCode && /^[A-Za-z]{6}$/.test(linkCode) && !S.g) {
  history.replaceState(null, '', location.pathname);
  S.mode = 'online';
  $('joinCode').value = linkCode.toUpperCase();
  if (S.myName.trim()) enterRoom('join');
  else { O.error = 'Enter your name, then tap Join.'; queueMicrotask(() => $('meName').focus()); }
} else if (!S.g && S.mode === 'online') {
  let again = null;
  try { again = sessionStorage.getItem(IN_ROOM); } catch {}
  const mem = roomMemory();
  if (mem && again === mem.id) net.open(mem.id);
}
fixSel();
render();
if (!S.g) refreshSaves();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: '/crossix/' }).catch(() => {});
