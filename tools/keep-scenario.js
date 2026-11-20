// Dusk Keep developer scenarios: prepared positions for checking rare screens in a browser, with nothing added to the
// shipped game. Each scenario is built by driving the real reducer on the owner content in play-test mode ("Play-test my
// content", the same content object app.js uses) after setup, with the needed card put on top of its deck, tiles placed
// from the tile bag and heroes moved, as the Node tests do. Dice are never scripted: the seed is searched until the hinted
// action really shows the screen, so the saved game rolls on normally after it. Developer script, outside the published
// site, not referenced by site/. Run from the repo root:
//   node tools/keep-scenario.js list          scenario names
//   node tools/keep-scenario.js <name>        one line on stdout: the value for localStorage['nl-keep-v1']; the hint on stderr
// Then, on the local preview's origin (BUILD-GUIDE "Preview and checks"), in the browser console:
//   localStorage.setItem('nl-keep-v1', JSON.stringify(<paste the line>))   (it is a JSON object literal), then reload.
// Clear the key afterwards.
import ORIGINAL from '../site/keep/content/original/index.js';
import FIXTURES from '../site/keep/content/fixtures/fixtures.js';
import { contentStatus } from '../site/keep/content/schema.js';
import { createGame, reduce } from '../site/keep/engine/reducer.js';
import { legalActions, sameAction } from '../site/keep/engine/phases.js';
import { tileSlots } from '../site/keep/engine/tiles.js';

export const MODE = 'mixed';
export const CONTENT = contentStatus(ORIGINAL, FIXTURES).mixed; // app.js: CONTENT.mixed = STATUS.mixed

// ---- Position helpers (the shapes the tests use, with real tile slots and card copies so every piece exists once).
function start(players, heroes, seed) {
  let g = createGame({ players: Array.from({ length: players }, (_, i) => `Player ${i + 1}`), seed, content: CONTENT, rules: { soloCombat: 'target' } });
  if (players > 1) g = reduce(g, { type: 'ROLL_FIRST_PLAYER' }, CONTENT);
  while (g.status === 'setup') {
    const acts = legalActions(g, CONTENT), seat = acts[0].seat;
    const a = acts[0].type === 'PICK_HERO' ? acts.find(x => x.heroId === heroes[seat]) || acts[0] : acts.find(x => x.type !== 'PICK_TOWER' || x.tower === seat % 4) || acts[0];
    g = reduce(g, a, CONTENT);
  }
  return g.activeSeat === 0 ? g : null; // player 1 acts first in every scenario; another seed otherwise
}
// The seat's ring becomes `id`; whoever had it takes the seat's old one (a ring is never held twice).
function ring(g, seat, id) {
  const other = g.seats.find(s => s.ringId === id);
  if (other) other.ringId = g.seats[seat].ringId;
  g.seats[seat].ringId = id;
}
const SLOTS = tileSlots(CONTENT.tiles);
function tile(g, at, defId, rotation = 0) {
  const i = g.board.tileBag.findIndex(s => SLOTS.find(x => x.slotId === s).defId === defId);
  if (i < 0) throw new Error(`No ${defId} left in the tile bag`);
  const [slotId] = g.board.tileBag.splice(i, 1);
  const [x, y] = at.split(',').map(Number);
  g.board.tiles[at] = { slotId, defId, coord: { x, y }, rotation, entrySide: 'S', revealedRound: g.round };
}
function hero(g, seat, at) {
  const [x, y] = at.split(',').map(Number);
  Object.assign(g.heroes[seat], { coord: { x, y }, prevCoord: null, enteredFrom: null, enteredVia: null, status: 'EXPLORING', roomState: null });
}
// The next copy of a card to the top of its deck, or into a hero's hand.
const top = (g, deck, id) => { const o = g.decks[deck].order, i = o.findIndex(c => c.startsWith(id + '#')); if (i < 0) throw new Error(`${id} not in ${deck}`); o.unshift(...o.splice(i, 1)); };
const give = (g, seat, deck, id, into = deck === 'TREASURY' ? 'treasury' : 'held') => { top(g, deck, id); g.heroes[seat][into].push(g.decks[deck].order.shift()); };
const dragonTop = (g, id) => { const r = g.dragon.remaining, i = r.findIndex(c => c.startsWith(id + '#')); r.unshift(...r.splice(i, 1)); };
const sleepingTop = g => { const r = g.dragon.remaining; if (r[0].startsWith('DRAGON_8#')) r.push(r.shift()); };
const log = (g, kind, from) => g.log.slice(from).filter(e => e.kind === kind);
// A solo hero on a placed black four-way at (2,3), facing a placed black four-way room at (3,3) to the east.
function room(seed, { heroId = 'HERO_1', ringId = 'RING_1', card, players = 1, here = 'TILE_006' } = {}) {
  const g = start(players, [heroId, 'HERO_2', 'HERO_3', 'HERO_4'], seed);
  if (!g) return null;
  ring(g, 0, ringId);
  tile(g, '2,3', here);
  tile(g, '3,3', 'TILE_006');
  hero(g, 0, '2,3');
  if (card) top(g, 'ROOM', card);
  return g;
}
const E = { type: 'MOVE', dir: 'E' };
// Heroes in the lair (4,5)+(5,5); the given tiles are the revealed squares next to it.
function lair(seed, { players = 1, inside = [0], tiles = [], ringOf = {}, heroes = ['HERO_1', 'HERO_2', 'HERO_3', 'HERO_4'] } = {}) {
  const g = start(players, heroes, seed);
  if (!g) return null;
  for (const [s, id] of Object.entries(ringOf)) ring(g, +s, id);
  for (const [at, id, rot] of tiles) tile(g, at, id, rot);
  for (const s of inside) hero(g, s, s % 2 ? '5,5' : '4,5');
  g.board.chamberPlaced = true;
  return g;
}

// ---- The scenarios. build(seed) -> game; then: the hinted actions (fields to match a legal action of the acting seat);
// expect(after, before) -> true once the screen the scenario is for is showing.
export const SCENARIOS = {
  'torch-out': {
    hint: 'Move east into the room: the torch goes out (ROOM_004); the next turn opens with the name-three-numbers prompt.',
    build: s => room(s, { card: 'ROOM_004' }), then: [E],
    expect: g => g.pending?.kind === 'name-numbers' && g.pending.count === 3,
  },
  spider: {
    hint: 'Move east into the room: the giant spider (ROOM_025), Fight or Flee.',
    build: s => room(s, { card: 'ROOM_025' }), then: [E],
    expect: g => g.pending?.kind === 'choice' && g.pending.options.join() === 'Fight,Flee',
  },
  'ceiling-ring': {
    hint: 'Move east into the room: the ceiling collapses (ROOM_008); the Protection Ring prompt comes first, then name a number.',
    build: s => room(s, { card: 'ROOM_008', ringId: 'RING_4' }), then: [E],
    expect: g => g.pending?.kind === 'trap-ring',
  },
  ceiling: {
    hint: 'Move east into the room: the ceiling collapses (ROOM_008); name one number (no Protection Ring).',
    build: s => room(s, { card: 'ROOM_008' }), then: [E],
    expect: g => g.pending?.kind === 'name-numbers' && g.pending.count === 1,
  },
  curse: {
    hint: "Two players. Player 1 moves east into the room: the wizard's curse (ROOM_007) turns the three yellow corridors; player 2 stands on one of them and stays there.",
    build: s => {
      const g = room(s, { card: 'ROOM_007', players: 2 });
      tile(g, '6,2', 'TILE_028'); tile(g, '7,2', 'TILE_027'); tile(g, '6,8', 'TILE_025');
      hero(g, 1, '7,2');
      return g;
    },
    then: [E],
    expect: (g, b) => log(g, 'tiles-rotated', b.log.length)[0]?.at.length === 3 && g.heroes[1].coord.x === 7 && g.heroes[1].coord.y === 2,
  },
  bones: {
    hint: 'Move east into the room: a chest (ROOM_009); choose Open the chest: Bones (CHEST_007), an odd D12 starts a Skeleton encounter.',
    build: s => { const g = room(s, { card: 'ROOM_009' }); top(g, 'CHEST', 'CHEST_007'); return g; },
    then: [E, { type: 'CHOOSE', option: 0 }],
    expect: (g, b) => log(g, 'draw', b.log.length).some(e => e.value?.startsWith('CHEST_007#')),
  },
  trapdoor: {
    hint: 'Move east into the room: the trapdoor (ROOM_015), the Luck test fails (this seed) and the hero falls; the next turn opens with Climb out. No rope.',
    build: s => room(s, { card: 'ROOM_015' }), then: [E],
    expect: g => g.pending?.kind === 'choice' && g.pending.options.join() === 'Climb out',
  },
  'trapdoor-rope': {
    hint: 'Move east into the room: the trapdoor (ROOM_015), the hero falls (this seed); holding the rope (SEARCH_005), the next turn starts freed, untested, rope kept.',
    build: s => { const g = room(s, { card: 'ROOM_015' }); give(g, 0, 'SEARCH', 'SEARCH_005'); return g; },
    then: [E],
    expect: (g, b) => log(g, 'freed', b.log.length).length === 1 && g.phase === 'CHOOSE_ACTION',
  },
  mist: {
    hint: 'Move east into the room: poisonous mist (ROOM_003), at least 1 damage on this seed, so one skipped turn per point ("Unconscious").',
    build: s => room(s, { card: 'ROOM_003' }), then: [E],
    expect: (g, b) => log(g, 'turn-skipped', b.log.length).length >= 1,
  },
  explosion: {
    hint: 'Move east into the room: the explosion (ROOM_005), 4 damage and the next turn skipped.',
    build: s => room(s, { card: 'ROOM_005' }), then: [E],
    expect: (g, b) => log(g, 'turn-skipped', b.log.length).length === 1,
  },
  flask: {
    hint: 'Start of a turn at full HP holding a small flask (ROOM_002): Use it; the turn is not used and HP may go above the start.',
    build: s => { const g = room(s); give(g, 0, 'ROOM', 'ROOM_002'); return g; },
    then: [],
    expect: g => g.phase === 'CHOOSE_ACTION' && g.heroes[0].hp === g.heroes[0].hpStart && legalActions(g, CONTENT).some(a => a.type === 'USE_ITEM'),
  },
  'chest-shuffle': {
    hint: 'Move east into the room: a chest (ROOM_009); Open the chest: "Shuffle again" (CHEST_009), then the replacement chest card in the same action.',
    build: s => { const g = room(s, { card: 'ROOM_009' }); top(g, 'CHEST', 'CHEST_009'); return g; },
    then: [E, { type: 'CHOOSE', option: 0 }],
    expect: (g, b) => log(g, 'draw', b.log.length).filter(e => e.deck === 'CHEST').length >= 2,
  },
  'door-shuffle': {
    hint: 'Move north through the door: "Shuffle again" (DOOR_005), then the replacement door card at once.',
    build: s => { const g = room(s, { here: 'TILE_005' }); if (!g) return null; tile(g, '2,2', 'TILE_006'); top(g, 'DOOR', 'DOOR_005'); top(g, 'ROOM', 'ROOM_013'); return g; },
    then: [{ type: 'MOVE', dir: 'N' }],
    expect: (g, b) => log(g, 'draw', b.log.length).filter(e => e.deck === 'DOOR').length === 2,
  },
  'door-trap-ring': {
    hint: 'Move north through the door: a door trap (DOOR_003) with the Protection Ring: Use or Keep before any die.',
    build: s => { const g = room(s, { ringId: 'RING_4', here: 'TILE_005' }); if (!g) return null; tile(g, '2,2', 'TILE_006'); top(g, 'DOOR', 'DOOR_003'); return g; },
    then: [{ type: 'MOVE', dir: 'N' }],
    expect: g => g.pending?.kind === 'trap-ring',
  },
  'well-far-side': {
    hint: 'Start of a turn on the far side of the well (TILE_017 at 2,2) carrying two chamber cards: Jump back (with +2) or drop cards first; or leave north.',
    build: s => {
      const g = room(s, { heroId: 'HERO_6' }); // Agility 9
      tile(g, '2,2', 'TILE_017');
      give(g, 0, 'TREASURY', 'TREASURY_013'); give(g, 0, 'TREASURY', 'TREASURY_014');
      let x = reduce(g, { type: 'MOVE', seat: 0, dir: 'N' }, CONTENT); // the Agility test on entry
      if (x.heroes[0].status !== 'EXPLORING' || x.pending?.kind !== 'well-edge') return null;
      x = reduce(x, { type: 'WELL_JUMP', seat: 0 }, CONTENT);
      return x.heroes[0].roomState?.phase === 'CROSSED' && x.phase === 'CHOOSE_ACTION' ? x : null;
    },
    then: [],
    expect: g => { const t = legalActions(g, CONTENT).map(a => a.type); return t.includes('WELL_JUMP') && t.includes('WELL_DISCARD'); },
  },
  'dragon-wake-2p': {
    hint: 'Two players, both in the lair; the awake card (DRAGON_8) is on top. Player 1: Stay and collect: the dragon wakes, chamber cards lost, a D12 each, then two forced moves.',
    build: s => { const g = lair(s, { players: 2, inside: [0, 1], tiles: [['4,4', 'TILE_006'], ['5,4', 'TILE_006']] }); dragonTop(g, 'DRAGON_8'); return g; },
    then: [{ type: 'COLLECT' }],
    expect: g => g.pending?.kind === 'forced-move' && g.pending.seat === 0 && g.heroes.every(h => h.status === 'EXPLORING'),
  },
  'dragon-stuck': {
    hint: 'Two players in the lair, only one revealed tile next to it (4,4). Player 1: Stay and collect: the dragon wakes; player 1 is driven to 4,4; player 2 has nowhere to go and stays with the dragon awake.',
    build: s => { const g = lair(s, { players: 2, inside: [0, 1], tiles: [['4,4', 'TILE_006']] }); dragonTop(g, 'DRAGON_8'); return g; },
    then: [{ type: 'COLLECT' }, { type: 'FORCED_MOVE', to: '4,4' }],
    expect: (g, b) => log(g, 'forced-move-none', b.log.length).length === 1 && g.dragon.awake && g.heroes.every(h => h.status === 'EXPLORING'),
  },
  'lair-awake-entry': {
    hint: 'Three players; the dragon is awake with player 2 still in the lair (stuck after a wake). Player 1 walks south into the lair: nothing is drawn, "The dragon is awake".',
    build: s => {
      const g = lair(s, { players: 3, inside: [1], tiles: [['4,4', 'TILE_006'], ['7,7', 'TILE_006']] });
      hero(g, 0, '4,4'); hero(g, 2, '7,7');
      dragonTop(g, 'DRAGON_8');
      g.dragon.aside.push(g.dragon.remaining.shift());
      g.dragon.awake = true;
      return g;
    },
    then: [{ type: 'MOVE', dir: 'S' }],
    expect: (g, b) => log(g, 'dragon-awake-no-collect', b.log.length).length === 1,
  },
  'rotating-flight': {
    hint: 'The hero stands in the rotating room (TILE_014 at 2,1, opening south) with the Protection Ring. Move south: a dark elf (ROOM_019); choose Flee: the flight succeeds (MONSTER_003) and the ring prompt shows before the room turns.',
    build: s => {
      const g = room(s, { ringId: 'RING_4', card: 'ROOM_019' });
      tile(g, '2,1', 'TILE_014'); tile(g, '2,2', 'TILE_006');
      hero(g, 0, '2,1');
      top(g, 'MONSTER', 'MONSTER_003');
      return g;
    },
    then: [{ type: 'MOVE', dir: 'S' }, { type: 'RESPOND', choice: 'flee' }],
    expect: g => g.pending?.kind === 'rotation-ring' && g.pending.via === 'flight',
  },
  'rotating-forced': {
    hint: 'Solo in the lair with the Protection Ring; the only revealed tile next to it is the rotating room (4,4); the awake card is on top. Stay and collect, then the forced move into the room: the ring prompt.',
    build: s => { const g = lair(s, { tiles: [['4,4', 'TILE_014']], ringOf: { 0: 'RING_4' } }); dragonTop(g, 'DRAGON_8'); return g; },
    then: [{ type: 'COLLECT' }, { type: 'FORCED_MOVE', to: '4,4' }],
    expect: g => g.pending?.kind === 'rotation-ring' && g.pending.via === 'forced',
  },
  'flee-into-lair': {
    hint: 'Spec v11 decision 7, dragon asleep. Solo in the lair; move north from 4,5 into the room: a dark elf (ROOM_019); choose Flee: back into the lair, two chamber cards and a dragon card (a sleeping one on top); the turn ends.',
    build: s => { const g = lair(s, { tiles: [['4,4', 'TILE_006']] }); top(g, 'ROOM', 'ROOM_019'); top(g, 'MONSTER', 'MONSTER_003'); sleepingTop(g); return g; },
    then: [{ type: 'MOVE', dir: 'N', from: '4,5' }, { type: 'RESPOND', choice: 'flee' }],
    expect: (g, b) => log(g, 'draw', b.log.length).map(e => e.deck).join() === 'ROOM,MONSTER,TREASURY,TREASURY,DRAGON',
  },
  'ambush-crossbow': {
    hint: 'A hunter (HERO_5) with four crossbow shots. Move east into the room: an ambush (ROOM_018): the damage first, then Attack, Flee or Shoot, never Wait.',
    build: s => room(s, { heroId: 'HERO_5', card: 'ROOM_018' }), then: [E],
    expect: g => { const c = legalActions(g, CONTENT).filter(a => a.type === 'RESPOND').map(a => a.choice); return g.heroes[0].status === 'EXPLORING' && c.includes('special') && !c.includes('wait'); },
  },
  thunder: {
    hint: 'The hero holds the Thunder Ring. Move east into the room: a dark elf (ROOM_019), an ordinary encounter: the ring is offered beside Attack, Wait and Flee.',
    build: s => room(s, { ringId: 'RING_3', card: 'ROOM_019' }), then: [E],
    expect: g => legalActions(g, CONTENT).some(a => a.type === 'USE_RING'),
  },
  'last-light': {
    hint: 'Solo at sun 26, the last round. Search the room (an empty search card on top): the turn ends at sunset and the results show the hero inside at sunset.',
    build: s => { const g = room(s); g.round = 26; g.sun = 26; top(g, 'ROOM_SEARCH', 'RSEARCH_007'); return g; },
    then: [{ type: 'SEARCH' }],
    expect: g => g.status === 'over' && g.sun === 27,
  },
  'tower-choice': {
    hint: 'The hero carries 60 gold (SEARCH_006) beside the north-west tower. Move west into it: Escape, Stay or Continue.',
    build: s => { const g = room(s); tile(g, '1,0', 'TILE_006'); hero(g, 0, '1,0'); give(g, 0, 'SEARCH', 'SEARCH_006'); return g; },
    then: [{ type: 'MOVE', dir: 'W' }],
    expect: g => g.phase === 'TOWER_CHOICE' && legalActions(g, CONTENT).length === 3,
  },
  'results-cowinners': {
    hint: 'Two players; player 2 escaped earlier with 60 gold. Player 1, also carrying 60 gold, moves west into the tower and chooses Escape: the game ends with two co-winners.',
    build: s => {
      const g = room(s, { players: 2 });
      tile(g, '1,0', 'TILE_006'); hero(g, 0, '1,0');
      give(g, 0, 'SEARCH', 'SEARCH_006'); give(g, 1, 'SEARCH', 'SEARCH_006');
      Object.assign(g.heroes[1], { coord: { x: 9, y: 10 }, status: 'ESCAPED', escapeSun: g.sun });
      return g;
    },
    then: [{ type: 'MOVE', dir: 'W' }, { type: 'TOWER_CHOICE', choice: 'ESCAPE' }],
    expect: g => g.status === 'over' && g.result?.winners?.join() === '0,1',
  },
};

// Apply the hinted actions to a game: each matches one legal action of the acting seat by its fields.
export function play(g, then) {
  for (const want of then) {
    const a = legalActions(g, CONTENT).find(x => Object.entries(want).every(([k, v]) => x[k] === v));
    if (!a) return null;
    g = reduce(g, a, CONTENT);
  }
  return g;
}

// The first seed from 1 whose position shows the screen after the hinted actions (no dice are scripted).
export function build(name) {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`Unknown scenario ${name}`);
  for (let seed = 1; seed <= 500; seed++) {
    let g;
    try { g = sc.build(seed); } catch { continue; }
    if (!g) continue;
    const after = play(g, sc.then);
    if (after && sc.expect(after, g)) return { game: g, seed };
  }
  throw new Error(`No seed up to 500 shows ${name}`);
}

// The autosave app.js reads back (load()): version 1, play-test mode, no undo history, owner unset (this browser's).
export function saveString(game) {
  const n = game.seats.length;
  return JSON.stringify({
    v: 1, count: n, names: [0, 1, 2, 3].map(i => (i < n ? game.seats[i].name : '')), soloCombat: game.rules.soloCombat,
    mode: MODE, game, hist: [], saveId: null, createdAt: null, dropSave: null, seen: game.log.length, reveal: null, peek: null, owner: null,
  });
}

if (process.argv[1]?.endsWith('keep-scenario.js')) {
  const name = process.argv[2];
  if (!name || name === 'list') console.log(Object.keys(SCENARIOS).join('\n'));
  else {
    const { game, seed } = build(name);
    process.stderr.write(`${name} (seed ${seed}): ${SCENARIOS[name].hint}\n`);
    console.log(saveString(game));
  }
}
