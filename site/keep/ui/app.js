// Dusk Keep frontend (system 10). A projection of the engine: it dispatches legal actions to
// reduce() and renders view(game, content, seat) for whoever is looking. No rules live here.
import FIXTURES from '../content/fixtures/fixtures.js';
import ORIGINAL from '../content/original/index.js';
import { createGame, reduce, restore, DEFAULT_RULES, RULE_TAGS } from '../engine/reducer.js';
import { legalActions, sameAction } from '../engine/phases.js';
import { view, screenOwner } from '../engine/view.js';
import { squareKind, exits, exitFor, key } from '../engine/board.js';
import { isActive } from '../engine/heroes.js';
import { cardDef } from '../engine/decks.js';
import { SUNSET } from '../engine/clock.js';
import { BEATS } from '../engine/combat.js';
import { validateContent, contentIndex, contentStatus, bannerLines, APP_LABEL, chamberName, theChamber, chamberCards } from '../content/schema.js';
import { mountBoard, resetView, chamberRoom, actionSquare, cellInfo, sideWord, svg, place, tileWords, towerAt, markGlyph, sideGlyph, towerGlyph, entryGlyph, blockedGlyph } from './board.js';
import { lines, entries, dragonStatus, collectWords, forcedMoveWords, cardText, monsterText, fightRowModel, soloStripModel, expr,
 undoLabel, exchangeWords, lastWords, revealWords, itemText, rotationRingWords, DIR, STAT, CHOICE, REACTION, PLACEMENT, FACE, deckWord, towerName, conditionWords, namedSteps, choiceSteps } from './words.js';
import { rollDice } from './dice.js';
import { actionCards, cardQueue, cardSpeech, latestTurn, OUTCOME_TAG } from './results.js';
import { shownEffectText } from '../engine/describe.js';
import { unitWord } from '../engine/inventory.js';
import { daylight, trackLabel, unit, skyAt, DUSK, duskDue, duskShown, duskWords } from './daylight.js';
import { HIST_CAP, pushUndo, canUndo as canUndoHist, undoBlocked, fitHist } from './undo.js';

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

const STATUS = contentStatus(ORIGINAL, FIXTURES); // the same status `node tools/keep-content.js report` prints
const REPORT = STATUS.report;
const CONTENT = { fixture: FIXTURES, original: ORIGINAL, mixed: STATUS.mixed };
const FX_REPORT = validateContent(FIXTURES);
$('howChamber').textContent = theChamber(ORIGINAL); // How to play names the owner's chamber
const KEY = 'nl-keep-v1';

// Rules-config entries with their ruling from the plan's decision register (display only); the authority tags
// come from the engine's RULE_TAGS. Entries in RULE_TAGS but not in the rules config are fixed rulings.
const RULE_INFO = {
  darkRoomPolicy: v => ['D06', v === 'EVERY_ENTRY' ? 'Every entry into a dark room makes you roll your way out.' : 'A dark room acts when it is first revealed and when you flee back into it; walking back in is safe.'],
  forcedMoveTileEffects: v => ['D19 (spec v11, with D16)', v ? 'Room effects apply where the dragon drives a hero, but no room card is drawn.' : 'No room effects there.'],
  soloCombat: v => ['D17', v === 'target' ? 'Solo fights use the target with results entered by hand.' : 'A, B or C against a computer pick: a digital variant, not an original rule.'],
  towerAtSunsetCountsAsEscape: v => ['D32', v ? 'A hero in a tower at sunset counts as escaped.' : 'A hero in a tower at sunset who never chose Escape is inside at sunset: not escaped, not dead.'],
  escapeWithoutExploring: v => ['D33', v ? 'A hero may escape straight from the start tower.' : 'A hero still in the start tower is never offered Escape.'],
  rotatingRoomRing: v => ['D67 (spec v9)', v === 'every-entry' ? "Entering a rotating room with the Protection Ring unused, you may use it so the room does not turn: on every entry, fleeing back in and the dragon's drive included. The owner's approved reading, not a printed rule." : v === 'first-reveal' ? 'The Protection Ring may stop a rotating room turning only when it is first revealed.' : 'The Protection Ring is never offered at a rotating room.'],
  soloMonsterHp: v => ['D37 (spec v4)', v === 'visible' ? "Solo: the monster's HP shows once it is revealed, as the printed rule says." : "Solo: the monster's HP stays hidden. A house rule, not the printed rule."],

  towerEscapeOnLaterTurns: () => ['D34', 'After Stay, Escape is offered on every later turn, the last one included.'],
};
const PREFS = 'nl-keep-prefs-v1'; // per-browser display preferences, not game state
let prefs = { debugLog: false };
try { prefs = { debugLog: JSON.parse(localStorage.getItem(PREFS))?.debugLog === true }; } catch {}
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };

// ---- State. The engine game plus what the screen needs; saved on every change. It belongs to whoever was signed in
// (owner), so a game in progress never shows to the next person on this browser.
const fresh = () => ({ v: 1, count: 2, names: ['', '', '', ''], soloCombat: 'target', mode: null, game: null, hist: [], saveId: null, createdAt: null, dropSave: null, seen: 0, reveal: null, peek: null, dusk: [], owner: NL.person() });
let S = fresh();
let viewer = null; // the seat looking now; never saved, so a refresh always covers a private screen
let target = { placement: null, face: null }; // solo target entry, before it is sent
let keyboard = false;

const okSnap = (h, c) => { try { restore(JSON.stringify(h), c); return true; } catch { return false; } };
function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { return; }
  const b = fresh();
  if (!s || s.v !== 1 || (s.owner && s.owner !== b.owner)) return; // another person's autosave stays unread
  if ([1, 2, 3, 4].includes(s.count)) b.count = s.count;
  if (Array.isArray(s.names)) b.names = b.names.map((n, i) => (typeof s.names[i] === 'string' ? s.names[i].slice(0, 20) : ''));
  if (['target', 'abc-digital-variant'].includes(s.soloCombat)) b.soloCombat = s.soloCombat;
  if (UUID.test(s.dropSave)) b.dropSave = s.dropSave;
  // Stored data is a trust boundary: the engine's restore() checks versions, content and shape.
  if (s.game && CONTENT[s.mode]) {
    try {
      const c = CONTENT[s.mode];
      b.game = restore(JSON.stringify(s.game), c);
      b.mode = s.mode;
      b.hist = Array.isArray(s.hist) ? s.hist.filter(h => okSnap(h, c)).slice(-HIST_CAP) : [];
      if (UUID.test(s.saveId)) b.saveId = s.saveId;
      if (ISO.test(s.createdAt)) b.createdAt = s.createdAt;
      b.seen = Number.isInteger(s.seen) && s.seen <= b.game.log.length ? s.seen : b.game.log.length;
      const r = s.reveal;
      if (r && Number.isInteger(r.seat) && r.seat >= 0 && r.seat < b.game.seats.length && ['A', 'B', 'C'].includes(r.hero) && ['A', 'B', 'C'].includes(r.monster) && Number.isInteger(r.heroDmg) && Number.isInteger(r.monsterDmg)) b.reveal = r;
      const n = b.game.seats.length;
      // The dusk notices already shown; an autosave from before they existed counts every one reached as shown.
      b.dusk = Array.isArray(s.dusk) ? DUSK.filter(t => s.dusk.includes(t)) : passedDusk(b.game);
      if (s.peek && Number.isInteger(s.peek.seat) && s.peek.seat >= 0 && s.peek.seat < n) b.peek = { seat: s.peek.seat, from: Number.isInteger(s.peek.from) ? s.peek.from : null };
    } catch { b.game = null; b.mode = null; }
  }
  S = b;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {
    // Storage full: keep the newest undo steps that fit (about 5 MB is a common browser limit), else none.
    const hist = fitHist(S.hist, JSON.stringify({ ...S, hist: [] }).length, 4500000);
    try { localStorage.setItem(KEY, JSON.stringify({ ...S, hist })); } catch {
      try { localStorage.setItem(KEY, JSON.stringify({ ...S, hist: [] })); } catch {}
    }
  }
}

const content = () => CONTENT[S.mode];
const passedDusk = g => DUSK.filter(t => daylight(g.sun, SUNSET).left <= t);
const solo = () => S.game.seats.length === 1;
const nameOf = seat => S.game.seats[seat].name;
const heroDef = (h) => contentIndex(content()).heroes.get(h.heroId);
const ctx = () => ({ content: content(), name: nameOf });

// ---- Actions: every one goes to the engine, which refuses anything not legal now.
function act(a) {
  // Spec v12 fix 5: nothing is dispatched from a table still held behind a result card (a stale control); it is redrawn.
  if (held) { release(); return; }
  const prev = S.game, c = content();
  duskLine = '';
  let next;
  try { next = reduce(prev, a, c); } catch { if ($('roll').dataset.mode === 'rolling') $('roll').close(); return render(); } // a stale double tap: nothing happens
  // D21: undo only steps back over actions that revealed nothing (the engine counts commit points).
  S.hist = pushUndo(S.hist, prev, next);
  S.seen = prev.log.length;
  const added = next.log.slice(prev.log.length);
  const multi = next.seats.length > 1;
  const ex = added.find(e => e.kind === 'exchange');
  S.reveal = multi && ex ? { seat: prev.encounter.seat, hero: ex.hero, monster: ex.monster, heroDmg: ex.heroDmg, monsterDmg: ex.monsterDmg } : null;
  const priv = added.find(e => (e.kind === 'draw' || e.kind === 'retain') && e.private !== undefined && e.deck !== 'MONSTER');
  // Spec v12 fix 4: after a wake the cards just drawn are gone, so no private card screen; the wake card says why.
  const woke = added.some(e => e.kind === 'dragon-wakes');
  S.peek = multi && !woke && Number.isInteger(priv?.private) ? { seat: priv.private, from: prev.log.length } : null;
  target = { placement: null, face: null };
  if (prev.status !== 'over' && next.status === 'over' && S.saveId) Object.assign(S, { dropSave: S.saveId, saveId: null, createdAt: null });
  S.game = next;
  // Spec v12 fix 1: a result card for every card drawn and every automatic event, from the public view in multiplayer
  // (the solo player's own view in solo), acknowledged one by one; a skipped turn is one of them (D54), not a toast.
  // A result card or fight-end card about to open holds the table as it was until the last Continue (release), so the
  // board, status bar and prompt do not move on to the next player behind it. Saved now all the same. Never held over a
  // private screen the next state would not show the same viewer: then the new state (a cover) renders first and the
  // public cards show over it.
  const cards = actionCards(prev, next, c, nameOf, multi ? null : 0);
  const out = encounterOutcome(prev, added);
  held = (solo() || viewer === null || needViewer() === viewer) && (cards.length > 0 || (!!out && !S.reveal));
  if (held) { persist(); dropFinished(); } else render();
  outcome = out;
  if (!cards.length && $('roll').open) { $('roll').dataset.mode = ''; $('roll').close(); }
  if (cards.length) queue.start(cards);
  showOutcome();
  showDusk();
}
let held = false;
function release() { if (held) { held = false; render(); } }

// ---- The end of a fight (owner, 2026-11-19): when an encounter ends with the monster dead or fled, or the hero
// away or dead, a short card over the dimmed board says so. It is public: the table hears these, and it holds no
// monster HP or card. It waits for the roll card and the Reveal, and shows over a hand-over cover rather than after
// it. Set only here, from the entries this action added, and never saved: a re-render, reload or undo cannot repeat it.
let outcome = null; // { title, line } until shown
function encounterOutcome(prev, added) {
  const start = added.find(e => e.kind === 'encounter');
  const seat = prev.encounter?.seat ?? start?.seat;
  if (seat === undefined) return null;
  const end = added.find(e => e.kind === 'encounter-end');
  const died = added.some(e => e.kind === 'death' && e.seat === seat);
  const killed = added.some(e => e.kind === 'monster-dead') || end?.outcome === 'monster-killed';
  const said = [];
  if (died) said.push(`${nameOf(seat)} dies.`);
  if (killed) said.push(died ? 'The monster is dead too.' : 'The monster is dead.');
  else if (end?.outcome === 'monster-fled') said.push('The monster flees.');
  else if (end?.outcome === 'hero-fled' && !died) said.push(`${nameOf(seat)} gets away.`);
  if (!said.length) return null;
  // One line of what follows, from the public log: the flight, the next turn or the end of the game.
  const after = prev.log.at(-1)?.seq ?? -1, last = added.findLast(e => ['encounter-end', 'death', 'monster-dead'].includes(e.kind)).seq;
  const pub = entries(view(S.game, content(), null).log.filter(e => e.seq > after), ctx());
  const next = pub.find(x => x.e.seq > last && ['move', 'turn', 'game-over', 'lost-at-sunset'].includes(x.e.kind));
  return { title: said[0], line: [...said.slice(1), next?.text].filter(Boolean).join(' ') };
}
function showOutcome() {
  if (!outcome || S.reveal || $('roll').open || $('outcome').open) return;
  const { title, line } = outcome;
  outcome = null;
  openOutcome(title, line);
  say(`${title} ${line}`.trim());
}
// The fight's end card and the last dusk notice share one dialog. Its Continue runs outcomeDone at once (spec v12
// fix 5); the dialog's close event (Esc) only repeats it when that has not happened yet.
let outcomeOpen = false;
function openOutcome(title, line) {
  $('outcomeTitle').textContent = title;
  $('outcomeLine').textContent = line;
  $('outcomeLine').hidden = !line;
  outcomeOpen = true;
  $('outcome').showModal();
  $('outcomeGo').focus();
}
function outcomeDone() {
  if (!outcomeOpen) return;
  outcomeOpen = false;
  if ($('outcome').open) $('outcome').close();
  release();
  refocus(false);
  showDusk();
}

// ---- Dusk notices (owner, 2026-11-19): when 5, 3 and 1 rounds of light are left (turns, solo), a short notice over the
// board, once per game each. 5 and 3 are a banner that goes by itself; the last is the end-of-fight card's family with
// Continue. Public, said in #said, and queued behind the roll card, the fight's end card, the Reveal and any hand-over
// cover. Which were shown is S.dusk, autosaved with the game like S.seen, so a re-render, reload or undo and redo never
// repeats one; a resumed save counts those already reached as shown (passedDusk).
let duskLine = '', duskTimer;
function showDusk() {
  const g = S.game;
  if (!g || g.status !== 'playing' || $('table').hidden || !$('cover').hidden || S.reveal || outcome || $('roll').open || $('outcome').open) return;
  const t = duskDue(daylight(g.sun, SUNSET).left, S.dusk);
  if (!t) return;
  S.dusk = duskShown(t, S.dusk);
  persist();
  const w = duskWords(t, solo());
  duskLine = `${w.title} ${w.line}`;
  say(`${$('said').textContent} ${duskLine}`.trim());
  if (w.card) return openOutcome(w.title, w.line);
  $('duskTitle').textContent = w.title;
  $('duskLine').textContent = w.line;
  $('dusk').hidden = false;
  clearTimeout(duskTimer);
  duskTimer = setTimeout(() => { $('dusk').hidden = true; }, 5000);
}

// ---- Dice over the board: a roll card for every test or die roll the player sets off.
// testInfo is the one adapter from game data to what the card shows before the roll. It reads the engine's
// view.pendingTests (dice.testPreview per legal action that may roll: attribute, hero value, modifiers with
// their sources, passingRolls) and shows only that; the dark-room D6 is not a test, so it is named here.
const ROLL_TITLE = { portcullis: 'Lift the portcullis', 'well entry': 'Enter the well room', 'well jump': 'Jump the well', 'force rubble': 'Force through the rubble', 'dark room exit': 'Find the way out' };
const ROLL_WHY = { portcullis: 'The portcullis is down. A pass lifts it and you go through; a fail ends the turn here.', 'well entry': 'An Agility test on entering the well room. A fall is death.', 'well jump': 'A failed jump is death.', 'force rubble': 'Pass, and you may leave by any way this turn. Fail, and the turn ends here.' };
function testInfo(v, a) {
  if (a.type === 'ROLL_DARK_EXIT') return { title: 'Find the way out', why: 'In the dark the D6 picks the way out.', die: 'D6', cancel: false };
  const tests = (v.pendingTests || []).filter(t => sameAction(t.action, a));
  if (!tests.length) return null;
  const [t, ...then] = tests; // a portcullis into a well room: the well test follows a pass
  return {
    title: ROLL_TITLE[t.reason] || `${STAT[t.stat]} test`, die: t.die, stat: t.stat, value: t.target, need: t.passingRolls, cancel: true,
    why: [ROLL_WHY[t.reason], t.reason === 'well jump' && legalActions(S.game, content()).some(x => x.type === 'WELL_DISCARD') ? `Each ${chamberCards(content(), 1)} you carry adds 1 to the roll. Go back to drop cards first.` : '', ...then.map(x => `Then ${x.reason === 'well entry' ? 'an Agility test on entering the well room' : `a ${STAT[x.stat]} test`}.`)].filter(Boolean).join(' '),
    mods: t.modifiers.map(m => ({ label: capital(m.source), n: m.value })),
  };
}
let rollFromCell = false; // the roll card was opened from the map grid, so focus goes back there

// An action with a known roll first opens the card: nothing is sent until Roll, and Back (or Esc, or a tap
// outside) returns to the choice with nothing spent. Anything else goes straight to the engine.
function tryAct(a) {
  const info = testInfo(view(S.game, content(), viewer), a);
  if (!info) return act(a);
  rollFromCell = !!document.activeElement?.closest?.('[data-cell]');
  const d = $('roll'), body = [];
  $('rollTitle').textContent = info.title;
  if (info.why) body.push(el('p', '', info.why));
  if (info.stat) {
    const facts = el('dl', 'facts');
    const row = (k, val) => { const r = el('div'); r.append(el('dt', '', k), el('dd', '', val)); facts.append(r); };
    row(`${nameOf(S.game.activeSeat)}'s ${STAT[info.stat]}`, String(info.value));
    for (const m of info.mods) row(m.label, `${m.n < 0 ? '-' : '+'} ${Math.abs(m.n)}`);
    body.push(facts);
  }
  const dice = el('div');
  rollDice(dice, [{ value: '?' }], { sides: info.die === 'D6' ? 6 : 12, animate: false });
  body.push(dice);
  const need = info.stat ? info.need : null;
  body.push(el('p', 'need', need === null ? `Roll the ${info.die}` : need >= 12 ? 'Any roll on the D12 passes' : need < 1 ? 'No roll on the D12 can pass' : `Roll ${need} or less on a D12`));
  $('rollBody').replaceChildren(...body);
  const go = el('button', 'btn primary', 'Roll');
  go.onclick = () => { d.dataset.mode = 'rolling'; act(a); };
  const btns = [go];
  if (info.cancel) { const back = el('button', 'btn', 'Back'); back.onclick = () => d.close(); btns.unshift(back); }
  $('rollBtns').replaceChildren(...btns);
  d.dataset.mode = info.cancel ? 'ask' : 'ask-only';
  d.dataset.title = info.title;
  if (!d.open) d.showModal();
  go.focus();
}

// ---- Result cards (spec v12 fix 1), in the roll card: title, what the card is, every die rolled for it with its
// consequence, then the tagged result lines and Continue. One card after another in the engine's order; the table
// stays held until the last Continue. Public in multiplayer (built from the public view), so nothing hidden shows.
const tagChip = tag => el('span', `tag tag-${tag}`, OUTCOME_TAG[tag]);
function drawCard(card, i, n) {
  const d = $('roll');
  $('rollTitle').textContent = card.title;
  const body = [];
  if (n > 1) body.push(el('p', 'count', `${i + 1} of ${n}`));
  for (const w of card.what) body.push(el('p', 'what', w));
  const dice = el('div'), out = el('div', 'outcome');
  for (const x of card.dice) { const p = el('p', 'tagged'); p.append(tagChip(x.tag), ' ', x.text); out.append(p); }
  if (card.results.length) {
    const ul = el('ul', 'results');
    for (const r of card.results) { const li = el('li', 'tagged'); li.append(tagChip(r.tag), ' ', r.text); ul.append(li); }
    out.append(ul);
  }
  if (card.dice.length) body.push(dice);
  body.push(out);
  $('rollBody').replaceChildren(...body);
  const ok = el('button', 'btn primary', 'Continue'); // "1 of 3" above says more follow
  ok.onclick = () => queue.next(); // spec v12 fix 5: the next card, or the table, at once in this handler
  $('rollBtns').replaceChildren(ok);
  d.dataset.mode = 'result';
  if (!d.open) { rollFromCell = !!document.activeElement?.closest?.('[data-cell]'); d.showModal(); }
  const shown = () => { out.style.visibility = ok.style.visibility = ''; ok.focus(); say(cardSpeech(card)); };
  if (!card.dice.length) return shown();
  out.style.visibility = ok.style.visibility = 'hidden';
  $('rollTitle').focus(); // until Continue shows
  // The tumble only decorates: it settles on a timer (dice.js), and is skipped while the page is hidden.
  rollDice(dice, card.dice.map(x => ({ value: x.value, sides: x.die === 'D12' ? 12 : 6 })), { animate: !document.hidden }).then(() => { if (d.open && out.isConnected) shown(); });
}
// After the last card: close, then the fight's end card, the table, focus and dusk, all inside the click handler.
function cardsDone() {
  const d = $('roll');
  d.dataset.mode = '';
  if (d.open) d.close();
  showOutcome(); // a fight's end card keeps the table held
  if (!$('outcome').open) release();
  refocus(rollFromCell);
  showDusk();
}
const queue = cardQueue(drawCard, cardsDone);
const canUndo = () => canUndoHist(S.hist, S.game);
// The thumb-reach undo under a prompt, named for what it takes back; or, with note, why there is nothing to undo.
function undoHere(v, note) {
  if (canUndo()) {
    const u = el('button', 'btn undo-here', undoLabel(S.hist.at(-1), S.game, content(), nameOf));
    u.onclick = undo;
    return [u];
  }
  const why = note && undoBlocked(v.log);
  return why ? [el('p', 'undo-note', why)] : [];
}
function undo() {
  if (!canUndo()) return;
  const here = document.activeElement?.classList.contains('undo-here');
  S.game = S.hist.pop();
  S.seen = Math.min(S.seen, S.game.log.length);
  S.reveal = null;
  outcome = null;
  S.peek = null;
  render();
  if (here) document.querySelector('main:not([hidden]) .undo-here')?.focus(); // press again for one more step
}

function newGame(mode) {
  const players = S.names.slice(0, S.count).map((n, i) => n.trim() || `Player ${i + 1}`);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  let game;
  try { game = createGame({ players, seed, content: CONTENT[mode], rules: { soloCombat: S.soloCombat } }); } catch (err) {
    $('startReason').textContent = err.message;
    return;
  }
  Object.assign(S, { mode, game, hist: [], saveId: null, createdAt: null, seen: 0, reveal: null, peek: null, dusk: [] });
  viewer = players.length === 1 ? 0 : null;
  outcome = null;
  resetView();
  render();
  window.scrollTo(0, 0);
}

function toTitle() {
  Object.assign(S, { mode: null, game: null, hist: [], saveId: null, createdAt: null, seen: 0, reveal: null, peek: null, dusk: [] });
  $('dusk').hidden = true;
  viewer = null;
  outcome = null;
  shown = NL.saves.cached('keep') ?? shown; // this browser's copy of a save just made shows at once
  render();
  window.scrollTo(0, 0);
  refreshSaves();
}

// ---- Saves through NL.saves.
function saveTitle(g) {
  const n = g.seats.length;
  const when = g.status === 'over' ? 'finished' : g.status === 'setup' ? 'setting up' : `sun ${g.sun}`;
  return `Dusk Keep, ${n} ${n === 1 ? 'player' : 'players'}, ${when}${g.banner ? `, ${g.banner}` : ''}`;
}
// put() writes to this browser at once and uploads in the background for a signed-in person.
async function saveGame() {
  const g = S.game;
  if (g.status === 'over') throw new Error('A finished game is not saved');
  const now = new Date().toISOString();
  if (!S.saveId) Object.assign(S, { saveId: crypto.randomUUID(), createdAt: now }); // before any await, so a double tap updates one record
  if (!S.createdAt) S.createdAt = (await NL.saves.get(S.saveId).catch(() => null))?.createdAt || now;
  persist();
  // The server keeps 256 KB per save: the newest undo steps that fit go with it, so undo survives a resume.
  const state = { mode: S.mode, game: g, hist: fitHist(S.hist, JSON.stringify({ mode: S.mode, game: g, hist: [] }).length, 240000) };
  return NL.saves.put({
    schemaVersion: 1, id: S.saveId, game: 'keep', personPublicId: NL.person(),
    title: saveTitle(g), status: 'in_progress',
    createdAt: S.createdAt, updatedAt: now, state,
  });
}
const okRecord = r => !!r?.state && CONTENT[r.state.mode] && !!r.state.game && typeof r.state.game === 'object';

// Finished games are not saved (owner, 2026-11-19). When a saved game ends, act() moves its id to S.dropSave and the
// record is removed here, so it can neither be resumed nor linger in the list (Bank, too, writes a save only when
// asked). Signed in, remove() must reach the server (decision 0003) and rejects offline: S.dropSave is autosaved and
// tried again on a later render, at most every 15 seconds, and when the network comes back. Meanwhile the list hides it.
let dropping = false, dropAt = 0;
function dropFinished() {
  const id = S.dropSave;
  if (!id || dropping || Date.now() - dropAt < 15000) return;
  dropping = true;
  dropAt = Date.now();
  NL.saves.remove(id).then(() => {
    if (S.dropSave === id) { S.dropSave = null; persist(); }
    shown = shown && shown.filter(r => r.id !== id);
    if (!S.game) drawSaves();
  }, () => {}).finally(() => { dropping = false; });
}
addEventListener('online', () => { dropAt = 0; dropFinished(); });

async function resume(id) {
  const r = await NL.saves.get(id).catch(() => null); // a signed-in save can fail to load when the server is unreachable
  if (!r) return toast('Could not open that save. Check your connection and try again.');
  let game, c;
  try { c = CONTENT[r.state.mode]; game = restore(JSON.stringify(r.state.game), c); } catch { return toast('That save cannot be opened.'); }
  Object.assign(S, {
    mode: r.state.mode, game, hist: Array.isArray(r.state.hist) ? r.state.hist.filter(h => okSnap(h, c)).slice(-HIST_CAP) : [],
    saveId: r.id, createdAt: r.createdAt, seen: game.log.length, reveal: null, peek: null, dusk: passedDusk(game),
  });
  viewer = game.seats.length === 1 ? 0 : null;
  outcome = null;
  resetView();
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

// The list shown now: the last known one at once (stale while revalidate), null while nothing is known yet.
let shown = NL.saves.cached('keep'), loadingSaves = !shown, savesNote = '';
const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const NOT_SYNCED = { save_limit: 'Not synced: 200 saves is the limit, delete one', too_large: 'Not synced: too large to upload', refused: 'Not synced: the server refused it' };

async function refreshSaves() {
  try {
    shown = await NL.saves.list('keep');
    savesNote = '';
  } catch {
    // Keep what is shown; never invent an empty list.
    savesNote = shown ? 'Could not reach the server. Showing the last known list.' : 'Could not load saved games.';
  }
  loadingSaves = false;
  if (!S.game) drawSaves();
}
addEventListener('nl-saves', () => { if (!S.game) refreshSaves(); }); // an upload finished or was refused
const OPEN_KEY = 'nl-keep-saved-open'; // open or closed, for this visit
try { $('savedGroup').open = sessionStorage.getItem(OPEN_KEY) === '1'; } catch {}
$('savedGroup').ontoggle = () => { try { sessionStorage.setItem(OPEN_KEY, $('savedGroup').open ? '1' : '0'); } catch {} };

function drawSaves() {
  const recs = (shown || []).filter(r => okRecord(r) && r.id !== S.dropSave), group = $('savedGroup');
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

function saveRow(r) {
  const li = el('li'), open = el('button', 'resume'), del = el('button');
  const when = new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const sync = r.pending ? ` · ${NOT_SYNCED[r.pending] || 'Not synced yet'}` : '';
  open.append(el('strong', '', r.title), el('span', '', `${r.status === 'finished' ? 'Finished' : 'In progress'} · ${when}${sync}`));
  open.onclick = () => resume(r.id);
  // Two-step delete in place: the X turns into a Delete button until the confirm tap, a tap anywhere else, or 4 seconds.
  // Not focus and blur: Safari on iOS drops focus from a tapped button before the second tap's click arrives.
  let disarm = null;
  const arm = on => {
    disarm?.();
    disarm = null;
    del.className = on ? 'btn danger' : 'circle remove';
    del.replaceChildren(on ? 'Delete' : xIcon());
    del.setAttribute('aria-label', on ? `Confirm delete ${r.title}` : `Delete ${r.title}`);
    if (!on) return;
    const away = e => { if (!del.contains(e.target)) arm(false); };
    const timer = setTimeout(() => arm(false), 4000);
    document.addEventListener('pointerdown', away, true);
    disarm = () => { clearTimeout(timer); document.removeEventListener('pointerdown', away, true); };
  };
  del.onclick = () => {
    if (!disarm) return arm(true);
    arm(false);
    removeSave(r);
  };
  arm(false);
  li.append(open, del);
  return li;
}

// Optimistic: the row goes at once and comes back with a message if the server refuses or cannot be reached.
async function removeSave(r) {
  shown = (shown || []).filter(x => x.id !== r.id);
  savesNote = '';
  drawSaves();
  try {
    await NL.saves.remove(r.id);
    shown = (shown || []).filter(x => x.id !== r.id); // a refresh that landed meanwhile may have brought it back
  } catch {
    shown = [...(shown || []).filter(x => x.id !== r.id), r].sort(newestFirst);
    savesNote = 'Could not delete that save. Check your connection and try again.';
  }
  if (!S.game) drawSaves();
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
  const name = nameOf(need);
  $('coverTitle').textContent = `Pass to ${name}`;
  $('coverNote').textContent = S.peek ? `Only ${name} should look: secret ${chamberCards(content())}.`
    : g.phase === 'MONSTER_REACT' ? `${name} plays the monster and reads its card in secret.`
    : need === g.encounter?.seat ? `${name} picks a combat card in secret.` : `${name} picks the monster's card in secret.`;
  $('coverGo').textContent = `I am ${name}, show me`;
  $('coverGo').onclick = () => {
    viewer = need;
    render();
    showDusk();
    // Straight to the prompt, not the map (on a phone in portrait the prompt is docked under the board already).
    if (!PHONE.matches) $('table').querySelector('.tablegrid section.panel')?.scrollIntoView({ block: 'start' });
  };
  $('cover').hidden = false;
  window.scrollTo(0, 0);
  $('coverGo').focus();
}

// ---- Rendering
// A phone, portrait or landscape: board and prompt share one screen (index.html has the same media queries).
const PHONE = matchMedia('(max-width: 819.98px) and (orientation: portrait), (orientation: landscape) and (max-height: 540px)');
PHONE.addEventListener('change', () => { if (S.game && !held) render(); }); // the map key moves between board and fold
// The one permanent live region: the latest result lines, only ever from the current viewer's view.
const say = text => { if ($('said').textContent !== text) $('said').textContent = text; };

// Keep the screen on while a game is in progress (feature-detected; a refusal or an old browser is fine).
let wake = null; // a promise of the WakeLockSentinel while one is held or asked for
function keepAwake(on) {
  if (!on) { const w = wake; wake = null; w?.then(s => s?.release()).catch(() => {}); return; }
  if (wake || document.hidden || !navigator.wakeLock) return;
  const p = wake = navigator.wakeLock.request('screen').then(
    s => { s.addEventListener('release', () => { if (wake === p) wake = null; }); return s; }, // the browser drops it when hidden
    () => { if (wake === p) wake = null; return null; });
}

let boardApi = null; // the mounted map, to put keyboard focus back on its grid after a re-render
function render() {
  persist();
  dropFinished();
  const g = S.game;
  const screen = !g ? 'title' : g.status === 'setup' ? 'draft' : g.status === 'over' ? 'results' : 'table';
  const onCell = !!document.activeElement?.closest?.('[data-cell]');
  boardApi = null;
  keepAwake(screen === 'draft' || screen === 'table');
  document.querySelector('.app').classList.toggle('wide', screen !== 'title');
  document.querySelector('.app').classList.toggle('table', screen === 'table');
  // Spec v2 #12: the banner names exactly which categories are synthetic.
  $('banner').hidden = !g?.banner;
  $('bannerText').textContent = g?.banner || '';
  $('synthetic').replaceChildren(...(g?.banner ? bannerLines(content()) : []).map(t => el('li', '', t)));
  // Menu: like Bank, the Games link gives way to Exit during a game. Undo shows only when a press works, named.
  const undoOk = canUndo() && !S.peek && !S.reveal;
  if (!undoOk && document.activeElement === $('undo')) $('menu').querySelector('.menu-trigger').focus();
  $('undo').hidden = !undoOk;
  if (undoOk) $('undo').querySelector('span').textContent = undoLabel(S.hist.at(-1), g, content(), nameOf);
  $('exitBtn').hidden = $('logBtn').hidden = !g;
  $('gamesLink').hidden = !!g;
  [...$('menuItems').children].filter(i => !i.hidden).forEach((item, k) => item.style.setProperty('--i', k + 1)); // NL.menu sets these on open only
  if (!g) {
    say('');
    $('cover').hidden = true;
    for (const id of ['draft', 'table', 'results']) { $(id).hidden = true; $(id).replaceChildren(); }
    $('title').hidden = false;
    return renderTitle();
  }
  if (solo()) viewer = 0;
  const need = needViewer();
  // Nothing private on screen now: straight to the public view, no hand-back cover. view(g, c, null) only ever
  // redacts more than any seat's view, so the last private holder sees nothing new. A cover still hands the
  // screen TO a seat.
  if (need === null) viewer = null;
  if (need !== viewer) { say(''); showCover(need); return showOutcome(); } // public, so over the cover
  $('cover').hidden = true;
  if ($(screen).hidden) scrollTo(0, 0); // a new screen starts at its top, not where the last one was scrolled
  for (const id of ['title', 'draft', 'table', 'results']) $(id).hidden = id !== screen;
  for (const id of ['draft', 'table', 'results']) if (id !== screen) $(id).replaceChildren();
  const v = view(g, content(), viewer);
  if (!$('roll').open) say(screen === 'table' ? [...lines(v.log.filter(e => e.seq > S.seen), ctx()), duskLine].filter(Boolean).join(' ') : ''); // a view drops shuffles: by seq, not index
  if (screen === 'draft') renderDraft(v);
  else if (screen === 'table') renderTable(v);
  else renderResults(v);
  refocus(onCell);
  showOutcome(); // after the Reveal's Continue, say
}
// Focus that a re-render (or a closed roll card) took away goes back to the map grid if it was there, else for
// keyboard players to the first choice.
function refocus(onCell) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected && !a.closest('[hidden]')) return;
  if (!$('cover').hidden) return $('coverGo').focus();
  if (onCell && boardApi) boardApi.focus();
  else if (keyboard) document.querySelector('main:not([hidden]) :is(.choices button, button.choice):not(:disabled)')?.focus();
}

// ---- Title and setup
const showCount = NL.segmented($('countSeg'), v => { S.count = +v; render(); });
const showSolo = NL.segmented($('soloSeg'), v => { S.soloCombat = v; render(); });
const showTheme = NL.segmented($('themeSeg'), v => { NL.theme.set(v); showTheme(v); });
NL.menu($('menu'));
NL.account($('account'));
const emptyRoster = () => !S.names.some(n => n.trim()) && !S.game;
const prefill = i => { if (i?.displayName && emptyRoster()) S.names[0] = i.displayName.slice(0, 20); };

function renderTitle() {
  showCount(String(S.count));
  // Sign-in still on its way with no cached name: hold the first player's row for it.
  const waiting = !NL.settled && emptyRoster();
  const shape = `${S.count} ${waiting}`;
  $('names').setAttribute('aria-busy', waiting);
  if ($('names').dataset.shape !== shape) {
    $('names').dataset.shape = shape;
    $('names').replaceChildren(...S.names.slice(0, S.count).map((n, i) => {
      if (i === 0 && waiting) { const li = el('li', 'loading'); li.setAttribute('aria-hidden', 'true'); li.append(el('span', 'skeleton line')); return li; }
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
  $('statusNote').textContent = STATUS.note;
  $('status').replaceChildren(...REPORT.categories.map((c, i) => {
    const li = el('li');
    li.append(el('span', '', c.label), el('span', '', STATUS.lines[i].slice(c.label.length + 1)));
    return li;
  }));
  $('start').disabled = !REPORT.fullStartAllowed;
  $('startReason').textContent = REPORT.fullStartAllowed ? '' : STATUS.start;
  $('fixtures').disabled = !FX_REPORT.fixturePlayable;
  $('mixed').disabled = !STATUS.mixedAllowed;
  $('mixedReason').textContent = STATUS.play;
  drawSaves();
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
  if (def.text) box.append(el('p', '', def.text));
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
  return rolls.map(e => `${nameOf(+e.reason.split(' ').pop())} rolled ${e.value}`).join(', ');
}

// The first-player roll is a step of its own: "?" dice and Roll (or a tap on the dice); once they land, the result
// and "Pick heroes", which brings in the hero picker. Never saved: a reload or resume goes straight to the picker.
// From then on (owner, 2026-11-19) the dice are gone: one small line says who goes first and the order of play.
let firstRolled = false; // just rolled: the dice tumble on the next draw
let firstWait = false; // the result shows on its own until "Pick heroes"
function renderDraft(v) {
  const g = S.game, c = content(), la = legalActions(g, c);
  const out = [el('h1', '', 'Setting up')];
  const { step } = g.setup;
  const seat = la[0].seat;
  if (step === 'first-player') {
    const p = panel('Who goes first', 'Everyone rolls a D12. The highest goes first; tied highest roll again.');
    const dice = el('div', 'tapdice');
    rollDice(dice, g.seats.map(s => ({ value: '?', label: s.name })), { animate: false });
    const go = () => { firstRolled = firstWait = true; act(la[0]); };
    dice.onclick = go; // the Roll button is the keyboard and screen reader way
    const ch = el('div', 'choices');
    ch.append(choice('Roll', `${g.seats.length} D12s`, go, 'primary'));
    p.append(dice, ch);
    out.push(p);
  } else if (firstWait && step === 'heroes') {
    // Every player's die, rerolls for a tie included, landing on what the engine rolled: animated once, just
    // after the roll, and the result said once it has landed.
    const p = panel('Who goes first');
    const dice = el('div'), seen = new Set();
    const items = g.log.filter(e => e.kind === 'roll' && /^first player, seat \d+$/.test(e.reason)).map(e => {
      const s = +e.reason.split(' ').pop(), again = seen.has(s);
      seen.add(s);
      return { value: e.value, label: again ? `${nameOf(s)}, again` : nameOf(s) };
    });
    const tie = items.some(x => x.label.endsWith(', again'));
    const res = el('p', 'firstres', `${nameOf(g.firstSeat)} goes first.`);
    const rolls = el('p', '', `${firstRolls(g)}.${tie ? ' Tied highest rolled again.' : ''}`);
    const order = el('p', '', `Order of play, clockwise: ${listOf(g.seats.map((_, k) => nameOf((g.firstSeat + k) % g.seats.length)))}.`);
    const ch = el('div', 'choices');
    ch.append(choice('Pick heroes', null, () => { firstWait = false; render(); }, 'primary'));
    p.append(dice, res, rolls, order, ch);
    const shown = [res, rolls, order, ch];
    out.push(p);
    const animate = firstRolled;
    firstRolled = false;
    if (animate) for (const x of shown) x.style.visibility = 'hidden';
    $('draft').replaceChildren(...out);
    return rollDice(dice, items, { animate }).then(() => {
      if (!animate) return;
      for (const x of shown) x.style.visibility = '';
      say(`${res.textContent} ${rolls.textContent} ${order.textContent}`);
      p.querySelector('.choice')?.focus();
    });
  } else {
    firstWait = false; // past the hero step (an undo, or another device): the picker as usual
    const n = g.seats.length;
    if (n > 1) out.push(el('p', 'firstline', `${nameOf(g.firstSeat)} goes first. Order: ${g.seats.map((_, k) => nameOf((g.firstSeat + k) % n)).join(', ')}.`));
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
      const said = r.text || r.power || shownEffectText(r, chamberName(c)).replace(/\.$/, '');
      const b = choice(r.name || r.id, takenBy ? `${said}. Taken by ${takenBy.name}.` : said, a ? () => act(a) : null);
      b.disabled = !a;
      ch.append(b);
    }
    p.append(ch);
    out.push(p);
  }
  if (step === 'towers') {
    const p = panel(`${nameOf(seat)}, pick your starting tower`, 'Towers are picked clockwise from the first player and may be shared.');
    const wrap = el('div', 'board-wrap');
    boardApi = mountBoard(wrap, { v, content: c, names: g.seats.map(s => s.name), onInspect: inspect, targets: la.map(a => ({ ...c.board.towers[a.tower], label: `Start in the ${towerName(c, a.tower)}`, pick: () => act(a) })) });
    p.append(wrap);
    const ch = el('div', 'choices grid2');
    for (const a of la) ch.append(choice(capital(towerName(c, a.tower)), null, () => act(a)));
    p.append(ch);
    out.push(p);
  }
  if (step !== 'first-player') out.find(x => x.matches('section.panel'))?.append(...undoHere(v, false)); // under the pick
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

// Why the hero may go on (the Keep moving prompt): the latest 'may-continue' entry the engine logged this turn.
function keepMovingWhy(v) {
  const turn = v.log.slice(v.log.findLastIndex(e => e.kind === 'turn') + 1);
  const e = turn.findLast(x => x.kind === 'may-continue');
  return e ? entries([e], ctx())[0]?.text || null : null;
}

// ---- Main tabletop
// The sun track (owner, 2026-11-19): a notch per sun, the elapsed part filled, the sun on this step, the last five
// notches in the danger colour and the horizon at the end; the number left beside it. One image for readers.
function sunTrack(sun, one) {
  const { step, steps, left } = daylight(sun, SUNSET), box = el('div', 'suntrack'), track = el('div', 'track');
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', trackLabel(sun, SUNSET, one));
  track.style.setProperty('--at', steps > 1 ? (step - 1) / (steps - 1) : 1);
  const notches = el('span', 'notches');
  for (let k = 1; k <= steps; k++) notches.append(el('i', [k < step && 'past', k > steps - 5 && 'late'].filter(Boolean).join(' ')));
  track.append(el('i', 'rail'), el('i', 'fill'), notches, el('i', 'sunmark'));
  const horizon = svg('svg', { viewBox: '0 0 16 12', class: 'horizon', 'aria-hidden': 'true' });
  svg('path', { d: 'M3 10a5 5 0 0 1 10 0', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, horizon);
  svg('path', { d: 'M0 11h16', stroke: 'currentColor', 'stroke-width': 2 }, horizon);
  const n = el('span', 'left', String(left));
  n.append(el('span', 'w', ` ${unit(left, one)}`), ' left');
  n.setAttribute('aria-hidden', 'true');
  box.append(track, horizon, n);
  return box;
}
// A small icon and number, its words for readers (and on wide screens words in front of the number).
function chip(cls, label, icon, words, num) {
  const c = el('span', `chip ${cls}`);
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', label);
  const s = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  svg('path', { d: icon }, s);
  c.append(s);
  if (words) c.append(el('span', 'w', words));
  c.append(num);
  return c;
}

// A move as a title and a reason line, read from the engine's exits (BoardDefinition geometry) and the tile data.
const MARK_EFFECT = { black: 'draws a room card', red: 'draws a room card, a portcullis drops behind you', yellow: 'you may keep moving', blue: '', none: '' };
const SPECIAL_EFFECT = { well: 'Agility test on entry, a fall is death', rubble: 'ends your turn', rotating: 'turns a quarter on entry', none: '' };
// a: the engine's MOVE action; its `from` names the chamber half it leaves by (D39).
function moveInfo(g, a) {
  const c = content(), seat = g.activeSeat, hero = g.heroes[seat], dir = a.dir;
  const ex = exitFor(g, c, seat, dir, a.from);
  const kind = squareKind(c.board, ex.to);
  const inst = g.board.tiles[key(ex.to)];
  const def = inst && contentIndex(c).tiles.get(inst.defId);
  const parts = [];
  if (ex.edge === 'door') parts.push('door, a door card first');
  if (ex.edge === 'gate') parts.push(`${sideWord(g, c, ex.from, dir)}, Strength ${heroDef(hero).stats.STR} test`);
  if (ex.edge === 'secret') parts.push('secret passage');
  if (kind === 'tower') parts.push('you may escape, stay or go on through it');
  else if (kind === 'center') parts.push(g.dragon.awake ? `${chamberName(c)}, the dragon is awake: no cards` : `${chamberName(c)}, two secret cards then a dragon card`);
  else if (!def) parts.push('unexplored, will reveal a tile');
  else parts.push(tileWords(def), MARK_EFFECT[def.mark], def.mark === 'blue' && g.rules.darkRoomPolicy === 'EVERY_ENTRY' ? 'ends your turn, a D6 picks the way out' : '', SPECIAL_EFFECT[def.special]);
  const title = ex.edge === 'door' || ex.edge === 'gate' ? `Try ${DIR[dir]}` : kind === 'tower' ? `Enter the ${towerAt(ex.to)}` : `Go ${DIR[dir]}`;
  return { title, reason: parts.filter(Boolean).join(', ') };
}
// Why an adjacent square cannot be entered now (the engine's exits() reason, in words).
const WHY = { 'door-closed': 'the door stayed shut this turn', 'tower-entry': 'that is the way you came into the tower', 'no-tiles-left': 'no tiles left to reveal', occupied: 'occupied room, one hero per room', 'across-the-well': 'on the other side of the well, jump to reach it' };
function whyNot(g, ex) {
  if (ex.reason !== 'wall') return WHY[ex.reason] || ex.reason;
  const w = sideWord(g, content(), ex.from, ex.dir);
  return w === 'wall' ? 'wall on this side' : w === 'printed wall' ? 'wall printed on the board' : 'wall on their side';
}

// One log line: the plain sentence, then the dice arithmetic behind it in smaller text.
function logLine({ text, detail }) {
  const li = el('li', '', text);
  if (detail) li.append(el('small', '', detail));
  return li;
}

// ---- Fight panels (owner, 2026-11-19): compact, so on a phone the buttons are in the dock without scrolling,
// however long the fight. A one-line header with a small tag, the fight in one row, the last exchange in one line
// and the earlier ones behind History.
function fightPanel(title, tag) {
  const p = el('section', 'glass panel fight'), h = el('h2', '', title);
  if (tag) h.append(el('span', 'tag', tag));
  p.append(h);
  return p;
}
// Who is fighting and the hero's HP. D37: the monster's card name only in the monster player's own view, its HP there
// and (spec v4) in the solo player's view once revealed; the engine strips them from every other view.
function fightRow(v, seat, enc) {
  const row = el('div', 'fightrow'), f = fightRowModel(v, seat, enc, nameOf, content());
  row.append(el('span', 'who', f.who));
  const hp = el('span', 'herohp'), bar = el('span', 'hp'), fill = el('i');
  fill.style.width = `${Math.min(100, 100 * f.hero.left / f.hero.max)}%`;
  bar.append(fill);
  hp.append(bar, `${f.hero.left}/${f.hero.max}`);
  hp.setAttribute('role', 'img');
  hp.setAttribute('aria-label', f.hero.label);
  row.append(hp);
  if (f.monster) row.append(hpMeter(f.monster.left, f.monster.max, f.monster.label));
  return row;
}
function lastLine(v, enc) {
  const x = enc.combat?.exchanges?.at(-1);
  return x ? el('p', 'last', `Last: ${lastWords(x, viewer === enc.seat ? 'you' : nameOf(enc.seat))}`) : null;
}
// The exchanges before the last one, opened in place (the open state lasts for the visit, like the map key).
let historyOpen = false;
function history(enc) {
  const ex = enc?.combat?.exchanges || [];
  if (ex.length < 2) return null;
  const d = el('details', 'history');
  d.open = historyOpen;
  d.ontoggle = () => { historyOpen = d.open; };
  d.append(el('summary', '', `History (${ex.length - 1})`));
  const ol = el('ol');
  for (const x of ex.slice(0, -1)) ol.append(el('li', '', x.placement ? (x.rethrow ? 'Unclear, thrown again' : `${PLACEMENT[x.placement]}, ${FACE[x.face].toLowerCase()}: hero ${x.heroDmg}, monster ${x.monsterDmg}`) : `${exchangeWords(x, nameOf(enc.seat))}.`));
  d.append(ol);
  return d;
}
// The small controls under a fight panel's buttons: Items and History here, Undo from renderTable.
function tools(...items) {
  const t = el('div', 'tools');
  t.append(...items.filter(Boolean));
  return t;
}

// The monster's HP for the monster player (and the solo player, spec v4): a heart per HP (filled left, empty lost), or
// above 10 the hero panel's green bar.
function hpMeter(left, max, label) {

  let m;
  if (max > 10) {
    m = el('div', 'hp');
    const fill = el('i');
    fill.style.width = `${100 * left / max}%`;
    m.append(fill);
  } else {
    m = el('div', 'hearts');
    for (let i = 0; i < max; i++) {
      const h = svg('svg', { viewBox: '0 0 24 24', class: i < left ? 'full' : 'lost', 'aria-hidden': 'true' });
      svg('path', { d: 'M12 20.5s-7.6-4.6-9.4-9.3C1.3 7.8 3.4 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.4 0 5.5 3.3 4.2 6.7-1.8 4.7-9.4 9.3-9.4 9.3z' }, h);
      m.append(h);
    }
  }
  m.setAttribute('role', 'img');
  m.setAttribute('aria-label', label);
  return m;
}

// A, B and C: the letter large, what it beats and loses to (BEATS, the engine's rule), and a double hit only on a card
// that has one. The card's placeholder name is in the accessible label only; "same letter" is said once, under them.
const LOSES_TO = Object.fromEntries(Object.entries(BEATS).map(([w, l]) => [l, w]));
function combatCards(seatSet, onPick) {
  const ch = el('div', 'choices grid3');
  for (const letter of ['A', 'B', 'C']) {
    const card = (content().combat || []).find(x => x.setId === seatSet && x.letter === letter);
    const beats = BEATS[letter], twice = !!card?.doubleAgainst?.includes(beats);
    const b = el('button', 'choice combatcard');
    b.append(el('span', 'big', letter), el('small', 'rule', `beats ${beats}`), el('small', '', `loses to ${LOSES_TO[letter]}`));
    if (twice) b.append(el('small', 'rule', `hits ${beats} twice`));
    b.setAttribute('aria-label', `Play ${letter}, ${card ? card.name : 'card pending'}. Beats ${beats}${twice ? ', hitting twice' : ''}. Loses to ${LOSES_TO[letter]}.`);
    b.onclick = () => onPick(letter);
    ch.append(b);
  }
  return ch;
}
const SAME = 'Same letter: both take 1.';

// The prompt panel: one per phase the engine can raise, built from its legal actions.
// Owner catalogue (torch, giant spider, ceiling): pick count different numbers from 1 to 6, then roll the D6. Six
// toggle buttons (aria-pressed) and a Roll button that waits for the full set; the picks live here until the roll.
// Spec v12 fix 3: the controls come first, then the rule as three short steps (namedSteps reads them from the card, so
// the spider's match says it is defeated), and the dock puts this prompt above what just happened.
let named = { key: null, picks: [] };
// Short steps under a prompt's buttons.
const stepList = steps => { const ol = el('ol', 'steps'); for (const t of steps) ol.append(el('li', '', t)); return ol; };
function numberPicker(v, pend, legal) {
  const at = String(v.log.length);
  if (named.key !== at) named = { key: at, picks: [] };
  const one = pend.count === 1;
  const p = panel(pend.label || 'Name numbers');
  p.classList.add('first');
  const row = el('div', 'numpick');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Numbers to name');
  const count = el('p', 'muted');
  count.setAttribute('aria-live', 'polite');
  const go = el('button', 'btn primary', 'Roll the D6');
  const sync = () => {
    const picks = [...named.picks].sort((a, b) => a - b);
    count.textContent = `${picks.length} of ${pend.count} chosen${picks.length ? `: ${picks.join(', ')}` : ''}`;
    go.disabled = picks.length !== pend.count;
    row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(named.picks.includes(+b.value))));
  };
  for (let n = 1; n <= 6; n++) {
    const b = el('button', 'btn', String(n));
    b.type = 'button';
    b.value = n;
    b.onclick = () => {
      const i = named.picks.indexOf(n);
      if (i >= 0) named.picks.splice(i, 1);
      else if (one) named.picks = [n];
      else if (named.picks.length < pend.count) named.picks.push(n);
      sync();
    };
    row.append(b);
  }
  go.onclick = () => {
    const a = legal.find(x => x.numbers === [...named.picks].sort((m, k) => m - k).join(','));
    if (a) { named = { key: null, picks: [] }; act(a); }
  };
  sync();
  const ch = el('div', 'choices');
  ch.append(go);
  p.append(row, count, ch, stepList(namedSteps(pend).steps));
  return p;
}

function renderPrompt(v, la, targets) {
  const g = S.game, c = content();
  const name = nameOf(g.activeSeat);
  const hero = g.heroes[g.activeSeat];
  const enc = v.encounter;
  const by = type => la.filter(a => a.type === type);
  let p;

  if (S.peek) {
    const seat = S.peek.seat, mine = v.heroes[seat];
    p = panel(`${nameOf(seat)}, your ${chamberCards(c)}`, 'Only you may see these.');
    if (S.peek.from !== null) {
      const drawn = v.log.filter(e => e.seq > S.peek.from && e.kind === 'draw' && e.deck === 'TREASURY' && e.private === seat);
      for (const e of drawn) { const d = cardDef(c, e.value); const f = el('div', 'cardface'); f.append(el('strong', '', `Drawn: ${e.cardName || d.name}`), el('p', '', cardText(d, e.effectText, c))); p.append(f); }
    }
    const f = el('div', 'cardface');
    f.append(el('strong', '', mine.treasury.length ? `You hold ${mine.treasury.length}: ${mine.gold} gold in all` : `You hold no ${chamberCards(c)} now`));
    mine.treasury.forEach((inst, i) => f.append(el('p', '', `${i + 1}. ${cardDef(c, inst).name}, ${cardDef(c, inst).gold || 0} gold`)));
    p.append(f);
    const ch = el('div', 'choices');
    ch.append(choice('Hide my cards', null, () => { S.peek = null; render(); }, 'primary'));
    p.append(ch);
    return p;
  }
  if (S.reveal) {
    const last = S.reveal;
    // The two letters large, one sentence, Continue; the fight row above and History below.
    p = fightPanel('Reveal');
    p.append(fightRow(v, last.seat, enc));
    const vs = el('div', 'vs');
    const side = (who, letter) => { const d = el('div'); d.append(el('span', '', letter), el('small', '', who)); return d; };
    vs.append(side(nameOf(last.seat), last.hero), el('small', '', 'against'), side('Monster', last.monster));
    p.append(vs, el('p', 'exchange', revealWords(last, nameOf(last.seat))));
    const ch = el('div', 'choices');
    ch.append(choice('Continue', null, () => { S.reveal = null; render(); }, 'primary'));
    p.append(ch);
    const h = history(enc);
    if (h) p.append(tools(h));
    return p;
  }

  const ch = el('div', 'choices');
  switch (g.phase) {
    case 'CHOOSE_ACTION':
    case 'CHOOSE_EXIT': {
      const inTower = hero.status === 'IN_TOWER_NOT_ESCAPED';
      const awake = v.collectUnavailable ? 'The dragon is awake. ' : ''; // D40: on the Lair while it stays awake
      p = g.phase === 'CHOOSE_ACTION'
        ? panel(`${name}, your move`, inTower ? `You are in the ${towerAt(hero.coord)}, not escaped.` : awake ? `${awake}Leave by any free way out when there is one.` : hero.roomState?.phase === 'CROSSED' ? 'You are across the well. Leave by this side, or jump back.' : null)
        : panel('Keep moving?', 'You may go on this turn, or stop here.');
      const why = g.phase === 'CHOOSE_EXIT' && keepMovingWhy(v);
      if (why) p.append(el('p', 'why', why));
      // Phone first: moves are the lit squares on the map (their labels carry the reason); only other actions are buttons.
      for (const a of by('MOVE')) {
        const m = moveInfo(g, a);
        targets.push({ ...actionSquare(g, a), label: `${m.title}, ${m.reason}`, pick: () => tryAct(a) });
      }
      for (const a of by('TOWER_CHOICE')) ch.append(choice('Escape the castle', "End this hero's run with their treasure. Final: no way back in.", () => act(a), 'primary'));
      for (const a of by('USE_ITEM')) {
        const item = allItems(v.heroes[g.activeSeat].inventory).find(x => x.inst === a.item);
        ch.append(choice(`Use ${cardDef(c, a.item).name}`, itemText(item) || itemText(cardDef(c, a.item)) || 'Its card allows it now', () => tryAct(a)));
      }
      // Spec v5 rings, only where phases.js offers them: Strength in place of the turn, Opening at a door or portcullis.
      for (const a of by('USE_RING')) {
        const r = ringOfSeat(a.seat), edge = a.dir && exitFor(g, c, a.seat, a.dir, a.from || null).edge;
        ch.append(choice(`Use ${r.name}`, a.dir ? `${edge === 'door' ? 'Open the door' : 'Lift the portcullis'} to the ${DIR[a.dir]} and go through, with no door card or test. The ring is then gone.` : r.text || shownEffectText(r, chamberName(c)), () => act(a)));
      }
      for (const a of by('SEARCH')) ch.append(choice('Search the room', 'Draw a room search card instead of moving', () => act(a)));
      if (!by('SEARCH').length && typeof v.searchUnavailable === 'string' && v.searchUnavailable) ch.append(el('p', 'muted', `Can't search here: ${v.searchUnavailable.replace(/\.$/, '')}.`));
      for (const a of by('COLLECT')) ch.append(choice('Stay and collect', collectWords(v, c), () => act(a), 'primary'));
      if (v.collectUnavailable) ch.append(el('p', 'muted', `Can't collect: ${v.collectUnavailable.replace(/\.$/, '')}.`));
      // D42: across the well, the near side needs a jump back (chamber cards may be dropped first).
      for (const a of by('WELL_JUMP')) ch.append(choice('Jump back across', `Agility test on the D12 plus ${hero.treasury.length} ${chamberCards(c, hero.treasury.length)} against ${heroDef(hero).stats.AGI}. A failed jump is death.`, () => tryAct(a)));
      for (const a of by('WELL_DISCARD')) ch.append(choice(`Drop ${chamberCards(c, 1)} ${hero.treasury.indexOf(a.card) + 1}`, viewer === g.activeSeat ? `${cardDef(c, a.card).name}, ${cardDef(c, a.card).gold || 0} gold` : 'Check which with Show my cards', () => act(a)));
      for (const a of by('STOP')) ch.append(inTower ? choice('Stop in the tower', 'End your turn here, not escaped', () => act(a)) : choice('Stop here', 'End your turn', () => act(a)));
      for (const a of by('FORCED_SKIP')) ch.append(choice('No way on', 'The turn passes', () => act(a)));
      break;
    }
    case 'TURN_START': {
      const kind = g.pending.kind;
      const agi = heroDef(hero).stats.AGI;
      if (kind === 'dark') {
        p = panel('In the dark', 'You cannot choose a way out: the D6 picks it.');
        for (const a of by('ROLL_DARK_EXIT')) ch.append(choice('Roll the D6', null, () => tryAct(a), 'primary'));
      } else if (kind === 'well-edge') {
        p = panel('At the edge of the well', `Climb back the way you came, or jump: an Agility test on the D12 plus ${hero.treasury.length} ${chamberCards(c, hero.treasury.length)} against ${agi}. A failed jump is death. You may drop ${chamberCards(c)} first.`);
        for (const a of by('WELL_RETURN')) ch.append(choice('Climb back', 'Go back the way you came', () => tryAct(a)));
        for (const a of by('WELL_DISCARD')) {
          const i = hero.treasury.indexOf(a.card);
          ch.append(choice(`Drop ${chamberCards(c, 1)} ${i + 1}`, viewer === g.activeSeat ? `${cardDef(c, a.card).name}, ${cardDef(c, a.card).gold || 0} gold` : 'Check which with Show my cards', () => act(a)));
        }
        for (const a of by('WELL_JUMP')) ch.append(choice('Jump', `Agility test, D12 + ${hero.treasury.length} against ${agi}`, () => tryAct(a), 'primary'));
      } else {
        p = panel('Stuck in rubble', `Go back the way you came, or force through with an Agility test against ${agi}. Pass, and you may leave by any way this turn.`);
        for (const a of by('RUBBLE_RETURN')) ch.append(choice('Go back', null, () => tryAct(a)));
        for (const a of by('RUBBLE_FORCE')) ch.append(choice('Force through', `Agility test against ${agi}`, () => tryAct(a), 'primary'));
      }
      break;
    }
    case 'RESOLVE_CARD': {
      const pend = g.pending;
      const frame = [...g.stack].reverse().find(f => f.card);
      if (pend.kind === 'name-numbers') {
        p = numberPicker(v, pend, by('NAME_NUMBERS'));
        break;
      } else if (pend.kind === 'choice') {
        // An optional draw (owner catalogue: chest, sarcophagus, fallen warrior) asks its own question; a lasting
        // effect at the start of a turn (no card drawn now) gives its reason line instead of a card.
        const leave = pend.options.includes('Leave it');
        const why = (hero.conditions || []).map(conditionWords).filter(Boolean).join('. ');
        const title = leave ? `${pend.options[0]}?` : frame ? cardDef(c, frame.card).name : why || 'Choose';
        // Spec v12 fix 3: a card's own choice (the giant spider, the trapdoor's climb) as buttons, then short steps.
        const steps = !leave && pend.effects?.some(l => l.length) ? choiceSteps(pend) : null;
        p = panel(title, steps ? (frame ? null : why ? `${name}: ${why}.` : null) : frame ? `${leave ? `${cardDef(c, frame.card).name}. ` : ''}${cardText(cardDef(c, frame.card), null, c)}` : why ? `${name}: ${why}.` : null);
        by('CHOOSE').forEach(a => ch.append(choice(pend.options[a.option], null, () => act(a), leave && a.option === 0 ? 'primary' : '')));
        if (steps) { p.classList.add('first'); p.append(ch, stepList(steps)); }
      } else if (pend.kind === 'trap-ring') {
        // Spec v5: a trap card was just drawn and the Protection Ring is unused.
        const def = cardDef(c, pend.card), r = ringOfSeat(pend.seat), nn = !def.text && def.effects?.[0]?.op === 'NAME_NUMBERS' && def.effects[0];
        p = panel('A trap', nn ? `${def.name}.` : `${def.name}. ${cardText(def, null, c)}`);
        for (const a of by('USE_RING')) ch.append(choice(`Use ${r.name}`, 'The trap does not affect you. The ring is then gone.', () => act(a), 'primary'));
        for (const a of by('DECLINE_RING')) ch.append(choice('Keep the ring', 'The trap happens', () => act(a)));
        if (nn) { p.classList.add('first'); p.append(ch, stepList(namedSteps(nn).steps)); } // spec v12 fix 3: the ceiling, in steps
      } else {
        p = panel('Move', 'Pick a neighbouring square.');
        for (const a of by('CHOOSE')) targets.push({ ...actionSquare(g, a), label: `Go ${DIR[pend.options[a.option]]}`, pick: () => tryAct(a) });
      }
      break;
    }
    case 'TOWER_CHOICE': {
      // Spec v2: being in a tower is not escaping; only Escape ends the run.
      p = panel('You reached a tower', `${name} is in the ${towerAt(hero.coord)}. Only Escape ends the run; a hero who stays is still inside.${g.sun === SUNSET - 1 ? ' This is the last round: anyone inside after it is inside at sunset.' : ''}`);
      const L = { ESCAPE: ['Escape the castle', "End this hero's run with their treasure. Final: no way back in."], STAY: ['Stay in the tower', g.sun === SUNSET - 1 ? 'End your turn here, not escaped; the sun sets after this round' : 'End your turn here and keep playing; you may escape on a later turn'], CONTINUE: ['Continue through the other passage', 'Keep moving this turn, not back the way you came'] };
      for (const a of by('TOWER_CHOICE')) ch.append(choice(...L[a.choice], () => act(a), a.choice === 'ESCAPE' ? 'primary' : ''));
      break;
    }
    case 'CHOOSE_MONSTER_RESPONSE': {
      p = fightPanel(`${name}, choose`, g.encounter.ambush ? 'ambush, no waiting' : 'before it shows');
      p.append(fightRow(v, g.encounter.seat, enc));
      // One button per legal action: the hero's own special weapon and each held weapon card are separate answers.
      const weapon = (c.specialWeapons || []).find(w => w.id === heroDef(hero).specialWeaponId);
      const SUB = { flee: 'Back where you came from', special: "Meets the monster's Attack answer" };
      ch.classList.add('grid2');
      // Spec v5: a weapon whose data has a verb reads it ("Shoot"), with what is left ("3 shots left").
      const left = weapon && Number.isInteger(weapon.uses) ? weapon.uses - hero.weaponUses : null;
      for (const a of by('RESPOND')) {
        const own = a.choice === 'special' && !a.item;
        const label = a.choice !== 'special' ? CHOICE[a.choice] : own && weapon?.verb ? weapon.verb : `Use ${a.item ? cardDef(c, a.item).name : weapon?.name || 'your special weapon'}`;
        const sub = own && left !== null ? `${left} ${unitWord(weapon, left)} left. ${SUB.special}` : SUB[a.choice] || null;
        ch.append(choice(label, sub, () => act(a), a.choice === 'attack' ? 'primary' : ''));
      }
      for (const a of by('USE_RING')) ch.append(choice(`Use ${ringOfSeat(a.seat).name}`, 'The monster flees. The ring is then gone.', () => act(a)));
      p.append(ch, tools());
      break;
    }
    case 'MONSTER_REACT': {
      // Multiplayer only: in solo the computer is the monster player and the engine announces at once (D37).
      const def = cardDef(c, enc.monster.inst);
      p = fightPanel(`${nameOf(enc.controller)}, you play the monster`, 'in secret');
      p.append(fightRow(v, enc.seat, enc));
      const r = enc.reaction;
      const chose = enc.choice === 'special' ? `a special weapon${enc.item ? `, ${cardDef(c, enc.item).name}` : ''} (its Attack answer)` : CHOICE[enc.choice];
      p.append(el('p', '', `${nameOf(enc.seat)} chose ${chose}.`), el('p', 'last', `Its answer: ${REACTION[r.type]}${r.damage ? `, ${expr(r.damage)} damage` : ''}. Announce it to the table.`));
      for (const a of by('ANNOUNCE')) ch.append(choice('Announce to the table', null, () => act(a), 'primary'));
      const card = el('details', 'history');
      card.append(el('summary', '', 'Whole card'), el('p', '', `${def.name}${enc.type ? `, monster type ${enc.type}` : ''}, HP ${enc.monster.hp ?? 'none (no fight)'}. ${monsterText(def)}`));
      p.append(ch, tools(card));
      break;
    }
    case 'COMBAT_SELECT': {
      const cb = g.encounter.combat;
      const heroSet = heroDef(g.heroes[g.encounter.seat]).combatSetId;
      if (cb.mode === 'target') {
        p = fightPanel('Throw at the target');
        p.append(el('p', 'help', `${cb.label}. Throw the combat die, then enter where it came to rest and the face up.`), fightRow(v, enc.seat, enc));
        const last = lastLine(v, enc);
        if (last) p.append(last);
        p.append(el('h3', '', 'Where it landed'));
        // Picking an option only marks it in place, never a re-render: scroll and focus stay where they are.
        const picked = () => la.find(x => x.placement === target.placement && x.face === target.face);
        const go = choice('Enter the result', null, () => { const a = picked(); if (a) act(a); }, 'primary');
        const options = (labels, field, cls) => {
          const box = el('div', cls);
          const mark = () => { for (const b of box.children) b.setAttribute('aria-pressed', target[field] === b.dataset.k); go.disabled = !picked(); };
          for (const k of Object.keys(labels)) {
            const b = choice(labels[k], null, () => { target[field] = k; mark(); });
            b.dataset.k = k;
            box.append(b);
          }
          mark();
          return box;
        };
        p.append(options(PLACEMENT, 'placement', 'choices grid2'), el('h3', '', 'Face up'), options(FACE, 'face', 'choices grid3'));
        ch.append(go);
        p.append(ch, tools(history(enc)));
      } else {
        const heroTurn = viewer === g.encounter.seat && !cb.heroPick;
        p = fightPanel(heroTurn ? `${nameOf(g.encounter.seat)}, pick your card` : `${nameOf(g.encounter.controller)}, pick the monster's card`, solo() ? null : 'in secret');
        if (cb.variant) p.append(el('div', 'variant', 'Digital variant, not an original rule: the computer picks the monster card.'));
        p.append(fightRow(v, enc.seat, enc));
        const last = lastLine(v, enc);
        if (last) p.append(last);
        const side = heroTurn ? 'hero' : 'monster', picks = by('COMBAT_PICK').filter(a => a.side === side);
        p.append(combatCards(heroTurn ? heroSet : g.encounter.monster.groupId, letter => act(picks.find(a => a.letter === letter))));
        p.append(el('p', 'help', SAME), tools(history(enc)));
      }
      break;
    }
    case 'RESOLVE_TILE_ENTRY': {
      // Spec v9: entering a rotating room with the Protection Ring unused; the board still shows it unturned. On a forced
      // move the driven hero decides, outside turn order, so the words name that seat.
      const seat = g.pending.seat, w = rotationRingWords(g, c, seat, nameOf(seat));
      p = panel(w.title, w.line);
      for (const a of by('USE_RING')) ch.append(choice(`Use ${ringOfSeat(seat).name}`, w.use, () => act(a), 'primary'));
      for (const a of by('DECLINE_RING')) ch.append(choice('Keep the ring', w.keep, () => act(a)));
      break;
    }
    case 'FORCED_MOVE': {
      const seat = g.pending.seat;
      p = panel(...forcedMoveWords(nameOf(seat), c));
      for (const a of by('FORCED_MOVE')) {
        const sq = actionSquare(g, a);
        targets.push({ ...sq, label: `${nameOf(seat)} moves to ${place(sq)}`, pick: () => tryAct(a) });
      }
      break;
    }
    default:
      p = panel('Waiting', `Phase ${g.phase}.`);
  }
  if (enc?.monster && !p.classList.contains('fight')) p.append(fightRow(v, enc.seat, enc));
  // Thumb reach: the active hero's inventory, one tap from the prompt (not while the monster player is looking); a
  // fight panel keeps it small, beside History and Undo.
  const small = p.querySelector('.tools');
  if (viewer === null || viewer === g.activeSeat) (small || ch).append(itemsButton(v, g.activeSeat, small ? 'btn' : 'choice'));
  if (targets.length) {
    p.append(el('p', 'movehint', 'Tap a highlighted square to move. Press and hold any square to see what is there.'));
    // The reason line of the focused lit square (the cell's own label already says it, so hidden from readers).
    const why = el('small', 'movewhy', 'Arrow keys and Enter move from the keyboard.');
    why.id = 'moveWhy';
    why.setAttribute('aria-hidden', 'true');
    p.append(why);
  }
  if (!p.contains(ch) && ch.children.length) p.append(ch);
  return p;
}

function renderTable(v) {
  const g = S.game, c = content(), la = legalActions(g, c);
  const out = [];
  const bar = el('header', `glass statusbar${solo() ? ' solo' : ''}`); // solo: the name is for readers only (CSS)
  const who = el('strong', 'who', nameOf(g.activeSeat));
  who.append(el('span', 'turnword', "'s turn")); // on a phone only the name shows; readers still hear it
  const odds = `${v.dragon.odds.awake} in ${v.dragon.odds.remaining}`;
  bar.append(who, sunTrack(v.sun, solo()),
    // D40: while a hero is stuck inside after a wake the dragon stays awake; the odds mean nothing then.
    chip('dragon', dragonStatus(v), 'M12 3c.6 3.2 5 5.4 5 10a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.5-5 .2 2 1 3 2 3.4C11 9 11 6 12 3z', v.dragon.awake ? 'Dragon ' : 'Dragon wakes on ', v.dragon.awake ? 'awake' : odds),

    // Tiles left: on wide screens the map tools say it, so this chip is for phones (CSS).
    chip('tilesleft', `${v.board.tileBag} tiles left`, 'M4 4h16v16H4zM4 12h16M12 4v16', '', String(v.board.tileBag)));
  out.push(bar);
  const strip = soloStrip(v);
  if (strip) out.push(strip);
  // The board's light follows the sun (index.html mixes these into the board background and unexplored squares).
  for (const [k, val] of Object.entries(skyAt(daylight(v.sun, SUNSET).f).vars)) $('table').style.setProperty(k, val);

  const grid = el('div', 'tablegrid');
  const targets = [];
  const prompt = renderPrompt(v, la, targets);

  const bp = el('section', 'glass board-panel board-wrap');
  bp.setAttribute('aria-label', 'Map');
  const host = el('div', 'board-host');
  bp.append(host);
  // Centre on hero follows whoever is looking: the viewer's own hero on a private screen, the active one at the table.
  const vh = viewer !== null && g.heroes[viewer];
  const homeSeat = vh?.coord && isActive(vh) ? viewer : g.activeSeat;
  const board = mountBoard(host, { v, content: c, names: g.seats.map(s => s.name), targets: S.peek || S.reveal ? [] : targets, home: g.heroes[homeSeat].coord, homeSeat, onInspect: inspect, onNear: near, tilesLeft: v.board.tileBag,
    onFocusTarget: t => { if (t && $('moveWhy')) $('moveWhy').textContent = t.label; } });

  // The dock holds the prompt and what just happened; on a phone in portrait it sits under the board, latest
  // first. The fold is what a phone in portrait reaches by scrolling the page past board and dock.
  const dock = el('div', 'dock'), fold = el('div', 'fold'), side = el('div', 'side');
  if (!S.peek && !S.reveal) (prompt.querySelector('.tools') || prompt).append(...undoHere(v, true)); // not on a private card panel or the shared reveal
  dock.append(prompt);
  dock.classList.toggle('fight', prompt.classList.contains('fight')); // the prompt above what just happened
  dock.classList.toggle('first', prompt.classList.contains('first')); // spec v12: a number picker or stepped choice too
  const latest = latestTurn(v.log, S.seen);
  if (latest.length) {
    const lp = panel(latest[0].seat !== undefined ? `What just happened on ${nameOf(latest[0].seat)}'s turn` : 'What just happened');
    lp.id = 'latest';
    const ol = el('ul', 'loglines');
    ol.append(...entries(latest, ctx()).map(logLine));
    lp.append(ol);
    dock.append(lp);
  }
  if (PHONE.matches) { const kp = el('div', 'glass panel board-wrap'); kp.append(mapKey()); fold.append(kp); } // board-wrap: the key's colours
  else bp.append(mapKey());
  fold.append(heroesPanel(v));
  side.append(dock, fold);
  grid.append(bp, side);
  out.push(grid);
  $('table').replaceChildren(...out);
  boardApi = board;
  board.settle(); // spec v12 fix 5: frame the map now it is laid out, not only when a ResizeObserver callback (a frame) comes
}

// Solo only (owner, 2026-11-19): the hero's HP, stats and gold in one line under the status bar, so a phone need not
// scroll to the Heroes panel; a tap opens the Items sheet. Its height comes out of the map, not the dock.
function soloStrip(v) {
  const m = soloStripModel(v, content(), nameOf);
  if (!m) return null;
  const b = el('button', 'glass herostrip');
  b.setAttribute('aria-label', m.label);
  b.onclick = () => openItems(0);
  const hp = el('span', 'herohp'), bar = el('span', 'hp'), fill = el('i');
  fill.style.width = `${Math.min(100, 100 * m.hp.left / m.hp.max)}%`;
  bar.append(fill);
  hp.append(bar, `${m.hp.left}/${m.hp.max}`);
  const stats = el('span', 'stats');
  for (const s of m.stats) { const x = el('span', '', `${s.short} `); x.append(el('b', '', String(s.value))); stats.append(x); }
  const gold = el('span', 'gold', 'Gold ');
  gold.append(el('b', '', String(m.gold)));
  b.append(hp, stats, gold);
  return b;
}

let keyOpen = false;
function mapKey() {
  const d = el('details');
  d.open = keyOpen;
  d.ontoggle = () => { keyOpen = d.open; };
  d.append(el('summary', '', 'Map key'));
  const k = el('div', 'key');
  const item = (label, draw, box = 60) => {
    const s = el('span');
    const ic = svg('svg', { viewBox: `0 0 ${box} ${box}`, 'aria-hidden': 'true' });
    draw(ic);
    s.append(ic, label);
    k.append(s);
  };
  item('Room: a room card', s => markGlyph(s, 'black', 30, 30));
  item('Red room: card, then a portcullis drops behind', s => markGlyph(s, 'red', 30, 30));
  item('Corridor: no card, keep going', s => markGlyph(s, 'yellow', 30, 32));
  item('Dark room', s => markGlyph(s, 'blue', 28, 30));
  item('Entry dot: the side the tile was entered from', s => { svg('rect', { x: 6, y: 6, width: 48, height: 48, rx: 4, class: 'floor' }, s); entryGlyph(s, 'S', 30, 54); });
  item('Wall', s => sideGlyph(s, 'wall', [8, 30, 52, 30]));
  item('Shut from the other side', s => { svg('rect', { x: 0, y: 0, width: 100, height: 100, rx: 4, class: 'floor' }, s); blockedGlyph(s, 'N'); }, 100);
  item('Wall printed on the board', s => sideGlyph(s, 'wall', [8, 30, 52, 30], 'fixed'));
  item('Door', s => sideGlyph(s, 'door', [4, 30, 56, 30]));
  item('Portcullis', s => sideGlyph(s, 'gate', [4, 30, 56, 30]));
  item('Portcullis down behind a red room', s => sideGlyph(s, 'gate', [4, 30, 56, 30], 'fallen'));
  item('Tower', s => { svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 10, class: 'tower' }, s); towerGlyph(s); }, 100);
  item(`${capital(chamberName(content()))}, not yet entered`, s => svg('rect', { x: 6, y: 6, width: 48, height: 48, rx: 4, class: 'reserved' }, s));
  item('Unexplored', s => svg('rect', { x: 6, y: 6, width: 48, height: 48, rx: 4, class: 'fog' }, s));
  item('Off the board', s => svg('rect', { x: 6, y: 6, width: 48, height: 48, class: 'offboard' }, s));
  item('Lit: a legal move', s => svg('rect', { x: 6, y: 6, width: 48, height: 48, rx: 6, class: 'target' }, s));
  d.append(k);
  return d;
}

// Spec v2 #11: the semantic log, one group per turn under the player's name and the round, plain lines with
// their dice arithmetic in smaller text. In game the newest turn is on top (a turn still reads in order); the
// results screen reads oldest first. "Debug log" (a setting, off by default) reads the debug view instead:
// every hidden card, deck ids, shuffles and the RNG state, with each entry's raw fields.
function logGroups(log, start = 'Setup') {
  const said = new Map(entries(log, ctx()).map(x => [x.e, x]));
  const groups = [];
  let cur = null;
  for (const e of log) {
    if (!cur || e.kind === 'turn') {
      const h = e.kind === 'turn' && S.game.heroes[e.seat];
      cur = { name: !h ? start : `${nameOf(e.seat)}, ${heroDef(h).name}`, round: e.kind === 'turn' ? `Round ${e.round}` : '', lines: [] };
      groups.push(cur);
      if (e.kind === 'turn') continue; // the heading says it
    }
    if (said.has(e)) cur.lines.push(said.get(e));
  }
  return groups.filter(x => x.lines.length);
}
// The sheet, opened from the menu's Event log or the results screen's button. Read from the current viewer's view.
function openLog() {
  // Behind a hand-over cover the last private viewer may no longer be looking: the public log there.
  const g = S.game, c = content(), v = view(g, c, $('cover').hidden ? viewer : null), results = g.status === 'over';
  $('logTitle').textContent = prefs.debugLog ? 'Event log, debug: hidden cards shown' : 'Event log';
  const ol = $('log');
  ol.replaceChildren();
  const when = e => el('span', 'when', e.round ? `Round ${e.round}` : 'Setup');
  if (prefs.debugLog) {
    const dv = view(g, c, null, { debug: true });
    const tops = Object.entries(dv.decks || {}).map(([cat, dk]) => `${cat} ${dk.order.length} (top ${dk.order.slice(0, 2).join(', ') || 'none'})`);
    ol.append(el('li', 'debug', `RNG seed ${dv.rng.seed}, state ${dv.rng.state}. Tile bag ${dv.board.tileBag.length} (next ${dv.board.tileBag[0] || 'none'}). Decks: ${tops.join('; ')}.`));
    // The plain line, then the deck bookkeeping players never see (where a card went, shuffles), then the raw entry.
    const said = new Map(entries(dv.log, ctx(), { debug: true }).map(x => [x.e, x]));
    for (const e of dv.log.slice(-400)) {
      const { seq, round, seat, kind, ...rest } = e, x = said.get(e);
      const li = el('li', 'debug');
      li.append(when(e), ` ${x?.text || ''} `);
      if (x?.mech) li.append(el('span', 'mech', x.mech));
      li.append(el('code', '', `#${seq} ${kind}${seat !== undefined ? ` seat ${seat}` : ''} ${JSON.stringify(rest)}`));
      ol.append(li);
    }
  } else {
    const groups = logGroups(results ? v.log : v.log.slice(-600), !results && v.log.length > 600 ? 'Earlier' : 'Setup').map(x => {
      const li = el('li', 'turnlog'), h = el('h3', '', x.name);
      if (x.round) h.append(el('span', '', x.round));
      const ul = el('ul', 'loglines');
      ul.append(...x.lines.map(logLine));
      li.append(h, ul);
      return li;
    });
    ol.append(...(results ? groups : groups.reverse()));
    if (!groups.length) ol.append(el('li', 'turnlog', 'Nothing has happened yet.'));
  }
  $('logEnd').hidden = !results;
  if (!$('logSheet').open) $('logSheet').showModal();
  ol.scrollTop = 0;
}

const STATUS_WORD = { READY_IN_START_TOWER: 'Ready in the start tower', EXPLORING: 'Exploring', IN_TOWER_NOT_ESCAPED: 'In a tower, not escaped', ESCAPED: 'Escaped', DEAD: 'Dead' };
function roomStateWords(h) {
  const r = h.roomState;
  if (r?.special === 'well') return `${r.phase === 'CROSSED' ? 'Across the well' : 'At the near edge of the well'}, entered from the ${DIR[r.entryEdge]}`;
  if (r?.special === 'rubble') return `In the rubble, came in heading ${DIR[r.arrivalDir]}`;
  if (h.conditions.some(x => x.id === 'dark')) return 'In the dark: a D6 picks the way out';
  return null;
}
function whereWords(v, h) {
  if (!h.coord) return 'Not placed yet';
  const c = content(), kind = squareKind(c.board, h.coord), inst = v.board.tiles[key(h.coord)];
  const what = kind === 'tower' ? towerAt(h.coord) : kind === 'center' ? chamberName(c) : inst ? tileWords(contentIndex(c).tiles.get(inst.defId)) : 'unexplored';
  return `${capital(place(h.coord))}, ${what}`;
}

function heroesPanel(v) {
  const g = S.game, c = content(), n = g.seats.length;
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
    body.append(el('div', 'name', `${g.seats[seat].name}, ${def.name}`));
    const stats = el('div', 'stats');
    for (const s of ['STR', 'AGI', 'ARM', 'LCK']) stats.append(el('span', '', `${STAT[s]} ${def.stats[s]}`));
    body.append(stats);
    const hp = el('div', 'hp');
    const fill = el('i');
    fill.style.width = `${Math.min(100, Math.max(0, 100 * h.hp / h.hpStart))}%`;
    hp.append(fill);
    body.append(hp);
    // Ordinary gold is held loot, public (D25); chamber cards are private, so only their number shows here.
    const ordinary = h.held.reduce((sum, inst) => sum + (cardDef(c, inst).gold || 0), 0);
    const chamberCount = Array.isArray(h.treasury) ? h.treasury.length : h.treasury;
    body.append(el('div', 'meta', `HP ${Math.max(0, h.hp)} of ${h.hpStart} · Gold ${ordinary} · ${chamberCount} hidden ${chamberCards(c, chamberCount)}`));
    const ring = g.seats[seat].ringId && contentIndex(c).rings.get(g.seats[seat].ringId);
    const weapon = def.specialWeaponId && (c.specialWeapons || []).find(w => w.id === def.specialWeaponId);
    const uses = weapon && Number.isInteger(weapon.uses) ? `, ${Math.max(0, weapon.uses - h.weaponUses)} of ${weapon.uses} ${unitWord(weapon, weapon.uses)} left` : '';
    body.append(el('div', 'meta', `Ring: ${ring ? `${ring.name || ring.id}${h.ringUsed ? ' (used, removed from play)' : ''}` : 'none'} · Special weapon: ${weapon ? weapon.name + uses : 'none'}`));
    const room = roomStateWords(h);
    if (room) body.append(el('div', 'meta room', room));
    // Lasting card effects with their reason line (owner catalogue): "Unconscious: 2 turns to miss", "Torch out".
    for (const t of (h.conditions || []).map(conditionWords).filter(Boolean)) body.append(el('div', 'meta room', t));
    const end = h.endResult === 'INSIDE_AT_SUNSET' ? ', inside at sunset' : '';
    body.append(el('div', 'meta', `${whereWords(v, h)} · ${STATUS_WORD[h.status]}${end}`));
    body.append(itemsButton(v, seat, 'btn'));
    if (n > 1 && chamberCount > 0 && isActive(h)) {
      const b = el('button', 'btn', 'Show my cards');
      b.setAttribute('aria-label', `Show ${g.seats[seat].name}'s ${chamberCards(c)}`);
      b.onclick = () => { S.peek = { seat, from: null }; render(); };
      body.append(b);
    }
    li.append(pawn, body);
    ul.append(li);
  }
  p.append(ul);
  return p;
}

// ---- Inventory (spec v3 section 4): what a hero carries in five groups, what is usable now and why not.
// Read from the current viewer's view: another seat's chamber cards are a count, never their names.
const allItems = inv => [...inv.equipment, ...(inv.ring ? [inv.ring] : []), ...inv.items, ...inv.treasure, ...(Array.isArray(inv.chamber) ? inv.chamber : [])];
const useActions = item => (item.actions || []).filter(a => a.type !== 'WELL_DISCARD');
function itemsButton(v, seat, cls) {
  const inv = v.heroes[seat].inventory, usable = allItems(inv).filter(x => x.usable).length;
  const name = () => S.game.seats[seat].name;
  const sub = usable ? `${usable} usable now` : 'Nothing usable now';
  let b;
  if (cls === 'choice') b = choice('Items', `${name()}'s inventory: ${sub.toLowerCase()}`, () => openItems(seat));
  else { b = el('button', 'btn', usable ? `Items, ${usable} usable` : 'Items'); b.onclick = () => openItems(seat); }
  b.setAttribute('aria-label', `Show ${name()}'s items, ${sub.toLowerCase()}`);
  return b;
}
const SOURCE = { hero: 'Hero equipment', specialWeapons: 'Special weapon card' };
const ringOfSeat = seat => contentIndex(content()).rings.get(S.game.seats[seat].ringId);
const ITEM_GROUPS = [['equipment', 'Starting equipment'], ['ring', 'Magic ring'], ['items', 'Weapons and useful items'], ['treasure', 'Treasure'], ['chamber', null]]; // null: the chamber's name, from the content
function openItems(seat) {
  const g = S.game, v = view(g, content(), viewer), inv = v.heroes[seat].inventory;
  $('itemsTitle').textContent = `${nameOf(seat)}'s items`;
  const out = [];
  for (const [k, title] of ITEM_GROUPS) {
    out.push(el('h3', '', title || capital(chamberCards(content()))));
    const list = k === 'ring' ? (inv.ring ? [inv.ring] : []) : inv[k];
    const spent = k === 'ring' && g.heroes[seat].ringUsed && ringOfSeat(seat);
    if (spent) { out.push(el('p', 'meta', `${spent.name}: used, removed from play`)); continue; }
    if (typeof list === 'number') { out.push(el('p', 'meta', list ? `${list} ${list === 1 ? 'card' : 'cards'}, kept secret by ${nameOf(seat)}` : 'None')); continue; }
    if (!list.length) { out.push(el('p', 'meta', 'None')); continue; }
    const ul = el('ul', 'inv');
    for (const item of list) {
      const li = el('li');
      li.append(el('strong', '', item.name || item.id || 'Unnamed'));
      const facts = [item.deck ? capital(deckWord(item.deck, content())) : SOURCE[item.source] || (k === 'ring' ? 'Ring' : '')];
      if (item.gold) facts.push(`${item.gold} gold`);
      if (Number.isInteger(item.usesLeft)) facts.push(`${item.usesLeft} ${item.unit ? unitWord(item, item.usesLeft) : item.usesLeft === 1 ? 'use' : 'uses'} left`);
      li.append(el('span', 'meta', facts.filter(Boolean).join(' · ')));
      const def = item.inst ? cardDef(content(), item.inst) : item.group === 'ring' ? contentIndex(content()).rings.get(item.id) : (content().specialWeapons || []).find(w => w.id === item.id);
      const text = itemText(item) || itemText(def);
      if (text) li.append(el('span', 'itemtext', text));
      if (item.pending) li.append(el('span', 'pending', 'Effect pending'));
      const acts = item.usable ? useActions(item) : [];
      for (const a of acts) {
        const b = el('button', 'btn primary', a.dir ? `Use ${item.name}, ${DIR[a.dir]}` : item.verb || `Use ${item.name}`);
        b.onclick = () => { $('items').close(); tryAct(a); };
        li.append(b);
      }
      if (!acts.length) li.append(el('span', 'meta', `Not usable now: ${item.reason || 'its card does not allow it'}`));
      ul.append(li);
    }
    out.push(ul);
  }
  $('itemsBody').replaceChildren(...out);
  if (!$('items').open) $('items').showModal();
}

// The active hero's exit into square c (either chamber half counts as the room, D39), the legal MOVE for it, and
// whether the hero is in c. Two chamber exits can share a side, so an action matches by side and `from` cell.
function exitTo(g, cc, c) {
  const canon = chamberRoom(cc.board).canon;
  const ex = exits(g, cc, g.activeSeat).find(e => canon(key(e.to)) === canon(key(c)));
  const a = ex && legalActions(g, cc).find(x => x.type === 'MOVE' && x.dir === ex.dir && (!x.from || x.from === key(ex.from)));
  return { ex, a, here: canon(key(g.heroes[g.activeSeat].coord)) === canon(key(c)) };
}

// A single tap on an unlit square: one line, why the active hero cannot go there or else what the square is.
function near(c) {
  const g = S.game, cc = content();
  if (g.status === 'playing' && ['CHOOSE_ACTION', 'CHOOSE_EXIT'].includes(g.phase) && !S.peek && !S.reveal) {
    const { ex, a } = exitTo(g, cc, c);
    if (ex && !a) return toast(`${nameOf(g.activeSeat)} cannot go there: ${whyNot(g, ex)}.`);
  }
  const info = cellInfo(view(g, cc, viewer), cc, c, g.seats.map(s => s.name));
  toast(`${info.title}: ${info.what}.`);
}

// The inspect sheet: what a square is, side by side, who is in it, and whether the active hero may go there.
function inspect(c) {
  const g = S.game, cc = content(), v = view(g, cc, viewer);
  const info = cellInfo(v, cc, c, g.seats.map(s => s.name));
  $('inspectTitle').textContent = info.title;
  const out = [el('p', '', capital(info.what))];
  const ul = el('ul', 'sides');
  for (const { side, word } of info.sides) ul.append(el('li', '', `${capital(DIR[side])}: ${word === 'unknown' ? 'not known until revealed' : word}`));
  out.push(ul, el('p', '', info.occupants.length ? `Here: ${listOf(info.occupants)}.` : 'Nobody is here.'));
  const hero = g.status === 'playing' && g.heroes[g.activeSeat];
  if (hero && ['CHOOSE_ACTION', 'CHOOSE_EXIT'].includes(g.phase) && !S.peek && !S.reveal) {
    const { ex, a, here } = exitTo(g, cc, c);
    if (a) {
      const m = moveInfo(g, a);
      out.push(el('p', 'why', `${m.title}: ${m.reason}.`));
      const go = el('button', 'btn primary', m.title);
      go.onclick = () => { $('inspect').close(); tryAct(a); };
      out.push(go);
    } else if (ex) out.push(el('p', 'why', `${nameOf(g.activeSeat)} cannot go there: ${whyNot(g, ex)}.`));
    else if (here) out.push(el('p', 'why', `${nameOf(g.activeSeat)} is here.`));
  }
  $('inspectBody').replaceChildren(...out);
  $('inspect').showModal();
}

// ---- Results: escapees by gold, shared top gold wins together (D01); none means the keep wins. Dead and
// inside at sunset are listed apart (owner tower and sunset ruling).
function renderResults(v) {
  const g = S.game, r = g.result, c = content();
  const hero = e => `${nameOf(e.seat)}, ${contentIndex(c).heroes.get(e.heroId).name}`;
  const out = [el('h1', '', r.castleWins ? 'The keep wins' : `${listOf(r.winners.map(nameOf))} ${r.winners.length > 1 ? 'share the win' : 'wins'}`)];
  out.push(el('p', 'lede', r.castleWins ? 'Nobody escaped before sunset.' : r.shared ? 'Equal top gold among those who escaped: a shared win.' : 'Most gold among those who escaped.'));
  const group = (title, rows, tag = 'ul') => {
    if (!rows.length) return;
    const p = panel(title);
    const l = el(tag);
    for (const t of rows) l.append(el('li', '', t));
    p.append(l);
    out.push(p);
  };
  group('Escaped', r.escaped.length ? r.escaped.map(e => `${hero(e)}: ${e.gold} gold${Number.isInteger(e.escapeSun) ? (e.escapeSun >= SUNSET ? ', escaped at sunset' : `, escaped on sun ${e.escapeSun}`) : ''}${r.winners.includes(e.seat) ? ', winner' : ''}`) : ['Nobody'], 'ol');
  const dead = r.others.filter(e => e.status === 'DEAD');
  const inside = r.others.filter(e => e.status !== 'DEAD' && e.endResult === 'INSIDE_AT_SUNSET');
  group('Dead', dead.map(e => `${hero(e)}: died in the keep`));
  group('Inside at sunset', inside.map(e => `${hero(e)}: ${e.status === 'IN_TOWER_NOT_ESCAPED' ? 'in a tower, never chose Escape' : 'still in the keep'}, ${e.gold} gold not counted`));
  group('Other', r.others.filter(e => !dead.includes(e) && !inside.includes(e)).map(e => `${hero(e)}: ${STATUS_WORD[e.status] || e.status}`));
  const again = el('div', 'again');
  const go = el('button', 'btn primary', 'Return to menu');
  go.onclick = toTitle;
  const see = el('button', 'btn', 'See the event log');
  see.onclick = openLog;
  again.append(go, see);
  out.push(again);
  $('results').replaceChildren(...out);
}

// ---- Wiring
$('start').onclick = () => newGame('original');
$('fixtures').onclick = () => newGame('fixture');
$('mixed').onclick = () => newGame('mixed');
$('undo').onclick = undo;
// Exit, as in Bank: Save and exit, Exit without saving, or Keep playing (Esc and a backdrop tap keep playing too).
// On the results there is nothing to save: Return to menu (the title) or Back to results.
$('exitBtn').onclick = () => {
  const fin = S.game.status === 'over';
  $('exitTitle').textContent = fin ? 'Leave the results?' : 'Exit this game?';
  $('exitNote').textContent = 'Save it to pick up later from Saved games.';
  $('exitNote').hidden = $('saveExit').hidden = fin;
  $('discard').textContent = fin ? 'Return to menu' : 'Exit without saving';
  $('discard').className = fin ? 'btn primary' : 'btn danger';
  $('keepPlaying').textContent = fin ? 'Back to results' : 'Keep playing';
  $('exitSheet').showModal();
};
// Back to the title at once with the save in the list; the upload finishes in the background.
$('saveExit').onclick = async () => {
  try {
    await saveGame();
  } catch {
    $('exitNote').textContent = 'Could not save on this device.';
    return;
  }
  loadingSaves = false;
  $('exitSheet').close();
  toTitle();
};
$('discard').onclick = () => { $('exitSheet').close(); toTitle(); };
$('keepPlaying').onclick = () => $('exitSheet').close();
$('logBtn').onclick = openLog;
$('logDone').onclick = () => $('logSheet').close();
$('logEnd').onclick = () => { const last = $('log').lastElementChild; if (last) { last.tabIndex = -1; last.scrollIntoView({ block: 'end' }); last.focus({ preventScroll: true }); } };
for (const d of document.querySelectorAll('dialog')) d.onclick = e => { if (e.target === d) d.close(); };
const showDebug = NL.segmented($('debugSeg'), v => { prefs.debugLog = v === 'on'; savePrefs(); showDebug(v); }); // only the Event log reads it, so no re-render
$('settingsBtn').onclick = () => {
  showTheme(NL.theme.get());
  showDebug(prefs.debugLog ? 'on' : 'off');
  const rules = S.game?.rules || DEFAULT_RULES;
  $('rules').replaceChildren(...Object.keys(RULE_TAGS).map(k => {
    const li = el('li');
    const fixed = !(k in rules), val = rules[k];
    const [ruling, text] = RULE_INFO[k] ? RULE_INFO[k](val) : ['Not in the register', ''];
    li.append(el('code', '', `${k}: ${fixed ? 'always on' : val === true ? 'on' : val === false ? 'off' : val}`), el('span', '', `${ruling}, ${RULE_TAGS[k].join(' and ')}. ${text}`));
    return li;
  }));
  $('settings').showModal();
};
$('settingsDone').onclick = () => $('settings').close();
// The roll card: a tap outside or Esc backs out before a voluntary roll. A result card is acknowledged with Continue
// (Enter or Space on it) or Esc, which shows the next card and never skips one; a tap outside does nothing, nor mid-roll.
$('roll').onclick = e => { if (e.target === $('roll') && $('roll').dataset.mode === 'ask') $('roll').close(); };
$('roll').addEventListener('cancel', e => {
  const mode = $('roll').dataset.mode;
  if (mode === 'ask') return;
  e.preventDefault();
  if (mode === 'result' && $('rollBtns').querySelector('button')?.style.visibility !== 'hidden') queue.next();
});
// Backing out of a voluntary roll (the dialog's own close). Results never end here: cardsDone clears the mode first.
$('roll').addEventListener('close', () => {
  if ($('roll').open || !$('roll').dataset.mode) return;
  $('roll').dataset.mode = '';
  showOutcome();
  if (!$('outcome').open) release();
  refocus(rollFromCell);
  showDusk();
});
// The fight's end card: Continue, Enter or Space on it, Esc, or a tap anywhere.
$('outcome').onclick = outcomeDone;
// The close event arrives as a later task: by then outcomeDone may have opened the dusk notice in the same dialog.
$('outcome').addEventListener('close', () => { if (!$('outcome').open) outcomeDone(); });
$('dusk').onclick = () => { $('dusk').hidden = true; };
$('inspectDone').onclick = () => $('inspect').close();
$('itemsDone').onclick = () => $('items').close();
for (const b of document.querySelectorAll('.sheet-x')) b.onclick = () => b.closest('dialog').close();
for (const id of ['appLabel', 'appLabelSettings']) $(id).textContent = APP_LABEL;
// The synthetic list starts folded on every screen; the toggle opens and closes it (the banner itself stays).
$('bannerToggle').onclick = () => {
  const open = $('bannerToggle').getAttribute('aria-expanded') !== 'true';
  $('bannerToggle').setAttribute('aria-expanded', open);
  $('synthetic').hidden = !open;
  $('banner').classList.toggle('open', open);
};
// Back from a locked phone or another app: ask for the wake lock again. Going away during a private screen in a
// multiplayer game puts the "I am X, show me" cover back for whoever unlocks the phone.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    keepAwake(!!S.game && S.game.status !== 'over');
    // Spec v12 fix 5: back in view, draw the current state (a held table whose card is gone is released).
    if (held && !$('roll').open && !$('outcome').open) release();
    else if (S.game && !held) render();
    return;
  }
  if (S.game && !solo() && viewer !== null) {
    // Result cards and the fight's end card are public: they stay, the private screen behind them is covered.
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'outcome' && !(d.id === 'roll' && d.dataset.mode === 'result')) d.close();
    viewer = null;
    render();
  }
});

// Esc cancels an uncommitted choice (the target placement and face, before Enter the result); sheets close natively.
document.addEventListener('keydown', e => {
  keyboard = true;
  if (e.key !== 'Escape' || document.querySelector('dialog[open]') || !S.game) return;
  if (target.placement || target.face) { target = { placement: null, face: null }; render(); }
});
document.addEventListener('pointerdown', () => { keyboard = false; });

load();
const me = NL.identity(); // the cached name, if this browser knows this person already
prefill(me);
render();
showDusk();
if (!S.game) refreshSaves();
// A signed-in name can arrive later: only into an empty roster with no game in progress. Either way this render
// drops the placeholder row.
NL.ready.then(i => {
  if (!me) prefill(i);
  if (!S.game) render();
});
