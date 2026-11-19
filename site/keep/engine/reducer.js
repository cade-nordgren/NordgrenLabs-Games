// Deterministic game state and reducer (system 1; SP 4, SP 11, plan 4.3-4.5).
// reduce(game, action, content) is pure: no DOM, no Math.random, no clock.
// Content definitions stay outside the state; the state refers to them by id.
import { newRng, roll, testStat, shuffle, logEvent } from './dice.js';
import { tileSlots } from './tiles.js';
import { startTurn, endTurn } from './clock.js';
import { initDecks, toBottom, cardDef } from './decks.js';
import { run, drawAndResolve } from './effects.js';
import { attemptMove, rollDarkExit, enterTile, wellJumpModifiers, allowContinue } from './movement.js';
import { killHero, clearCondition, setCondition, statOf, READY, ESCAPED } from './heroes.js';
import { neighbour } from './board.js';
import { respond, announce, combatPick, targetResult } from './monsters.js';
import { collect, forcedMove, checkDragonReset } from './treasury.js';
import { legalActions, sameAction } from './phases.js';
import { spendUse, itemLog, consumeRing } from './inventory.js';
import { validateContent, contentIndex, contentHash, MIXED_BANNER } from '../content/schema.js';

export const SCHEMA_VERSION = 1;
export const MECHANICS_VERSION = 'rb-0.2/sp-1.0/v7'; // v7: the owner's card catalogue (named numbers, skipped turns, free item use, rotating corridors); older saves are refused
export const MAX_PLAYERS = 4;

// Rules config: rulings kept as data so a change is a flag, not code (plan section 9).
export const DEFAULT_RULES = {
  // D06: the dark effect on the initial reveal and on a flee back in, not on ordinary re-entry; or 'EVERY_ENTRY'.
  darkRoomPolicy: 'ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY',
  forcedMoveTileEffects: true, // plan 13 #3 default: tile effects at the post-wake forced-move target apply as for flight (D16)
  soloCombat: 'target', // D17: 'target' (original, manual result entry) or 'abc-digital-variant' (class 4, labelled)
  towerAtSunsetCountsAsEscape: false, // D32: a hero in a tower at sunset who never chose Escape is not escaped
  escapeWithoutExploring: false, // D33: a hero still in its start tower is never offered Escape
  // D37 as amended by spec v4: solo shows the revealed monster's HP (2023 rules 11); 'hidden-house-rule' restores the
  // old solo behaviour (no user-facing switch yet: the owner may offer it later as a labelled house rule).
  soloMonsterHp: 'visible',
};
const RULE_VALUES = {
  darkRoomPolicy: ['ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY', 'EVERY_ENTRY'],
  forcedMoveTileEffects: [true, false],
  soloCombat: ['target', 'abc-digital-variant'],
  towerAtSunsetCountsAsEscape: [true, false],
  escapeWithoutExploring: [true, false],
  soloMonsterHp: ['visible', 'hidden-house-rule'],
};
// Spec v2 authority levels: A explicit2023, B componentData, C legacySupported, D interpretation,
// E houseRule, F developer assumption (forbidden), plus app-only for class 4 behaviour.
export const AUTHORITY_TAGS = ['explicit2023', 'componentData', 'legacySupported', 'interpretation', 'houseRule', 'app-only'];
export const RULE_TAGS = {
  darkRoomPolicy: ['interpretation'],
  forcedMoveTileEffects: ['interpretation'],
  soloCombat: ['explicit2023', 'app-only'], // target mode explicit; the A/B/C computer variant app-only
  towerAtSunsetCountsAsEscape: ['interpretation'],
  escapeWithoutExploring: ['interpretation'],
  soloMonsterHp: ['explicit2023', 'houseRule'], // visible explicit (2023 rules 11); hidden a house rule
  // Fixed rulings without a switch (not in DEFAULT_RULES), tagged all the same:
  towerEscapeOnLaterTurns: ['interpretation'], // plan 13 #25: after Stay, Escape stays offered on later turns
};

// D21 (application-only): an action that rolled, drew, shuffled or revealed is a commit point;
// a later undo (M3) may only step back over actions after the last commit.
const COMMIT_KINDS = new Set(['roll', 'draw', 'shuffle', 'reveal', 'test', 'exchange', 'throw', 'reaction', 'dragon-wakes']);

const clockwise = (first, n) => Array.from({ length: n }, (_, k) => (first + k) % n);

export function createGame({ players, seed, content, rules = {}, diceScript = null, tileOrder = null, deckOrders = null }) {
  // RB 1, SP 2: one to four players.
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_PLAYERS) throw new RangeError(`Players must be 1 to ${MAX_PLAYERS}`);
  const report = validateContent(content);
  if (content.mode === 'original' && !report.fullStartAllowed) throw new Error('Full-fidelity start blocked: content incomplete or unverified');
  if (['fixture', 'mixed'].includes(content.mode) && !report.fixturePlayable) throw new Error('Fixture content invalid: ' + report.errors.map(e => e.message).join('; '));
  if (content.heroes.length < players.length || content.rings.length < players.length) throw new Error('Not enough heroes or rings');
  for (const [k, v] of Object.entries(rules)) {
    if (!(k in DEFAULT_RULES)) throw new Error(`Unknown rule ${k}`);
    if (!RULE_VALUES[k].includes(v)) throw new Error(`Rule ${k} cannot be ${v}`);
  }
  // deckOrders: { DECK: order } or { DECK: [order, order, ...] } for successive shuffles (tests, replays).
  const orders = deckOrders && Object.fromEntries(Object.entries(deckOrders).map(([d, o]) => [d, typeof o[0] === 'string' ? [o] : o]));

  const slots = tileSlots(content.tiles).map(s => s.slotId);
  if (tileOrder && (new Set(tileOrder).size !== tileOrder.length || tileOrder.some(s => !slots.includes(s)))) throw new Error('tileOrder must list distinct tile slot ids');
  const game = {
    schemaVersion: SCHEMA_VERSION,
    mechanicsVersion: MECHANICS_VERSION,
    contentMode: content.mode,
    banner: content.mode === 'fixture' ? 'NON-AUTHENTIC TEST DATA' : content.mode === 'mixed' ? MIXED_BANNER : null,
    contentHash: contentHash(content),
    rules: { ...DEFAULT_RULES, ...rules },
    phase: 'SETUP',
    status: 'setup',
    // A solo game has no first-player roll (owner, 2026-11-19): the one seat goes first and drafts at once.
    setup: players.length === 1 ? { step: 'heroes', order: [0], index: 0 } : { step: 'first-player', order: [], index: 0 },
    round: 0,
    sun: 0,
    seats: players.map((name, seat) => ({ seat, name: String(name), heroId: null, ringId: null })), // index order is clockwise
    firstSeat: players.length === 1 ? 0 : null,
    activeSeat: null,
    rng: newRng(seed, diceScript, orders),
    log: [],
    board: { defId: content.board.id, width: content.board.width, height: content.board.height, chamberPlaced: false, tiles: {}, tileBag: [], edges: {} },
    heroes: players.map(() => null),
    decks: null,
    dragon: null,
    turn: null,
    stack: [],
    pending: null,
    encounter: null,
    wake: null,
    registers: {},
    commits: 0,
    result: null,
  };
  // RB 4, SP 3: 88 tiles shuffled face down, drawn without replacement (D27); chamber held aside.
  game.board.tileBag = tileOrder ? [...tileOrder] : shuffle(game, slots, 'TILE');
  initDecks(game, content);
  return game;
}

export function reduce(game, action, content) {
  if (!legalActions(game, content).some(a => sameAction(a, action))) throw new Error(`Illegal action ${JSON.stringify(action)} in ${game.phase}`);
  const g = structuredClone(game);
  const before = g.log.length;
  apply[action.type](g, action, content);
  checkDragonReset(g, content);
  if (g.log.slice(before).some(e => COMMIT_KINDS.has(e.kind))) g.commits += 1;
  return g;
}

const n = g => g.seats.length;
function nextPick(g, step, order) { g.setup = { step, order, index: 0 }; }

const apply = {
  // RB 4, SP 3: everyone rolls a D12, highest is first player. D05 (house rule): tied highest seats reroll.
  ROLL_FIRST_PLAYER(g) {
    let contenders = g.seats.map(s => s.seat);
    for (;;) {
      const rolls = contenders.map(seat => ({ seat, value: roll(g, 'D12', `first player, seat ${seat}`) }));
      const top = Math.max(...rolls.map(r => r.value));
      contenders = rolls.filter(r => r.value === top).map(r => r.seat);
      if (contenders.length === 1) break;
    }
    g.firstSeat = contenders[0];
    logEvent(g, { kind: 'first-player', seat: g.firstSeat });
    nextPick(g, 'heroes', clockwise(g.firstSeat, n(g)));
  },
  // Heroes clockwise from the first player; starting HP from the hero card (RB 4, SP 3).
  PICK_HERO(g, { seat, heroId }, content) {
    const def = contentIndex(content).heroes.get(heroId);
    g.seats[seat].heroId = heroId;
    g.heroes[seat] = { heroId, seat, status: READY, roomState: null, coord: null, prevCoord: null, enteredFrom: null, enteredVia: null, startTower: null, hp: def.hp, hpStart: def.hp, held: [], treasury: [], conditions: [], weaponUses: 0, itemUses: {}, ringUsed: false, escapeSun: null };
    logEvent(g, { kind: 'pick-hero', seat, heroId });
    if (++g.setup.index === n(g)) nextPick(g, 'rings', [...g.setup.order].reverse());
  },
  // The last hero picker takes the first ring, then counterclockwise (RB 4, SP 3).
  PICK_RING(g, { seat, ringId }) {
    g.seats[seat].ringId = ringId;
    logEvent(g, { kind: 'pick-ring', seat, ringId });
    if (++g.setup.index === n(g)) nextPick(g, 'towers', clockwise(g.firstSeat, n(g)));
  },
  // First player picks a tower, then clockwise; towers may be shared (RB 4, SP 3). Sun starts at 1.
  PICK_TOWER(g, { seat, tower }, content) {
    const t = content.board.towers[tower];
    Object.assign(g.heroes[seat], { coord: { x: t.x, y: t.y }, startTower: tower });
    logEvent(g, { kind: 'pick-tower', seat, tower });
    if (++g.setup.index < n(g)) return;
    g.setup = null;
    g.status = 'playing';
    g.round = 1;
    g.sun = 1;
    startTurn(g, g.firstSeat, content);
  },
  // RB 5, SP 4, SP 5: orthogonal move; doors draw a door card, gates need a STR test.
  MOVE(g, { dir, from }, content) { attemptMove(g, content, dir, { from }); run(g, content); },
  // Optional further movement (yellow corridor, door stayed closed, secret door) may be declined.
  STOP(g, { seat }, content) { logEvent(g, { kind: 'stop', seat }); endTurn(g, content); },
  // RB 7.1, SP 6: search instead of moving, black or red rooms only; repeatable on later turns.
  SEARCH(g, { seat }, content) {
    g.phase = 'ROOM_SEARCH';
    logEvent(g, { kind: 'search', seat });
    drawAndResolve(g, content, 'ROOM_SEARCH', 'room search');
    run(g, content);
  },
  // RB 9.1, SP 8: stay in the chamber and collect.
  COLLECT(g, { seat }, content) { logEvent(g, { kind: 'stay', seat }); collect(g, content, seat); run(g, content); },
  // D20: only offered when no legal action exists.
  FORCED_SKIP(g, { seat }, content) {
    logEvent(g, { kind: 'forced-skip', seat });
    endTurn(g, content);
  },
  // RB 6.2, SP 5: the dark-room D6 picks the exit; no choice.
  ROLL_DARK_EXIT(g, a, content) { g.pending = null; rollDarkExit(g, content); run(g, content); },
  // RB 6.3, RB 6.5: go back the way the hero came (a normal move through the entry side).
  WELL_RETURN(g, a, content) { returnMove(g, content); },
  RUBBLE_RETURN(g, a, content) { returnMove(g, content); },
  // RB 6.3, D09: voluntary discard before the jump, to the bottom of the treasury deck.
  WELL_DISCARD(g, { seat, card }) {
    const hero = g.heroes[seat];
    hero.treasury.splice(hero.treasury.indexOf(card), 1);
    toBottom(g, 'TREASURY', card, seat);
    logEvent(g, { kind: 'well-discard', seat });
    itemLog(g, seat, 'discard', card, 'chamber', { to: 'bottom of TREASURY' });
  },
  // Spec v3 section 4: a held card whose own `use` data allows it, as the turn's action (timing 'turn-action').
  // D53: an item whose use timing is 'free' (the flask) does not use the turn: the turn goes on where it was.
  USE_ITEM(g, { seat, item }, content) {
    if (cardDef(content, item).use.timing === 'free') g.turn.resume = g.phase;
    g.stack.push({ effects: spendUse(g, content, seat, item), i: 0 });
    run(g, content);
  },
  // D56, D58, D59: the named numbers (a sorted list such as '1,3,5'), then one D6; a match runs the card's onMatch.
  NAME_NUMBERS(g, { seat, numbers }, content) {
    const p = g.pending;
    g.pending = null;
    const named = numbers.split(',').map(Number);
    const value = roll(g, 'D6', `named roll${p.label ? ` (${p.label})` : ''}`);
    const match = named.includes(value);
    if (p.store) g.registers[p.store] = value;
    logEvent(g, { kind: 'named-roll', seat, numbers: named, value, match, label: p.label, card: p.card });
    g.stack.push({ effects: match ? p.onMatch : p.onMiss, i: 0 });
    run(g, content);
  },
  // Spec v5: the seat's ring, at the one moment its card data allows (phases.js offers it only then). It is consumed;
  // its effects run with the door or portcullis it was used at (Opening Ring).
  USE_RING(g, { seat, dir, from }, content) {
    g.pending = null;
    const effects = consumeRing(g, content, seat);
    g.stack.push({ effects, i: 0, ...(dir ? { passage: { dir, from: from ?? null } } : {}) });
    run(g, content);
  },
  // The trap happens: the card resolves as drawn and the ring stays unused.
  DECLINE_RING(g, { seat }, content) { g.pending = null; logEvent(g, { kind: 'ring-kept', seat }); run(g, content); },
  // RB 6.3, SP 5: AGI test on D12 + held treasure-chamber cards. D08 (interpretation): a failed jump is death.
  // D42 (spec v4): success leaves the hero on the well tile at the opposite edge (CROSSED) and ends the turn; a jump
  // from CROSSED goes back to the near edge (interpretation), which is the clinging state again.
  WELL_JUMP(g, { seat }, content) {
    const hero = g.heroes[seat];
    g.pending = null;
    const back = hero.roomState?.phase === 'CROSSED';
    const { pass } = testStat(g, 'AGI', statOf(content, hero, 'AGI'), 'well jump', wellJumpModifiers(hero, content));
    if (!pass) killHero(g, content, seat, 'failed the well jump');
    else if (back) { setCondition(g, seat, { id: 'well-edge', turns: null }); hero.roomState = { ...hero.roomState, phase: 'AT_NEAR_EDGE' }; }
    else { clearCondition(g, seat, 'well-edge'); hero.roomState = { ...hero.roomState, phase: 'CROSSED' }; }
    g.turn.endAfter = true;
    run(g, content);
  },
  // RB 6.5, SP 5: AGI test; success may leave through any exit this turn, failure retries later.
  RUBBLE_FORCE(g, { seat }, content) {
    const hero = g.heroes[seat];
    g.pending = null;
    const { pass } = testStat(g, 'AGI', statOf(content, hero, 'AGI'), 'force rubble');
    if (pass) { clearCondition(g, seat, 'rubble'); allowContinue(g, 'rubble-forced'); } else g.turn.endAfter = true;
    run(g, content);
  },
  // REQUEST_CHOICE and MOVE_HERO adjacent-choice answers.
  CHOOSE(g, { option }, content) {
    const p = g.pending;
    g.pending = null;
    if (p.kind === 'choice') g.stack.push({ effects: p.effects[option], i: 0 });
    else enterTile(g, content, p.seat, neighbour(g.heroes[p.seat].coord, p.options[option]), { ...p.opts, dir: p.options[option] });
    run(g, content);
  },
  // Spec v2, owner tower ruling: only ESCAPE sets ESCAPED (final, the hero leaves the turn order); STAY ends
  // the turn in the tower; CONTINUE goes on through another legal tower passage this turn (transit).
  // Deliberate owner rule (D23, D32-D34), not the printed rulebook (which only says reach any tower before
  // sunset, 2023 rules section 2): do not "correct" Escape / Stay / Continue or INSIDE_AT_SUNSET from the PDF.
  TOWER_CHOICE(g, { seat, choice }, content) {
    const hero = g.heroes[seat];
    g.pending = null;
    logEvent(g, { kind: 'tower-choice', seat, choice, at: `${hero.coord.x},${hero.coord.y}` });
    if (choice === 'ESCAPE') {
      hero.status = ESCAPED;
      hero.escapeSun = g.sun; // kept for a later tiebreak on equal gold (owner question 2026-11-19; D01 unchanged)
      logEvent(g, { kind: 'escape', seat, at: `${hero.coord.x},${hero.coord.y}`, sun: g.sun });
      g.turn.endNow = true;
    } else if (choice === 'STAY') g.turn.endAfter = true;
    else { allowContinue(g, 'tower-transit'); g.turn.transitFrom = hero.enteredFrom; }
    run(g, content);
  },
  RESPOND(g, { choice, item }, content) { respond(g, content, choice, item); run(g, content); },
  ANNOUNCE(g, a, content) { announce(g, content); run(g, content); },
  COMBAT_PICK(g, { side, letter }, content) { combatPick(g, content, side, letter); run(g, content); },
  TARGET_RESULT(g, { placement, face }, content) { targetResult(g, content, placement, face); run(g, content); },
  FORCED_MOVE(g, { seat, to }, content) { forcedMove(g, content, seat, to); },
};

function returnMove(g, content) {
  g.pending = null;
  attemptMove(g, content, g.heroes[g.activeSeat].enteredFrom, { noDetour: true });
  run(g, content);
}

// Save/restore. The state is plain JSON; restoring checks the shape markers and that
// the same content is loaded (stored data is a trust boundary, BG contract 3).
export const serialize = game => JSON.stringify(game);

export function restore(text, content) {
  const g = JSON.parse(text);
  if (!g || g.schemaVersion !== SCHEMA_VERSION || g.mechanicsVersion !== MECHANICS_VERSION) throw new Error('Unsupported save version');
  if (g.contentHash !== contentHash(content)) throw new Error('Save was made with different content');
  if (!Array.isArray(g.seats) || !Array.isArray(g.heroes) || !Array.isArray(g.log) || !g.rng || !g.board) throw new Error('Save is malformed');
  return g;
}
