// DiceLanes screens. All rules live in ../engine; this file dispatches actions and draws state.
import { LANES, LAST, POINTS, MARKS_BEFORE_LAST, MAX_PENALTIES, MAX_PLAYERS, score, standings } from '../engine/lanes.js';
import { canMark, isSkipped, pickOptions, hasPicks, indexOf, whiteSum } from '../engine/moves.js';
import { newGame, reduce, validState, endReason } from '../engine/reducer.js';
import { record, undo as undoHist, cleanHist, SAVE_CAP } from '../engine/history.js';
import { mountDie, showDie } from './dice.js';

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
const PREFS = 'nl-dicelanes-prefs';
let prefs = { haptics: 'on', picker: 'off' };
try {
  const p = JSON.parse(localStorage.getItem(PREFS));
  if (p?.haptics === 'off') prefs.haptics = 'off';
  if (p?.picker === 'on') prefs.picker = 'on';
} catch {}
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
// Only after a real tap: Chrome logs an error for vibrate() before any user activation.
const buzz = p => { if (prefs.haptics === 'on' && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); };
const narrow = matchMedia('(max-width: 359px)');
// Digital only: with your own dice a tap always crosses off.
const pickerOn = () => S.g?.mode === 'digital' && (prefs.picker === 'on' || narrow.matches);

// ---- State, autosaved on every render. It belongs to whoever was signed in (owner), so a game in progress never
// shows to the next person on this browser.
const KEY = 'nl-dicelanes-v1';
const fresh = () => ({ v: 1, owner: NL.person(), names: [], mode: 'physical', g: null, hist: [], saveId: null, createdAt: null, sel: 0, compact: false });
let S = fresh();
const me = NL.identity();
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && s.v === 1 && (!s.owner || s.owner === S.owner)) { // another person's autosave stays unread
    if (Array.isArray(s.names)) S.names = s.names.filter(n => typeof n === 'string').slice(0, MAX_PLAYERS).map(n => n.slice(0, 20));
    if (MODE_WORD[s.mode]) S.mode = s.mode;
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
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
NL.ready.then(i => {
  if (!me && i?.displayName && !S.names.length && !S.g) S.names.push(i.displayName.slice(0, 20));
  if (!S.g) render();
});
NL.account($('account'));

let rolling = false, note = '', popMarks = false; // popMarks: animate new crosses only right after a move

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
function change(action) {
  const next = reduce(S.g, action);
  if (next === S.g) return false;
  S.hist = record(S.hist, S.g);
  S.g = next;
  note = '';
  follow(action);
  popMarks = true;
  render();
  popMarks = false;
  return true;
}
function undo() {
  const u = undoHist(S.hist);
  if (!u) return;
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
  note = '';
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
  const names = S.g.players.map(p => p.name);
  Object.assign(S, { g: newGame({ mode: S.g.mode, names, seed: newSeed() }), hist: [], saveId: null, createdAt: null, sel: 0 });
  render();
}
function toSetup() {
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
    schemaVersion: 1, id: S.saveId, game: 'dicelanes', personPublicId: NL.person(),
    title: listOf(S.g.players.map(p => p.name)), status: S.g.status === 'over' ? 'finished' : 'in_progress',
    createdAt: S.createdAt, updatedAt: now,
    state: { g: S.g, hist: S.hist.slice(-SAVE_CAP), sel: S.sel },
  });
}
async function pause() {
  let saved;
  try { saved = await saveGame(); } catch { note = 'Could not save on this device.'; return render(); }
  shown = NL.saves.cached('dicelanes') || [saved, ...(shown || []).filter(x => x.id !== saved.id)];
  loadingSaves = false;
  toSetup();
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

let shown = NL.saves.cached('dicelanes'), loadingSaves = !shown, savesNote = '';
const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const NOT_SYNCED = { save_limit: 'Not synced: 200 saves is the limit, delete one', too_large: 'Not synced: too large to upload', refused: 'Not synced: the server refused it' };
async function refreshSaves() {
  try {
    shown = await NL.saves.list('dicelanes');
    savesNote = '';
  } catch {
    savesNote = shown ? 'Could not reach the server. Showing the last known list.' : 'Could not load saved games.'; // never invent an empty list
  }
  loadingSaves = false;
  drawSaves();
}
addEventListener('nl-saves', () => { if (!S.g) refreshSaves(); });
const OPEN_KEY = 'nl-dicelanes-saved-open';
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

// ---- Build the fixed parts of the sheet once; render() only updates them, so focus stays put.
const laneEls = [], cellEls = [];
LANES.forEach((lane, l) => {
  const row = el('div', `lane ${lane.id}`);
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', `${lane.name} lane`);
  cellEls[l] = [];
  for (let i = 0; i < 12; i++) {
    const b = el('button', i === 11 ? 'cell lock' : 'cell');
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
    const p = S.g.players[S.sel];
    if (change({ type: 'penalty', player: S.sel, add: k >= p.penalties })) buzz(20);
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
// Digital: this player's tentative picks as cells, so they can be drawn and tapped again to take back.
function pickedCells(g, p) {
  const t = g.turn, k = t?.phase === 'choose' ? t.picks[p] : null, out = [];
  if (!k) return out;
  if (k.white != null) out.push({ lane: k.white, index: indexOf(k.white, whiteSum(t.dice)), kind: 'white' });
  if (k.colour) out.push({ lane: k.colour.lane, index: indexOf(k.colour.lane, t.dice.w[k.colour.die] + t.dice.c[k.colour.lane]), kind: 'colour' });
  return out;
}
function tapCell(l, i) {
  const g = S.g;
  if (!g || g.status !== 'playing') return;
  const idx = i === 11 ? LAST : i, p = S.sel;
  let ok = false;
  if (g.mode === 'physical') {
    if (i === 11 && !canMark(g.players[p], g.closed, l, LAST)) ok = change({ type: 'close', lane: l });
    else ok = change({ type: 'mark', player: p, lane: l, index: idx });
  } else {
    if (rolling || g.turn.phase !== 'choose' || g.turn.done[p]) return;
    const mine = pickedCells(g, p).find(c => c.lane === l && c.index === idx);
    if (mine) ok = change({ type: 'unpick', player: p, kind: mine.kind });
    else {
      // A cell both picks could reach goes to the kind not used yet, white first.
      const here = legalMoves().filter(m => m.lane === l && m.index === idx), cur = g.turn.picks[p];
      const m = here.find(o => o.kind === 'white' && cur.white == null) || here.find(o => o.kind === 'colour' && !cur.colour) || here[0];
      if (!m) return;
      ok = change(m.kind === 'white' ? { type: 'pick', player: p, kind: 'white', lane: l } : { type: 'pick', player: p, kind: 'colour', lane: l, die: m.pick.colour.die });
    }
  }
  if (ok) { buzz(10); if ($('picker').open) $('picker').close(); }
}
function legalMoves() {
  const g = S.g;
  if (!g?.turn || rolling || g.status !== 'playing') return [];
  return pickOptions(g, S.sel);
}

function paintCell(b, l, i, legal) {
  const g = S.g, sheet = g.players[S.sel], lane = LANES[l], lock = i === 11, playing = g.status === 'playing';
  const marked = lock ? sheet.locks[l] : sheet.marks[l].includes(i);
  const skip = !lock && isSkipped(sheet, l, i);
  const isLegal = legal.some(m => m.lane === l && m.index === (lock ? LAST : i));
  const isPick = g.mode === 'digital' && pickedCells(g, S.sel).some(c => c.lane === l && c.index === (lock ? LAST : i));
  const wasX = b.classList.contains('x');
  b.classList.toggle('x', marked);
  b.classList.toggle('pop', marked && !wasX && popMarks);
  b.classList.toggle('skip', skip);
  b.classList.toggle('legal', isLegal && !isPick);
  b.classList.toggle('pick', isPick);
  b.classList.toggle('held', lock && marked);
  let label;
  if (lock) {
    const closed = g.closed[l], left = MARKS_BEFORE_LAST - sheet.marks[l].length;
    b.replaceChildren(tpl(closed || marked ? 'lockIcon' : 'openIcon'));
    if (!closed && left > 0) b.append(el('small', '', `${sheet.marks[l].length}/${MARKS_BEFORE_LAST}`));
    label = `${lane.name} lock` + (marked ? ', locked by this player' : closed ? ', closed' : left > 0 ? `, needs ${left} more` : ', ready');
  } else {
    if (b.firstChild?.textContent !== String(lane.nums[i])) b.replaceChildren(el('span', 'n', lane.nums[i]));
    label = `${lane.name} ${lane.nums[i]}` + (marked ? ', crossed' : isPick ? ', picked, tap to take back' : skip ? ', skipped' : '');
  }
  b.setAttribute('aria-label', label);
  let can;
  if (!playing) can = false;
  else if (g.mode === 'physical') can = canMark(sheet, g.closed, l, lock ? LAST : i) || (lock && !g.players.some(p => p.locks[l]));
  else can = (isLegal || isPick) && !rolling;
  b.disabled = !can;
}

// ---- Rendering
function render() {
  save();
  const playing = !!S.g;
  $('setupPage').hidden = playing;
  $('gamePage').hidden = !playing;
  $('gamesLink').hidden = playing;
  $('undo').hidden = !playing;
  $('undo').disabled = !S.hist.length;
  $('pause').hidden = !playing || S.g.status === 'over';
  $('restart').hidden = $('newGame').hidden = !playing;
  playing ? renderGame() : renderSetup();
  if ($('scoresSheet').open) renderScores();
}

const showMode = NL.segmented($('modeSeg'), v => { S.mode = v; render(); });
function renderSetup() {
  showMode(S.mode);
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
    c.lastChild.textContent = t;
    c.setAttribute('aria-pressed', S.sel === i);
    c.classList.toggle('mover', digital && m === i);
    c.classList.toggle('done', choosing && g.turn.done[i]);
    c.setAttribute('aria-label', `${p.name}, ${t} points${digital && m === i ? ', rolling player' : ''}${choosing && g.turn.done[i] ? ', done' : ''}`);
  });
  box.hidden = g.players.length < 2 || g.status === 'over'; // results show everyone at once
}

function renderGame() {
  const g = S.g, over = g.status === 'over', digital = !!g.turn;
  renderChips();
  $('results').hidden = !over;
  $('status').hidden = over;
  $('board').hidden = over;
  if (over) return renderResults();

  const sheet = g.players[S.sel];
  const status = $('status');
  status.replaceChildren(...(note ? [note] : digital ? turnLine() : g.players.length > 1 ? [el('strong', '', sheet.name), "'s sheet"] : ['Your sheet']));

  $('table').classList.toggle('digital', digital);
  $('tray').hidden = !digital;
  if (digital) renderTray();

  const legal = legalMoves(), picker = pickerOn();
  $('lanes').classList.toggle('choosing', digital && !rolling && g.turn.phase === 'choose' && !g.turn.done[S.sel]);
  laneEls.forEach((row, l) => {
    row.classList.toggle('closed', g.closed[l]);
    row.classList.toggle('pickable', picker);
    if (picker) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `${LANES[l].name} lane, open large`); }
    else { row.removeAttribute('tabindex'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', `${LANES[l].name} lane`); }
    cellEls[l].forEach((b, i) => { paintCell(b, l, i, legal); if (picker) b.tabIndex = -1; else b.removeAttribute('tabindex'); });
  });
  if ($('picker').open) paintPicker(legal);

  penEls.forEach((b, k) => {
    b.classList.toggle('on', k < sheet.penalties);
    b.disabled = digital || (k > sheet.penalties); // physical: tap the next box to add, the last taken one to remove
    b.setAttribute('aria-label', `Penalty ${k + 1}${k < sheet.penalties ? ', taken' : ''}`);
  });
  const sc = score(sheet);
  sc.lanes.forEach((v, l) => { eqEls.parts[l].textContent = v; });
  eqEls.pen.textContent = sc.penalty;
  eqEls.total.replaceChildren(el('small', '', 'Total'), String(sc.total));
}

// Digital: the line under the chips says whose sheet this is and what they may do.
function turnLine() {
  const g = S.g, t = g.turn, p = S.sel, name = g.players[p].name, solo = g.players.length === 1;
  const who = solo ? [] : [el('strong', '', name), ': '];
  if (rolling) return ['Rolling.'];
  if (t.phase === 'roll') return [`Turn ${t.n}. `, ...(solo ? ['Roll the dice.'] : [el('strong', '', g.players[t.active].name), ' rolls.'])];
  const s = whiteSum(t.dice);
  if (t.done[p]) {
    const waiting = g.players.filter((_, i) => !t.done[i]).map(x => x.name);
    return [...who, `done. Waiting for ${listOf(waiting)}.`];
  }
  const any = legalMoves().length || hasPicks(t.picks[p]);
  if (p === t.active) return [...who, any ? `cross off the white sum ${s}, one white die plus a colour, or both. Then tap Done.` : 'nothing fits this roll. Tap Done.'];
  return [...who, any ? `you may cross off ${s === 8 || s === 11 ? "an" : "a"} ${s}. Then tap Done.` : `no ${s} fits. Tap Done.`];
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
  $('sumLabel').textContent = fresh ? 'White sum' : 'Ready to roll';
  $('roll').hidden = t.phase !== 'roll';
  $('roll').disabled = rolling;
  const done = $('doneBtn'), p = S.sel, mine = fresh && t.done[p];
  done.hidden = !fresh;
  done.disabled = rolling;
  done.classList.toggle('reopen', !!mine);
  const solo = g.players.length === 1, name = g.players[p].name;
  done.textContent = mine ? `Change ${solo ? 'picks' : name + "'s picks"}`
    : p === t.active && fresh && !hasPicks(t.picks[p]) ? 'Done, take a penalty'
    : solo ? 'Done' : `Done for ${name}`;
}

async function roll() {
  if (rolling || !change({ type: 'roll' })) return;
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
  if (change({ type: 'done', player: S.sel, value: !t.done[S.sel] })) buzz(8);
}

// ---- Big lane picker: one lane, large, in order: the first six, then the rest and the lock.
let pickLane = 0;
const bigCells = Array.from({ length: 12 }, (_, i) => {
  const b = el('button', i === 11 ? 'cell lock' : 'cell');
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
  paintPicker(legalMoves());
  $('picker').showModal();
}
function paintPicker(legal) {
  const g = S.g;
  bigCells.forEach((b, i) => paintCell(b, pickLane, i, legal));
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
function renderResults() {
  const g = S.g, rows = standings(g.players), top = rows.filter(r => r.rank === 1).map(r => g.players[r.i].name);
  $('resultsTitle').textContent = g.players.length === 1 ? `${rows[0].total} points` : top.length > 1 ? `${listOf(top)} tie` : `${top[0]} wins`;
  const fourth = g.players.filter(p => p.penalties >= MAX_PENALTIES).map(p => p.name);
  $('resultsWhy').textContent = endReason(g) === 'penalties'
    ? `${g.players.length === 1 ? 'A' : `${listOf(fourth)} took a`} fourth penalty.`
    : `Two colours are locked: ${listOf(LANES.filter((_, l) => g.closed[l]).map(l => l.name.toLowerCase()))}.`;
  standingsList($('finalList'), g);
}
function renderScores() {
  const g = S.g;
  $('scoreList').hidden = !g;
  $('scoresLede').textContent = !g ? 'Start a game to see the scores here.'
    : g.status === 'over' ? 'Final scores.'
    : g.turn ? `Turn ${g.turn.n}. Lanes, penalties and totals for everyone.` : 'Lanes, penalties and totals for everyone, live.';
  if (g) standingsList($('scoreList'), g);
}

const showTheme = NL.segmented($('themeSeg'), v => { NL.theme.set(v); showTheme(v); });
const showHaptics = NL.segmented($('hapticsSeg'), v => { prefs.haptics = v; savePrefs(); showHaptics(v); buzz(10); });
const showPicker = NL.segmented($('pickerSeg'), v => { prefs.picker = v; savePrefs(); showPicker(v); render(); });
NL.menu($('menu'));
const closeMenu = () => { if ($('menu').classList.contains('open')) $('menu').querySelector('.menu-trigger').click(); };
const inProgress = () => !!S.g && S.g.status === 'playing' && S.hist.length > 0;
// Restart and New game stay in the open menu for their second tap (data-keep-open), then close it.
const chip = id => $(id).querySelector('span');
twoTap($('restart'), on => { chip('restart').textContent = on ? 'Tap again to restart' : 'Restart'; }, inProgress, () => !!S.g, () => { closeMenu(); restart(); });
twoTap($('newGame'), on => { chip('newGame').textContent = on ? 'Tap again to end this game' : 'New game'; }, inProgress, () => !!S.g, () => { closeMenu(); toSetup(); });

// ---- Sheets: Esc and a backdrop click close them.
for (const d of document.querySelectorAll('dialog')) d.onclick = e => { if (e.target === d) d.close(); };
$('scoresBtn').onclick = () => { renderScores(); $('scoresSheet').showModal(); };
$('rulesBtn').onclick = () => $('rulesSheet').showModal();
$('settingsBtn').onclick = () => { showTheme(NL.theme.get()); showHaptics(prefs.haptics); showPicker(prefs.picker); $('settingsSheet').showModal(); };
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
$('pause').onclick = pause;
$('roll').onclick = roll;
$('doneBtn').onclick = doneTap;
$('again').onclick = restart;
$('fresh').onclick = toSetup;
$('trayToggle').onclick = () => { S.compact = !S.compact; render(); };
narrow.addEventListener('change', render);

fixSel();
render();
if (!S.g) refreshSaves();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: '/dicelanes/' }).catch(() => {});
