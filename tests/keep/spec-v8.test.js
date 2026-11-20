// Owner specification v8 (docs/plans/spec-v8-owner-2026-11-19.md). (1) Multiplayer regression for "shuffle again"
// (R62, D62): a replacement draw keeps the active seat, turn order, prompts and hidden information exactly as if the
// replacement had been drawn directly. (2) Current rotating-room behaviour on the owner's tile, pinned while the
// Protection Ring question is reopened (plan 13 #41a, proposal-rotating-room-ring-2026-11-19.md): no behaviour change.
// (3) The wizard's curse stays outside the Protection Ring (owner interpretation, spec v8).
// Owner cards (draft) on the NON-AUTHENTIC fixture board and tiles, with scripted deck orders: the first order is the
// setup shuffle, each later one the next reshuffle of that deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent } from '../../site/keep/content/schema.js';
import { view, screenOwner } from '../../site/keep/engine/view.js';
import { enterTile } from '../../site/keep/engine/movement.js';
import { sideOnBoard, SIDES } from '../../site/keep/engine/tiles.js';
import { FX, setup, act, acts, place, putHero, draws, xy, slotsOf } from './helpers.js';

const C = ORIGINAL;
const M = mixContent(ORIGINAL, FX);
const T = { ...M, board: FX.board, tiles: FX.tiles, chamber: FX.chamber };
const EMPTY = Array(10).fill('ROOM_013');
const go = (g, type, fields = {}) => act(g, type, fields, T);
const SHUFFLE = { ROOM: 'ROOM_014', SEARCH: 'SEARCH_001', ROOM_SEARCH: 'RSEARCH_008', CHEST: 'CHEST_009', DOOR: 'DOOR_005' };
// Seat k rolls the only 12, so seat k is the first (and active) player; clockwise order from there.
const firsts = (n, k) => Array.from({ length: n }, (_, i) => (i === k ? 12 : i + 1));
const ringTo = k => g => { const j = g.seats.findIndex(s => s.ringId === 'RING_4'); if (j >= 0) g.seats[j].ringId = g.seats[k].ringId; g.seats[k].ringId = 'RING_4'; };

// One action of seat k in an n-player game. deck: the deck under test; orders: its scripted orders.
// ROOM: step into a room. SEARCH: the fallen warrior, "Search the body". CHEST: a chest room, "Open the chest".
// ROOM_SEARCH: search the room. DOOR: try a door.
function play(n, k, deck, orders, { ring = false } = {}) {
  const room = { ROOM: orders, SEARCH: [['ROOM_022', ...EMPTY]], CHEST: [['ROOM_009', ...EMPTY]] }[deck] || [EMPTY];
  const decks = { ROOM: room, MONSTER: ['MONSTER_006'], ...(deck !== 'ROOM' ? { [deck]: orders } : {}) };
  let g = setup({ players: n, content: T, firstRolls: firsts(n, k), script: Array(40).fill(3), deckOrders: decks });
  assert.equal(g.activeSeat, k);
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', deck === 'DOOR' ? 'FX_DOORWAY' : deck === 'ROOM_SEARCH' ? 'FX_TEE' : 'FX_CROSS', 0);
  putHero(g, k, deck === 'ROOM_SEARCH' ? '1,1' : '1,0');
  if (ring) ringTo(k)(g);
  if (deck === 'ROOM_SEARCH') return go(g, 'SEARCH');
  g = go(g, 'MOVE', { dir: 'S' });
  return deck === 'SEARCH' || deck === 'CHEST' ? go(g, 'CHOOSE', { option: 0 }) : g;
}
// Everything but the log, the deck orders and the RNG (those differ by the shuffle itself).
const core = g => JSON.stringify({ ...g, log: null, decks: null, rng: null });
const seen = (g, seat) => JSON.stringify({ ...view(g, T, seat), log: null, decks: null });
const viewers = g => [null, ...g.seats.map(s => s.seat)];
function same(a, b, why) {
  assert.equal(core(a), core(b), `${why}: state`);
  assert.equal(screenOwner(a), screenOwner(b), `${why}: who looks`);
  for (const v of viewers(a)) assert.equal(seen(a, v), seen(b, v), `${why}: view of ${v}`);
}
// Every private log entry reaches its own seat only; everyone else gets it blanked.
function privateStays(g, why) {
  for (const v of viewers(g)) {
    const log = view(g, T, v).log.filter(e => e.kind !== 'shuffle');
    g.log.filter(e => e.kind !== 'shuffle').forEach((e, i) => {
      if (e.private === undefined) return;
      if (e.private === v) assert.equal(log[i].value, e.value, `${why}: seat ${v} reads its own entry`);
      else assert.equal(log[i].value, 'hidden', `${why}: seat ${v} cannot read ${e.kind} for ${e.private}`);
    });
  }
}
// The rest of seat k's turn, the same deterministic choices on both games (STOP when offered, else the last option).
function finish(g, k) {
  for (let i = 0; i < 60 && g.status === 'playing' && g.activeSeat === k; i++) {
    const L = acts(g, T);
    g = act(g, (L.find(a => a.type === 'STOP') || L.at(-1)).type, L.find(a => a.type === 'STOP') || L.at(-1), T);
  }
  return g;
}

const CASES = [
  { deck: 'ROOM', rep: 'ROOM_010', what: 'a kept treasure' },
  { deck: 'ROOM', rep: 'ROOM_017', what: 'a monster' },
  { deck: 'ROOM', rep: 'ROOM_006', what: 'a trap, Protection Ring held', ring: true },
  { deck: 'ROOM', rep: 'ROOM_009', what: 'the chest prompt' },
  { deck: 'ROOM', rep: 'ROOM_022', what: 'the body prompt' },
  { deck: 'SEARCH', rep: 'SEARCH_003', what: 'a kept search card' },
  { deck: 'ROOM_SEARCH', rep: 'RSEARCH_005', what: 'a kept room search card' },
  { deck: 'CHEST', rep: 'CHEST_005', what: 'a kept chest card' },
  { deck: 'CHEST', rep: 'CHEST_008', what: 'the chest trap, Protection Ring held', ring: true },
  { deck: 'DOOR', rep: 'DOOR_001', what: 'an opening door' },
  { deck: 'DOOR', rep: 'DOOR_003', what: 'a door trap, Protection Ring held', ring: true },
];
const first = (deck, rest) => (deck === 'ROOM' ? [...rest, ...EMPTY] : rest);

for (const [n, k] of [[2, 1], [4, 2]]) {
  test(`spec v8 multiplayer (${n} players, seat ${k} active): every "shuffle again" replacement leaves seat, turn order, prompts and hidden information as a direct draw`, () => {
    const right = (k - 1 + n) % n, next = (k + 1) % n;
    for (const c of CASES) {
      const s = SHUFFLE[c.deck];
      for (const [label, orders] of [['one shuffle card', [first(c.deck, [s]), [c.rep]]], ['two in a row', [first(c.deck, [s]), [s], [c.rep]]]]) {
        const why = `${n}p ${c.deck} ${label}, ${c.what}`;
        let a = play(n, k, c.deck, orders, c);
        let b = play(n, k, c.deck, [first(c.deck, [c.rep])], c);
        assert.equal(draws(a, c.deck).filter(i => i.startsWith(`${s}#`)).length, orders.length - 1, `${why}: the shuffle cards were drawn`);
        assert.equal(draws(a, c.deck).at(-1).split('#')[0], c.rep, `${why}: the replacement was drawn`);
        same(a, b, why);
        privateStays(a, why);
        assert.ok([k, next].includes(a.activeSeat), `${why}: active seat`);
        if (a.pending) assert.equal(a.pending.seat, k, `${why}: the prompt is the acting hero's`);
        if (c.ring) {
          assert.equal(a.pending?.kind, 'trap-ring', `${why}: the ring is offered`);
          assert.ok(!a.log.slice(a.log.findLastIndex(e => e.kind === 'draw')).some(e => e.kind === 'roll'), `${why}: before any die`);
          [a, b] = [go(a, 'USE_RING'), go(b, 'USE_RING')];
          same(a, b, `${why}, ring used`);
        }
        if (c.rep === 'ROOM_017') {
          // The hero commits before the monster card exists; the right-hand player controls it.
          assert.equal(a.phase, 'CHOOSE_MONSTER_RESPONSE');
          assert.deepEqual(draws(a, 'MONSTER'), []);
          assert.equal(a.encounter.controller, right);
          assert.equal(screenOwner(a), null);
          [a, b] = [go(a, 'RESPOND', { choice: 'attack' }), go(b, 'RESPOND', { choice: 'attack' })];
          same(a, b, `${why}, committed`);
          privateStays(a, `${why}, committed`);
          assert.equal(a.pending.seat, right, `${why}: the monster player announces`);
          assert.equal(screenOwner(a), right, `${why}: only the monster player looks`);
          for (const v of viewers(a).filter(v => v !== right)) {
            const e = view(a, T, v).encounter;
            assert.equal(JSON.stringify(view(a, T, v)).includes('MONSTER_006'), false, `${why}: seat ${v} does not see the monster card`);
            assert.equal(e.monster.hp, undefined, `${why}: seat ${v} does not see its HP`);
            assert.equal(e.reaction, null, `${why}: seat ${v} does not see its reaction`);
          }
          assert.ok(JSON.stringify(view(a, T, right)).includes('MONSTER_006'), `${why}: the monster player reads the card`);
        }
        // To the end of the turn: the same choices give the same game, and the next player in clockwise order moves.
        [a, b] = [finish(a, k), finish(b, k)];
        same(a, b, `${why}, turn over`);
        privateStays(a, `${why}, turn over`);
        if (a.status === 'playing') assert.equal(a.activeSeat, a.heroes[next].status === 'DEAD' ? a.activeSeat : next, `${why}: next player`);
      }
    }
  });
}

test('spec v8 multiplayer: a monster replacement into an A/B/C fight keeps both picks hidden from the other side', () => {
  let a = play(2, 1, 'ROOM', [['ROOM_014', ...EMPTY], ['ROOM_017']]);
  a = go(go(a, 'RESPOND', { choice: 'attack' }), 'ANNOUNCE');
  assert.equal(a.phase, 'COMBAT_SELECT');
  assert.equal(a.encounter.combat.mode, 'abc');
  assert.equal(screenOwner(a), 1, 'the hero picks first, alone');
  a = act(a, 'COMBAT_PICK', acts(a, T).find(x => x.side === 'hero'), T);
  assert.equal(screenOwner(a), 0, 'then the monster player, alone');
  assert.equal(view(a, T, 0).encounter.combat.heroPick, 'hidden');
  a = act(a, 'COMBAT_PICK', acts(a, T).find(x => x.side === 'monster'), T);
  assert.ok(a.log.some(e => e.kind === 'exchange'), 'both picks locked in, the exchange resolves');
});

// ---- Rotating room, current behaviour (no change; plan 13 #41a reopened by spec v8).
test('spec v8 rotating room today, owner tile TILE_014: on every entry direction it turns a quarter clockwise, the opening leaves the way in, and no ring is offered', () => {
  const own = { ...T, tiles: C.tiles };
  const opening = (g, at) => SIDES.filter(s => sideOnBoard(C.tiles.find(t => t.id === 'TILE_014'), g.board.tiles[at].rotation, s) === 'open');
  // The hero moves into (2,3) from each neighbour. Opening after entry: 90 clockwise from the way in.
  const want = { N: 'E', E: 'S', S: 'W', W: 'N' }; // keyed by the side the hero came in by
  for (const [dir, from] of [['S', '2,2'], ['W', '3,3'], ['N', '2,4'], ['E', '1,3']]) {
    const came = { S: 'N', W: 'E', N: 'S', E: 'W' }[dir];
    let g = setup({ players: 1, content: own, script: Array(10).fill(3), tileOrder: slotsOf('TILE_014', own), deckOrders: { ROOM: EMPTY } });
    ringTo(0)(g);
    place(g, from, 'TILE_006');
    putHero(g, 0, from);
    g = act(g, 'MOVE', { dir }, own);
    assert.equal(g.board.tiles['2,3'].defId, 'TILE_014');
    assert.deepEqual(g.log.filter(e => e.kind === 'rotate').length, 1, `${dir}: one quarter turn on the first reveal`);
    assert.deepEqual(opening(g, '2,3'), [want[came]], `${dir}: the opening no longer faces the way in (${came})`);
    assert.notEqual(g.pending?.kind, 'trap-ring');
    assert.equal(g.heroes[0].ringUsed, false, 'the ring is untouched');
    assert.equal(draws(g, 'ROOM').length, 0, 'no dot: no room card');
    assert.ok(!acts(g, own).some(a => a.type === 'SEARCH'), 'no dot: no search');
  }
  // A forced move after a dragon wake turns it too (forcedMoveTileEffects, default on); entering with tile effects off does not.
  let g = setup({ players: 1, content: own, deckOrders: { ROOM: EMPTY } });
  place(g, '2,3', 'TILE_014', 0);
  putHero(g, 0, '2,4');
  enterTile(g, own, 0, xy('2,3'), { dir: 'N', via: 'forced', drawRoom: false });
  assert.equal(g.board.tiles['2,3'].rotation, 90);
  putHero(g, 0, '2,4');
  enterTile(g, own, 0, xy('2,3'), { dir: 'N', via: 'card', applyTile: false });
  assert.equal(g.board.tiles['2,3'].rotation, 90, 'a card move with applyTile false: no turn');
});

test('spec v8 wizard\'s curse: no Protection Ring offer, by owner interpretation (not an expressly stated rule)', () => {
  const room = C.room.find(e => e.id === 'ROOM_007');
  assert.notEqual(room.kind, 'trap');
  assert.match(room.notes, /Status: PROVISIONAL\/INFERRED/);
  assert.match(room.notes, /interpretation/);
  let g = setup({ players: 1, content: T, script: [1, 3, 3, 3], deckOrders: { ROOM: ['ROOM_007', ...EMPTY] } });
  ringTo(0)(g);
  place(g, '1,0', 'FX_CROSS'); place(g, '1,1', 'FX_CROSS', 0); putHero(g, 0, '1,0');
  g = go(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(draws(g, 'ROOM'), ['ROOM_007#1']);
  assert.notEqual(g.pending?.kind, 'trap-ring');
  assert.ok(g.log.some(e => e.kind === 'tiles-rotated'), 'the curse resolved');
  assert.equal(g.heroes[0].ringUsed, false);
});
