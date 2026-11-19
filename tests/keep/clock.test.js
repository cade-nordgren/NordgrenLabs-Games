// Sun clock, turn order, escape and winning. T05, T05b, T27, T27b, T27c.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { ranking, SUNSET } from '../../site/keep/engine/clock.js';
import { FX, setup, move, stop, run, slotsOf, withWalledTowers } from './helpers.js';

// Play until over, always taking the first legal action; returns the final game.
function playOut(g, content) {
  while (g.status === 'playing') g = reduce(g, legalActions(g, content)[0], content);
  return g;
}
const turnsBySeat = g => g.log.filter(e => e.kind === 'turn').reduce((m, e) => ({ ...m, [e.seat]: (m[e.seat] || 0) + 1 }), {});

test('T05 sun: exactly 26 turns per hero, sun 27 ends the game, heroes inside lost (RB 1, SP 4, SP 10, SP 12 #5, D02)', () => {
  const content = withWalledTowers([0, 1, 2, 3]); // nobody can move: every turn is a forced skip
  const cases = [
    { cite: 'SP 12 #5 solo', players: 1, towers: [0] },
    { cite: 'SP 12 #5 two players', players: 2, towers: [0, 1] },
    { cite: 'SP 12 #5 four players, first player seat 2', players: 4, towers: [0, 1, 2, 3], firstRolls: [1, 2, 12, 3] },
  ];
  for (const c of cases) {
    const start = setup({ players: c.players, content, towers: c.towers, firstRolls: c.firstRolls });
    assert.equal(start.sun, 1, 'round 1 is played at sun 1');
    const g = playOut(start, content);
    const turns = turnsBySeat(g);
    for (let s = 0; s < c.players; s++) assert.equal(turns[s], 26, `${c.cite}: seat ${s} has 26 turns, not 25 or 27`);
    assert.equal(SUNSET, 27);
    assert.equal(g.sun, 27);
    assert.equal(g.round, 27);
    assert.equal(Math.max(...g.log.filter(e => e.kind === 'turn').map(e => e.sun)), 26, 'no turn at sun 27');
    assert.equal(g.phase, 'SUNSET_GAME_OVER');
    assert.ok(g.heroes.every(h => h.status === 'READY_IN_START_TOWER' && h.endResult === 'INSIDE_AT_SUNSET'), 'never left the start tower: not escaped, not dead');
    assert.equal(g.result.castleWins, true);
    assert.deepEqual(legalActions(g, content), [], 'no action after sunset');
  }
});

test('T05 turn order is clockwise from the first player every round (RB 5, SP 4)', () => {
  const content = withWalledTowers([0, 1, 2, 3]);
  const g = playOut(setup({ players: 3, content, towers: [0, 1, 2], firstRolls: [4, 10, 2] }), content);
  const seats = g.log.filter(e => e.kind === 'turn').slice(0, 6).map(e => e.seat);
  assert.deepEqual(seats, [1, 2, 0, 1, 2, 0]);
});

test('T05b the sun still advances per round after the first player escapes (D30); escaped heroes take no more turns (spec v2)', () => {
  const content = withWalledTowers([1]);
  let g = setup({ players: 2, content, towers: [0, 1], tileOrder: slotsOf('FX_CROSS').slice(0, 2) });
  assert.equal(g.firstSeat, 0);
  g = run(g, [move(g, 'E')], content); // seat 0 leaves the tower
  g = run(g, [{ type: 'FORCED_SKIP', seat: 1 }], content);
  g = run(g, [move(g, 'W'), { type: 'TOWER_CHOICE', seat: 0, choice: 'ESCAPE' }], content); // back into its start tower, chooses Escape
  assert.equal(g.heroes[0].status, 'ESCAPED');
  const escapedAt = g.log.length;
  g = playOut(g, content);
  assert.ok(g.log.slice(escapedAt).filter(e => e.kind === 'turn').every(e => e.seat === 1), 'escaped seat takes no more turns');
  assert.equal(turnsBySeat(g)[1], 26);
  assert.equal(g.sun, 27);
  assert.deepEqual(g.result.winners, [0], 'the single escapee wins');
  assert.deepEqual([g.heroes[1].status, g.heroes[1].endResult], ['READY_IN_START_TOWER', 'INSIDE_AT_SUNSET']);
});

test('T27 escape through any tower ends the game when nobody is left inside (RB 1, RB 12, SP 10, SP 12 #27)', () => {
  // From tower (0,0) south through nine straights (yellow corridors, M2) to tower (0,10), stopping each turn.
  let g = setup({ tileOrder: slotsOf('FX_STRAIGHT').slice(0, 9) });
  for (let i = 0; i < 9; i++) g = run(g, [move(g, 'S'), stop(g)]);
  assert.equal(g.heroes[0].status, 'EXPLORING');
  assert.equal(g.sun, 10);
  g = run(g, [move(g, 'S')]);
  assert.equal(g.phase, 'TOWER_CHOICE', 'entering a tower offers the choice; it never forces escape');
  g = run(g, [{ type: 'TOWER_CHOICE', seat: 0, choice: 'ESCAPE' }]);
  assert.equal(g.heroes[0].status, 'ESCAPED');
  assert.deepEqual(g.heroes[0].coord, { x: 0, y: 10 }, 'a different tower from the start');
  assert.equal(g.status, 'over');
  assert.equal(g.phase, 'GAME_OVER');
  assert.deepEqual(g.result.winners, [0]);
  assert.equal(g.result.castleWins, false);
});

test('T27c a setup hero is never escaped; no Escape is offered before leaving (spec v2, D33)', () => {
  const g = setup({ players: 2, towers: [0, 0] });
  assert.ok(g.heroes.every(h => h.status === 'READY_IN_START_TOWER'));
  assert.ok(legalActions(g, FX).every(a => a.type === 'MOVE'), 'no way to stay and escape');
});

test('T27, T27b ranking: escapees only, highest gold wins, ties share, none means the castle wins (RB 1, SP 10, D01)', () => {
  const e = (seat, status, gold) => ({ seat, heroId: `H${seat}`, status, gold });
  const cases = [
    { cite: 'RB 1: one escapee wins outright', entries: [e(0, 'ESCAPED', 5), e(1, 'DEAD', 900), e(2, 'IN_TOWER_NOT_ESCAPED', 300)], winners: [0], castle: false, shared: false },
    { cite: 'RB 1: highest gold among escapees', entries: [e(0, 'ESCAPED', 40), e(1, 'ESCAPED', 75), e(2, 'ESCAPED', 10)], winners: [1], castle: false, shared: false },
    { cite: 'RB 1: never entering the center is fine (ranking ignores it)', entries: [e(0, 'ESCAPED', 0), e(1, 'DEAD', 50)], winners: [0], castle: false, shared: false },
    { cite: 'D01 house rule: equal top gold, co-winners', entries: [e(0, 'ESCAPED', 60), e(1, 'ESCAPED', 60), e(2, 'ESCAPED', 20)], winners: [0, 1], castle: false, shared: true },
    { cite: 'RB 1: zero escapees, castle wins', entries: [e(0, 'DEAD', 10), e(1, 'IN_TOWER_NOT_ESCAPED', 99)], winners: [], castle: true, shared: false },
  ];
  for (const c of cases) {
    const r = ranking(c.entries);
    assert.deepEqual(r.winners, c.winners, c.cite);
    assert.equal(r.castleWins, c.castle, c.cite);
    assert.equal(r.shared, c.shared, c.cite);
  }
});
