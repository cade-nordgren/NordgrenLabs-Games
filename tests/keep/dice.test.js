// Dice, PRNG and stat tests. T04 (SP 12 #4), plan 4.3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRng, roll, statPasses, testStat, shuffle } from '../../site/keep/engine/dice.js';
import { FX } from './helpers.js';

const stub = (seed, script = null) => ({ rng: newRng(seed, script), log: [] });
const knight = FX.heroes[0].stats, hunter = FX.heroes[1].stats; // RB 3 example stat lines, fixtures only

test('T04 stat test: D12 <= stat passes (RB 3, RB 5.1, SP 12 #4)', () => {
  const cases = [
    { cite: 'SP 12 #4, knight AGI 4', stat: knight.AGI, d12: 4, pass: true },
    { cite: 'SP 12 #4, knight AGI 4', stat: knight.AGI, d12: 5, pass: false },
    { cite: 'SP 12 #4, hunter AGI 9', stat: hunter.AGI, d12: 9, pass: true },
    { cite: 'SP 12 #4, hunter AGI 9', stat: hunter.AGI, d12: 10, pass: false },
    { cite: 'RB 3: AGI 9 passes 1..9', stat: 9, d12: 1, pass: true },
    { cite: 'RB 3', stat: 12, d12: 12, pass: true },
    { cite: 'RB 3', stat: 11, d12: 12, pass: false },
    { cite: 'RB 6.3 well jump: D12 + 2 treasury cards vs AGI 9', stat: 9, d12: 7, mod: 2, pass: true },
    { cite: 'RB 6.3', stat: 9, d12: 8, mod: 2, pass: false },
  ];
  for (const c of cases) assert.equal(statPasses(c.d12, c.stat, c.mod || 0), c.pass, `${c.cite}: ${c.d12} vs ${c.stat}`);
});

test('T04 testStat rolls a logged D12 and logs the test (RB 5.1, plan 4.3)', () => {
  const g = stub(1, [4, 5]);
  assert.deepEqual(testStat(g, 'AGI', 4, 'well entry'), { roll: 4, pass: true });
  assert.deepEqual(testStat(g, 'AGI', 4, 'well entry'), { roll: 5, pass: false });
  assert.deepEqual(g.log.map(e => e.kind), ['roll', 'test', 'roll', 'test']);
  assert.equal(g.log[0].reason, 'well entry');
  assert.equal(g.log[3].pass, false);
});

test('seeded PRNG: same seed same rolls, state lives in the object (plan 4.3, SP 11)', () => {
  const a = stub(42), b = stub(42), c = stub(43);
  const ra = Array.from({ length: 50 }, () => roll(a, 'D12', 't'));
  const rb = Array.from({ length: 50 }, () => roll(b, 'D12', 't'));
  const rc = Array.from({ length: 50 }, () => roll(c, 'D12', 't'));
  assert.deepEqual(ra, rb);
  assert.notDeepEqual(ra, rc);
  assert.equal(a.rng.state, b.rng.state);
  // Resuming from a copied state continues identically.
  const copy = structuredClone(a);
  assert.deepEqual([roll(a, 'D6', 'x'), roll(a, 'D6', 'x')], [roll(copy, 'D6', 'x'), roll(copy, 'D6', 'x')]);
});

test('dice ranges: D12 1..12 and D6 1..6, every face reachable (SP 2)', () => {
  const g = stub(9);
  for (const [die, sides] of [['D12', 12], ['D6', 6]]) {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = roll(g, die, 'range');
      assert.ok(Number.isInteger(v) && v >= 1 && v <= sides);
      seen.add(v);
    }
    assert.equal(seen.size, sides);
  }
  assert.equal(g.log.length, 4000); // every roll logged
});

test('scripted dice: consumed in order, never fall back to random (plan 4.3, plan 5)', () => {
  const g = stub(1, [3, 6]);
  assert.equal(roll(g, 'D12', 'a'), 3);
  assert.equal(roll(g, 'D6', 'b'), 6);
  assert.throws(() => roll(g, 'D12', 'c'), /script exhausted/);
  assert.throws(() => roll(stub(1, [7]), 'D6', 'd'), /out of range/);
  assert.throws(() => roll(stub(1), 'D20', 'e'), /Unknown die/);
});

test('shuffle is a logged permutation driven by the seed (RB 4, SP 3)', () => {
  const items = Array.from({ length: 88 }, (_, i) => i);
  const a = shuffle(stub(5), items, 'TILE'), b = shuffle(stub(5), items, 'TILE');
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), items);
  const g = stub(5);
  shuffle(g, items, 'TILE');
  assert.equal(g.log[0].kind, 'shuffle');
});
