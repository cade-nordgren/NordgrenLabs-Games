// Central chamber and the shared dragon deck. T24, T24b, T25, T26, T26b (SP 12 #24-#26).
// Fixture treasure and dragon cards are NON-AUTHENTIC TEST DATA (dragon kinds follow RB 9 structure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wakeOdds, forcedMoveTargets } from '../../site/keep/engine/treasury.js';
import { view } from '../../site/keep/engine/view.js';
import { FX, setup, acts, act, types, place, putHero, draws, assertCensus, EMPTY_ROOMS } from './helpers.js';

const SLEEPING7 = Array(7).fill('FX_DRAGON_SLEEPING');
const odds = g => g.log.filter(e => e.kind === 'dragon-odds').map(e => `${e.awake}/${e.remaining}`);

// Heroes standing north of the chamber over (4,5) and (5,5) (D39); seat 0 at (4,4).
function nearChamber({ players = 1, dragon = SLEEPING7, script = [], rules = {}, treasury, tiles = {} } = {}) {
  const g = setup({ players, towers: [0, 1, 2, 3], script, rules, deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: [dragon], ...(treasury ? { TREASURY: treasury } : {}) } });
  place(g, '4,4', 'FX_CROSS');
  for (const [at, id] of Object.entries(tiles)) place(g, at, id);
  putHero(g, 0, '4,4');
  return g;
}

test('T25 entering the chamber: tile placed, two private treasure cards and one dragon card, no room card; staying repeats it; leaving draws nothing (RB 9.1, SP 8, SP 12 #25, D18, D31)', () => {
  let g = nearChamber({ treasury: ['FX_TREASURY_B', 'FX_TREASURY_C', 'FX_TREASURY_A', 'FX_TREASURY_A'] });
  assert.equal(g.board.chamberPlaced, false);
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(g.board.chamberPlaced, true, 'placed during the entry turn');
  assert.deepEqual(draws(g, 'ROOM'), [], 'D31: no room card in the chamber');
  assert.deepEqual(g.heroes[0].treasury, ['FX_TREASURY_B#1', 'FX_TREASURY_C#1']);
  assert.ok(g.log.filter(e => e.deck === 'TREASURY' && e.kind === 'draw').every(e => e.private === 0), 'private to the collector');
  assert.equal(draws(g, 'DRAGON').length, 1);
  assert.equal(g.dragon.remaining.length, 7);
  assert.equal(g.sun, 2, 'a sleeping card ends the turn');
  assert.deepEqual(types(g).sort(), ['COLLECT', 'MOVE']);
  g = act(g, 'COLLECT');
  assert.equal(g.heroes[0].treasury.length, 4);
  assert.equal(g.dragon.remaining.length, 6);
  const out = act(g, 'MOVE', { dir: 'N' });
  assert.equal(draws(out, 'TREASURY').length, 4, 'RB 9.1: no treasure on the leaving turn');
  assert.equal(draws(out, 'DRAGON').length, 2, 'and no dragon card');
  assert.equal(out.heroes[0].treasury.length, 4, 'collected cards are kept');
  assertCensus(assert, out);
});

test('T24 dragon deck: 7 sleeping, 1 awake, no replacement, odds 1/8 down to 1/1 (RB 9.1, RB 9.3, SP 8, SP 12 #24)', () => {
  let g = nearChamber({ script: [3] });
  assert.deepEqual(wakeOdds(g, FX), { awake: 1, remaining: 8 });
  assert.deepEqual(FX.dragon.map(d => [d.kind, d.copies]), [['sleeping', 7], ['awake', 1]]);
  g = act(g, 'MOVE', { dir: 'S' });
  for (let i = 0; i < 7; i++) g = act(g, 'COLLECT');
  assert.deepEqual(odds(g), ['1/8', '1/7', '1/6', '1/5', '1/4', '1/3', '1/2', '1/1']);
  assert.equal(new Set(g.log.filter(e => e.kind === 'draw' && e.deck === 'DRAGON').map(e => e.value)).size, 8, 'never the same card twice');
  assert.ok(g.log.some(e => e.kind === 'dragon-wakes'), 'the eighth draw is the awake card');
  // RB 9.3: chance of waking by the n-th draw from a fresh deck is n/8.
  for (let n = 1; n <= 8; n++) {
    let safe = 1;
    for (let k = 8; k > 8 - n; k--) safe *= 1 - 1 / k;
    assert.ok(Math.abs(1 - safe - n / 8) < 1e-12, `n=${n}`);
  }
});

test('T24 one dragon deck shared by every hero in the chamber (RB 9.1, SP 8)', () => {
  let g = nearChamber({ players: 2 });
  putHero(g, 1, '4,5');
  g.board.chamberPlaced = true;
  g = act(g, 'MOVE', { dir: 'S' }); // seat 0 enters: 1/8
  g = act(g, 'COLLECT');            // seat 1 stays: 1/7
  g = act(g, 'COLLECT');            // seat 0: 1/6
  g = act(g, 'COLLECT');            // seat 1: 1/5
  assert.deepEqual(odds(g), ['1/8', '1/7', '1/6', '1/5']);
  assert.deepEqual(g.log.filter(e => e.kind === 'dragon-odds').map((e, i) => g.log.slice(0, g.log.indexOf(e)).filter(x => x.kind === 'turn').at(-1).seat), [0, 1, 0, 1]);
});

test('T24b the dragon deck resets when the chamber empties, also after voluntary exits (D22)', () => {
  let g = nearChamber({ players: 2 });
  putHero(g, 1, '4,5');
  g.board.chamberPlaced = true;
  g = act(g, 'MOVE', { dir: 'S' }); // seat 0 in: 7 left
  g = act(g, 'COLLECT');            // seat 1: 6 left
  g = act(g, 'MOVE', { dir: 'N' }); // seat 0 leaves; seat 1 still inside
  assert.equal(g.dragon.remaining.length, 6, 'no reset while someone is inside');
  g = act(g, 'MOVE', { dir: 'E' }); // seat 1 leaves into (5,5): unexplored, a tile is revealed
  assert.equal(g.dragon.remaining.length, 8);
  assert.equal(g.dragon.resets, 1);
  assert.deepEqual(g.dragon.aside, []);
});

test('T26 the wake: waker first then clockwise; treasure-chamber cards to the bottom; full D12; forced move to a revealed adjacent tile, no room card; then reset (RB 9.2, SP 8, SP 12 #26, D19)', () => {
  // Seat 0 is already in the chamber; seat 1 (hunter, 10 HP) walks in and draws the awake card.
  let g = nearChamber({ players: 2, dragon: ['FX_DRAGON_SLEEPING', 'FX_DRAGON_AWAKE'], script: [5, 7], tiles: { '4,6': 'FX_CROSS', '6,5': 'FX_CROSS' } });
  putHero(g, 0, '4,5');
  putHero(g, 1, '4,4');
  g.board.chamberPlaced = true;
  g = act(g, 'COLLECT');            // seat 0 stays: sleeping
  const seat0Cards = [...g.heroes[0].treasury];
  g = act(g, 'MOVE', { dir: 'S' }); // seat 1 enters: two cards, then the awake card
  const seat1Cards = draws(g, 'TREASURY').slice(-2); // drawn on entry, already returned by the wake
  assert.ok(g.log.some(e => e.kind === 'dragon-wakes' && e.waker === 1 && e.queue.join() === '1,0'));
  assert.equal(g.phase, 'FORCED_MOVE');
  assert.deepEqual(g.heroes[1].treasury, [], 'waker lost the chamber cards');
  assert.equal(g.heroes[1].hp, 5, 'straight D12 = 5, no Luck');
  // (3,5), (5,4) and (5,6) are unexplored.
  assert.deepEqual(g.pending.targets, ['4,4', '4,6', '6,5'], 'only revealed maze tiles next to the chamber, never unexplored ones');
  assert.deepEqual(acts(g).map(a => a.seat), [1, 1, 1], 'outside turn order, the waker moves first');
  g = act(g, 'FORCED_MOVE', { to: '6,5' });
  assert.deepEqual(g.heroes[1].coord, { x: 6, y: 5 });
  assert.equal(g.heroes[0].hp, 10, 'then seat 0: 17 - 7');
  assert.deepEqual(g.pending.targets, ['4,4', '4,6'], '(6,5) is occupied now');
  g = act(g, 'FORCED_MOVE', { to: '4,4' });
  assert.deepEqual(draws(g, 'ROOM'), [], 'no room card for either forced move');
  assert.deepEqual(g.decks.TREASURY.order.slice(-4), [...seat1Cards, ...seat0Cards], 'waker\'s cards first, then clockwise');
  assert.equal(g.dragon.remaining.length, 8, 'all eight back after the evacuation');
  assert.equal(g.dragon.resets, 1);
  assert.equal(g.activeSeat, 0, 'turn order resumes after the waker');
  assert.equal(g.sun, 2);
  assertCensus(assert, g);
});

test('T26b no legal adjacent tile: the hero stays put with the dragon awake, no reset until the chamber is empty; a D12 can kill (D19 stay-put, D40)', () => {
  let g = nearChamber({ dragon: ['FX_DRAGON_AWAKE'], script: [3] });
  g.board.tiles = {};
  putHero(g, 0, '4,5');
  g.board.chamberPlaced = true;
  assert.deepEqual(forcedMoveTargets(g, FX), []);
  g = act(g, 'COLLECT');
  assert.ok(g.log.some(e => e.kind === 'forced-move-none' && e.seat === 0));
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 5 }, 'stays in the chamber');
  assert.equal(g.heroes[0].hp, 14);
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.remaining.length], [true, 0, 7], 'D40: still awake, no reset while a hero is inside');
  assert.ok(g.log.some(e => e.kind === 'dragon-stays-awake' && e.seats.join() === '0'));
  // Next turn: no Stay and collect, with the reason; leaving by an ordinary move empties the chamber and resets the deck.
  assert.ok(!types(g).includes('COLLECT'));
  assert.match(view(g, FX, 0).collectUnavailable, /dragon is awake/);
  assert.equal(view(g, FX, 0).dragon.awake, true);
  g = act(g, 'MOVE', { dir: 'N' }); // (4,4) is unexplored: a normal move reveals it
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 4 });
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.remaining.length], [false, 1, 8], 'reset the moment the chamber is empty');
  assert.equal(view(g, FX, 0).collectUnavailable, null);

  let k = nearChamber({ dragon: ['FX_DRAGON_AWAKE'], script: [12] });
  k.heroes[0].hp = 5;
  k = act(k, 'MOVE', { dir: 'S' });
  assert.equal(k.heroes[0].status, 'DEAD', 'dragon fire 12 kills a 5-HP hero');
  assert.ok(!k.log.some(e => e.kind === 'forced-move-none'), 'no forced move for the dead');
  assert.equal(k.status, 'over');
});

test('plan 13 #3 default: tile effects at the forced-move target apply as for flight; rules flag off skips them (D16 analogy, provisional)', () => {
  for (const flag of [true, false]) {
    let g = nearChamber({ dragon: ['FX_DRAGON_AWAKE'], script: [2], rules: { forcedMoveTileEffects: flag } });
    g.board.tiles = {};
    place(g, '4,4', 'FX_DARK'); // N and S open
    putHero(g, 0, '4,5');
    g.board.chamberPlaced = true;
    g = act(g, 'COLLECT');
    g = act(g, 'FORCED_MOVE', { to: '4,4' });
    assert.equal(g.heroes[0].conditions.some(c => c.id === 'dark'), flag, `flag ${flag}`);
    assert.equal(g.phase, flag ? 'TURN_START' : 'CHOOSE_ACTION', `flag ${flag}`);
  }
});
