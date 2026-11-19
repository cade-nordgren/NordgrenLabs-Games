// Acceptance tests for the owner's specification v3 (docs/plans/spec-v3-owner-2026-11-19.md).
// Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../site/keep/engine/view.js';
import { FX, setup, act, acts, place, putHero, EMPTY_ROOMS } from './helpers.js';

// Seat 0 at (1,0) steps S into a black room at (1,1) whose card is a monster.
function meet(monsterId, { players = 3, prep = () => {} } = {}) {
  const g = setup({ players, towers: [0, 1, 2], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: [monsterId] } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  prep(g);
  return act(g, 'MOVE', { dir: 'S' });
}

// Spec v3 section 2: no starting HP, remaining HP, proportion or damage tally in the hero's or a public view.
function assertNoMonsterSecrets(g, viewers) {
  for (const viewer of viewers) {
    const v = view(g, FX, viewer);
    const where = `${g.phase}, viewer ${viewer}`;
    assert.ok(!JSON.stringify(v).includes('FX_MON_'), `${where}: no monster card id (its HP is in the content)`);
    if (v.encounter?.monster) assert.deepEqual(Object.keys(v.encounter.monster), ['groupId'], `${where}: encounter.monster`);
    for (const e of v.log) {
      assert.ok(!('wounds' in e), `${where}: log ${e.kind} carries no damage tally`);
      if ('hp' in e) assert.ok(['damage', 'heal'].includes(e.kind), `${where}: only hero HP in the log (${e.kind})`);
    }
  }
}

test('v3 monster HP never reaches the hero or a public view at any step of an encounter; the controller has it; death is announced without HP (spec v3 section 2)', () => {
  // Three seats: hero 0, controller 2 (right-hand seat), bystander 1.
  let g = meet('FX_MON_BRUTE');
  const steps = [g];
  g = act(g, 'RESPOND', { choice: 'attack' });
  steps.push(g);
  assert.equal(view(g, FX, 2).encounter.monster.hp, 4, 'the monster player reads the HP');
  assert.equal(view(g, FX, 2).log.find(e => e.deck === 'MONSTER' && e.kind === 'draw').value, 'FX_MON_BRUTE#1');
  g = act(g, 'ANNOUNCE');
  steps.push(g);
  // Knight A hits B twice (fixture); two exchanges kill the 4-HP monster.
  for (let i = 0; i < 2; i++) {
    g = act(g, 'COMBAT_PICK', { side: 'hero', letter: 'A' });
    steps.push(g);
    g = act(g, 'COMBAT_PICK', { side: 'monster', letter: 'B' });
    steps.push(g);
    if (g.encounter) assert.equal(view(g, FX, 2).encounter.monster.wounds, 2, 'the controller tracks damage privately');
  }
  assert.equal(g.encounter, null, 'monster dead');
  for (const s of steps) assertNoMonsterSecrets(s, [0, 1, null]);
  const dead = view(g, FX, 0).log.find(e => e.kind === 'monster-dead');
  assert.deepEqual(Object.keys(dead).sort(), ['kind', 'round', 'seat', 'seq'], 'announced, with no HP figure');
  assert.equal(view(g, FX, 0).log.filter(e => e.kind === 'monster-wound').length, 2, 'each hit is still announced');
  // Solo: the computer is the monster player; the one human never sees it either (D37).
  let solo = meet('FX_MON_BRUTE', { players: 1 });
  const soloSteps = [solo];
  solo = act(solo, 'RESPOND', { choice: 'attack' });
  soloSteps.push(solo);
  solo = act(solo, 'TARGET_RESULT', { placement: 'inner', face: 'other' });
  soloSteps.push(solo);
  solo = act(solo, 'TARGET_RESULT', { placement: 'inner', face: 'other' });
  soloSteps.push(solo);
  assert.equal(solo.encounter, null, 'four damage on the target kills it');
  for (const s of soloSteps) assertNoMonsterSecrets(s, [0, null]);
});

test('v3 encounter choices: the card decides what each choice leads to; no Wait or Flee once an exchange is under way (spec v3 section 2)', () => {
  // The same Attack choice: combat for one card, the monster flees for another.
  const fight = act(act(meet('FX_MON_BRUTE'), 'RESPOND', { choice: 'attack' }), 'ANNOUNCE');
  assert.equal(fight.phase, 'COMBAT_SELECT');
  const shy = act(act(meet('FX_MON_SHY'), 'RESPOND', { choice: 'attack' }), 'ANNOUNCE');
  assert.equal(shy.encounter, null, 'Attack does not always start combat');
  assert.ok(!shy.log.some(e => e.kind === 'combat'));
  // During combat only A/B/C picks are legal: no Wait, no Flee.
  assert.ok(acts(fight).every(a => a.type === 'COMBAT_PICK'));
  const tie = act(act(fight, 'COMBAT_PICK', { side: 'hero', letter: 'C' }), 'COMBAT_PICK', { side: 'monster', letter: 'C' });
  assert.deepEqual(tie.encounter.combat.exchanges.at(-1), { hero: 'C', monster: 'C', heroDmg: 1, monsterDmg: 1 }, 'matching letters: 1 to both');
  assert.ok(acts(tie).every(a => a.type === 'COMBAT_PICK'), 'cards reused, still only picks');
  assert.equal(fight.encounter.combat.label, 'A/B/C combat');
});
