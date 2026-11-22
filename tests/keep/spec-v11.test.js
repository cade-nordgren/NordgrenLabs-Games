// Owner specification v11 (docs/plans/spec-v11-owner-2026-11-20.md), decisions 6 and 7 checked against the engine.
// Decision 6: the dragon drives a surviving hero onto a special tile: the tile's applicable entry effects apply, but no
// room card is ever drawn (2023 rules 10.1). Decision 7: a successful flight from a monster back into the lair is an entry:
// asleep, the normal two chamber cards and a dragon draw; awake, nothing; the wake works as normal; no extra movement.
// Full owner content (draft) on the owner's board and tiles: the content the play-test runs on. No behaviour changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { contentStatus } from '../../site/keep/content/schema.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { FX, setup, act, place, putHero, draws } from './helpers.js';

const M = contentStatus(ORIGINAL, FX).mixed; // what "Play-test my content" plays
const EMPTY = Array(12).fill('ROOM_013');
const go = (g, type, fields = {}) => act(g, type, fields, M);
const since = (g, n, kind) => g.log.slice(n).filter(e => e.kind === kind);
const L = g => legalActions(g, M);

// ---- Decision 6. Solo: the hero stays in the lair and collects; the awake card is on top; the only revealed tile next to
// the lair is (4,4), directly north of the chamber square (4,5), placed unturned (its entry side faces the lair).
function driven(tile, { script = [], ring = null, rot = 0 } = {}) {
  let g = setup({ content: M, heroes: ['HERO_1'], script: [1, ...script], deckOrders: { ROOM: EMPTY, DRAGON: ['DRAGON_8'] } });
  putHero(g, 0, '4,5');
  g.heroes[0].status = 'EXPLORING';
  g.board.chamberPlaced = true;
  place(g, '4,4', tile, rot);
  if (ring) g.seats[0].ringId = ring;
  g = go(g, 'COLLECT');
  assert.equal(g.phase, 'FORCED_MOVE', `${tile}: the wake asks for the forced move`);
  assert.deepEqual(L(g), [{ type: 'FORCED_MOVE', seat: 0, to: '4,4' }]);
  const room = [...g.decks.ROOM.order], n = g.log.length;
  return { g: go(g, 'FORCED_MOVE', { to: '4,4' }), room, n };
}
// No room card in any case: the room deck is untouched and nothing was drawn from it.
function noRoomCard({ g, room, n }, what) {
  assert.deepEqual(g.decks.ROOM.order, room, `${what}: room deck unchanged`);
  assert.equal(since(g, n, 'draw').filter(e => e.deck === 'ROOM').length, 0, `${what}: no room draw logged`);
  assert.equal(since(g, n, 'resolve-card').length, 0, `${what}: no card resolved`);
  assert.deepEqual(draws(g, 'ROOM'), [], `${what}: no room card all game`);
}

test('spec v11 decision 6: a black-dot room (TILE_006): no room card; nothing else happens; the next turn is an ordinary one', () => {
  const r = driven('TILE_006');
  noRoomCard(r, 'black');
  assert.deepEqual(r.g.heroes[0].coord, { x: 4, y: 4 });
  assert.deepEqual(r.g.heroes[0].conditions, []);
  assert.equal(r.g.phase, 'CHOOSE_ACTION', 'solo: the next turn starts with a free choice');
  assert.ok(L(r.g).some(a => a.type === 'SEARCH'), 'the room may be searched on that turn as usual');
});

test('spec v11 decision 6: a red-dot room (TILE_021): no room card; the portcullis falls behind the driven hero, on the edge toward the lair', () => {
  const r = driven('TILE_021');
  noRoomCard(r, 'red');
  assert.equal(r.g.board.edges['4,4|S'], 'gate', 'the red mark drops a portcullis on the entry edge (RB 6.1, 6.7)');
  assert.equal(since(r.g, r.n, 'gate-falls').length, 1);
});

test('spec v11 decision 6: a yellow corridor (TILE_027): no room card and no continued movement (it is not the hero\'s own move)', () => {
  const r = driven('TILE_027');
  noRoomCard(r, 'yellow');
  assert.equal(since(r.g, r.n, 'may-continue').length, 0, 'no yellow-corridor continue');
  assert.equal(r.g.phase, 'CHOOSE_ACTION', 'the wake ends the turn; the next turn starts fresh');
  assert.equal(r.g.sun, 2);
});

test('spec v11 decision 6: a dark room (TILE_013): no room card; the dark state is set, so the next turn starts with the D6 exit roll', () => {
  const r = driven('TILE_013');
  noRoomCard(r, 'dark');
  assert.ok(r.g.heroes[0].conditions.some(c => c.id === 'dark'));
  assert.deepEqual([r.g.phase, r.g.pending?.kind], ['TURN_START', 'dark']);
  assert.deepEqual(L(r.g).map(a => a.type), ['ROLL_DARK_EXIT']);
});

test('spec v11 decision 6: rubble (TILE_015): no room card; the hero is stopped in the rubble (go back or force through next turn)', () => {
  const r = driven('TILE_015');
  noRoomCard(r, 'rubble');
  assert.ok(r.g.heroes[0].conditions.some(c => c.id === 'rubble'));
  assert.deepEqual(r.g.heroes[0].roomState, { special: 'rubble', entryEdge: 'S', arrivalDir: 'N' });
  assert.deepEqual([r.g.phase, r.g.pending?.kind], ['TURN_START', 'rubble']);
});

test('spec v11 decision 6: a well (TILE_017): no room card; the Agility test on entry: a pass clings to the near edge, a fail is death', () => {
  const pass = driven('TILE_017', { script: [1] }); // D12 1 against Agility 4
  noRoomCard(pass, 'well, pass');
  const t = since(pass.g, pass.n, 'test');
  assert.deepEqual(t.map(e => [e.reason, e.stat, e.pass]), [['well entry', 'AGI', true]]);
  assert.deepEqual(pass.g.heroes[0].roomState, { special: 'well', entryEdge: 'S', phase: 'AT_NEAR_EDGE' });
  assert.deepEqual([pass.g.phase, pass.g.pending?.kind], ['TURN_START', 'well-edge']);
  const fail = driven('TILE_017', { script: [12] });
  noRoomCard(fail, 'well, fail');
  assert.equal(fail.g.heroes[0].status, 'DEAD');
  assert.equal(fail.g.status, 'over', 'solo: the only hero died');
});

test('spec v11 decision 6: the rotating room (TILE_014): no room card; it turns a quarter, or with the Protection Ring unused the ring prompt comes first', () => {
  const plain = driven('TILE_014');
  noRoomCard(plain, 'rotating');
  assert.equal(plain.g.board.tiles['4,4'].rotation, 90);
  const ringed = driven('TILE_014', { ring: 'RING_4' });
  assert.deepEqual([ringed.g.pending?.kind, ringed.g.pending?.via], ['rotation-ring', 'forced']);
  assert.equal(ringed.g.board.tiles['4,4'].rotation, 0, 'not turned before the choice');
  for (const use of [true, false]) {
    const g = go(ringed.g, use ? 'USE_RING' : 'DECLINE_RING');
    noRoomCard({ ...ringed, g }, `rotating, ring ${use ? 'used' : 'kept'}`);
    assert.equal(g.board.tiles['4,4'].rotation, use ? 0 : 90);
    assert.equal(g.wake, null, 'the wake finished after the choice');
  }
});

// ---- Decision 7. The hero left the lair north into a black room (4,4) and met a dark elf (S09); MONSTER_003 has S09's
// Flee reaction "flight succeeds", so the flight goes back into the lair square it came from.
function fleeBack({ dragon = ['DRAGON_1'], players = 1, awake = false, script = [] } = {}) {
  let g = setup({ players, content: M, heroes: ['HERO_1', 'HERO_2'], script, deckOrders: { ROOM: ['ROOM_019', ...EMPTY], MONSTER: ['MONSTER_003'], DRAGON: dragon } });
  putHero(g, 0, '4,5');
  g.heroes[0].status = 'EXPLORING';
  g.board.chamberPlaced = true;
  place(g, '4,4', 'TILE_006');
  if (awake) { // seat 1 stuck in the lair keeps the dragon awake (D40)
    putHero(g, 1, '5,5');
    g.heroes[1].status = 'EXPLORING';
    g.dragon.aside.push(g.dragon.remaining.shift());
    g.dragon.awake = true;
  }
  g = go(g, 'MOVE', { dir: 'N', from: '4,5' });
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.ok(L(g).some(a => a.type === 'RESPOND' && a.choice === 'flee'), 'the way back into the lair is open');
  const n = g.log.length, sun = g.sun;
  g = go(g, 'RESPOND', { choice: 'flee' });
  if (players > 1) g = go(g, 'ANNOUNCE');
  return { g, n, sun };
}

test('spec v11 decision 7: dragon asleep: the flight back into the lair draws two chamber cards and a dragon card, as a normal entry; then the turn ends', () => {
  const { g, n, sun } = fleeBack();
  assert.deepEqual(since(g, n, 'flight').map(e => e.to), ['4,5']);
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 5 });
  const d = since(g, n, 'draw');
  assert.deepEqual(d.map(e => e.deck), ['MONSTER', 'TREASURY', 'TREASURY', 'DRAGON'], 'two chamber cards, then one dragon card');
  assert.equal(g.heroes[0].treasury.length, 2);
  assert.deepEqual(since(g, n, 'dragon-odds').map(e => [e.awake, e.remaining]), [[1, 8]]);
  assert.equal(d.filter(e => e.deck === 'ROOM').length, 0, 'no room card on the flight');
  assert.equal(since(g, n, 'may-continue').length, 0, 'no further movement');
  assert.deepEqual([g.sun, g.phase, g.activeSeat], [sun + 1, 'CHOOSE_ACTION', 0], 'solo: the turn ended; the next one starts');
});

test('spec v11 decision 7: dragon awake: the flight back into the lair draws no treasure and no dragon card, and does not reset the dragon', () => {
  const { g, n } = fleeBack({ players: 2, awake: true });
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 5 });
  assert.deepEqual(since(g, n, 'draw').map(e => e.deck), ['MONSTER'], 'only the monster card');
  assert.equal(since(g, n, 'dragon-awake-no-collect').length, 1);
  assert.equal(g.heroes[0].treasury.length, 0);
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.aside.length], [true, 0, 1]);
  assert.equal(since(g, n, 'may-continue').length, 0);
  assert.equal(g.activeSeat, 1, 'the turn passed to the next seat');
});

test('spec v11 decision 7: the dragon card drawn on the flight is the awake one: the normal wake (treasure lost, D12 fire, forced move), then the turn ends', () => {
  let { g, n, sun } = fleeBack({ dragon: ['DRAGON_8'], script: [3] });
  assert.ok(since(g, n, 'dragon-wakes').length === 1);
  assert.equal(g.heroes[0].treasury.length, 0, 'the two chamber cards just drawn are lost');
  assert.deepEqual(since(g, n, 'damage').map(e => e.reason), ['dragon fire (D12)']);
  assert.deepEqual([g.phase, g.pending?.kind, g.pending?.targets], ['FORCED_MOVE', 'forced-move', ['4,4']], 'driven out to the revealed tile next to the lair');
  g = go(g, 'FORCED_MOVE', { to: '4,4' });
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 4 });
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.remaining.length], [false, 1, 8], 'the lair is empty: the deck resets as before');
  assert.equal(since(g, n, 'draw').filter(e => e.deck === 'ROOM').length, 0, 'no room card on the flight or the forced move');
  assert.equal(since(g, n, 'may-continue').length, 0);
  assert.deepEqual([g.sun, g.phase], [sun + 1, 'CHOOSE_ACTION']);
});

// ---- Labels (spec v11): the approvals are named in the card notes in words; no Status label changed; physical details stay
// flagged; the rule switches keep their documented defaults and have no control; every entry stays draft.
test('spec v11 labels: notes name the approvals, the coins stay PROVISIONAL/INFERRED, the switches keep their defaults, everything approved (spec v13 and v14)', async () => {
  const { DEFAULT_RULES } = await import('../../site/keep/engine/reducer.js');
  assert.deepEqual(DEFAULT_RULES, { darkRoomPolicy: 'ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY', forcedMoveTileEffects: true, soloCombat: 'target', towerAtSunsetCountsAsEscape: false, escapeWithoutExploring: false, soloMonsterHp: 'visible', rotatingRoomRing: 'every-entry' }, 'decision 9: documented defaults preserved');
  const all = Object.values(ORIGINAL).filter(Array.isArray).flat();
  const notes = id => all.find(e => e.id === id).notes;
  for (const id of ['ROOM_003', 'ROOM_005', 'ROOM_007', 'ROOM_015', 'ROOM_025', 'SEARCH_005']) assert.match(notes(id), /owner-approved interpretation,? \(?owner spec v11, 2026-11-20/, id);
  assert.match(notes('ROOM_004'), /Status: DIRECT 2023 CARD .*supported by the card instructions, owner spec v11/);
  assert.match(notes('RSEARCH_003'), /supported by the printed rules .*spec v11/);
  for (const id of ['ROOM_003', 'ROOM_005']) assert.match(notes(id), /Status: 1985-SUPPORTED INTERPRETATION/, `${id}: trap classification label unchanged`);
  for (let v = 13; v <= 33; v++) assert.match(notes(`TREASURY_0${v}`), /Status: PROVISIONAL\/INFERRED/, 'coins not directly verified');
  assert.ok(!all.some(e => typeof e.notes === 'string' && e.notes.includes('OWNER DECISION REQUIRED')));
  assert.equal(all.filter(e => e.status === 'DRAFT').length, 0, 'spec v14: nothing is draft');
});
