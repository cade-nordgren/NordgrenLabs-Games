// Owner specification v9 (docs/plans/spec-v9-owner-2026-11-20.md): the Protection Ring and the rotating room, as approved
// from proposal-rotating-room-ring-2026-11-19.md. The 19 proposed cases keep the proposal's numbers (section 8); where the
// proposal left a choice "as ruled", the owner's decisions apply: every entry, flight offered, the dragon's forced move
// offered (to the driven hero's seat), declining allowed. Plus the trapped case: the turned opening would face a wall or
// the board edge. Rules: rotatingRoomRing 'every-entry' (default, D67); 'first-reveal' and 'never' stay settable.
// The room is a trap that turns clockwise on every entry: DIRECT 2023 RULE (rulebook 5.7). The ring cancelling the turn,
// its timing and its offer on a forced move: OWNER_APPROVED_INTERPRETATION, not printed rules.
// Owner tile TILE_014 (dead end, one opening, entry side S) and owner cards (draft) on the NON-AUTHENTIC fixture board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent } from '../../site/keep/content/schema.js';
import { serialize, restore, createGame, reduce, MECHANICS_VERSION } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { view, screenOwner, canUndoTo } from '../../site/keep/engine/view.js';
import { enterTile } from '../../site/keep/engine/movement.js';
import { edgeKey } from '../../site/keep/engine/board.js';
import { sideOnBoard, rotationFor, SIDES, OPPOSITE } from '../../site/keep/engine/tiles.js';
import { rotationRingWords } from '../../site/keep/ui/words.js';
import { FX, setup, act, acts, place, putHero, draws, xy, slotsOf } from './helpers.js';

const C = ORIGINAL;
const M = mixContent(ORIGINAL, FX);
const own = { ...M, board: FX.board, tiles: C.tiles, chamber: FX.chamber };
const ROT = C.tiles.find(t => t.id === 'TILE_014');
const EMPTY = Array(10).fill('ROOM_013');
const go = (g, type, fields = {}) => act(g, type, fields, own);
const L = g => acts(g, own);
const opening = (g, at) => SIDES.filter(s => sideOnBoard(ROT, g.board.tiles[at].rotation, s) === 'open');
const CW = { N: 'E', E: 'S', S: 'W', W: 'N' };
const came = dir => OPPOSITE[dir]; // the side of the room the hero comes in by
// Move direction and the square the hero comes from, into the room at 2,3.
const AROUND = [['N', '2,4'], ['E', '1,3'], ['S', '2,2'], ['W', '3,3']];
const ringOf = (g, seat, id) => { const j = g.seats.findIndex(s => s.ringId === id); if (j >= 0 && j !== seat) g.seats[j].ringId = g.seats[seat].ringId; g.seats[seat].ringId = id; };
const kinds = (g, from = 0) => g.log.slice(from).map(e => e.kind);
const noSeq = g => g.log.filter(e => e.kind !== 'ring-kept').map(({ seq, ...e }) => e);
const sameGame = (a, b, why) => {
  assert.deepEqual({ ...a, log: null, rules: null }, { ...b, log: null, rules: null }, `${why}: state`);
  assert.deepEqual(noSeq(a), noSeq(b), `${why}: log`);
};

// A solo hero on `from` (a placed four-way room) holding `ring`, moving `dir` into the unexplored `room` (the rotating room is next in the bag).
function reveal(dir, from, { ring = 'RING_4', rules = {}, room = null, deck = EMPTY, script = Array(20).fill(3), extra = () => {} } = {}) {
  let g = setup({ players: 1, content: own, script, tileOrder: slotsOf('TILE_014', own), deckOrders: { ROOM: deck }, rules });
  g.seats[0].ringId = ring;
  place(g, from, 'TILE_006');
  putHero(g, 0, from);
  extra(g);
  g = go(g, 'MOVE', { dir });
  if (room) assert.equal(g.board.tiles[room].defId, 'TILE_014');
  return g;
}
// A solo hero on 2,4 with the rotating room already placed at 2,3, opening S toward the hero.
function placed({ ring = 'RING_4', rules = {}, deck = EMPTY, monster = null } = {}) {
  const g = setup({ players: 1, content: own, script: Array(20).fill(3), deckOrders: { ROOM: deck, ...(monster ? { MONSTER: monster } : {}) }, rules });
  g.seats[0].ringId = ring;
  place(g, '2,3', 'TILE_014', 0);
  place(g, '2,4', 'TILE_006');
  putHero(g, 0, '2,4');
  return g;
}
// The turn the room entry belongs to is over: a solo game is at the start of the hero's next turn.
const turnOver = (g, from) => { assert.ok(kinds(g, from).includes('turn'), 'the turn ended'); assert.equal(g.phase, 'CHOOSE_ACTION'); assert.equal(g.pending, null); };

test('spec v9 #1: first reveal with the ring: the room is placed with its opening toward the hero, the hero is on it, it has not turned, and the only choices are Use ring and Keep ring', () => {
  for (const [dir, from] of AROUND) {
    const g = reveal(dir, from, { room: '2,3' });
    assert.equal(g.board.tiles['2,3'].rotation, rotationFor('S', came(dir)), `${dir}: placed by 5.1`);
    assert.deepEqual(opening(g, '2,3'), [came(dir)], `${dir}: opening toward the hero`);
    assert.deepEqual(g.heroes[0].coord, xy('2,3'));
    assert.ok(kinds(g).includes('reveal') && !kinds(g).includes('rotate'), `${dir}: revealed, not turned`);
    assert.equal(g.pending.kind, 'rotation-ring');
    assert.deepEqual(L(g), [{ type: 'USE_RING', seat: 0 }, { type: 'DECLINE_RING', seat: 0 }]);
    // What the screen draws while the choice is open: the newly drawn room, placed and unturned.
    assert.equal(view(g, own, 0).board.tiles['2,3'].rotation, g.board.tiles['2,3'].rotation);
    assert.equal(view(g, own, 0).heroes[0].inventory.ring.usable, true, 'the ring shows as usable now');
  }
});

test('spec v9 #2: using the ring: the room keeps its placed rotation, the ring is used and gone, "rotation-ignored" is logged, no die, and the turn ends as after any entry into this room', () => {
  const g0 = reveal('N', '2,4', { room: '2,3' });
  const n = g0.log.length;
  const g = go(g0, 'USE_RING');
  assert.equal(g.board.tiles['2,3'].rotation, g0.board.tiles['2,3'].rotation);
  assert.equal(g.heroes[0].ringUsed, true);
  const items = g.log.slice(n).filter(e => e.kind === 'item');
  assert.deepEqual(items.map(e => [e.action, e.value, e.group, e.to]), [['use', 'RING_4', 'ring', undefined], ['discard', 'RING_4', 'ring', 'out of the game']]);
  assert.deepEqual(g.log.slice(n).filter(e => e.kind === 'rotation-ignored').map(e => [e.seat, e.at]), [[0, '2,3']]);
  assert.ok(!kinds(g, n).includes('rotate'), 'no turn');
  assert.ok(!g.log.slice(g.log.findIndex(e => e.kind === 'reveal')).some(e => e.kind === 'roll' || e.kind === 'test'), 'no die');
  assert.equal(view(g, own, 0).heroes[0].inventory.ring, null, 'gone from the inventory');
  assert.deepEqual(draws(g, 'ROOM'), [], 'no dot: no room card');
  turnOver(g, n);
});

test('spec v9 #3: keeping the ring: the room turns a quarter clockwise exactly as without a ring offer, and the ring stays unused', () => {
  for (const [dir, from] of AROUND) {
    const g0 = reveal(dir, from, { room: '2,3' });
    const g = go(g0, 'DECLINE_RING');
    assert.equal(g.board.tiles['2,3'].rotation, (g0.board.tiles['2,3'].rotation + 90) % 360);
    assert.equal(g.log.filter(e => e.kind === 'rotate').length, 1);
    assert.equal(g.heroes[0].ringUsed, false);
    assert.equal(view(g, own, 0).heroes[0].inventory.ring.id, 'RING_4', 'still held');
    sameGame(g, reveal(dir, from, { rules: { rotatingRoomRing: 'never' } }), `${dir}: same as the engine before v9`);
    turnOver(g, g0.log.length);
  }
});

test('spec v9 #4: a hero holding another ring (Strength, Opening, Thunder): no prompt, the room turns as today', () => {
  for (const ring of ['RING_1', 'RING_2', 'RING_3']) {
    const g = reveal('N', '2,4', { ring, room: '2,3' });
    assert.equal(g.pending, null, ring);
    assert.equal(g.log.filter(e => e.kind === 'rotate').length, 1, ring);
    sameGame(g, reveal('N', '2,4', { ring, rules: { rotatingRoomRing: 'never' } }), ring);
  }
});

test('spec v9 #5: a hero whose Protection Ring is already used: no prompt, the room turns', () => {
  const g = reveal('N', '2,4', { room: '2,3', extra: g => { g.heroes[0].ringUsed = true; } });
  assert.equal(g.pending, null);
  assert.equal(g.log.filter(e => e.kind === 'rotate').length, 1);
  assert.deepEqual(opening(g, '2,3'), ['W']);
});

test('spec v9 #6: each of the four entry directions with the ring used: the opening faces the way in, and next turn the move back out is legal', () => {
  for (const [dir, from] of AROUND) {
    let g = go(reveal(dir, from, { room: '2,3' }), 'USE_RING');
    assert.deepEqual(opening(g, '2,3'), [came(dir)], dir);
    assert.deepEqual(L(g).filter(a => a.type === 'MOVE'), [{ type: 'MOVE', seat: 0, dir: came(dir) }], `${dir}: the way back`);
    g = go(g, 'MOVE', { dir: came(dir) });
    assert.deepEqual(g.heroes[0].coord, xy(from), `${dir}: back out`);
  }
});

test('spec v9 #7: each of the four entry directions with the ring kept: the opening ends a quarter turn clockwise from the way in (in by S: W; W: N; N: E; E: S)', () => {
  for (const [dir, from] of AROUND) {
    const g = go(reveal(dir, from, { room: '2,3' }), 'DECLINE_RING');
    assert.deepEqual(opening(g, '2,3'), [CW[came(dir)]], dir);
  }
  assert.deepEqual(Object.fromEntries(AROUND.map(([dir]) => [came(dir), CW[came(dir)]])), { S: 'W', W: 'N', N: 'E', E: 'S' });
});

test('spec v9 #8: entering the placed rotating room again: under "every entry" (default) the prompt appears and the ring keeps it still; under "first reveal only" no prompt and it turns; "never" as before v9', () => {
  let g = go(placed(), 'MOVE', { dir: 'N' });
  assert.equal(g.pending.kind, 'rotation-ring');
  assert.equal(g.pending.first, false);
  g = go(g, 'USE_RING');
  assert.equal(g.board.tiles['2,3'].rotation, 0);
  assert.deepEqual(opening(g, '2,3'), ['S']);
  for (const v of ['first-reveal', 'never']) {
    const h = go(placed({ rules: { rotatingRoomRing: v } }), 'MOVE', { dir: 'N' });
    assert.equal(h.pending, null, v);
    assert.equal(h.board.tiles['2,3'].rotation, 90, v);
  }
  // 'first-reveal' still offers it on the first reveal.
  assert.equal(reveal('N', '2,4', { rules: { rotatingRoomRing: 'first-reveal' } }).pending.kind, 'rotation-ring');
  assert.equal(reveal('N', '2,4', { rules: { rotatingRoomRing: 'never' } }).pending, null);
});

test('spec v9 #9: fleeing back into the rotating room with the ring: offered (owner decision); either way no room card and the turn ends', () => {
  for (const use of [true, false]) {
    // The hero walks out of the room into 2,4, meets a mountain troll and flees back (MONSTER_006, S10: flight succeeds).
    let g = placed({ deck: ['ROOM_026', ...EMPTY], monster: ['MONSTER_006'] });
    putHero(g, 0, '2,3');
    g = go(g, 'MOVE', { dir: 'S' });
    assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
    g = go(g, 'RESPOND', { choice: 'flee' });
    assert.ok(kinds(g).includes('flight'));
    assert.deepEqual(g.heroes[0].coord, xy('2,3'));
    assert.equal(g.pending?.kind, 'rotation-ring', 'offered on the flight back');
    assert.equal(g.pending.via, 'flight');
    const n = g.log.length;
    g = go(g, use ? 'USE_RING' : 'DECLINE_RING');
    assert.equal(g.board.tiles['2,3'].rotation, use ? 0 : 90);
    assert.deepEqual(draws(g, 'ROOM'), ['ROOM_026#1'], 'no room card on the flight back');
    turnOver(g, n);
  }
});

test('spec v9 #10: the dragon wakes and drives a hero with the ring into the rotating room: the prompt goes to the driven hero\'s seat, outside turn order, and the wake goes on with the next hero', () => {
  const wake = rules => {
    let g = setup({ players: 3, content: own, script: [1, 1, 1, ...Array(20).fill(3)], deckOrders: { ROOM: EMPTY, DRAGON: ['DRAGON_8'] }, rules });
    for (const s of [0, 1, 2]) putHero(g, s, '4,5');
    g.board.chamberPlaced = true;
    ringOf(g, 1, 'RING_4');
    place(g, '4,4', 'TILE_014', 0); // opening S, toward the chamber
    place(g, '5,4', 'TILE_006');
    place(g, '3,5', 'TILE_006');
    g = go(g, 'COLLECT');
    assert.ok(kinds(g).includes('dragon-wakes'));
    g = act(g, 'FORCED_MOVE', { seat: 0, to: '5,4' }, own);
    return act(g, 'FORCED_MOVE', { seat: 1, to: '4,4' }, own);
  };
  for (const use of [true, false]) {
    let g = wake();
    assert.equal(g.activeSeat, 0, 'the waker is still the active seat');
    assert.deepEqual(g.pending && [g.pending.kind, g.pending.seat, g.pending.via], ['rotation-ring', 1, 'forced']);
    assert.deepEqual(L(g), [{ type: 'USE_RING', seat: 1 }, { type: 'DECLINE_RING', seat: 1 }], 'the driven hero decides');
    assert.equal(screenOwner(g), null);
    assert.equal(g.board.tiles['4,4'].rotation, 0, 'not turned yet');
    assert.deepEqual(g.wake.queue, [2], 'the wake waits with the next hero queued');
    g = act(g, use ? 'USE_RING' : 'DECLINE_RING', { seat: 1 }, own);
    assert.equal(g.board.tiles['4,4'].rotation, use ? 0 : 90);
    assert.equal(g.heroes[1].ringUsed, use);
    assert.deepEqual([g.phase, g.pending.kind, g.pending.seat], ['FORCED_MOVE', 'forced-move', 2], 'the wake goes on: the next hero is driven');
    if (!use) sameGame(g, wake({ rotatingRoomRing: 'never' }), 'kept: the wake as before v9');
    g = act(g, 'FORCED_MOVE', { seat: 2, to: '3,5' }, own);
    assert.equal(g.wake, null);
    assert.equal(g.activeSeat, 1, 'the next turn is the next seat clockwise');
  }
});

test('spec v9 #11: a card move with tile effects into the rotating room follows the ordinary-entry rule; with applyTile false, no turn and no prompt', () => {
  let g = placed();
  enterTile(g, own, 0, xy('2,3'), { dir: 'N', via: 'card' });
  assert.equal(g.pending.kind, 'rotation-ring');
  g = go(g, 'USE_RING');
  assert.equal(g.board.tiles['2,3'].rotation, 0);
  assert.equal(g.heroes[0].ringUsed, true);
  g = placed();
  enterTile(g, own, 0, xy('2,3'), { dir: 'N', via: 'card', applyTile: false });
  assert.equal(g.pending, null);
  assert.equal(g.board.tiles['2,3'].rotation, 0);
  assert.ok(!kinds(g).includes('rotate'));
});

test('spec v9 #12: a hero staying in the rotating room (a forced skip): no prompt and no turn', () => {
  let g = go(reveal('N', '0,4', { room: '0,3' }), 'DECLINE_RING'); // the opening now faces the board edge
  const n = g.log.length;
  g = go(g, 'FORCED_SKIP');
  assert.ok(!kinds(g, n).includes('rotate'));
  assert.equal(g.pending, null);
  assert.equal(g.heroes[0].ringUsed, false);
});

test('spec v9 #13: the ring is single-use across both: used on the room, no prompt at a later trap card; used on a trap card, no prompt at the room, which turns', () => {
  let g = go(reveal('N', '2,4', { room: '2,3', deck: ['ROOM_006', ...EMPTY] }), 'USE_RING');
  g = go(g, 'MOVE', { dir: 'S' }); // back into the black room: the arrow trap
  assert.deepEqual(draws(g, 'ROOM'), ['ROOM_006#1']);
  assert.notEqual(g.pending?.kind, 'trap-ring');
  assert.ok(kinds(g).includes('damage') || g.log.some(e => e.kind === 'formula' && e.reason === 'damage formula'), 'the trap happened');
  // The other way round: the arrow trap first (ring used there), then the rotating room.
  let h = setup({ players: 1, content: own, script: Array(20).fill(3), tileOrder: slotsOf('TILE_014', own), deckOrders: { ROOM: ['ROOM_006', ...EMPTY] } });
  h.seats[0].ringId = 'RING_4';
  place(h, '2,5', 'TILE_006'); place(h, '2,4', 'TILE_006'); putHero(h, 0, '2,5');
  h = go(h, 'MOVE', { dir: 'N' });
  assert.equal(h.pending.kind, 'trap-ring');
  h = go(h, 'USE_RING');
  h = go(h, 'MOVE', { dir: 'N' });
  assert.equal(h.board.tiles['2,3'].defId, 'TILE_014');
  assert.equal(h.pending, null);
  assert.equal(h.log.filter(e => e.kind === 'rotate').length, 1);
});

// Every seat's view, with what may differ by viewer anyway taken out: chamber cards and gold, and private log entries.
const shared = (g, v) => {
  const w = view(g, own, v);
  w.heroes = w.heroes.map(h => h && { ...h, treasury: Array.isArray(h.treasury) ? h.treasury.length : h.treasury, gold: null, inventory: { ...h.inventory, chamber: Array.isArray(h.inventory.chamber) ? h.inventory.chamber.length : h.inventory.chamber } });
  w.log = w.log.filter(e => e.private === undefined);
  return JSON.stringify(w);
};
const sameForAll = (g, why) => { for (const s of g.seats) assert.equal(shared(g, s.seat), shared(g, null), `${why}: seat ${s.seat} sees the shared table`); };

test('spec v9 #14: 2 and 4 players: the prompt is the entering hero\'s, nobody else looks away, and every seat sees the same apart from its own chamber cards', () => {
  for (const [n, k] of [[2, 1], [4, 2]]) {
    let g = setup({ players: n, content: own, firstRolls: Array.from({ length: n }, (_, i) => (i === k ? 12 : i + 1)), script: Array(20).fill(3), tileOrder: slotsOf('TILE_014', own), deckOrders: { ROOM: EMPTY } });
    assert.equal(g.activeSeat, k);
    ringOf(g, k, 'RING_4');
    place(g, '2,4', 'TILE_006');
    putHero(g, k, '2,4');
    g = go(g, 'MOVE', { dir: 'N' });
    assert.equal(g.pending.seat, k, `${n}p: the entering hero's prompt`);
    assert.ok(L(g).every(a => a.seat === k));
    assert.equal(screenOwner(g), null);
    sameForAll(g, `${n}p prompt`);
    g = go(g, 'USE_RING');
    sameForAll(g, `${n}p answered`);
    assert.equal(g.activeSeat, (k + 1) % n, `${n}p: the next seat clockwise`);
  }
});

test('spec v9 #14 (forced move): the driven hero\'s prompt in a 3-player wake shows the same to every seat apart from chamber cards', () => {
  let g = setup({ players: 3, content: own, script: [1, 1, 1, ...Array(20).fill(3)], deckOrders: { ROOM: EMPTY, DRAGON: ['DRAGON_8'] } });
  for (const s of [0, 1, 2]) putHero(g, s, '4,5');
  g.board.chamberPlaced = true;
  ringOf(g, 1, 'RING_4');
  place(g, '4,4', 'TILE_014', 0); place(g, '5,4', 'TILE_006'); place(g, '3,5', 'TILE_006');
  g = go(g, 'COLLECT');
  g = act(g, 'FORCED_MOVE', { seat: 0, to: '5,4' }, own);
  g = act(g, 'FORCED_MOVE', { seat: 1, to: '4,4' }, own);
  assert.equal(g.pending.seat, 1);
  sameForAll(g, 'forced-move prompt');
});

test('spec v9 #15: undo: after a first reveal the choice can be undone back to the prompt but not past the draw; after a re-entry the choice and the move both undo and the ring is unused again', () => {
  let before = setup({ players: 1, content: own, script: Array(20).fill(3), tileOrder: slotsOf('TILE_014', own), deckOrders: { ROOM: EMPTY } });
  before.seats[0].ringId = 'RING_4';
  place(before, '2,4', 'TILE_006'); putHero(before, 0, '2,4');
  let mid = go(before, 'MOVE', { dir: 'N' });
  let end = go(mid, 'USE_RING');
  assert.equal(canUndoTo(before, mid), false, 'not past the tile draw');
  assert.equal(canUndoTo(mid, end), true, 'back to the prompt');
  assert.equal(mid.pending.kind, 'rotation-ring');
  before = placed();
  mid = go(before, 'MOVE', { dir: 'N' });
  end = go(mid, 'USE_RING');
  assert.equal(canUndoTo(before, mid) && canUndoTo(mid, end) && canUndoTo(before, end), true, 'both undo');
  assert.deepEqual([before.heroes[0].ringUsed, end.heroes[0].ringUsed], [false, true], 'the ring comes back');
});

test('spec v9 #16: the Opening, Strength or Thunder Ring: no prompt at the rotating room; the Opening Ring still only at a door or portcullis', () => {
  for (const ring of ['RING_1', 'RING_2', 'RING_3']) {
    const g = go(placed({ ring }), 'MOVE', { dir: 'N' });
    assert.equal(g.pending, null, ring);
    assert.ok(!L(g).some(a => a.type === 'USE_RING') || ring === 'RING_1', `${ring}: not offered in the room`);
    if (ring === 'RING_1') assert.deepEqual(L(g).filter(a => a.type === 'USE_RING'), [{ type: 'USE_RING', seat: 0 }], 'the Strength Ring stays a turn action, as always');
  }
  // The Opening Ring in the room: offered only toward a door (TILE_004 has a door on its N side, toward the room).
  const g = placed({ ring: 'RING_2' });
  putHero(g, 0, '2,3');
  assert.ok(!L(g).some(a => a.type === 'USE_RING'), 'an open way: no Opening Ring');
  place(g, '2,4', 'TILE_004', 0);
  assert.deepEqual(L(g).filter(a => a.type === 'USE_RING'), [{ type: 'USE_RING', seat: 0, dir: 'S' }], 'a door: the Opening Ring');
});

test('spec v9 #17: the well, rubble, a dark room and a portcullis: no Protection Ring prompt (unchanged)', () => {
  for (const [tile, what] of [['TILE_017', 'well'], ['TILE_015', 'rubble'], ['TILE_013', 'dark room']]) {
    const g = placed({});
    place(g, '2,3', tile, 0);
    const h = act(g, 'MOVE', { dir: 'N' }, own);
    assert.ok(!['rotation-ring', 'trap-ring'].includes(h.pending?.kind), what);
    assert.equal(h.heroes[0].ringUsed, false, what);
  }
  const g = placed({});
  place(g, '2,3', 'TILE_006', 0);
  g.board.edges[edgeKey(xy('2,4'), 'N')] = 'gate';
  const h = act(g, 'MOVE', { dir: 'N' }, own);
  assert.ok(h.log.some(e => e.kind === 'gate'), 'the portcullis was tried');
  assert.ok(!['rotation-ring', 'trap-ring'].includes(h.pending?.kind), 'portcullis');
  assert.equal(h.heroes[0].ringUsed, false);
});

test('spec v9 #18: the wizard\'s curse: no Protection Ring prompt (unchanged, spec v8), now labelled an owner-approved interpretation', () => {
  const room = C.room.find(e => e.id === 'ROOM_007');
  assert.notEqual(room.kind, 'trap');
  assert.match(room.notes, /Status: OWNER_APPROVED_INTERPRETATION/);
  let g = setup({ players: 1, content: own, script: [1, 3, 3, 3], deckOrders: { ROOM: ['ROOM_007', ...EMPTY] } });
  g.seats[0].ringId = 'RING_4';
  place(g, '1,0', 'TILE_006'); place(g, '1,1', 'TILE_006', 0); putHero(g, 0, '1,0');
  g = go(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(draws(g, 'ROOM'), ['ROOM_007#1']);
  assert.ok(!['rotation-ring', 'trap-ring'].includes(g.pending?.kind));
  assert.ok(kinds(g).includes('tiles-rotated'), 'the curse resolved');
  assert.equal(g.heroes[0].ringUsed, false);
});

test('spec v9 #19: a v9 save is refused (MECHANICS_VERSION v10); a game in which no hero with the ring enters a rotating room replays the same as before v9', () => {
  assert.equal(MECHANICS_VERSION, 'rb-0.2/sp-1.0/v10');
  const g = createGame({ players: ['A', 'B'], seed: 9, content: M });
  const old = JSON.parse(serialize(g));
  old.mechanicsVersion = 'rb-0.2/sp-1.0/v9';
  assert.throws(() => restore(JSON.stringify(old), M), /Unsupported save version/);
  // Random games played under 'never' (the behaviour before v9), replayed under the default: identical unless and until the
  // ring is offered at a rotating room, and then identical up to that offer.
  let same = 0, offered = 0;
  for (let i = 0; i < 24; i++) {
    const players = Array.from({ length: [1, 2, 4][i % 3] }, (_, s) => `P${s + 1}`);
    let a = createGame({ players, seed: 700 + i, content: M, rules: { rotatingRoomRing: 'never' } });
    let b = createGame({ players, seed: 700 + i, content: M });
    let diverged = false;
    for (let step = 0; a.status !== 'over' && step < 3000; step++) {
      const la = legalActions(a, M);
      const pick = la[(step * 7 + i) % la.length];
      a = reduce(a, pick, M);
      b = reduce(b, pick, M);
      if (b.pending?.kind === 'rotation-ring') { diverged = true; break; }
      assert.deepEqual({ ...b, rules: null }, { ...a, rules: null }, `seed ${700 + i}, step ${step}`);
    }
    if (diverged) offered++; else same++;
  }
  assert.ok(same >= 10, `${same} games replayed the same`);
});

// ---- The trapped case: the turned opening would face the board edge or a wall.
test('spec v9 trapped: in all four entry directions, where the turned opening would face the board edge or a wall, keeping the ring leaves no legal exit next turn (forced skip); using it, the hero walks back out', () => {
  const cases = [
    ['N', '0,4', '0,3', 'the west board edge'],
    ['E', '2,0', '3,0', 'the north board edge'],
    ['S', '9,2', '9,3', 'the east board edge'],
    ['W', '6,10', '5,10', 'the south board edge'],
    // A wall: moving north into 2,3, the turned opening faces 1,3, a black corner whose east side is a wall.
    ['N', '2,4', '2,3', 'a wall', g => place(g, '1,3', 'TILE_001', 90)],
  ];
  for (const [dir, from, room, what, extra = () => {}] of cases) {
    const kept = go(reveal(dir, from, { room, extra }), 'DECLINE_RING');
    assert.deepEqual(opening(kept, room), [CW[came(dir)]], `${what}: turned`);
    assert.deepEqual(L(kept), [{ type: 'FORCED_SKIP', seat: 0 }], `${what}: kept, no way out`);
    const used = go(reveal(dir, from, { room, extra }), 'USE_RING');
    assert.deepEqual(L(used).filter(a => a.type === 'MOVE'), [{ type: 'MOVE', seat: 0, dir: came(dir) }], `${what}: used, the way back`);
    assert.deepEqual(go(used, 'MOVE', { dir: came(dir) }).heroes[0].coord, xy(from), `${what}: out again`);
  }
});

test('spec v9 prompt words (ui/words.js): the rotating room, what the turned opening would face, and the two answers', () => {
  const line = g => rotationRingWords(g, own, g.pending.seat, 'P1').line;
  const edge = reveal('N', '0,4', { room: '0,3' });
  const w = rotationRingWords(edge, own, 0, 'P1');
  assert.deepEqual([w.title, w.use, w.keep], ['A rotating room', 'The room does not turn. The ring is gone.', 'The room turns.']);
  assert.equal(w.line, 'P1, the room is about to turn a quarter turn clockwise. Your way out would then face west: the board edge, so no way out.');
  assert.match(line(reveal('N', '2,4', { room: '2,3', extra: g => place(g, '1,3', 'TILE_001', 90) })), /face west: a wall, so no way out\.$/);
  assert.match(line(reveal('N', '2,4', { room: '2,3', extra: g => place(g, '1,3', 'TILE_006') })), /face west: an open room\.$/);
  assert.match(line(reveal('N', '2,4', { room: '2,3' })), /face west: an unexplored square, but no tiles are left\.$/, 'the only tile in this bag was the room');
  assert.match(line(go(placed(), 'MOVE', { dir: 'N' })), /face west: an unexplored square\.$/);
  assert.equal(edge.board.tiles['0,3'].rotation, 0, 'the words do not turn the room');
});
