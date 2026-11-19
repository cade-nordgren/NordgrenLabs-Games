// Deterministic replay and save/restore continuation (plan section 5, SP 11, SP 12 #29 engine part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, serialize, restore } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { FX, assertCensus } from './helpers.js';

// A deterministic chooser that varies its pick, so games wander the board.
const choose = (acts, i) => acts[(i * 7) % acts.length];

function playSeeded(seed, steps, from = null, startStep = 0) {
  let g = from || createGame({ players: ['A', 'B', 'C'], seed, content: FX });
  const actions = [];
  for (let i = startStep; i < startStep + steps && g.status !== 'over'; i++) {
    const a = choose(legalActions(g, FX), i);
    actions.push(a);
    g = reduce(g, a, FX);
  }
  return { g, actions };
}

test('same seed and same actions give the same state (plan 5, SP 11)', () => {
  const a = playSeeded(2024, 60), b = playSeeded(2024, 60);
  assert.deepEqual(a.actions, b.actions);
  assert.deepEqual(a.g, b.g);
  assert.ok(a.g.log.some(e => e.kind === 'reveal'), 'tiles were revealed');
  // Replaying the recorded actions from a fresh game reproduces the state exactly.
  const replayed = a.actions.reduce((g, act) => reduce(g, act, FX), createGame({ players: ['A', 'B', 'C'], seed: 2024, content: FX }));
  assert.deepEqual(replayed, a.g);
  assert.notDeepEqual(playSeeded(2025, 60).g.board, a.g.board, 'a different seed gives a different game');
});

test('save, restore and continue gives an identical continuation (SP 11, SP 12 #29)', () => {
  const first = playSeeded(77, 25);
  const text = serialize(first.g);
  const restored = restore(text, FX);
  assert.deepEqual(restored, first.g);
  const live = playSeeded(77, 40, first.g, 25);
  const resumed = playSeeded(77, 40, restored, 25);
  assert.deepEqual(resumed.actions, live.actions);
  assert.equal(serialize(resumed.g), serialize(live.g));
});

test('restore rejects foreign content and bad versions; reduce never mutates its input (BG contract 3, plan 4.3)', () => {
  const g = playSeeded(5, 10).g;
  const otherContent = { ...FX, heroes: FX.heroes.slice(0, 7) };
  assert.throws(() => restore(serialize(g), otherContent), /different content/);
  assert.throws(() => restore(JSON.stringify({ ...g, schemaVersion: 99 }), FX), /version/);
  const before = serialize(g);
  reduce(g, legalActions(g, FX)[0], FX);
  assert.equal(serialize(g), before);
});

test('every die roll and draw is in the event log (plan 4.3, SP 11)', () => {
  const g = playSeeded(31, 50).g;
  const reveals = g.log.filter(e => e.kind === 'reveal').length;
  assert.equal(g.log.filter(e => e.kind === 'draw' && e.deck === 'TILE').length, reveals);
  assert.equal(Object.keys(g.board.tiles).length, reveals);
  assert.equal(g.board.tileBag.length, 104 - reveals); // NON-AUTHENTIC fixture bag: one tile per maze square
  assert.ok(g.log.filter(e => e.kind === 'roll').length >= 3, 'first-player rolls logged');
  assert.deepEqual(g.log.map(e => e.seq), g.log.map((_, i) => i + 1));
});

test('random full games: every card copy stays accounted for, no action ever throws, games end, saves stay small (RB 7.4, SP 11, plan 4.8)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const players = 1 + (seed % 4);
    let g = createGame({ players: Array.from({ length: players }, (_, i) => `P${i}`), seed, content: FX, rules: seed % 3 ? {} : { soloCombat: 'abc-digital-variant', darkRoomPolicy: 'EVERY_ENTRY' } });
    let steps = 0;
    while (g.status !== 'over') {
      const legal = legalActions(g, FX);
      assert.ok(legal.length, `seed ${seed}: a playing game always has a legal action (${g.phase})`);
      g = reduce(g, legal[(steps * 7 + seed) % legal.length], FX);
      if (g.status === 'playing') assertCensus(assert, g);
      assert.ok(++steps < 20000, `seed ${seed}: the game ends`);
    }
    assert.ok(g.sun <= 27);
    assert.ok(serialize(g).length < 200 * 1024, `seed ${seed}: ${serialize(g).length} bytes, under the 200 KB budget`);
  }
});
