// Dots and Boxes screens. All rules live in ../engine; this file dispatches actions and draws state.
import { CATEGORIES, PRESETS, preset, buildGeometry, validateSpec } from '../engine/boards.js';
import { newGame, reduce, legalEdges, result, countSteps, checkState, startEdges } from '../engine/reducer.js';
import { COLORS, color, clash } from './colors.js';
import { makeBoard, thumb } from './board.js';
import { mountDie, showDie } from './dice.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent, never innerHTML: names are user input
  return e;
};
const tpl = id => $(id).content.firstElementChild.cloneNode(true);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms)); // timers, so counting still finishes in a background tab
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 'es'}`; // "box", "boxes"
const tint = (e, id) => { for (const k of ['line', 'fill', 'ink']) e.style.setProperty(`--${k}-c`, `var(--c-${id}-${k})`); return e; };
const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const mk = (p, cls = '') => tint(el('span', `mk ${cls}`, p.marker), p.color);

// ---- Per-device settings: box count, haptics, the last players and board (remembered for the next game).
const PREFS = 'nl-dots-settings';
const MAX_NAME = 20;
const DEF_PLAYERS = () => [{ name: 'Player 1', marker: '', color: 'blue' }, { name: 'Player 2', marker: '', color: 'red' }];
let prefs = { box: 'live', haptics: 'on', roll: 'digital', board: 'sq-4x4', start: 'none', players: DEF_PLAYERS() }, storedPlayers = false;
try {
  const p = JSON.parse(localStorage.getItem(PREFS));
  if (p?.box === 'hide') prefs.box = 'hide';
  if (p?.haptics === 'off') prefs.haptics = 'off';
  if (p?.roll === 'physical') prefs.roll = 'physical';
  if (p?.start === 'swedish' || p?.start === 'icelandic') prefs.start = p.start;
  if (typeof p?.board === 'string') prefs.board = p.board.slice(0, 60);
  if (Array.isArray(p?.players) && p.players.length === 2) {
    prefs.players = p.players.map((q, i) => ({
      name: typeof q?.name === 'string' ? q.name.slice(0, MAX_NAME) : DEF_PLAYERS()[i].name,
      marker: typeof q?.marker === 'string' ? firstChar(q.marker) : '',
      color: color(q?.color) ? q.color : DEF_PLAYERS()[i].color,
    }));
    storedPlayers = true;
  }
} catch {}
function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} }

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

// ---- Markers: one displayable character (a grapheme, so an emoji or an accented letter counts as one).
function firstChar(s) { for (const { segment } of seg.segment(String(s).trim())) return segment.toLocaleUpperCase(); return ''; }
// A distinct marker for a name: the first letter of a later word ("Anna Bell" gives B), then any other letter.
function suggest(name, avoid) {
  const words = name.trim().split(/\s+/), tries = [...words.slice(1).map(firstChar), ...[...seg.segment(name)].map(s => s.segment.toLocaleUpperCase())];
  return tries.find(c => c.trim() && c !== avoid) || (avoid === '2' ? '1' : '2');
}
const nameOf = (p, i) => p.name.trim().slice(0, MAX_NAME) || `Player ${i + 1}`;
function markers(ps) {
  const n = ps.map(nameOf);
  let a = ps[0].marker || firstChar(n[0]), b = ps[1].marker || firstChar(n[1]);
  if (a === b && !ps[1].marker) b = suggest(n[1], a);
  else if (a === b && !ps[0].marker) a = suggest(n[0], b);
  return [a, b];
}
console.assert(JSON.stringify(markers(DEF_PLAYERS())) === '["P","2"]' && JSON.stringify(markers([{ name: 'Anna', marker: '' }, { name: 'Alex Berg', marker: '' }])) === '["A","B"]', 'marker suggestions');
const finalPlayers = () => { const m = markers(prefs.players); return prefs.players.map((p, i) => ({ name: nameOf(p, i), marker: m[i], color: p.color })); };

// ---- Custom layouts, stored on this device. Stored data is a trust boundary: only valid square masks are kept.
const LAYOUTS = 'nl-dots-layouts';
let layouts = [];
try {
  const l = JSON.parse(localStorage.getItem(LAYOUTS));
  if (Array.isArray(l)) layouts = l.filter(x => x && UUID.test(x.id) && typeof x.name === 'string' && validateSpec({ kind: 'square', mask: x.mask }).ok)
    .map(x => ({ id: x.id, name: x.name.slice(0, 24), mask: x.mask }));
} catch {}
const saveLayouts = () => { try { localStorage.setItem(LAYOUTS, JSON.stringify(layouts)); return true; } catch { return false; } };

const SIZE_WORD = { small: 'Small', medium: 'Medium', large: 'Large', huge: 'Extra large' };
const sizeOf = n => n <= 9 ? 'small' : n <= 25 ? 'medium' : n <= 49 ? 'large' : 'huge';
function boardById(id) {
  const p = preset(id);
  if (p) return { id, name: p.name, spec: p.spec, category: p.category, size: p.size };
  const l = id?.startsWith('custom:') && layouts.find(x => x.id === id.slice(7));
  if (l) { const spec = { kind: 'square', mask: l.mask }; return { id, name: l.name, spec, category: 'custom', size: sizeOf(validateSpec(spec).faces) }; }
  return null;
}
const chosenBoard = () => boardById(prefs.board) || boardById('sq-4x4');
const facesIn = spec => buildGeometry(spec).faces.length;
const boardLine = b => `${plural(facesIn(b.spec), 'box')} · ${SIZE_WORD[b.size]}`;
// Starting lines (a traditional variation): Icelandic is for square boards only, so another board falls back to None.
const START_NAME = { swedish: 'Swedish', icelandic: 'Icelandic' };
const START_TEXT = { swedish: 'The outer border starts drawn.', icelandic: 'The left and bottom edges start drawn.' };
const startFor = spec => prefs.start === 'icelandic' && spec.kind !== 'square' ? 'none' : prefs.start;
// A board's outline with the chosen starting lines drawn in, for the setup card and the picker.
const boardThumb = b => thumb(buildGeometry(b.spec), startEdges(b.spec, startFor(b.spec)));
const okStart = (spec, start) => { try { startEdges(spec, start); return true; } catch { return false; } };
// The board name as shown in the game, the results and saves: "4 × 4 · Swedish".
const withStart = (name, start) => START_NAME[start] ? `${name} · ${START_NAME[start]}` : name;

// ---- State, autosaved on every render. It belongs to whoever was signed in (owner), so a game in progress never
// shows to the next person on this browser.
const KEY = 'nl-dots-v1', CAP = 200, SAVE_CAP = 60;
const fresh = () => ({ v: 1, owner: NL.person(), page: 'setup', next: null, roll: null, g: null, hist: [], boardName: '', saveId: null, createdAt: null });
let S = fresh();
const okPlayers = ps => Array.isArray(ps) && ps.length === 2 && ps.every(p => p && typeof p.name === 'string' && p.name.length <= MAX_NAME && p.name.trim()
  && typeof p.marker === 'string' && p.marker.length > 0 && p.marker.length <= 16 && !!color(p.color));
const okGame = g => { try { checkState(g); return okPlayers(g.players); } catch { return false; } };
const okDie = d => Number.isInteger(d) && d >= 1 && d <= 6;
const okRoll = r => !!r && (r.mode === 'digital' || r.mode === 'physical') && Array.isArray(r.rounds) && r.rounds.every(x => Array.isArray(x) && x.length === 2 && x.every(okDie))
  && Array.isArray(r.cur) && r.cur.length === 2 && r.cur.every(d => d === null || okDie(d));
const okNext = n => !!n && okPlayers(n.players) && typeof n.board?.name === 'string' && validateSpec(n.board?.spec).ok && okStart(n.board.spec, n.start);
const cleanHist = h => (Array.isArray(h) ? h : []).filter(x => { try { return typeof x === 'string' && okGame(JSON.parse(x)); } catch { return false; } }).slice(-CAP);
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && s.v === 1 && (!s.owner || s.owner === S.owner)) { // another person's autosave stays unread
    if (s.g && okGame(s.g)) {
      Object.assign(S, { g: s.g, hist: cleanHist(s.hist), boardName: typeof s.boardName === 'string' ? s.boardName.slice(0, 40) : '' });
      if (UUID.test(s.saveId)) S.saveId = s.saveId;
      if (ISO.test(s.createdAt)) S.createdAt = s.createdAt;
    }
    if (s.page === 'boards') S.page = 'boards';
    if (s.page === 'roll' && okNext(s.next) && okRoll(s.roll)) Object.assign(S, { page: 'roll', next: s.next, roll: s.roll });
  }
} catch {}
const me = NL.identity();
// Pre-fill the first player only into a roster this device never set, with no game in progress.
const prefill = i => { if (i?.displayName && !storedPlayers && !S.g) { prefs.players[0].name = i.displayName.slice(0, MAX_NAME); storedPlayers = true; } };
prefill(me);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
NL.ready.then(i => { if (!me) { prefill(i); if (!S.g) render(); } });
NL.account($('account'));

// The box count setting: hidden means no running total anywhere until the game is over.
const hideCounts = () => prefs.box === 'hide' && S.g?.status === 'playing';

// ---- Game actions. Every change goes through here: snapshot for undo, reduce, render. Illegal actions change nothing.
let popEdge = -1, popFaces = null; // animate only the line and boxes just drawn
let revealPending = false, revealing = false, revealToken = 0, revealView = null;
const stopReveal = () => { revealToken++; revealing = revealPending = false; revealView = null; };
function change(action) {
  const next = reduce(S.g, action);
  if (next === S.g) return false;
  if (S.g.status === 'playing' && next.status === 'over') revealPending = true;
  S.hist = [...S.hist, JSON.stringify(S.g)].slice(-CAP);
  S.g = next;
  if (action.type === 'draw') { popEdge = action.edge; popFaces = next.last.faces; }
  render();
  popEdge = -1; popFaces = null;
  return true;
}
function undo() {
  if (!S.hist.length) return;
  stopReveal();
  S.g = JSON.parse(S.hist.at(-1));
  S.hist = S.hist.slice(0, -1);
  buzz(6);
  render();
}
function draw(edge) {
  if (!change({ type: 'draw', edge })) return;
  buzz(S.g.last.faces.length ? [10, 40, 10] : 10);
}
function nextTurn() {
  const had = document.activeElement === $('next');
  if (!change({ type: 'next' })) return;
  buzz(6);
  if (had) board?.svg.focus({ preventScroll: true }); // the button just went disabled; keep keyboard play on the board
}
function startGame(first) {
  const n = S.next;
  Object.assign(S, { g: newGame({ spec: n.board.spec, players: n.players, first, roll: { mode: S.roll.mode, rounds: S.roll.rounds }, start: n.start }),
    boardName: n.board.name, hist: [], saveId: null, createdAt: null, page: 'setup', next: null, roll: null });
  stopReveal();
  render();
  board?.svg.focus({ preventScroll: true }); // Start game is gone; play goes on at the board
}
// Same players, board and first player (Restart, and a rematch that keeps the order).
function replay() {
  stopReveal();
  const g = S.g;
  Object.assign(S, { g: newGame({ spec: g.spec, players: g.players, first: g.first, roll: g.roll, start: g.start }), hist: [], saveId: null, createdAt: null });
  render();
}
function toSetup() {
  stopReveal();
  Object.assign(S, { g: null, hist: [], saveId: null, createdAt: null, page: 'setup', next: null, roll: null, boardName: '' });
  render();
  refreshSaves();
}
const newRoll = () => ({ mode: prefs.roll, rounds: [], cur: [null, null] });
function toRoll(next) {
  S.next = next;
  S.roll = newRoll();
  S.page = 'roll';
  render();
}

// ---- Saved games, through NL.saves. put() writes to this browser at once and uploads in the background.
const title = g => `${g.players[0].name} and ${g.players[1].name}`;
async function saveGame() {
  const now = new Date().toISOString();
  if (!S.saveId) Object.assign(S, { saveId: crypto.randomUUID(), createdAt: now }); // before any await, so a double tap updates one record
  if (!S.createdAt) S.createdAt = (await NL.saves.get(S.saveId).catch(() => null))?.createdAt || now;
  return NL.saves.put({
    schemaVersion: 1, id: S.saveId, game: 'dots', personPublicId: NL.person(),
    title: title(S.g), status: S.g.status === 'over' ? 'finished' : 'in_progress',
    createdAt: S.createdAt, updatedAt: now,
    state: { g: S.g, hist: S.hist.slice(-SAVE_CAP), boardName: S.boardName },
  });
}
async function saveNow(noteEl) {
  let saved;
  try { saved = await saveGame(); } catch { noteEl.textContent = 'Could not save on this device.'; return false; }
  shown = NL.saves.cached('dots') || [saved, ...(shown || []).filter(x => x.id !== saved.id)];
  loadingSaves = false;
  return true;
}
const okRecord = r => !!r && okGame(r.state?.g);
async function resume(id) {
  const r = await NL.saves.get(id).catch(() => null); // a signed-in save can fail to load when the server is unreachable
  if (!okRecord(r)) { savesNote = 'Could not open that save. Check your connection and try again.'; return drawSaves(); }
  stopReveal();
  Object.assign(S, { g: r.state.g, hist: cleanHist(r.state.hist), saveId: r.id, createdAt: r.createdAt, page: 'setup', next: null, roll: null,
    boardName: typeof r.state.boardName === 'string' ? r.state.boardName.slice(0, 40) : '' });
  render();
}
function winLine(g) {
  const { scores, winner } = result(g);
  return winner === null ? `It's a tie` : `${g.players[winner].name} wins`;
}
function saveStatus(r) {
  const g = r.state.g, name = typeof r.state.boardName === 'string' ? r.state.boardName.slice(0, 40) : '';
  if (g.status === 'over') { const { scores, winner } = result(g); return `Finished, ${winner === null ? `tie at ${scores[0]}` : `${g.players[winner].name} ${scores[winner]} to ${scores[1 - winner]}`}`; }
  return `${name ? withStart(name, g.start) + ', ' : ''}${g.moves.length} of ${g.edges.filter(o => o !== -2).length} lines`;
}

let shown = NL.saves.cached('dots'), loadingSaves = !shown, savesNote = '';
const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const NOT_SYNCED = { save_limit: 'Not synced: 200 saves is the limit, delete one', too_large: 'Not synced: too large to upload', refused: 'Not synced: the server refused it' };
async function refreshSaves() {
  try {
    shown = await NL.saves.list('dots');
    savesNote = '';
  } catch {
    savesNote = shown ? 'Could not reach the server. Showing the last known list.' : 'Could not load saved games.'; // never invent an empty list
  }
  loadingSaves = false;
  drawSaves();
}
addEventListener('nl-saves', () => { if (!S.g) refreshSaves(); });
const OPEN_KEY = 'nl-dots-saved-open';
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
  open.append(el('strong', '', r.title), el('span', '', `${saveStatus(r)} · ${when}${sync}`));
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

// ---- Setup: two player cards (name, marker, colour), built once so typing keeps focus; paintPlayers updates them.
const pcards = prefs.players.map((_, i) => {
  const box = el('div', 'player'), r1 = el('div', 'prow'), r2 = el('div', 'prow');
  const prev = el('span', 'mk'), name = el('input', 'field'), marker = el('input', 'field marker'), sws = el('div', 'swatches');
  prev.setAttribute('aria-hidden', 'true');
  name.maxLength = MAX_NAME; name.autocomplete = 'off'; name.enterKeyHint = 'done'; name.id = `name${i}`;
  name.setAttribute('aria-label', `Player ${i + 1} name`);
  name.oninput = () => { prefs.players[i].name = name.value; savePrefs(); paintPlayers(); };
  marker.autocomplete = 'off'; marker.enterKeyHint = 'done'; marker.id = `marker${i}`; marker.setAttribute('autocapitalize', 'characters');
  marker.oninput = () => { prefs.players[i].marker = firstChar(marker.value); marker.value = prefs.players[i].marker; savePrefs(); paintPlayers(); };
  const ml = el('label', '', 'Box letter'); ml.htmlFor = marker.id;
  r1.append(prev, name);
  r2.append(ml, marker, el('span', 'note'));
  r2.lastChild.style.margin = '0';
  sws.setAttribute('role', 'radiogroup');
  sws.setAttribute('aria-label', `Player ${i + 1} colour`);
  const btns = COLORS.map(c => {
    const b = tint(el('button', 'sw'), c.id);
    b.setAttribute('role', 'radio');
    b.dataset.c = c.id;
    b.onclick = () => { prefs.players[i].color = c.id; savePrefs(); paintPlayers(); buzz(6); };
    return b;
  });
  // Arrow keys move the choice through the colours (one tab stop per player, like native radios).
  sws.onkeydown = e => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const k = (COLORS.findIndex(c => c.id === prefs.players[i].color) + d + COLORS.length) % COLORS.length;
    btns[k].click();
    btns[k].focus();
  };
  sws.append(...btns);
  box.append(r1, r2, sws);
  $('players').append(box);
  return { prev, name, marker, btns, hint: r2.lastChild };
});
function paintPlayers() {
  const ps = prefs.players, fin = finalPlayers();
  pcards.forEach((c, i) => {
    const p = ps[i], other = ps[1 - i];
    if (document.activeElement !== c.name) c.name.value = p.name;
    if (document.activeElement !== c.marker) c.marker.value = p.marker;
    c.name.placeholder = `Player ${i + 1}`;
    c.marker.placeholder = fin[i].marker;
    c.marker.setAttribute('aria-label', `${fin[i].name} box letter${p.marker ? '' : `, automatic ${fin[i].marker}`}`);
    c.hint.textContent = p.marker ? '' : 'Automatic';
    tint(c.prev, p.color).textContent = fin[i].marker;
    c.btns.forEach(b => {
      const on = b.dataset.c === p.color, near = clash(b.dataset.c, other.color);
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('near', near);
      b.setAttribute('aria-label', color(b.dataset.c).name + (near ? `, too close to ${nameOf(other, 1 - i)}'s colour` : ''));
    });
  });
  const problem = setupProblem();
  let note = '';
  const n0 = ps.map(nameOf);
  if (!problem && !ps[0].marker && !ps[1].marker && firstChar(n0[0]) === firstChar(n0[1])) {
    note = `Both names start with ${firstChar(n0[0])}, so ${fin[1].name}'s boxes show ${fin[1].marker}. Change the box letter if you like.`;
  }
  $('playersNote').textContent = problem || note;
  $('playersNote').classList.toggle('bad', !!problem);
  $('toRoll').disabled = !!problem;
  $('startHint').hidden = !problem;
  $('startHint').textContent = problem ? 'Fix the players above to continue.' : '';
}
function setupProblem() {
  const ps = prefs.players, fin = finalPlayers();
  if (clash(ps[0].color, ps[1].color)) return ps[0].color === ps[1].color
    ? 'Both players have the same colour. Pick another one for one of them.'
    : `${color(ps[0].color).name} and ${color(ps[1].color).name} look too alike. Pick another colour for one of them.`;
  if (fin[0].marker === fin[1].marker) return `Both players have the box letter ${fin[0].marker}. Give one of them another letter.`;
  return '';
}
function renderSetup() {
  paintPlayers();
  const b = chosenBoard(), box = $('chosen'), info = el('div'), change = el('button', 'btn', 'Change');
  info.append(el('strong', '', b.name), el('span', '', boardLine(b)));
  change.onclick = () => { pickId = chosenBoard().id; pickCat = chosenBoard().category; S.page = 'boards'; render(); scrollTo(0, 0); };
  change.setAttribute('aria-label', `Change board, now ${b.name}`);
  box.replaceChildren(boardThumb(b), info, change);
  const start = startFor(b.spec), square = b.spec.kind === 'square';
  showStart(start);
  $('startSeg').querySelector('[value="icelandic"]').disabled = !square;
  const note = [START_TEXT[start], square ? '' : 'Icelandic is for square boards only.'].filter(Boolean).join(' ');
  $('startNote').textContent = note;
  $('startNote').hidden = !note;
  drawSaves();
}

const showStart = NL.segmented($('startSeg'), v => { prefs.start = v; savePrefs(); renderSetup(); });

// ---- Board picker: categories, a card per board with its real outline, a larger preview of the one picked.
let pickId = prefs.board, pickCat = chosenBoard().category;
const CATS = [...CATEGORIES, { id: 'custom', name: 'Custom' }];
CATS.forEach(c => {
  const b = el('button', '', c.name);
  b.dataset.cat = c.id;
  b.onclick = () => { pickCat = c.id; renderBoards(); };
  $('cats').append(b);
});
function boardCard(b) {
  const card = el('button', 'bcard glass');
  card.append(boardThumb(b), el('strong', '', b.name), el('span', '', boardLine(b)));
  card.setAttribute('aria-pressed', b.id === pickId);
  card.onclick = () => { pickId = b.id; renderBoards(); };
  return card;
}
function renderBoards() {
  if (!boardById(pickId)) pickId = chosenBoard().id;
  for (const b of $('cats').children) b.setAttribute('aria-pressed', b.dataset.cat === pickCat);
  const list = pickCat === 'custom' ? layouts.map(l => boardById(`custom:${l.id}`)) : PRESETS.filter(p => p.category === pickCat).map(p => boardById(p.id));
  const cards = list.map(boardCard);
  if (pickCat === 'custom') {
    const add = el('button', 'bcard glass new');
    add.append(tpl('plusIcon'), el('strong', '', 'New layout'));
    add.onclick = () => openEditor(null);
    cards.push(add);
  }
  $('boardGrid').replaceChildren(...cards);
  const b = boardById(pickId), big = $('bigPreview');
  big.replaceChildren(boardThumb(b), el('strong', '', b.name), el('span', '', boardLine(b)));
  big.setAttribute('aria-label', `Picked: ${b.name}, ${boardLine(b)}`);
  if (b.category === 'custom') {
    const edit = el('button', 'btn', 'Edit');
    edit.onclick = () => openEditor(b.id.slice(7));
    edit.setAttribute('aria-label', `Edit ${b.name}`);
    big.append(edit);
  }
}
$('useBoard').onclick = () => { prefs.board = pickId; savePrefs(); S.page = 'setup'; render(); };
$('boardsBack').onclick = () => { S.page = 'setup'; render(); };

// ---- Custom layout editor: tap squares on a grid; the engine's validateSpec decides what is playable.
let ed = null;
function openEditor(id) {
  const l = id && layouts.find(x => x.id === id);
  const mask = l ? l.mask : ['#####', '#####', '#####', '#####', '#####'];
  ed = { id: l ? l.id : null, cells: mask.map(r => [...r].map(ch => ch === '#')) };
  $('editTitle').textContent = l ? 'Edit layout' : 'New layout';
  $('layoutName').value = l ? l.name : '';
  $('layoutDelete').hidden = !l;
  armDelete(false);
  paintEditor();
  $('editSheet').showModal();
}
const edMask = () => ed.cells.map(r => r.map(on => (on ? '#' : '.')).join(''));
// Empty rows and columns round the edge are dropped on save; the engine places what is left at the origin anyway.
function trimmed(mask) {
  let m = mask.filter(r => r.includes('#'));
  if (!m.length) return mask;
  const lo = Math.min(...m.map(r => r.indexOf('#'))), hi = Math.max(...m.map(r => r.lastIndexOf('#')));
  return m.map(r => r.slice(lo, hi + 1));
}
console.assert(JSON.stringify(trimmed(['....', '.##.', '..#.'])) === '["##",".#"]', 'trim layout');
function resize(rows, cols) {
  rows = Math.max(1, Math.min(12, rows)); cols = Math.max(1, Math.min(12, cols));
  ed.cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ed.cells[r]?.[c] ?? true));
  paintEditor();
}
function paintEditor() {
  const rows = ed.cells.length, cols = ed.cells[0].length, grid = $('cellGrid');
  $('rowsN').textContent = rows; $('colsN').textContent = cols;
  $('rowsDown').disabled = rows <= 1; $('rowsUp').disabled = rows >= 12; $('colsDown').disabled = cols <= 1; $('colsUp').disabled = cols >= 12;
  grid.style.setProperty('--cols', cols);
  if (grid.children.length !== rows * cols) {
    grid.replaceChildren(...ed.cells.flatMap((row, r) => row.map((_, c) => {
      const b = el('button');
      b.onclick = () => { ed.cells[r][c] = !ed.cells[r][c]; paintEditor(); };
      b.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
      return b;
    })));
  }
  [...grid.children].forEach((b, k) => b.setAttribute('aria-pressed', ed.cells[Math.floor(k / cols)][k % cols]));
  const v = validateSpec({ kind: 'square', mask: edMask() }), n = ed.cells.flat().filter(Boolean).length;
  $('editCount').textContent = v.ok ? `${plural(n, 'box')}, ready to play.` : `${plural(n, 'box')}. ${v.reason}`;
  $('editCount').classList.toggle('bad', !v.ok);
  $('layoutSave').disabled = !v.ok;
}
$('rowsUp').onclick = () => resize(ed.cells.length + 1, ed.cells[0].length);
$('rowsDown').onclick = () => resize(ed.cells.length - 1, ed.cells[0].length);
$('colsUp').onclick = () => resize(ed.cells.length, ed.cells[0].length + 1);
$('colsDown').onclick = () => resize(ed.cells.length, ed.cells[0].length - 1);
$('layoutSave').onclick = () => {
  const mask = trimmed(edMask());
  if (!validateSpec({ kind: 'square', mask }).ok) return;
  const name = $('layoutName').value.trim().slice(0, 24) || `Layout ${layouts.length + 1}`;
  const id = ed.id || crypto.randomUUID();
  const before = layouts;
  layouts = ed.id ? layouts.map(l => (l.id === id ? { id, name, mask } : l)) : [...layouts, { id, name, mask }];
  if (!saveLayouts()) { layouts = before; $('editCount').textContent = 'Could not save on this device.'; return; }
  pickId = `custom:${id}`; pickCat = 'custom';
  $('editSheet').close();
  render();
};
const armDelete = twoTap($('layoutDelete'), on => { $('layoutDelete').textContent = on ? 'Tap again to delete' : 'Delete'; }, () => true, () => !!ed?.id, () => {
  layouts = layouts.filter(l => l.id !== ed.id);
  saveLayouts();
  if (prefs.board === `custom:${ed.id}`) { prefs.board = 'sq-4x4'; savePrefs(); }
  $('editSheet').close();
  render();
});
$('layoutCancel').onclick = () => $('editSheet').close();

// ---- Who goes first: a D6 each, digital (Crossix's dice) or physical (type in what you rolled). Ties roll again.
const dice = [], pads = [];
let rolling = false;
const rcards = [0, 1].map(i => {
  const card = el('div', 'rcard glass'), who = el('div', 'who'), slot = el('div', 'slot'), btn = el('button', 'btn primary', 'Roll'), pad = el('div', 'pad');
  slot.setAttribute('role', 'img');
  dice[i] = mountDie(slot);
  showDie(dice[i], i ? 3 : 5);
  btn.onclick = () => rollDie(i);
  pad.setAttribute('role', 'group');
  pads[i] = [1, 2, 3, 4, 5, 6].map(v => {
    const b = el('button', '', v);
    b.onclick = () => enterDie(i, v);
    pad.append(b);
    return b;
  });
  card.append(who, slot, btn, pad);
  $('rcards').append(card);
  return { card, who, slot, btn, pad };
});
const rollWinner = r => { const last = r.rounds.at(-1); return last && last[0] !== last[1] ? (last[0] > last[1] ? 0 : 1) : null; };
// An unbiased 1 to 6 from the browser's random source.
const d6 = () => { const a = new Uint8Array(1); do crypto.getRandomValues(a); while (a[0] >= 252); return (a[0] % 6) + 1; };
function settleRound() {
  const r = S.roll;
  if (r.cur.every(d => d !== null)) { r.rounds.push(r.cur); r.cur = [null, null]; }
}
async function rollDie(i) {
  const r = S.roll;
  if (rolling || rollWinner(r) !== null || r.cur[i] !== null || (i === 1 && r.cur[0] === null)) return;
  const v = d6();
  rolling = true;
  r.cur[i] = v;
  buzz([8, 40, 8]);
  renderRoll();
  await showDie(dice[i], v, 2, i);
  dice[i].dataset.shown = v;
  rolling = false;
  if (S.roll !== r) return; // left the page mid-roll
  settleRound();
  render();
}
function enterDie(i, v) {
  const r = S.roll;
  if (rollWinner(r) !== null) return;
  r.cur[i] = v;
  buzz(6);
  settleRound();
  render();
}
const showRollMode = NL.segmented($('rollSeg'), v => { prefs.roll = v; savePrefs(); S.roll = newRoll(); render(); });
function renderRoll() {
  const r = S.roll, ps = S.next.players, win = rollWinner(r), last = r.rounds.at(-1), digital = r.mode === 'digital';
  showRollMode(r.mode);
  rcards.forEach((c, i) => {
    const p = ps[i];
    tint(c.card, p.color);
    c.who.replaceChildren(mk(p), el('span', '', p.name));
    c.card.classList.toggle('win', win === i);
    const v = r.cur[i] ?? last?.[i] ?? null;
    c.slot.hidden = !digital;
    c.slot.classList.toggle('idle', r.cur[i] === null && !(win !== null));
    c.slot.setAttribute('aria-label', v ? `${p.name} rolled ${v}` : `${p.name}'s die, not rolled yet`);
    if (!rolling && v && dice[i].dataset.shown !== String(v)) { showDie(dice[i], v); dice[i].dataset.shown = v; }
    c.btn.hidden = !digital || win !== null;
    c.btn.disabled = rolling || r.cur[i] !== null || (i === 1 && r.cur[0] === null);
    c.btn.textContent = last && last[0] === last[1] && r.cur[i] === null ? 'Roll again' : 'Roll';
    c.btn.setAttribute('aria-label', `${c.btn.textContent} for ${p.name}`);
    c.pad.hidden = digital;
    c.pad.setAttribute('aria-label', `${p.name} rolled`);
    pads[i].forEach((b, k) => { b.setAttribute('aria-pressed', (r.cur[i] ?? (win !== null ? last[i] : null)) === k + 1); b.disabled = win !== null; });
  });
  const msg = $('rollMsg');
  if (rolling) msg.replaceChildren('Rolling…');
  else if (win !== null) msg.replaceChildren(mk(ps[win]), `${ps[0].name} rolled ${last[0]}, ${ps[1].name} rolled ${last[1]}. ${ps[win].name} goes first.`);
  else if (last && r.cur.every(d => d === null)) msg.replaceChildren(`Both rolled ${last[0]}. It's a tie, so ${digital ? 'roll again, both of you' : 'roll again and enter the new numbers'}.`);
  else if (!digital) msg.replaceChildren(r.cur.some(d => d !== null) ? `Now ${ps[r.cur[0] === null ? 0 : 1].name}'s number.` : 'Roll a die each and tap what you rolled. Higher goes first.');
  else msg.replaceChildren(`${ps[r.cur[0] === null ? 0 : 1].name}, roll the die. Higher goes first.`);
  $('startGame').hidden = win === null || rolling;
  $('fixRoll').hidden = win === null || digital;
  // Focus never stays on <body> or on a button that just went away: move it to what comes next.
  const a = document.activeElement;
  if (a === document.body || ($('rollPage').contains(a) && (a.disabled || !a.offsetParent))) {
    const to = !$('startGame').hidden ? $('startGame') : rcards.map(c => c.btn).find(b => !b.hidden && !b.disabled);
    to?.focus({ preventScroll: true });
  }
}
$('startGame').onclick = () => { const w = rollWinner(S.roll); if (w !== null) startGame(w); };
$('fixRoll').firstElementChild.onclick = () => { S.roll.rounds.pop(); render(); };
$('rollBack').onclick = () => { S.page = 'setup'; S.next = S.roll = null; render(); };
$('toRoll').onclick = () => {
  if (setupProblem()) return;
  const b = chosenBoard();
  toRoll({ players: finalPlayers(), board: { name: b.name, spec: b.spec }, start: startFor(b.spec), rematch: false });
  scrollTo(0, 0);
};

// ---- The game screen: board, player panels, message and Next turn.
let board = null, boardKey = '';
const fitTo = (stage, b, geo) => {
  const cs = getComputedStyle(stage), vb = b.svg.viewBox.baseVal;
  const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (!w || !h) return;
  const s = Math.min(w / vb.width, h / vb.height);
  b.svg.style.width = `${Math.floor(vb.width * s)}px`;
  b.svg.style.height = `${Math.floor(vb.height * s)}px`;
  b.svg.style.setProperty('--u', `${s * 100}px`); // pixels per edge length, for line widths (board.js scales by 100)
};
const fitBoard = () => { if (board && !$('gamePage').hidden) fitTo($('stage'), board); };
new ResizeObserver(fitBoard).observe($('stage'));
function ensureBoard(g) {
  const key = JSON.stringify(g.spec);
  if (key === boardKey) return;
  boardKey = key;
  board = makeBoard(buildGeometry(g.spec), { onDraw: draw, live: $('boardLive') });
  board.svg.setAttribute('aria-label', 'Board');
  $('bwrap').replaceChildren(board.svg);
  requestAnimationFrame(fitBoard);
}
const panels = [0, 1].map(i => {
  const p = el('div', 'pl'), m = el('span', 'mk'), name = el('span', 'name'), tag = el('span', 'tag'), n = el('span', 'n');
  m.setAttribute('aria-hidden', 'true');
  p.setAttribute('role', 'group');
  p.append(m, name, tag, n);
  $('panels').append(p);
  return { p, m, name, tag, n };
});
let shownScores = [null, null];
function renderPanels(g) {
  // The mover keeps the highlight until Next turn is pressed; the next player only gets a quiet tag.
  const hide = hideCounts(), turn = g.active, next = g.pending ? g.pending.next : null;
  panels.forEach((c, i) => {
    const pl = g.players[i];
    tint(c.p, pl.color);
    tint(c.m, pl.color).textContent = pl.marker;
    c.name.textContent = pl.name;
    c.p.classList.toggle('active', turn === i && g.status === 'playing');
    c.tag.textContent = next === i ? 'Up next' : '';
    const v = hide ? '–' : String(g.scores[i]);
    c.n.classList.toggle('hid', hide);
    if (c.n.textContent !== v) {
      c.n.textContent = v;
      if (!hide && shownScores[i] !== null && g.scores[i] > shownScores[i] && !still()) { c.n.classList.remove('pop'); void c.n.offsetWidth; c.n.classList.add('pop'); }
    }
    shownScores[i] = hide ? null : g.scores[i];
    // Hidden counts stay out of the label too.
    c.p.setAttribute('aria-label', `${pl.name}, box letter ${pl.marker}, ${color(pl.color).name}${hide ? '' : `, ${plural(g.scores[i], 'box')}`}${turn === i ? ', drawing now' : next === i ? ', up next' : ''}`);
  });
}
function message(g) {
  const ps = g.players, p = g.pending;
  if (!p) return [ps[g.active], `${ps[g.active].name}, draw a line.`];
  if (p.claimed) return [ps[p.by], `${ps[p.by].name} claimed ${plural(p.claimed, 'box')}. ${ps[p.by].name} plays again.`];
  return [ps[p.next], `${ps[p.next].name} is up next. ${ps[p.by].name}, tap another line to move yours.`];
}
function paintBoard(g) {
  board.paint({
    edges: g.edges, faces: g.faces, players: g.players, mover: g.active,
    legal: g.status === 'playing' ? new Set(legalEdges(g)) : null,
    fresh: popEdge, freshFaces: popFaces,
    now: revealView?.now ?? null, counted: revealView?.counted ?? null,
    lockedText: 'The game is over.',
  });
}
function renderGame() {
  const g = S.g, over = g.status === 'over';
  ensureBoard(g);
  $('gamePage').classList.toggle('over', over);
  $('panels').hidden = over;
  $('turnbar').hidden = over;
  $('results').hidden = !over;
  if (!over) {
    renderPanels(g);
    const [who, text] = message(g);
    $('msg').replaceChildren(mk(who), el('span', '', text));
    $('next').disabled = !g.pending;
    $('boardName').textContent = withStart(S.boardName, g.start);
  }
  paintBoard(g);
  if (over) renderResults();
  requestAnimationFrame(fitBoard);
}

// ---- Results: Crossix's finish list. Rows of the board are counted top to bottom, each box in turn lit on the board
// and added to its owner's count; after each row the ranking re-sorts (FLIP). Then the winner glows. Tap or Skip ends it.
function renderResults() {
  const g = S.g;
  if (revealing) return; // the count is running; leave its rows alone
  const rows = resultRows(g);
  if (revealPending && !still()) { revealPending = false; runReveal(g, rows); return; }
  revealPending = false;
  finishReveal(g, rows);
}
function resultRows(g) {
  return g.players.map((p, i) => {
    const row = tint(el('li', 'rrow glass'), p.color), rank = el('span', 'rank', ''), num = el('span', 't', '0');
    row.append(rank, mk(p), el('span', 'who', p.name), num);
    return { row, rank, num, i };
  });
}
function placeRows(rows, counts, slide) {
  const list = $('reveal'), before = new Map(rows.map(r => [r, r.row.getBoundingClientRect().top]));
  const sorted = [...rows].sort((a, b) => counts[b.i] - counts[a.i] || a.i - b.i);
  list.append(...sorted.map(r => r.row));
  rows.forEach(r => {
    const rank = 1 + rows.filter(o => counts[o.i] > counts[r.i]).length;
    r.rank.textContent = rank;
    r.row.setAttribute('aria-label', `${g().players[r.i].name}, ${plural(counts[r.i], 'box')}, rank ${rank}`);
  });
  if (!slide || still()) return;
  for (const r of rows) {
    const dy = before.get(r) - r.row.getBoundingClientRect().top;
    if (dy) r.row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
}
const g = () => S.g;
function finishReveal(game, rows) {
  $('reveal').replaceChildren(...rows.map(r => r.row));
  const { scores, winner } = result(game);
  rows.forEach(r => {
    r.num.textContent = scores[r.i];
    r.num.classList.remove('now');
    r.num.classList.add('fin');
    const win = winner === null || winner === r.i; // a tie: both are treated the same, nobody steps back
    r.row.classList.toggle('win', win);
    r.row.classList.toggle('dim', !win);
    r.rank.classList.toggle('first', win);
  });
  placeRows(rows, scores, false);
  $('resultsTitle').textContent = winLine(game);
  $('resultsWhy').textContent = winner === null
    ? `Both claimed ${plural(scores[0], 'box')}${S.boardName ? ` on ${withStart(S.boardName, game.start)}` : ''}.`
    : `${plural(scores[winner], 'box')} to ${scores[1 - winner]}${S.boardName ? ` on ${withStart(S.boardName, game.start)}` : ''}.`;
  $('skip').hidden = true;
  $('after').hidden = false;
  $('again').textContent = 'Rematch';
}
async function runReveal(game, rows) {
  const my = ++revealToken, live = () => my === revealToken;
  revealing = true;
  const steps = countSteps(game), total = steps.flat().length, counts = [0, 0], counted = new Set();
  const per = Math.max(45, Math.min(260, Math.round(4500 / total))), beat = steps.length > 6 ? 300 : 450;
  $('reveal').replaceChildren(...rows.map(r => r.row));
  rows.forEach(r => r.row.classList.remove('win', 'dim'));
  placeRows(rows, counts, false);
  rows.forEach(r => { r.rank.textContent = ''; });
  $('resultsTitle').textContent = 'Counting the boxes';
  $('resultsWhy').textContent = '';
  $('skip').hidden = false;
  $('after').hidden = true;
  revealView = { now: null, counted };
  paintBoard(game);
  await wait(400);
  for (let r = 0; r < steps.length; r++) {
    if (!live()) return;
    $('resultsWhy').textContent = `Row ${r + 1} of ${steps.length}`;
    for (const { face, owner } of steps[r]) {
      if (!live()) return;
      revealView.now = face;
      paintBoard(game);
      counts[owner]++;
      const row = rows[owner];
      rows.forEach(x => x.num.classList.toggle('now', x === row));
      row.num.textContent = counts[owner];
      row.num.classList.remove('pop'); void row.num.offsetWidth; row.num.classList.add('pop');
      await wait(per);
      counted.add(face);
    }
    if (!live()) return;
    revealView.now = null;
    rows.forEach(x => x.num.classList.remove('now'));
    paintBoard(game);
    buzz(6);
    placeRows(rows, counts, true);
    await wait(beat);
  }
  if (!live()) return;
  revealing = false;
  revealView = null;
  paintBoard(game);
  finishReveal(game, rows);
  buzz([10, 60, 10]);
}
function skipReveal() {
  if (!revealing) return;
  stopReveal();
  render();
}
$('skip').onclick = e => { e.stopPropagation(); skipReveal(); };
// Tap anywhere on the results while counting skips it, but only a tap that began there: on a phone held upright the
// board shrinks when the last line ends the game, and the click from that same finger lands on the results.
let downOnResults = false;
document.addEventListener('pointerdown', e => { downOnResults = $('results').contains(e.target); }, true);
$('results').onclick = () => { if (downOnResults) skipReveal(); downOnResults = false; };

// ---- Rendering
function render() {
  save();
  const page = S.page === 'roll' ? 'roll' : S.g ? 'game' : S.page;
  $('setupPage').hidden = page !== 'setup';
  $('boardsPage').hidden = page !== 'boards';
  $('rollPage').hidden = page !== 'roll';
  $('gamePage').hidden = page !== 'game';
  const playing = page === 'game';
  $('gamesLink').hidden = playing;
  $('undo').hidden = !playing;
  $('undo').disabled = !S.hist.length;
  for (const id of ['exitBtn', 'newBtn', 'restart']) $(id).hidden = !playing;
  if (page === 'setup') renderSetup();
  else if (page === 'boards') renderBoards();
  else if (page === 'roll') renderRoll();
  else renderGame();
}

// ---- How to play: a small picture for each topic, drawn with the real board code.
const DEMO = () => finalPlayers();
function demoBoard(spec, set) {
  const geo = buildGeometry(spec), v = { edges: geo.edges.map(() => -1), faces: geo.faces.map(() => -1) };
  set(geo, v);
  const b = makeBoard(geo);
  b.paint({ ...v, players: DEMO(), mover: 0, legal: null });
  const pic = el('div', 'pic');
  pic.setAttribute('aria-hidden', 'true');
  pic.append(b.svg);
  return pic;
}
const sideOf = (geo, f) => geo.faces[f].edges;
function miniRows(rows) {
  const pic = el('div', 'pic'), box = el('div', 'mini');
  pic.setAttribute('aria-hidden', 'true');
  for (const [a, b, cls] of rows) { const s = el('span', cls || '', a); if (b != null) s.append(el('b', '', b)); box.append(s); }
  pic.append(box);
  return pic;
}
function renderTopics() {
  const P = DEMO();
  const one = { kind: 'square', mask: ['##', '##'] }; // the engine's smallest board; every picture uses it
  const topics = [
    ['Drawing lines', 'On your turn, tap between two dots that sit next to each other to draw one line. Lines run along the grid, never diagonally on square boards.',
      demoBoard(one, (geo, v) => { [0, 5, 7].forEach((e, k) => { v.edges[e] = k % 2; }); })],
    ['Claiming boxes', `Draw the last side of a box and it is yours: it fills with your colour and your letter, like ${P[0].marker} here.`,
      demoBoard(one, (geo, v) => { sideOf(geo, 0).forEach((e, k) => { v.edges[e] = k === 3 ? 0 : k % 2; }); v.faces[0] = 0; })],
    ['Extra turns', 'Claim a box and you play again. A line that closes nothing passes the turn to the other player.',
      demoBoard(one, (geo, v) => { sideOf(geo, 0).forEach(e => { v.edges[e] = 0; }); v.faces[0] = 0; sideOf(geo, 1).slice(0, 2).forEach(e => { v.edges[e] = 1; }); })],
    ['Double boxes', 'One line can close two boxes at once. That is two boxes, but still only one extra turn.',
      demoBoard(one, (geo, v) => { [...sideOf(geo, 0), ...sideOf(geo, 1)].forEach((e, k) => { v.edges[e] = k % 3 ? 1 : 0; }); geo.edgeFaces.forEach((f, e) => { if (f.includes(0) && f.includes(1)) v.edges[e] = 0; }); v.faces[0] = v.faces[1] = 0; })],
    ['Next turn', 'After your line, tap Next turn to hand over (or to carry on after a box). Until then you can tap another line to move yours.',
      miniRows([[`${P[1].name} is up next`], ['Next turn', null, 'go']])],
    ['Winning', 'When every line is drawn, the boxes are counted row by row. More boxes wins. The same count is a tie.',
      miniRows([[P[0].name, '9'], [P[1].name, '7']])],
    ['Different shapes', 'Boards come as squares, shapes with gaps and holes, triangles and hexagons. Every closed shape counts as one box. Gaps never count.',
      demoBoard(preset('tri-small').spec, (geo, v) => { geo.faces.forEach((f, k) => { if (k % 3 === 0) { f.edges.forEach(e => { v.edges[e] = k % 2; }); v.faces[k] = k % 2; } }); })],
    ['Starting lines', 'Swedish starts with the outer border drawn, Icelandic with the left and bottom edges (square boards only). Nobody owns those lines, and a box can start with three sides.',
      demoBoard(one, (geo, v) => { startEdges(one, 'swedish').forEach(e => { v.edges[e] = -2; }); })],
    ['Hidden scores', 'In Settings, Hide until the end keeps both totals out of sight. Boxes still show who claimed them.',
      miniRows([[P[0].name, '–'], [P[1].name, '–']])],
  ];
  $('topics').replaceChildren(...topics.map(([h, p, pic]) => { const t = el('div', 'topic'), d = el('div'); d.append(el('h3', '', h), el('p', '', p)); t.append(pic, d); return t; }));
}

// ---- Tutorial: the real game on a 2 × 2 board inside a sheet, with a hint for each moment. Never saved, never forced.
let tut = null, tutBoard = null;
const TUT_SPEC = { kind: 'square', mask: ['##', '##'] };
function startTutorial() {
  tut = newGame({ spec: TUT_SPEC, players: DEMO(), first: 0, roll: null });
  tutBoard = makeBoard(buildGeometry(TUT_SPEC), { onDraw: e => { const n = reduce(tut, { type: 'draw', edge: e }); if (n !== tut) { tut = n; buzz(10); paintTut(e); } }, live: $('tutLive') });
  tutBoard.svg.setAttribute('aria-label', 'Tutorial board');
  const wrap = el('div', 'bwrap');
  wrap.append(tutBoard.svg);
  $('tutStage').replaceChildren(wrap);
  paintTut();
}
function paintTut(fresh = -1) {
  const t = tut, ps = t.players, geo = buildGeometry(TUT_SPEC), p = t.pending;
  tutBoard.paint({ edges: t.edges, faces: t.faces, players: ps, mover: t.active, legal: new Set(legalEdges(t)), fresh, freshFaces: fresh >= 0 ? t.last.faces : null,
    lockedText: 'The board is full.' });
  let msg;
  if (t.status === 'over') {
    const { scores, winner } = result(t);
    msg = `The board is full: ${ps[0].name} ${scores[0]}, ${ps[1].name} ${scores[1]}. ${winner === null ? "It's a tie." : `${ps[winner].name} wins.`}`;
  } else if (p?.claimed === 2) msg = `${ps[p.by].name} closed two boxes with one line: two boxes, one extra turn. Tap Next turn.`;
  else if (p?.claimed) msg = `${ps[p.by].name} closed a box, so it is theirs and they play again. Tap Next turn.`;
  else if (p) msg = `No box, so ${ps[p.next].name} is up next. Tap another line to move yours, or tap Next turn.`;
  else if (geo.faces.some((f, k) => t.faces[k] === -1 && f.edges.filter(e => t.edges[e] === -1).length === 1)) msg = `${ps[t.active].name}, a box has three sides. Draw the fourth to claim it.`;
  else msg = `${ps[t.active].name}, tap between two dots to draw a line.`;
  $('tutMsg').textContent = msg;
  $('tutNext').textContent = t.status === 'over' ? 'Play again' : 'Next turn';
  $('tutNext').disabled = !p && t.status !== 'over';
  requestAnimationFrame(() => fitTo($('tutStage'), tutBoard));
}
$('tutNext').onclick = () => {
  if (tut.status === 'over') return startTutorial();
  tut = reduce(tut, { type: 'next' });
  paintTut();
  if (document.activeElement === $('tutNext')) tutBoard.svg.focus({ preventScroll: true });
};
$('tutBtn').onclick = () => { $('rulesSheet').close(); startTutorial(); $('tutSheet').showModal(); };
$('tutDone').onclick = () => $('tutSheet').close();

// ---- Menu and sheets
const showTheme = NL.segmented($('themeSeg'), v => { NL.theme.set(v); showTheme(v); });
const showBox = NL.segmented($('boxSeg'), v => { prefs.box = v; savePrefs(); showBox(v); render(); });
const showHaptics = NL.segmented($('hapticsSeg'), v => { prefs.haptics = v; savePrefs(); showHaptics(v); buzz(10); });
NL.menu($('menu'));
const closeMenu = () => { if ($('menu').classList.contains('open')) $('menu').querySelector('.menu-trigger').click(); };
const inProgress = () => !!S.g && S.g.status === 'playing' && S.g.moves.length > 0;
const chip = id => $(id).querySelector('span');
// Restart stays in the open menu for its second tap (data-keep-open), then closes it. Same players, board and first player.
twoTap($('restart'), on => { chip('restart').textContent = on ? 'Tap again to restart' : 'Restart'; }, inProgress, () => !!S.g, () => { closeMenu(); replay(); });
function endSheet(kind) {
  const fin = S.g?.status === 'over';
  $('endTitle').textContent = kind === 'new' ? 'Start a new game?' : fin ? 'Leave the results?' : 'End this game?';
  $('endNote').textContent = kind === 'new'
    ? `Choose players and a board again. ${fin ? 'Save the result to see it again later.' : 'Save this game to pick it up later from Saved games.'}`
    : fin ? 'Save the result to see it again later.' : 'Save it to pick up later from Saved games.';
  $('saveExit').textContent = kind === 'new' ? 'Save and start new' : 'Save and exit';
  $('discard').textContent = kind === 'new' ? 'Start new without saving' : fin ? 'Exit without saving' : 'End without saving';
  $('keep').textContent = fin ? 'Back to results' : 'Keep playing';
  $('endSheet').showModal();
}
$('exitBtn').onclick = () => endSheet('exit');
$('newBtn').onclick = () => endSheet('new');
$('toNew').onclick = e => { e.stopPropagation(); endSheet('new'); };
// Back to the start screen at once with the save in the list; the upload finishes in the background.
$('saveExit').onclick = async () => { if (await saveNow($('endNote'))) { $('endSheet').close(); toSetup(); } };
$('discard').onclick = () => { $('endSheet').close(); toSetup(); };
$('keep').onclick = () => $('endSheet').close();
$('again').onclick = e => {
  e.stopPropagation();
  $('rematchKeep').textContent = `Keep ${S.g.players[S.g.first].name} first`;
  $('rematchSheet').showModal();
};
$('rematchRoll').onclick = () => {
  $('rematchSheet').close();
  toRoll({ players: S.g.players, board: { name: S.boardName, spec: S.g.spec }, start: S.g.start, rematch: true });
};
$('rematchKeep').onclick = () => { $('rematchSheet').close(); replay(); };
$('rematchCancel').onclick = () => $('rematchSheet').close();
// Back from a rematch roll returns to the results it came from.
const rollBackDefault = $('rollBack').onclick;
$('rollBack').onclick = () => { if (S.next?.rematch && S.g) { S.page = 'setup'; S.next = S.roll = null; render(); } else rollBackDefault(); };

for (const d of document.querySelectorAll('dialog')) d.onclick = e => { if (e.target === d) d.close(); };
// Like an iPhone sheet: drag down while it is scrolled to the top, let go past a quarter of its height (or flick) to dismiss.
for (const d of document.querySelectorAll('dialog.sheet')) {
  const h = d.querySelector('h2'); // focus the title on open, so a tall sheet opens at its top, not scrolled to its Done button
  if (h) { h.tabIndex = -1; h.autofocus = true; }
  let y0 = null, dy = 0, t0 = 0, drag = false;
  d.addEventListener('touchstart', e => {
    // Not from a board: a finger there is drawing a line.
    y0 = d.open && d.scrollTop <= 0 && e.touches.length === 1 && !e.target.closest('svg.board') ? e.touches[0].clientY : null;
    dy = 0; t0 = e.timeStamp; drag = false;
  }, { passive: true });
  d.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!drag && dy <= 0) { y0 = null; return; } // an upward move scrolls the sheet as usual
    drag = true;
    e.preventDefault();
    d.style.transition = 'none';
    d.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  d.addEventListener('touchend', e => {
    if (!drag) { y0 = null; return; }
    y0 = null; drag = false;
    const flick = dy / Math.max(1, e.timeStamp - t0) > 0.5 && dy > 30;
    d.style.transition = still() ? 'none' : 'transform .22s ease-out';
    if (dy > d.offsetHeight / 4 || flick) {
      d.style.transform = 'translateY(calc(100% + 40px))';
      setTimeout(() => { d.close(); d.style.transition = d.style.transform = ''; }, still() ? 0 : 200);
    } else d.style.transform = '';
  });
  d.addEventListener('close', () => { d.style.transition = d.style.transform = ''; });
}
$('rulesBtn').onclick = () => { renderTopics(); $('rulesSheet').showModal(); };
$('settingsBtn').onclick = () => { showTheme(NL.theme.get()); showBox(prefs.box); showHaptics(prefs.haptics); $('settingsSheet').showModal(); };
for (const id of ['rules', 'settings']) $(`${id}Done`).onclick = () => $(`${id}Sheet`).close();
$('undo').onclick = undo;
$('next').onclick = nextTurn;

render();
if (!S.g) refreshSaves();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: '/dots/' }).catch(() => {});
