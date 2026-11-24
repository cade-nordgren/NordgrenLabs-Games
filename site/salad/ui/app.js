// Canadian Salad screens: home, create and join, lobby, and routing to the table and the results. Rules live in
// ../engine; the server holds the game (ui/net.js); this file only draws views and sends intents.
import * as net from './net.js';
import { COLORS, color, avatar } from './colors.js';
import { TABLES, tableOf } from './prefs.js';
import { describeConfig } from '../engine/score.js';
import { defaultDecks } from '../engine/cards.js';
import { qrSvg } from './qr.js';
import { cardEl, deckBackEl, deckPreview, setTableArt } from './cards.js';
import { DECKS } from '../../decks/decks.js';
import { $, el, toast, seg, svgUse, listOf, plural, ERR, errText } from './dom.js';
import { renderTable, tableBusy, onIdle } from './table.js';
import { renderResults, renderFinal, openScores, openScorecard, stopReveals, finalShown } from './results.js';
import { openSettings } from './settings.js';
import { openHow } from './howto.js';


// ---- Your last name and colour, offered again next time (this device only).
const ME = 'nl-salad-me';
const loadMe = () => { try { const m = JSON.parse(localStorage.getItem(ME)); return { name: typeof m?.name === 'string' ? m.name.slice(0, 20) : '', color: COLORS.some(c => c.id === m?.color) ? m.color : 'cobalt' }; } catch { return { name: '', color: 'cobalt' }; } };
const saveMe = m => { try { localStorage.setItem(ME, JSON.stringify(m)); } catch {} };
let me = loadMe();

// ---- Screens
let screen = 'home'; // without a room: home | create | join
const pages = ['home', 'form', 'lobby', 'results', 'final'];
function show(id) {
  for (const p of pages) $(p).hidden = p !== id;
  $('house').hidden = id === 'game';
  $('game').hidden = id !== 'game';
  const inRoom = !!net.state.view, inGame = net.state.view?.room.phase === 'game';
  $('mScores').hidden = !inGame;
  $('mHome').hidden = !inGame;
  $('mLeave').hidden = !(inRoom && !inGame);
  document.body.classList.toggle('live', id === 'game');
}

let current = null;
export function render() {
  setTableArt(net.state.view?.room?.config?.art);
  const v = net.state.view;
  if (!v) { stopReveals(); current = screen === 'home' ? 'home' : 'form'; show(current); if (current === 'home') renderHome(); return; }
  if (v.room.phase === 'lobby') { current = 'lobby'; show('lobby'); renderLobby(v); return; }
  const g = v.game;
  renderTable(v); // keeps the trick animation going even when results take over
  let next = 'game';
  if (g.phase === 'roundEnd' && !tableBusy()) next = 'results';
  if (g.phase === 'over' && !tableBusy()) next = finalShown(v) ? 'final' : 'results';
  if (next !== current) window.scrollTo(0, 0);
  current = next;
  show(next);
  if (next === 'results') renderResults(v);
  if (next === 'final') renderFinal(v);
  maybeCut(v);
}
onIdle(render);
addEventListener('salad-prefs', () => { if (net.state.view?.game) render(); });

// ---- Home
function renderHome() {
  const fan = $('fan');
  if (!fan.childElementCount) {
    const b = deckBackEl('luxury'), q = cardEl('d1-QH', 'span', 'luxury'), k = cardEl('d1-KS', 'span', 'luxury');
    b.style.cssText += ';left: 0; top: 16px; transform: rotate(-14deg)';
    q.style.cssText += ';left: 56px; top: 4px; transform: rotate(-2deg)';
    k.style.cssText += ';left: 112px; top: 14px; transform: rotate(12deg)';
    fan.append(b, q, k);
  }
  const saved = net.savedRoom();
  $('rejoin').hidden = !saved;
  if (saved) $('rejoinNote').textContent = `Room ${saved.code}`;
}
$('rejoin').onclick = async () => {
  $('rejoin').disabled = true;
  const ok = await net.reconnect();
  $('rejoin').disabled = false;
  if (!ok) { homeNote('That game has ended or the room has closed.'); render(); }
};
const homeNote = t => { $('homeNote').textContent = t; $('homeNote').hidden = !t; };
$('createBtn').onclick = () => openForm('create');
$('joinBtn').onclick = () => openForm('join');
$('howBtn').onclick = () => openHow();
$('setBtn').onclick = () => openSettings(net.state.view);

// ---- Create and join forms
let form = { capacity: 4, decks: 1, decksTouched: false, tableTheme: 'felt', scoreDisplay: 'live', art: ['', '', ''], color: me.color };
export function openForm(kind, code = '') {
  screen = kind;
  homeNote('');
  $('formTitle').textContent = kind === 'create' ? 'Create a game' : 'Join a game';
  $('formLede').textContent = kind === 'create' ? 'You host: choose the table, then share the code.' : 'Enter the code from the host, your name and a colour.';
  $('formGo').textContent = kind === 'create' ? 'Create game' : 'Join game';
  $('codeGroup').hidden = kind !== 'join';
  $('setupGroup').hidden = kind !== 'create';
  $('formErr').textContent = '';
  if (code) $('code').value = code;
  $('name').value = me.name || NL.identity()?.displayName?.slice(0, 20) || '';
  form.color = me.color;
  swatchPicker($('swatches'), form.color, [], c => { form.color = c; });
  if (kind === 'create') openFormSetup();
  render();
  (kind === 'join' && !code ? $('code') : $('name')).focus({ preventScroll: true });
}
const openFormSetup = () => drawSetup($('setupGroup'), form, 0, patch => {
  if ('decks' in patch) form.decksTouched = true;
  if ('capacity' in patch && !form.decksTouched) patch.decks = defaultDecks(patch.capacity);
  Object.assign(form, patch);
  openFormSetup();
});

// Colour swatches as a radio group; `taken` ids are struck through and skipped.
function drawSwatches(box, chosen, taken, pick) {
  box.replaceChildren(...COLORS.map(c => {
    const b = el('button', 'sw' + (taken.includes(c.id) ? ' taken' : ''));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', c.id === chosen);
    b.setAttribute('aria-label', c.name + (taken.includes(c.id) ? ', taken' : ''));
    b.style.background = c.hex;
    b.style.color = c.ink;
    b.append(svgUse('i-check', 20));
    b.disabled = taken.includes(c.id);
    b.onclick = () => pick(c.id);
    return b;
  }));
}
function swatchPicker(box, chosen, taken, onPick) {
  const pick = c => { onPick(c); drawSwatches(box, c, taken, pick); };
  drawSwatches(box, chosen, taken, pick);
}

// Estimated length: about 3.5 s a card, plus a pause between rounds.
const minutes = (players, tricks) => Math.max(5, Math.round((6 * tricks * players * 3.5 / 60 + 4.5) / 5) * 5);

// Table setup: editable (create form, host in the lobby) or a read-only summary. `seated` limits the capacity.
function drawSetup(box, cfg, seated, onSet) {
  const players = Math.max(2, seated || cfg.capacity), d = describeConfig(players, cfg.decks);
  const kids = [];
  const h = el('h2', '', 'Game setup');
  kids.push(h);
  if (onSet) {
    const capT = el('h3', 'cap', 'Seats'); capT.id = 'capT' + box.id;
    kids.push(capT, seg(capT.id, [2, 3, 4, 5, 6, 7, 8].map(n => ({ value: n, label: String(n), disabled: n < seated, aria: `${n} seats` })), cfg.capacity, v => onSet({ capacity: +v })));
    const dT = el('h3', 'cap', 'Decks'); dT.id = 'dT' + box.id;
    kids.push(dT, seg(dT.id, [1, 2, 3].map(n => ({ value: n, label: plural(n, 'deck') })), cfg.decks, v => onSet({ decks: +v })));
  }
  // Cards: one slot per deck, the host's choice of picture deck (or Standard), shown as backs or aces of spades.
  const art = Array.isArray(cfg.art) && cfg.art.length === 3 ? cfg.art : ['', '', ''];
  const aT = el('h3', 'cap', 'Cards'); aT.id = 'aT' + box.id;
  const row = el('div', 'art-row');
  row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', aT.id);
  for (let i = 0; i < cfg.decks; i++) {
    const b = el(onSet ? 'button' : 'div', 'art-opt');
    if (onSet) { b.type = 'button'; b.onclick = () => openDecks(i, art[i], id => onSet({ art: art.map((a, k) => k === i ? id : a) })); }
    b.setAttribute('aria-label', `Deck ${i + 1}: ${artName(art[i])}${onSet ? '. Change' : ''}`);
    b.append(deckPreview(art[i], artShow), el('b', '', `Deck ${i + 1}`), el('small', '', artName(art[i])));
    row.append(b);
  }
  kids.push(aT, row);
  const kv = el('div', 'kv');
  const cell = (b, s) => { const c = el('div'); c.append(el('b', '', b), el('span', 'cap', s)); return c; };
  kv.append(cell(plural(cfg.decks, 'deck'), `${52 * cfg.decks} cards`), cell(String(d.cardsEach), 'cards each'), cell(d.kitty ? String(d.kitty) : 'No', d.kitty ? 'in the kitty' : 'kitty'),
    cell(String(d.tricks), 'tricks a round'), cell(cfg.scoreDisplay === 'live' ? 'Live' : 'Round end', 'scores'), cell(`${minutes(players, d.tricks)} min`, 'about'));
  kids.push(kv);
  kids.push(el('p', 'cap soft', seated ? `Counted for the ${plural(players, 'player')} seated now; it updates as people join.` : `Counted for ${plural(players, 'player')}.`));
  if (d.kitty) kids.push(el('p', 'cap soft', `${52 * cfg.decks} cards do not split evenly, so ${plural(d.kitty, 'card')} form a kitty: the winner of each round's first trick takes it, face up.`));
  if (d.long) kids.push(el('p', 'warn', `Long game: ${d.cardsEach} cards each and ${d.tricks} tricks in every round. Fewer decks make it shorter.`));
  if (onSet) {
    const tT = el('h3', 'cap', 'Table'); tT.id = 'tT' + box.id;
    const tiles = el('div', 'tables');
    tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-labelledby', tT.id);
    for (const t of TABLES) {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', t.id === tableOf(cfg.tableTheme).id);
      const sw = el('span', 'sw-t');
      sw.style.background = `radial-gradient(ellipse at 50% 45%, ${t.a}, ${t.b})`;
      b.append(sw, t.name.replace('NordgrenLabs ', ''));
      b.setAttribute('aria-label', t.name);
      b.onclick = () => onSet({ tableTheme: t.id });
      tiles.append(b);
    }
    const sT = el('h3', 'cap', 'Scores'); sT.id = 'sT' + box.id;
    kids.push(tT, tiles, sT, seg(sT.id, [{ value: 'live', label: 'Live' }, { value: 'roundEnd', label: 'At round end' }], cfg.scoreDisplay, v => onSet({ scoreDisplay: v })),
      el('p', 'cap soft', 'At round end keeps this round’s points hidden until its results. Trick winners and captured cards stay public.'));
  } else {
    kids.push(el('p', 'cap soft', `Table: ${tableOf(cfg.tableTheme).name}. Locked once the game starts.`));
  }
  box.replaceChildren(...kids);
}

// ---- The host's deck picker. The Backs / Ace of spades choice is kept per device.
const ART_CHOICES = [{ id: '', name: 'Standard' }, ...DECKS];
const artName = id => ART_CHOICES.find(d => d.id === id)?.name || 'Standard';
const VIEW_KEY = 'nl-salad-deck-view';
let artShow = (() => { try { return localStorage.getItem(VIEW_KEY) === 'ace' ? 'ace' : 'back'; } catch { return 'back'; } })();
let onArt = null, artCur = '';
function openDecks(i, current, pick) {
  onArt = pick; artCur = current;
  $('deckTitle').textContent = `Deck ${i + 1}`;
  drawDeckSheet();
  $('deckSheet').showModal();
}
function drawDeckSheet() {
  $('deckView').replaceChildren(seg('deckTitle', [{ value: 'back', label: 'Backs' }, { value: 'ace', label: 'Ace of spades' }], artShow, v => {
    artShow = v; try { localStorage.setItem(VIEW_KEY, v); } catch {}
    drawDeckSheet(); render();
  }));
  $('deckGrid').replaceChildren(...ART_CHOICES.map(d => {
    const b = el('button', 'art-opt');
    b.type = 'button';
    b.setAttribute('aria-pressed', d.id === artCur);
    b.append(deckPreview(d.id, artShow), el('span', '', d.name.replace(' Deck', '')));
    b.onclick = () => { $('deckSheet').close(); onArt?.(d.id); };
    return b;
  }));
}
$('deckDone').onclick = () => $('deckSheet').close();

$('code').addEventListener('input', () => {
  const v = $('code').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  if ($('code').value !== v) $('code').value = v;
});
$('form').onsubmit = async e => {
  e.preventDefault();
  const name = $('name').value.trim(), code = $('code').value.trim();
  $('formErr').textContent = '';
  if (screen === 'join' && !/^[A-Z]{6}$/.test(code)) { $('formErr').textContent = 'Room codes are 6 letters.'; $('code').focus(); return; }
  if (!name) { $('formErr').textContent = ERR.invalid_name; $('name').focus(); return; }
  me = { name, color: form.color };
  saveMe(me);
  $('formGo').disabled = true;
  const r = screen === 'create'
    ? await net.create(name, form.color, { capacity: form.capacity, decks: form.decks, tableTheme: form.tableTheme, scoreDisplay: form.scoreDisplay, art: form.art })
    : await net.join(code, name, form.color);
  $('formGo').disabled = false;
  if (!r.ok) { $('formErr').textContent = errText(r.error); return; }
  screen = 'home';
  const mine = net.state.view.room.seats[net.state.view.you.seat];
  if (mine && mine.color !== form.color) toast(`${color(form.color).name} was taken, so you are ${color(mine.color).name}.`);
  render();
};
$('formBack').onclick = () => { screen = 'home'; render(); };

// ---- Lobby
let lobbyKey = '', qrCode = '';
function renderLobby(v) {
  const { room, you } = v, host = room.seats[room.host], mine = room.seats[you.seat];
  $('lobbyLede').textContent = you.host ? 'You’re the host. Start when everyone’s ready.' : `${host.name} is the host and starts the game.`;
  $('lobbyCode').textContent = room.code;
  $('lobbyLink').textContent = net.shareLink(room.code).replace(/^https?:\/\//, '');
  if (qrCode !== room.code) { qrCode = room.code; $('qr').innerHTML = qrSvg(net.shareLink(room.code)); } // our own SVG markup, no user text
  $('share').hidden = !navigator.share;
  $('seatsTitle').textContent = `Players · ${room.seats.length} of ${room.config.capacity} seats`;

  const rows = [];
  for (let i = 0; i < room.config.capacity; i++) {
    const s = room.seats[i], row = el('div', 'seat' + (s ? '' : ' open'));
    row.append(el('span', 'no', String(i + 1)));
    if (!s) { row.append(el('span', 'av l'), el('span', 'nm', 'Open seat')); rows.push(row); continue; }
    const nm = el('span', 'nm');
    nm.append(el('span', 'n', s.name));
    if (i === room.host) nm.append(el('span', 'tag', 'Host'));
    if (i === you.seat) nm.append(el('span', 'tag', 'You'));
    if (!s.connected) nm.append(el('span', 'tag', 'Away'));
    row.append(avatar(s, 'av l'), nm);
    if (i === you.seat) {
      const edit = el('button', 'btn sm', 'Edit');
      edit.setAttribute('aria-label', 'Change your name or colour');
      edit.onclick = () => openPlayer(v);
      row.append(edit);
    }
    if (i === room.host) row.append(el('span', 'rd', 'Hosting'));
    else if (i === you.seat) {
      const lab = el('span', 'ready-row', 'Ready'), t = el('button', 'toggle');
      t.setAttribute('role', 'switch');
      t.setAttribute('aria-checked', s.ready);
      t.setAttribute('aria-label', 'I’m ready');
      t.onclick = async () => { t.disabled = true; const r = await net.act({ type: 'SET_READY', ready: !s.ready }); t.disabled = false; if (!r.ok) toast(errText(r.error)); };
      lab.append(t);
      row.append(lab);
    } else {
      const rd = el('span', 'rd' + (s.ready ? '' : ' not'));
      if (s.ready) rd.append(svgUse('i-check'));
      rd.append(s.ready ? 'Ready' : 'Not ready');
      row.append(rd);
    }
    rows.push(row);
  }
  $('seatList').replaceChildren(...rows);

  const key = JSON.stringify([room.config, room.seats.length, you.host]);
  if (key !== lobbyKey) {
    lobbyKey = key;
    drawSetup($('lobbySetup'), room.config, room.seats.length, you.host ? async patch => {
      const r = await net.act({ type: 'SET_CONFIG', ...patch });
      if (!r.ok) { toast(errText(r.error)); lobbyKey = ''; render(); }
    } : null);
  }

  const waiting = room.seats.filter((s, i) => i !== room.host && !s.ready).map(s => s.name);
  $('startBtn').hidden = !you.host;
  $('startBtn').disabled = room.seats.length < 2 || waiting.length > 0;
  $('startNote').textContent = !you.host ? `Waiting for ${host.name} to start the game.`
    : room.seats.length < 2 ? 'Share the code: you need at least 2 players.'
    : waiting.length ? `Waiting for ${listOf(waiting)} to be ready.` : 'Everyone is ready.';
  void mine;
}
$('startBtn').onclick = async () => {
  $('startBtn').disabled = true;
  const r = await net.act({ type: 'START' });
  if (!r.ok) { toast(errText(r.error)); render(); }
};
const copy = async (text, done) => {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Copy did not work here. Select the text instead.'); }
};
$('copyLink').onclick = () => copy(net.shareLink(net.state.view.room.code), 'Invite link copied.');
$('copyCode').onclick = () => copy(net.state.view.room.code, 'Room code copied.');
$('share').onclick = () => {
  const code = net.state.view.room.code;
  navigator.share({ title: 'Canadian Salad', text: `Join my Canadian Salad table. Room code ${code}.`, url: net.shareLink(code) }).catch(() => {});
};
$('qr').onclick = () => $('qr').classList.toggle('big');

function openPlayer(v) {
  const s = v.room.seats[v.you.seat], taken = v.room.seats.filter((o, i) => i !== v.you.seat).map(o => o.color);
  let chosen = s.color;
  $('pName').value = s.name;
  $('pErr').textContent = '';
  swatchPicker($('pSwatches'), chosen, taken, c => { chosen = c; });
  $('pSave').onclick = async () => {
    const name = $('pName').value.trim();
    if (!name) { $('pErr').textContent = ERR.invalid_name; return; }
    const patch = { type: 'SET_PLAYER' };
    if (name !== s.name) patch.name = name;
    if (chosen !== s.color) patch.color = chosen;
    if (patch.name || patch.color) {
      const r = await net.act(patch);
      if (!r.ok) { $('pErr').textContent = errText(r.error); return; }
      me = { name, color: chosen };
      saveMe(me);
    }
    $('playerSheet').close();
  };
  $('playerSheet').showModal();
}

// ---- Dealer cut, shown once per game before the first lead.
function maybeCut(v) {
  const g = v.game;
  if (g.round !== 1 || g.tricksPlayed || g.trick?.plays.length || g.phase !== 'play') return;
  const key = v.room.id + JSON.stringify(g.cut);
  try { if (localStorage.getItem('nl-salad-cut') === key) return; localStorage.setItem('nl-salad-cut', key); } catch {}
  const rows = g.cut.map((row, r) => {
    const top = Math.max(...row.map(c => c.rank)), line = el('div', 'cutrow');
    for (const c of row) {
      const spot = el('div', 'spot'), card = cardEl(`d1-${c.rank <= 10 ? c.rank : 'JQKA'[c.rank - 11]}${c.suit}`, 'span');
      card.classList.add('sm');
      if (c.rank === top) card.classList.add('win');
      const who = el('span', 'who'), dot = el('i');
      dot.style.background = color(g.players[c.seat].color).hex;
      who.append(dot, el('span', '', c.seat === v.you.seat ? 'You' : g.players[c.seat].name));
      spot.append(card, who);
      line.append(spot);
    }
    if (r) line.prepend(el('p', 'cap', 'Tie, cut again:'));
    return line;
  });
  $('cutRows').replaceChildren(...rows);
  const name = s => s === v.you.seat ? 'You' : g.players[s].name;
  const leader = (g.dealer + 1) % g.players.length;
  $('cutResult').textContent = `${name(g.dealer)} ${g.dealer === v.you.seat ? 'deal' : 'deals'}. ${name(leader)} ${leader === v.you.seat ? 'lead' : 'leads'} the first trick.`;
  $('cutSheet').showModal();
}

// ---- Menu and sheets
NL.menu($('menu'));
$('mScores').onclick = () => openScores(net.state.view);
$('gScores').onclick = () => openScores(net.state.view);
$('newGame').onclick = () => { net.detach(); net.forgetRoom(); openForm('create'); };
$('mHow').onclick = () => openHow();
$('mSettings').onclick = () => openSettings(net.state.view);
$('mHome').onclick = () => { net.detach(); screen = 'home'; render(); };
$('mLeave').onclick = () => {
  const v = net.state.view;
  $('leaveTitle').textContent = 'Leave this room?';
  $('leaveNote').textContent = v.you.host && v.room.seats.length > 1 ? 'You give up your seat, and the next player becomes host.' : 'You give up your seat.';
  $('leaveGo').textContent = 'Leave room';
  $('leaveSheet').showModal();
};
$('leaveGo').onclick = async () => {
  $('leaveSheet').close();
  const r = await net.act({ type: 'LEAVE' });
  if (!r.ok && r.error !== 'not_found') toast(errText(r.error));
};
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  const h = d.querySelector('h2');
  if (h) { h.tabIndex = -1; h.autofocus = true; }
}

net.onChange(e => {
  if (e.type === 'view') { $('offline').hidden = true; render(); }
  else if (e.type === 'offline') $('offline').hidden = e.fails < 2;
  else if (e.type === 'gone') {
    $('offline').hidden = true;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    screen = 'home';
    render();
    if (e.reason === 'not_found') homeNote('That room has closed or you are no longer seated in it.');
  } else if (e.type === 'error') { screen = 'home'; net.detach(); render(); homeNote(errText(e.error)); }
});

// ---- Start: a ?room=CODE link goes straight to joining (or back to our seat there); else rejoin the saved room.
(async function boot() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (params.has('room')) { params.delete('room'); history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '')); }
  await NL.ready;
  if (!me.name) me.name = NL.identity()?.displayName?.slice(0, 20) || '';
  const saved = net.savedRoom();
  if (code.length === 6 && saved?.code !== code) { openForm('join', code); return; }
  if (saved && await net.reconnect()) return;
  if (code.length === 6) { openForm('join', code); return; }
  render();
})();

window.addEventListener('resize', () => { if (net.state.view?.game) renderTable(net.state.view, true); });
if ('serviceWorker' in navigator && !net.isDev) navigator.serviceWorker.register('sw.js', { scope: '/salad/' }).catch(() => {});
