// Dusk Keep frontend (system 10). A projection of the engine: it dispatches legal actions to
// reduce() and renders view(game, content, seat) for whoever is looking. No rules live here.
import FIXTURES from '../content/fixtures/fixtures.js';
import ORIGINAL from '../content/original/index.js';
import { createGame, reduce, restore, DEFAULT_RULES } from '../engine/reducer.js';
import { legalActions } from '../engine/phases.js';
import { view, canUndoTo, screenOwner } from '../engine/view.js';
import { neighbour, edgeKind, squareKind, key } from '../engine/board.js';
import { cardDef } from '../engine/decks.js';
import { SUNSET } from '../engine/clock.js';
import { validateContent, contentIndex } from '../content/schema.js';
import { drawBoard, svg, place, tileWords } from './board.js';
import { lines, cardText, monsterText, expr, DIR, STAT, CHOICE, REACTION, PLACEMENT, FACE, towerName } from './words.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent, never innerHTML: names are user input
  return e;
};
const listOf = names => new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const CONTENT = { fixture: FIXTURES, original: ORIGINAL };
const REPORT = validateContent(ORIGINAL);
const FX_REPORT = validateContent(FIXTURES);
const KEY = 'nl-keep-v1';
const HIST_CAP = 20; // shortcut: full snapshots, at most 20 and cleared at every commit point; store diffs if long uncommitted runs ever matter

// Rules-config flags with their ruling and class from the plan's decision register (display only).
const RULE_INFO = {
  darkRoomOnReentry: v => `D06, interpretation, provisional. ${v ? 'Going back into a dark room makes you roll your way out again.' : 'Only the first entry is dark.'}`,
  forcedMoveTileEffects: v => `Open point 3 (with D19), interpretation, provisional. ${v ? 'Room effects apply where the dragon drives a hero.' : 'No room effects there.'}`,
  soloCombat: v => (v === 'target' ? 'D17, original rule. Solo fights use the target with results entered by hand.' : 'D17, application only. A, B or C against a computer pick is a digital variant, not an original rule.'),
};

// ---- State. The engine game plus what the screen needs; saved on every change.
const fresh = () => ({ v: 1, count: 2, names: ['', '', '', ''], soloCombat: 'target', mode: null, game: null, hist: [], saveId: null, createdAt: null, finishedSaved: false, seen: 0, reveal: null, peek: null, zoom: 1 });
let S = fresh();
let viewer = null; // the seat looking now; never saved, so a refresh always covers a private screen
let target = { placement: null, face: null }; // solo target entry, before it is sent
let keyboard = false;

const okSnap = (h, c) => { try { restore(JSON.stringify(h), c); return true; } catch { return false; } };
function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { return; }
  if (!s || s.v !== 1) return;
  const b = fresh();
  if ([1, 2, 3, 4].includes(s.count)) b.count = s.count;
  if (Array.isArray(s.names)) b.names = b.names.map((n, i) => (typeof s.names[i] === 'string' ? s.names[i].slice(0, 20) : ''));
  if (['target', 'abc-digital-variant'].includes(s.soloCombat)) b.soloCombat = s.soloCombat;
  if ([1, 1.5, 2, 3].includes(s.zoom)) b.zoom = s.zoom;
  // Stored data is a trust boundary: the engine's restore() checks versions, content and shape.
  if (s.game && CONTENT[s.mode]) {
    try {
      const c = CONTENT[s.mode];
      b.game = restore(JSON.stringify(s.game), c);
      b.mode = s.mode;
      b.hist = Array.isArray(s.hist) ? s.hist.filter(h => okSnap(h, c)).slice(-HIST_CAP) : [];
      if (UUID.test(s.saveId)) b.saveId = s.saveId;
      if (ISO.test(s.createdAt)) b.createdAt = s.createdAt;
      b.finishedSaved = s.finishedSaved === true;
      b.seen = Number.isInteger(s.seen) && s.seen <= b.game.log.length ? s.seen : b.game.log.length;
      const r = s.reveal;
      if (r && Number.isInteger(r.seat) && r.seat >= 0 && r.seat < b.game.seats.length && ['A', 'B', 'C'].includes(r.hero) && ['A', 'B', 'C'].includes(r.monster) && Number.isInteger(r.heroDmg) && Number.isInteger(r.monsterDmg)) b.reveal = r;
      const n = b.game.seats.length;
      if (s.peek && Number.isInteger(s.peek.seat) && s.peek.seat >= 0 && s.peek.seat < n) b.peek = { seat: s.peek.seat, from: Number.isInteger(s.peek.from) ? s.peek.from : null };
    } catch { b.game = null; b.mode = null; }
  }
  S = b;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {
    try { localStorage.setItem(KEY, JSON.stringify({ ...S, hist: [] })); } catch {}
  }
}

const content = () => CONTENT[S.mode];
const solo = () => S.game.seats.length === 1;
const nameOf = seat => S.game.seats[seat].name;
const heroDef = (h) => contentIndex(content()).heroes.get(h.heroId);
const ctx = () => ({ content: content(), name: nameOf });

// ---- Actions: every one goes to the engine, which refuses anything not legal now.
function act(a) {
  const prev = S.game, c = content();
  let next;
  try { next = reduce(prev, a, c); } catch { return render(); } // a stale double tap: nothing happens
  // D21: undo only steps back over actions that revealed nothing (the engine counts commit points).
  S.hist = canUndoTo(prev, next) ? [...S.hist, prev].slice(-HIST_CAP) : [];
  S.seen = prev.log.length;
  const added = next.log.slice(prev.log.length);
  const multi = next.seats.length > 1;
  const ex = added.find(e => e.kind === 'exchange');
  S.reveal = multi && ex ? { seat: prev.encounter.seat, hero: ex.hero, monster: ex.monster, heroDmg: ex.heroDmg, monsterDmg: ex.monsterDmg } : null;
  const priv = added.find(e => (e.kind === 'draw' || e.kind === 'retain') && e.private !== undefined && e.deck !== 'MONSTER');
  S.peek = multi && priv ? { seat: priv.private, from: prev.log.length } : null;
  target = { placement: null, face: null };
  S.game = next;
  render();
}
const canUndo = () => !!S.game && S.hist.length > 0 && canUndoTo(S.hist.at(-1), S.game);
function undo() {
  if (!canUndo()) return;
  S.game = S.hist.pop();
  S.seen = Math.min(S.seen, S.game.log.length);
  S.reveal = null;
  S.peek = null;
  render();
}

function newGame(mode) {
  const players = S.names.slice(0, S.count).map((n, i) => n.trim() || `Player ${i + 1}`);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  let game;
  try { game = createGame({ players, seed, content: CONTENT[mode], rules: { soloCombat: S.soloCombat } }); } catch (err) {
    $('startReason').textContent = err.message;
    return;
  }
  Object.assign(S, { mode, game, hist: [], saveId: null, createdAt: null, finishedSaved: false, seen: 0, reveal: null, peek: null });
  viewer = players.length === 1 ? 0 : null;
  render();
  window.scrollTo(0, 0);
}

function toTitle() {
  Object.assign(S, { mode: null, game: null, hist: [], saveId: null, createdAt: null, finishedSaved: false, seen: 0, reveal: null, peek: null });
  viewer = null;
  render();
  window.scrollTo(0, 0);
}

// ---- Saves through NL.saves.
function saveTitle(g) {
  const n = g.seats.length;
  const when = g.status === 'over' ? 'finished' : g.status === 'setup' ? 'setting up' : `sun ${g.sun}`;
  return `Dusk Keep, ${n} ${n === 1 ? 'player' : 'players'}, ${when}${g.banner ? `, ${g.banner}` : ''}`;
}
async function saveGame() {
  const g = S.game;
  S.saveId ||= crypto.randomUUID(); // set before awaiting so a double tap updates one record
  const now = new Date().toISOString();
  S.createdAt ||= now;
  persist();
  let state = { mode: S.mode, game: g, hist: S.hist };
  if (JSON.stringify(state).length > 240000) state = { mode: S.mode, game: g, hist: [] }; // the server keeps 256 KB per save
  const old = await NL.saves.get(S.saveId).catch(() => null);
  await NL.saves.put({
    schemaVersion: 1, id: S.saveId, game: 'keep',
    personPublicId: old ? old.personPublicId : NL.identity()?.personPublicId ?? null,
    title: saveTitle(g), status: g.status === 'over' ? 'finished' : 'in_progress',
    createdAt: old ? old.createdAt : S.createdAt, updatedAt: now, state,
  });
}
const okRecord = r => !!r?.state && CONTENT[r.state.mode] && !!r.state.game && typeof r.state.game === 'object';

async function resume(id) {
  const r = await NL.saves.get(id).catch(() => null);
  let game, c;
  try { c = CONTENT[r.state.mode]; game = restore(JSON.stringify(r.state.game), c); } catch { toast('That save cannot be opened.'); return renderSaves(); }
  Object.assign(S, {
    mode: r.state.mode, game, hist: Array.isArray(r.state.hist) ? r.state.hist.filter(h => okSnap(h, c)).slice(-HIST_CAP) : [],
    saveId: r.id, createdAt: r.createdAt, finishedSaved: r.status === 'finished', seen: game.log.length, reveal: null, peek: null,
  });
  viewer = game.seats.length === 1 ? 0 : null;
  render();
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}

async function renderSaves() {
  const recs = (await NL.saves.list('keep').catch(() => [])).filter(okRecord);
  $('savedGroup').hidden = !recs.length;
  $('saves').replaceChildren(...recs.map(r => {
    const li = el('li'), open = el('button', 'resume'), del = el('button');
    const when = new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    open.append(el('strong', '', r.title), el('span', '', `${r.status === 'finished' ? 'Finished' : 'In progress'} · ${when}`));
    open.onclick = () => resume(r.id);
    const arm = on => {
      del.className = on ? 'btn danger' : 'circle remove';
      del.replaceChildren(on ? 'Delete' : xIcon());
      del.setAttribute('aria-label', on ? `Confirm delete ${r.title}` : `Delete ${r.title}`);
    };
    del.onclick = async () => {
      if (!del.classList.contains('btn')) { arm(true); del.focus(); return; }
      try { await NL.saves.remove(r.id); } catch {}
      renderSaves();
    };
    del.onblur = () => arm(false);
    arm(false);
    li.append(open, del);
    return li;
  }));
}
function xIcon() {
  const s = svg('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'aria-hidden': 'true' });
  svg('path', { d: 'M6 6l12 12M18 6 6 18' }, s);
  return s;
}

// ---- Who should be looking. The engine says whose private moment it is (plan 4.9); the screen
// adds two of its own: a holder reading their secret cards, and the shared reveal of an exchange.
function needViewer() {
  if (solo()) return 0;
  if (S.peek) return S.peek.seat;
  if (S.reveal || S.game.status !== 'playing') return null;
  return screenOwner(S.game);
}

function showCover(need) {
  for (const id of ['title', 'draft', 'table', 'results']) $(id).hidden = true;
  for (const id of ['draft', 'table', 'results']) $(id).replaceChildren(); // nothing private stays in the page behind the cover
  const g = S.game;
  $('coverBanner').hidden = !g.banner;
  $('coverBanner').textContent = g.banner || '';
  if (need === null) {
    $('coverTitle').textContent = 'Pass back to the table';
    $('coverNote').textContent = 'Everyone may look again.';
    $('coverGo').textContent = 'Show the table';
  } else {
    const name = nameOf(need);
    $('coverTitle').textContent = `Pass to ${name}`;
    $('coverNote').textContent = S.peek ? `Only ${name} should look: secret treasure chamber cards.`
      : g.phase === 'MONSTER_REACT' ? `${name} plays the monster and reads its card in secret.`
      : need === g.encounter?.seat ? `${name} picks a combat card in secret.` : `${name} picks the monster's card in secret.`;
    $('coverGo').textContent = `I am ${name}, show me`;
  }
  $('coverGo').onclick = () => {
    viewer = need;
    render();
    $('table').querySelector('.tablegrid section.panel')?.scrollIntoView({ block: 'start' }); // straight to the prompt, not the map
  };
  $('cover').hidden = false;
  window.scrollTo(0, 0);
  $('coverGo').focus();
}

// ---- Rendering
function render() {
  persist();
  const g = S.game;
  const screen = !g ? 'title' : g.status === 'setup' ? 'draft' : g.status === 'over' ? 'results' : 'table';
  document.querySelector('.app').classList.toggle('wide', screen !== 'title');
  $('banner').hidden = !g?.banner;
  $('banner').textContent = g?.banner || '';
  $('undo').hidden = $('saveExit').hidden = !g;
  $('undo').disabled = !canUndo();
  $('saveExit').disabled = false;
  if (!g) {
    $('cover').hidden = true;
    for (const id of ['draft', 'table', 'results']) { $(id).hidden = true; $(id).replaceChildren(); }
    $('title').hidden = false;
    return renderTitle();
  }
  if (g.status === 'over' && !S.finishedSaved) {
    // A finished game saves itself once, reusing the record of a resumed or saved game.
    S.finishedSaved = true;
    persist();
    saveGame().catch(() => toast('Could not save the finished game.'));
  }
  if (solo()) viewer = 0;
  const need = needViewer();
  if (need !== viewer) return showCover(need);
  $('cover').hidden = true;
  for (const id of ['title', 'draft', 'table', 'results']) $(id).hidden = id !== screen;
  for (const id of ['draft', 'table', 'results']) if (id !== screen) $(id).replaceChildren();
  const v = view(g, content(), viewer);
  if (screen === 'draft') renderDraft(v);
  else if (screen === 'table') renderTable(v);
  else renderResults(v);
  const lost = a => !a || a === document.body || !a.isConnected || !!a.closest('[hidden]');
  if (keyboard && lost(document.activeElement)) {
    const first = $(screen).querySelector('.choices button:not(:disabled), button.choice:not(:disabled), .target');
    first?.focus();
  }
}

// ---- Title and setup
const showCount = NL.segmented($('countSeg'), v => { S.count = +v; render(); });
const showSolo = NL.segmented($('soloSeg'), v => { S.soloCombat = v; render(); });
const showTheme = NL.segmented($('themeSeg'), v => { NL.theme.set(v); showTheme(v); });
NL.menu($('menu'));
NL.account($('account'));
NL.ready.then(i => {
  // A signed-in name arrives late: only into an empty first name, with no game in progress.
  if (i?.displayName && !S.names[0] && !S.game) { S.names[0] = i.displayName.slice(0, 20); render(); }
});

function renderTitle() {
  showCount(String(S.count));
  if (!S.names.some(Boolean) && NL.identity()?.displayName) S.names[0] = NL.identity().displayName.slice(0, 20);
  const inputs = [...$('names').querySelectorAll('input')];
  if (inputs.length !== S.count) {
    $('names').replaceChildren(...S.names.slice(0, S.count).map((n, i) => {
      const li = el('li'), input = el('input');
      input.value = n;
      input.maxLength = 20;
      input.placeholder = `Player ${i + 1}`;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', `Player ${i + 1} name`);
      input.oninput = () => { S.names[i] = input.value; persist(); };
      li.append(input);
      return li;
    }));
  }
  $('soloBox').hidden = S.count !== 1;
  showSolo(S.soloCombat);
  $('soloNote').textContent = S.soloCombat === 'target'
    ? 'The original solo fight: throw the combat die at the printed target and enter where it lands.'
    : 'Digital variant, not an original rule: you pick A, B or C and the computer picks for the monster.';
  const verified = REPORT.categories.filter(c => c.verified === c.required).length;
  $('statusNote').textContent = `${verified} of ${REPORT.categories.length} content categories verified. The full game unlocks when every slot holds approved original content.`;
  $('status').replaceChildren(...REPORT.categories.map(c => {
    const li = el('li');
    li.append(el('span', '', c.label), el('span', '', `${c.verified}/${c.required} verified`));
    return li;
  }));
  $('start').disabled = !REPORT.fullStartAllowed;
  $('startReason').textContent = REPORT.fullStartAllowed ? '' : `Start is off until the content is complete: ${REPORT.lines.find(l => !/ (\d+)\/\1 /.test(l)) || 'content incomplete'}.`;
  $('fixtures').disabled = !FX_REPORT.fixturePlayable;
  renderSaves();
}

// ---- Draft: first player, heroes clockwise, rings counterclockwise, towers.
function panel(title, text) {
  const p = el('section', 'glass panel');
  p.append(el('h2', '', title));
  if (text) p.append(el('p', '', text));
  return p;
}
function choice(label, sub, onclick, cls = '') {
  const b = el('button', `choice ${cls}`.trim());
  b.append(el('span', '', label));
  if (sub) b.append(el('small', '', sub));
  b.onclick = onclick;
  return b;
}
const pendingText = (value, what) => (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length) ? el('span', 'pending', `${what} pending`) : null);

function heroCard(def, extra) {
  const box = el('div');
  box.append(el('strong', '', def.name || def.id));
  const line = el('div', 'stats');
  line.append(el('span', '', def.class ? capital(def.class) : 'Class pending'));
  for (const k of ['STR', 'AGI', 'ARM', 'LCK']) line.append(el('span', '', `${STAT[k]} ${def.stats?.[k] ?? 'pending'}`));
  line.append(el('span', '', `HP ${def.hp ?? 'pending'}`));
  box.append(line);
  const eq = pendingText(def.equipment, 'Equipment');
  box.append(eq || el('div', 'stats', `Equipment: ${def.equipment.join(', ')}`));
  if (def.specialWeaponId) box.append(el('div', 'stats', `Special weapon: ${(content().specialWeapons || []).find(w => w.id === def.specialWeaponId)?.name || 'pending'}`));
  if (!def.art) box.append(el('div', 'pending', 'Art pending'));
  if (extra) box.append(el('div', 'stats', extra));
  return box;
}
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

function firstRolls(g) {
  const rolls = g.log.filter(e => e.kind === 'roll' && /^first player, seat \d+$/.test(e.reason));
  return rolls.map(e => `${nameOf(+e.reason.split(' ').pop())} ${e.value}`).join(', ');
}

function renderDraft(v) {
  const g = S.game, c = content(), la = legalActions(g, c);
  const out = [el('h1', '', 'Setting up')];
  const { step } = g.setup;
  const seat = la[0].seat;
  if (step === 'first-player') {
    const p = panel('Who goes first', 'Everyone rolls a D12. The highest goes first; tied highest roll again.');
    const ch = el('div', 'choices');
    ch.append(choice('Roll for first player', `${g.seats.length} D12s`, () => act(la[0]), 'primary'));
    p.append(ch);
    out.push(p);
  } else {
    const p = panel('First player', `${firstRolls(g)}. ${nameOf(g.firstSeat)} goes first.`);
    p.append(el('p', '', `Order of play, clockwise: ${listOf(g.seats.map((_, k) => nameOf((g.firstSeat + k) % g.seats.length)))}.`));
    out.push(p);
  }
  if (step === 'heroes') {
    const p = panel(`${nameOf(seat)}, pick your hero`, 'Heroes are picked clockwise from the first player.');
    const ch = el('div', 'choices grid2');
    ch.id = 'draftList';
    for (const def of c.heroes) {
      const a = la.find(x => x.heroId === def.id);
      const takenBy = g.seats.find(s => s.heroId === def.id);
      const b = el('button', 'choice');
      b.append(heroCard(def, takenBy ? `Taken by ${takenBy.name}` : null));
      b.disabled = !a;
      if (a) b.onclick = () => act(a);
      ch.append(b);
    }
    p.append(ch);
    out.push(p);
  }
  if (step === 'rings') {
    const p = panel(`${nameOf(seat)}, pick your ring`, 'Rings go counterclockwise, starting with the last hero pick.');
    const ch = el('div', 'choices');
    for (const r of c.rings) {
      const a = la.find(x => x.ringId === r.id);
      const takenBy = g.seats.find(s => s.ringId === r.id);
      const b = choice(r.name || r.id, takenBy ? `${r.power || 'Power pending'}. Taken by ${takenBy.name}.` : r.power || 'Power pending', a ? () => act(a) : null);
      b.disabled = !a;
      ch.append(b);
    }
    p.append(ch);
    out.push(p);
  }
  if (step === 'towers') {
    const p = panel(`${nameOf(seat)}, pick your starting tower`, 'Towers are picked clockwise from the first player and may be shared.');
    const wrap = el('div', 'board-wrap');
    const host = el('div', 'board-scroll');
    wrap.append(host);
    drawBoard(host, { v, content: c, names: g.seats.map(s => s.name), targets: la.map(a => ({ ...c.board.towers[a.tower], label: `Start in the ${towerName(c, a.tower)}`, pick: () => act(a) })) });
    p.append(wrap);
    const ch = el('div', 'choices grid2');
    for (const a of la) ch.append(choice(capital(towerName(c, a.tower)), null, () => act(a)));
    p.append(ch);
    out.push(p);
  }
  if (step !== 'first-player') {
    const p = panel('Picks so far');
    const ul = el('ul');
    for (const s of g.seats) {
      const h = s.heroId && contentIndex(c).heroes.get(s.heroId), r = s.ringId && contentIndex(c).rings.get(s.ringId);
      ul.append(el('li', '', `${s.name}: ${h ? h.name : 'no hero yet'}${r ? `, ${r.name}` : ''}`));
    }
    p.append(ul);
    out.push(p);
  }
  $('draft').replaceChildren(...out);
}

// ---- Main tabletop
function sunClock(sun) {
  const s = svg('svg', { viewBox: '0 0 120 64', class: 'sun', 'aria-hidden': 'true' });
  svg('line', { x1: 4, y1: 60, x2: 116, y2: 60, class: 'horizon' }, s);
  for (let k = 1; k < SUNSET; k++) {
    const t = Math.PI * (1 - (k - 1) / (SUNSET - 2));
    const [c, si] = [Math.cos(t), Math.sin(t)];
    svg('line', { x1: 60 + 50 * c, y1: 58 - 50 * si, x2: 60 + 56 * c, y2: 58 - 56 * si, class: `tick${k >= sun ? ' left' : ''}` }, s);
  }
  const t = Math.PI * (1 - (Math.min(sun, SUNSET - 1) - 1) / (SUNSET - 2));
  svg('circle', { cx: 60 + 40 * Math.cos(t), cy: 58 - 40 * Math.sin(t), r: 9, class: 'disc' }, s);
  return s;
}

function heldNames(h) { return h.held.map(inst => cardDef(content(), inst).name); }

function moveLabel(g, a) {
  const c = content(), hero = g.heroes[a.seat];
  const to = neighbour(hero.coord, a.dir);
  const kind = squareKind(c.board, to);
  const edge = edgeKind(g, c, hero.coord, a.dir);
  const where = kind === 'tower' ? 'the tower' : kind === 'center' ? 'the treasure chamber' : g.board.tiles[key(to)] ? tileWords(contentIndex(c).tiles.get(g.board.tiles[key(to)].defId)) : 'unexplored';
  const via = edge === 'door' ? ', through a door (door card)' : edge === 'gate' ? ', under a portcullis (Strength test)' : edge === 'wall' ? ', through the secret passage' : '';
  return `${where}${via}`;
}

function testLines(events) {
  return events.filter(e => e.kind === 'test').map(e => {
    const d = el('div', 'testline');
    d.append(el('span', 'die', e.roll + (e.modifier ? `+${e.modifier}` : '')), el('span', '', `${STAT[e.stat]} ${e.target}, ${e.reason}: ${e.pass ? 'pass' : 'fail'}`));
    return d;
  });
}

function combatBox(v, enc) {
  const box = el('div', 'cardface');
  const m = enc.monster;
  const wounds = el('span', 'pips');
  for (let i = 0; i < (m?.wounds || 0); i++) wounds.append(el('i'));
  const line = el('p');
  line.append(`Monster wounds: ${m?.wounds || 0}${m?.hp ? ` of ${m.hp} HP` : ''} `, wounds);
  box.append(el('strong', '', m?.inst ? cardDef(content(), m.inst).name : 'The monster'), line);
  const hero = v.heroes[enc.seat];
  box.append(el('p', '', `${nameOf(enc.seat)}: ${Math.max(0, hero.hp)} of ${hero.hpStart} HP`));
  const ex = enc.combat?.exchanges || [];
  if (ex.length) {
    const ol = el('ol');
    for (const x of ex) ol.append(el('li', '', x.placement ? (x.rethrow ? 'Unclear, thrown again' : `${PLACEMENT[x.placement]}, ${FACE[x.face].toLowerCase()}: hero ${x.heroDmg}, monster ${x.monsterDmg}`) : `${x.hero} against ${x.monster}: hero ${x.heroDmg}, monster ${x.monsterDmg}`));
    box.append(ol);
  }
  return box;
}

function combatCards(seatSet, onPick) {
  const ch = el('div', 'choices grid3');
  for (const letter of ['A', 'B', 'C']) {
    const card = (content().combat || []).find(x => x.setId === seatSet && x.letter === letter);
    const b = el('button', 'choice');
    b.append(el('span', 'big', letter));
    b.append(el('small', '', card ? card.name : 'pending'));
    if (card?.doubleAgainst?.length) b.append(el('small', '', `Hits ${card.doubleAgainst.join(', ')} twice`));
    b.setAttribute('aria-label', `Play ${letter}${card ? `, ${card.name}` : ''}`);
    b.onclick = () => onPick(letter);
    ch.append(b);
  }
  return ch;
}

// The prompt panel: one per phase the engine can raise, built from its legal actions.
function renderPrompt(v, la, targets) {
  const g = S.game, c = content();
  const name = nameOf(g.activeSeat);
  const hero = g.heroes[g.activeSeat];
  const enc = v.encounter;
  const by = type => la.filter(a => a.type === type);
  let p;

  if (S.peek) {
    const seat = S.peek.seat, mine = v.heroes[seat];
    p = panel(`${nameOf(seat)}, your treasure chamber cards`, 'Only you may see these.');
    if (S.peek.from !== null) {
      const drawn = v.log.slice(S.peek.from).filter(e => (e.kind === 'draw' && e.deck === 'TREASURY') && e.private === seat);
      for (const e of drawn) { const d = cardDef(c, e.value); const f = el('div', 'cardface'); f.append(el('strong', '', `Drawn: ${d.name}`), el('p', '', cardText(d))); p.append(f); }
    }
    const f = el('div', 'cardface');
    f.append(el('strong', '', mine.treasury.length ? `You hold ${mine.treasury.length}: ${mine.gold} gold in all` : 'You hold no treasure chamber cards now'));
    mine.treasury.forEach((inst, i) => f.append(el('p', '', `${i + 1}. ${cardDef(c, inst).name}, ${cardDef(c, inst).gold || 0} gold`)));
    p.append(f);
    const ch = el('div', 'choices');
    ch.append(choice('Hide my cards', null, () => { S.peek = null; render(); }, 'primary'));
    p.append(ch);
    return p;
  }
  if (S.reveal) {
    const last = S.reveal;
    p = panel('Reveal', 'Both cards turn over at once.');
    const vs = el('div', 'vs');
    const side = (who, letter, dmg) => { const d = el('div'); d.append(el('span', '', letter), el('small', '', `${who} takes ${dmg}`)); return d; };
    vs.append(side(nameOf(last.seat), last.hero, last.heroDmg), el('small', '', 'against'), side('Monster', last.monster, last.monsterDmg));
    p.append(vs);
    if (enc) p.append(combatBox(v, enc));
    const ch = el('div', 'choices');
    ch.append(choice('Continue', null, () => { S.reveal = null; render(); }, 'primary'));
    p.append(ch);
    return p;
  }

  const ch = el('div', 'choices');
  switch (g.phase) {
    case 'CHOOSE_ACTION':
    case 'CHOOSE_EXIT': {
      p = g.phase === 'CHOOSE_ACTION' ? panel(`${name}, your move`, 'Pick a lit square on the map, use the arrow keys, or choose below.') : panel('Keep moving?', 'You may go on this turn, or stop here.');
      for (const a of by('MOVE')) {
        ch.append(choice(`Go ${DIR[a.dir]}`, moveLabel(g, a), () => act(a)));
        const to = neighbour(hero.coord, a.dir);
        targets.push({ ...to, label: `Go ${DIR[a.dir]}: ${moveLabel(g, a)}`, pick: () => act(a) });
      }
      for (const a of by('SEARCH')) ch.append(choice('Search the room', 'Draw a room search card instead of moving', () => act(a)));
      for (const a of by('COLLECT')) ch.append(choice('Stay and collect', `Two treasure chamber cards, then a dragon card. It wakes on ${v.dragon.odds.awake} in ${v.dragon.odds.remaining}.`, () => act(a), 'primary'));
      for (const a of by('STOP')) ch.append(choice('Stop here', 'End your turn', () => act(a)));
      for (const a of by('FORCED_SKIP')) ch.append(choice('No way on', 'The turn passes', () => act(a)));
      break;
    }
    case 'TURN_START': {
      const kind = g.pending.kind;
      const agi = heroDef(hero).stats.AGI;
      if (kind === 'dark') {
        p = panel('In the dark', 'You cannot choose a way out: the D6 picks it.');
        for (const a of by('ROLL_DARK_EXIT')) ch.append(choice('Roll the D6', null, () => act(a), 'primary'));
      } else if (kind === 'well-edge') {
        p = panel('At the edge of the well', `Climb back the way you came, or jump: an Agility test on the D12 plus ${hero.treasury.length} treasure chamber ${hero.treasury.length === 1 ? 'card' : 'cards'} against ${agi}. A failed jump is death. You may drop treasure chamber cards first.`);
        for (const a of by('WELL_RETURN')) ch.append(choice('Climb back', 'Go back the way you came', () => act(a)));
        for (const a of by('WELL_DISCARD')) {
          const i = hero.treasury.indexOf(a.card);
          ch.append(choice(`Drop treasure chamber card ${i + 1}`, viewer === g.activeSeat ? `${cardDef(c, a.card).name}, ${cardDef(c, a.card).gold || 0} gold` : 'Check which with Show my cards', () => act(a)));
        }
        for (const a of by('WELL_JUMP')) ch.append(choice('Jump', `Agility test, D12 + ${hero.treasury.length} against ${agi}`, () => act(a), 'primary'));
      } else {
        p = panel('Stuck in rubble', `Go back the way you came, or force through with an Agility test against ${agi}. Pass, and you may leave by any way this turn.`);
        for (const a of by('RUBBLE_RETURN')) ch.append(choice('Go back', null, () => act(a)));
        for (const a of by('RUBBLE_FORCE')) ch.append(choice('Force through', `Agility test against ${agi}`, () => act(a), 'primary'));
      }
      break;
    }
    case 'RESOLVE_CARD': {
      const pend = g.pending;
      const frame = [...g.stack].reverse().find(f => f.card);
      if (pend.kind === 'choice') {
        p = panel('Choose', frame ? `${cardDef(c, frame.card).name}: ${cardText(cardDef(c, frame.card))}` : null);
        by('CHOOSE').forEach(a => ch.append(choice(pend.options[a.option], null, () => act(a))));
      } else {
        p = panel('Move', 'Pick a neighbouring square.');
        for (const a of by('CHOOSE')) {
          const dir = pend.options[a.option];
          ch.append(choice(`Go ${DIR[dir]}`, null, () => act(a)));
          targets.push({ ...neighbour(hero.coord, dir), label: `Go ${DIR[dir]}`, pick: () => act(a) });
        }
      }
      break;
    }
    case 'CHOOSE_MONSTER_RESPONSE': {
      p = panel(g.encounter.ambush ? 'Ambush' : 'Something stirs', `${name}, choose before the monster shows itself.${g.encounter.ambush ? ' In an ambush you may only attack or flee.' : ''}`);
      const weapon = (c.specialWeapons || []).find(w => w.id === heroDef(hero).specialWeaponId);
      for (const a of by('RESPOND')) ch.append(choice(a.choice === 'special' && weapon ? `${CHOICE.special}: ${weapon.name}` : CHOICE[a.choice], a.choice === 'flee' ? 'Back to the square you came from' : null, () => act(a), a.choice === 'attack' ? 'primary' : ''));
      break;
    }
    case 'MONSTER_REACT': {
      const def = cardDef(c, enc.monster.inst);
      p = panel(solo() ? 'The monster' : `${nameOf(enc.controller)}, you play the monster`, solo() ? null : 'Read the card, then announce its answer to the table.');
      const f = el('div', 'cardface');
      f.append(el('strong', '', def.name), el('p', '', `HP ${def.hp}. ${monsterText(def)}`));
      p.append(f);
      const r = enc.reaction;
      const ans = el('div', 'cardface');
      ans.append(el('p', '', `${nameOf(enc.seat)} chose ${CHOICE[enc.choice]}.`), el('strong', '', `Its answer: ${REACTION[r.type]}${r.damage ? `, ${expr(r.damage)} damage` : ''}.`));
      p.append(ans);
      for (const a of by('ANNOUNCE')) ch.append(choice(solo() ? 'Continue' : 'Announce to the table', null, () => act(a), 'primary'));
      break;
    }
    case 'COMBAT_SELECT': {
      const cb = g.encounter.combat;
      const heroSet = heroDef(g.heroes[g.encounter.seat]).combatSetId;
      if (cb.mode === 'target') {
        p = panel('Throw at the target', 'Throw the combat die at the target, then enter where it came to rest and the face that shows.');
        p.append(combatBox(v, enc));
        p.append(el('h3', '', 'Where it landed'));
        const pl = el('div', 'choices grid2');
        for (const k of Object.keys(PLACEMENT)) {
          const b = choice(PLACEMENT[k], null, () => { target.placement = k; render(); });
          b.setAttribute('aria-pressed', target.placement === k);
          pl.append(b);
        }
        p.append(pl, el('h3', '', 'Face up'));
        const fc = el('div', 'choices grid3');
        for (const k of Object.keys(FACE)) {
          const b = choice(FACE[k], null, () => { target.face = k; render(); });
          b.setAttribute('aria-pressed', target.face === k);
          fc.append(b);
        }
        p.append(fc);
        const a = la.find(x => x.placement === target.placement && x.face === target.face);
        const go = choice('Enter the result', null, () => a && act(a), 'primary');
        go.disabled = !a;
        ch.append(go);
      } else {
        const heroTurn = viewer === g.encounter.seat && !cb.heroPick;
        p = panel(heroTurn ? `${nameOf(g.encounter.seat)}, pick your card` : `${nameOf(g.encounter.controller)}, pick the monster's card`, `${solo() ? '' : 'In secret. '}Cards go back to the hand after each exchange.`);
        if (cb.variant) p.append(el('div', 'variant', 'Digital variant, not an original rule: the computer picks the monster card.'));
        p.append(combatBox(v, enc));
        if (heroTurn) {
          const picks = by('COMBAT_PICK').filter(a => a.side === 'hero');
          p.append(combatCards(heroSet, letter => act(picks.find(a => a.letter === letter))));
        } else {
          const picks = by('COMBAT_PICK').filter(a => a.side === 'monster');
          p.append(combatCards(g.encounter.monster.groupId, letter => act(picks.find(a => a.letter === letter))));
        }
      }
      break;
    }
    case 'FORCED_MOVE': {
      const seat = g.pending.seat;
      p = panel('The dragon drives you out', `${nameOf(seat)} must move to an explored room next to the chamber. No room card is drawn.`);
      for (const a of by('FORCED_MOVE')) {
        const [x, y] = a.to.split(',').map(Number);
        ch.append(choice(`Room at ${place({ x, y })}`, null, () => act(a)));
        targets.push({ x, y, label: `${nameOf(seat)} moves to ${place({ x, y })}`, pick: () => act(a) });
      }
      break;
    }
    default:
      p = panel('Waiting', `Phase ${g.phase}.`);
  }
  if (enc && g.phase !== 'COMBAT_SELECT' && g.phase !== 'MONSTER_REACT' && enc.monster) p.append(combatBox(v, enc));
  p.append(ch);
  p.setAttribute('aria-live', 'polite');
  return p;
}

function renderTable(v) {
  const g = S.game, c = content(), la = legalActions(g, c);
  const out = [];
  const bar = el('header', 'glass statusbar');
  const who = el('div', 'who');
  who.append(el('strong', '', `${nameOf(g.activeSeat)}'s turn`), el('span', '', `Sun ${g.sun} of ${SUNSET - 1}, ${SUNSET - g.sun} ${SUNSET - g.sun === 1 ? 'turn' : 'turns'} left`),
    el('span', '', `Dragon wakes on ${v.dragon.odds.awake} in ${v.dragon.odds.remaining}`));
  bar.append(sunClock(g.sun), who);
  out.push(bar);

  const grid = el('div', 'tablegrid');
  const targets = [];
  const prompt = renderPrompt(v, la, targets);

  const bp = el('section', 'glass board-panel board-wrap');
  const zoom = el('div', 'zoom');
  const zb = (label, text, z) => { const b = el('button', 'btn', text); b.setAttribute('aria-label', label); b.disabled = z === S.zoom; b.onclick = () => { S.zoom = z; render(); }; return b; };
  // shortcut: zoom in fixed steps with native scrolling to pan, no pinch gesture; enough for the 6 x 5 fixture board, revisit with the real board size (M4)
  const zs = [1, 1.5, 2, 3], zi = zs.indexOf(S.zoom);
  zoom.append(zb('Zoom out', '−', zs[Math.max(0, zi - 1)]), zb('Fit the board', 'Fit', 1), zb('Zoom in', '+', zs[Math.min(zs.length - 1, zi + 1)]), el('span', '', `${v.board.tileBag} tiles left`));
  const host = el('div', 'board-scroll');
  host.style.setProperty('--zoom', S.zoom);
  host.classList.toggle('fit', S.zoom === 1);
  bp.append(zoom, host, mapKey());
  drawBoard(host, { v, content: c, names: g.seats.map(s => s.name), targets: S.peek || S.reveal ? [] : targets });

  const side = el('div');
  side.append(prompt);
  const latest = v.log.slice(S.seen);
  if (latest.length) {
    const lp = panel('What just happened');
    lp.id = 'latest';
    lp.append(...testLines(latest));
    const ol = el('ol');
    for (const t of lines(latest, ctx())) ol.append(el('li', '', t));
    lp.append(ol);
    side.append(lp);
  }
  side.append(heroesPanel(v));
  const log = el('details', 'glass panel');
  log.append(el('summary', '', 'Event log'));
  const ol = el('ol');
  ol.id = 'log';
  for (const t of lines(v.log, ctx()).slice(-300)) ol.append(el('li', '', t));
  log.append(ol);
  side.append(log);
  grid.append(bp, side);
  out.push(grid);
  $('table').replaceChildren(...out);
}

function mapKey() {
  const d = el('details');
  d.append(el('summary', '', 'Map key'));
  const k = el('div', 'key');
  const item = (label, draw) => {
    const s = el('span');
    const ic = svg('svg', { viewBox: '0 0 60 60', 'aria-hidden': 'true' });
    draw(ic);
    s.append(ic, label);
    k.append(s);
  };
  item('Room: a room card', s => svg('circle', { cx: 30, cy: 30, r: 12, class: 'dot dot-black' }, s));
  item('Red room: card, then a portcullis drops behind', s => svg('path', { d: 'M30 15l15 15-15 15-15-15z', class: 'dot dot-red' }, s));
  item('Corridor: no card, keep going', s => svg('path', { d: 'M30 15l15 26h-30z', class: 'dot dot-yellow' }, s));
  item('Dark room', s => svg('path', { d: 'M34 15a15 15 0 1 0 11 24a12 12 0 1 1-11-24z', class: 'dot dot-blue' }, s));
  item('Door', s => svg('rect', { x: 12, y: 24, width: 36, height: 12, rx: 3, class: 'door' }, s));
  item('Portcullis', s => { for (let t = 16; t <= 44; t += 7) svg('line', { x1: t, y1: 22, x2: t, y2: 38, class: 'gate' }, s); svg('line', { x1: 12, y1: 30, x2: 48, y2: 30, class: 'gate' }, s); });
  item('Unexplored', s => svg('rect', { x: 6, y: 6, width: 48, height: 48, rx: 4, class: 'fog' }, s));
  d.append(k);
  return d;
}

function heroesPanel(v) {
  const g = S.game, n = g.seats.length;
  const p = panel('Heroes');
  p.id = 'heroes';
  const ul = el('ul');
  for (let k = 0; k < n; k++) {
    const seat = (g.firstSeat + k) % n;
    const h = v.heroes[seat], def = heroDef(h);
    const li = el('li', seat === g.activeSeat ? 'active' : '');
    const pawn = el('span', 'pawn', seat + 1);
    pawn.style.background = `var(--seat${seat})`;
    const body = el('div');
    const status = { inside: '', escaped: 'Escaped', dead: 'Dead', 'lost-at-sunset': 'Caught at sunset' }[h.status];
    body.append(el('div', 'name', `${g.seats[seat].name}, ${def.name}${status ? `: ${status}` : ''}`));
    const hp = el('div', 'hp');
    const fill = el('i');
    fill.style.width = `${Math.max(0, 100 * h.hp / h.hpStart)}%`;
    hp.append(fill);
    body.append(hp);
    const cond = h.conditions.map(x => ({ dark: 'in the dark', 'well-edge': 'at the well edge', rubble: 'in rubble' }[x.id] || 'under an effect'));
    const chamberCount = Array.isArray(h.treasury) ? h.treasury.length : h.treasury;
    body.append(el('div', 'meta', `HP ${Math.max(0, h.hp)} of ${h.hpStart} · ${Array.isArray(h.treasury) ? `${h.gold} gold` : `${h.gold} gold showing`} · ${chamberCount} chamber ${chamberCount === 1 ? 'card' : 'cards'}${cond.length ? ` · ${cond.join(', ')}` : ''}`));
    const held = heldNames(h);
    if (held.length) body.append(el('div', 'meta', `Holds: ${held.join(', ')}`));
    if (Array.isArray(h.treasury) && h.treasury.length) body.append(el('div', 'meta', `Chamber cards: ${h.treasury.map(i => cardDef(content(), i).name).join(', ')}`));
    if (n > 1 && chamberCount > 0 && h.status === 'inside') {
      const b = el('button', 'btn', 'Show my cards');
      b.setAttribute('aria-label', `Show ${g.seats[seat].name}'s treasure chamber cards`);
      b.onclick = () => { S.peek = { seat, from: null }; render(); };
      body.append(b);
    }
    li.append(pawn, body);
    ul.append(li);
  }
  p.append(ul);
  return p;
}

// ---- Results: escapees by gold, shared top gold wins together (D01); none means the keep wins.
function renderResults(v) {
  const g = S.game, r = g.result, c = content();
  const out = [el('h1', '', r.castleWins ? 'The keep wins' : `${listOf(r.winners.map(nameOf))} ${r.winners.length > 1 ? 'share the win' : 'wins'}`)];
  out.push(el('p', 'lede', r.castleWins ? 'Nobody escaped before sunset.' : r.shared ? 'Equal top gold among those who escaped: a shared win.' : 'Most gold among those who escaped.'));
  const p = panel('Escaped');
  const ol = el('ol');
  for (const e of r.escaped) ol.append(el('li', '', `${nameOf(e.seat)}, ${contentIndex(c).heroes.get(e.heroId).name}: ${e.gold} gold${r.winners.includes(e.seat) ? ', winner' : ''}`));
  if (!r.escaped.length) ol.append(el('li', '', 'Nobody'));
  p.append(ol);
  out.push(p);
  if (r.others.length) {
    const q = panel('Did not escape');
    const ul = el('ul');
    for (const e of r.others) ul.append(el('li', '', `${nameOf(e.seat)}, ${contentIndex(c).heroes.get(e.heroId).name}: ${e.status === 'dead' ? 'died in the keep' : 'caught inside at sunset'}`));
    q.append(ul);
    out.push(q);
  }
  const again = el('div', 'choices');
  again.append(choice('New game', null, toTitle, 'primary'));
  out.push(again);
  const log = el('details', 'glass panel');
  log.append(el('summary', '', 'Event log'));
  const l = el('ol');
  l.id = 'log';
  for (const t of lines(v.log, ctx()).slice(-400)) l.append(el('li', '', t));
  log.append(l);
  out.push(log);
  $('results').replaceChildren(...out);
}

// ---- Wiring
$('start').onclick = () => newGame('original');
$('fixtures').onclick = () => newGame('fixture');
$('undo').onclick = undo;
$('saveExit').onclick = async () => {
  $('saveExit').disabled = true;
  try {
    await saveGame();
    toTitle();
    toast('Saved.');
  } catch {
    $('saveExit').disabled = false;
    toast('Could not save on this device.');
  }
};
for (const d of document.querySelectorAll('dialog')) d.onclick = e => { if (e.target === d) d.close(); };
$('settingsBtn').onclick = () => {
  showTheme(NL.theme.get());
  const rules = S.game?.rules || DEFAULT_RULES;
  $('rules').replaceChildren(...Object.entries(rules).map(([k, val]) => {
    const li = el('li');
    li.append(el('code', '', `${k}: ${val === true ? 'on' : val === false ? 'off' : val}`), el('span', '', RULE_INFO[k] ? RULE_INFO[k](val) : 'Unclassified'));
    return li;
  }));
  $('settings').showModal();
};
$('settingsDone').onclick = () => $('settings').close();

// Arrow keys move when a move that way is legal.
const ARROWS = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };
document.addEventListener('keydown', e => {
  keyboard = true;
  const dir = ARROWS[e.key];
  if (!dir || !S.game || S.game.status !== 'playing' || !$('cover').hidden || S.peek || S.reveal || document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, textarea, select')) return;
  const la = legalActions(S.game, content());
  const a = la.find(x => x.type === 'MOVE' && x.dir === dir)
    || (S.game.pending?.kind === 'move-choice' && la.find(x => x.type === 'CHOOSE' && S.game.pending.options[x.option] === dir));
  if (!a) return;
  e.preventDefault();
  act(a);
});
document.addEventListener('pointerdown', () => { keyboard = false; });

load();
render();
