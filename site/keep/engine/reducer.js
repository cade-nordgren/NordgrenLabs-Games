// Deterministic game state and reducer (system 1; SP 4, SP 11, plan 4.3-4.5).
// reduce(game, action, content) is pure: no DOM, no Math.random, no clock.
// Content definitions stay outside the state; the state refers to them by id.
import { newRng, roll, shuffle, logEvent } from './dice.js';
import { key, squareKind, neighbour } from './board.js';
import { OPPOSITE, rotationFor, tileSlots } from './tiles.js';
import { startTurn, endTurn } from './clock.js';
import { legalActions, sameAction } from './phases.js';
import { validateContent, contentIndex, contentHash } from '../content/schema.js';

export const SCHEMA_VERSION = 1;
export const MECHANICS_VERSION = 'rb-0.2/sp-1.0';
export const MAX_PLAYERS = 4;

// Rules config: provisional rulings that may flip after verification (plan section 9).
export const DEFAULT_RULES = {
  darkRoomOnReentry: true, // D06, interpretation, provisional; read by the M2 dark-room rule
};

const clockwise = (first, n) => Array.from({ length: n }, (_, k) => (first + k) % n);

export function createGame({ players, seed, content, rules = {}, diceScript = null, tileOrder = null }) {
  // RB 1, SP 2: one to four players.
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_PLAYERS) throw new RangeError(`Players must be 1 to ${MAX_PLAYERS}`);
  const report = validateContent(content);
  if (content.mode === 'original' && !report.fullStartAllowed) throw new Error('Full-fidelity start blocked: content incomplete or unverified');
  if (content.mode === 'fixture' && !report.fixturePlayable) throw new Error('Fixture content invalid: ' + report.errors.map(e => e.message).join('; '));
  if (content.heroes.length < players.length || content.rings.length < players.length) throw new Error('Not enough heroes or rings');
  for (const k of Object.keys(rules)) if (!(k in DEFAULT_RULES)) throw new Error(`Unknown rule ${k}`);

  const slots = tileSlots(content.tiles).map(s => s.slotId);
  if (tileOrder && (new Set(tileOrder).size !== tileOrder.length || tileOrder.some(s => !slots.includes(s)))) throw new Error('tileOrder must list distinct tile slot ids');
  const game = {
    schemaVersion: SCHEMA_VERSION,
    mechanicsVersion: MECHANICS_VERSION,
    contentMode: content.mode,
    banner: content.mode === 'fixture' ? 'NON-AUTHENTIC TEST DATA' : null,
    contentHash: contentHash(content),
    rules: { ...DEFAULT_RULES, ...rules },
    phase: 'SETUP',
    status: 'setup',
    setup: { step: 'first-player', order: [], index: 0 },
    round: 0,
    sun: 0,
    seats: players.map((name, seat) => ({ seat, name: String(name), heroId: null, ringId: null })), // index order is clockwise
    firstSeat: null,
    activeSeat: null,
    rng: newRng(seed, diceScript),
    log: [],
    board: { defId: content.board.id, width: content.board.width, height: content.board.height, chamberPlaced: false, tiles: {}, tileBag: [] },
    heroes: players.map(() => null),
    result: null,
  };
  // RB 4, SP 3: 88 tiles shuffled face down, drawn without replacement (D27); chamber held aside.
  game.board.tileBag = tileOrder ? [...tileOrder] : shuffle(game, slots, 'TILE');
  return game;
}

export function reduce(game, action, content) {
  if (!legalActions(game, content).some(a => sameAction(a, action))) throw new Error(`Illegal action ${JSON.stringify(action)} in ${game.phase}`);
  const g = structuredClone(game);
  apply[action.type](g, action, content);
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
    g.heroes[seat] = { heroId, seat, status: 'inside', coord: null, prevCoord: null, startTower: null, hp: def.hp, hpStart: def.hp, held: [], treasury: [], conditions: [] };
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
    startTurn(g, g.firstSeat);
  },
  // RB 5, SP 4, SP 5: orthogonal move through a free passage; reveal and orient a new tile.
  MOVE(g, { seat, dir }, content) {
    const hero = g.heroes[seat];
    const to = neighbour(hero.coord, dir);
    const kind = squareKind(content.board, to);
    if (kind === 'maze' && !g.board.tiles[key(to)]) {
      g.phase = 'REVEAL_TILE';
      const slotId = g.board.tileBag.shift();
      const def = contentIndex(content).tileSlots.get(slotId);
      logEvent(g, { kind: 'draw', deck: 'TILE', value: slotId, defId: def.id });
      // shortcut: a door or gate on the entry-dot side is undocumented (plan 13 #8); rejected until M2 tile data says how it works.
      if (def.sides[def.entrySide] !== 'open') throw new Error(`M2: tile ${def.id} has a ${def.sides[def.entrySide]} on its entry side`);
      const entrySide = OPPOSITE[dir]; // the entry dot faces the side the hero comes from
      g.board.tiles[key(to)] = { slotId, defId: def.id, coord: to, rotation: rotationFor(def.entrySide, entrySide), entrySide, revealedRound: g.round };
      logEvent(g, { kind: 'reveal', at: key(to), defId: def.id, rotation: g.board.tiles[key(to)].rotation });
    }
    if (kind === 'center' && !g.board.chamberPlaced) {
      g.board.chamberPlaced = true; // RB 9.1, SP 8: chamber tile placed on first entry to either square
      logEvent(g, { kind: 'place-chamber' });
    }
    hero.prevCoord = hero.coord;
    hero.coord = to;
    logEvent(g, { kind: 'move', seat, dir, to: key(to) });
    // D23: a hero always starts in a tower and must move out first, so entering any tower by a move is escape.
    if (kind === 'tower') {
      hero.status = 'escaped';
      logEvent(g, { kind: 'escape', seat });
    } else g.phase = 'RESOLVE_TILE_ENTRY';
    // M2 hook: dot types and special rooms (RB 6), room cards (black/red, never towers or chamber, D31),
    // chamber collect (RB 9.1, D18). In M1 every move ends the turn.
    endTurn(g, content);
  },
  // D20: only offered when no legal action exists.
  FORCED_SKIP(g, { seat }, content) {
    logEvent(g, { kind: 'forced-skip', seat });
    endTurn(g, content);
  },
};

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
