// Acceptance tests for the owner's specification v3 (docs/plans/spec-v3-owner-2026-11-19.md).
// Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../site/keep/engine/view.js';
import { edgeKind } from '../../site/keep/engine/board.js';
import { FX, setup, act, acts, place, putHero, give, draws, slotsOf, EMPTY_ROOMS } from './helpers.js';

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

test('v3 portcullis: no Strength test to enter a red room; its room card; stored on the exact edge; D12 <= STR to cross; fail ends the turn; every crossing re-drops; other exits free; no Flee through it (spec v3 section 3)', () => {
  // Solo knight (STR 6) at (1,0); (1,1) will be a red CORNER entered from the north (open N and W after rotation).
  let g = setup({ tileOrder: [...slotsOf('FX_CORNER').slice(0, 1), ...slotsOf('FX_CROSS').slice(0, 1)], script: [7, 6, 2], deckOrders: { ROOM: ['FX_ROOM_EMPTY', 'FX_ROOM_EMPTY', 'FX_ROOM_MONSTER', 'FX_ROOM_EMPTY'], MONSTER: ['FX_MON_BRUTE'] } });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  const tests = s => s.log.filter(e => e.kind === 'test');
  assert.deepEqual(view(g, FX, 0).pendingTests, [], '(1) no test offered for a red room ahead');
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(g.board.tiles['1,1'].defId, 'FX_CORNER');
  assert.deepEqual(tests(g), [], '(1) entering a red room through a free passage rolls nothing');
  assert.deepEqual(draws(g, 'ROOM'), ['FX_ROOM_EMPTY#1'], '(2) its room card is drawn');
  assert.deepEqual(g.board.edges, { '1,0|S': 'gate' }, '(3) the portcullis is on the entry edge only');
  assert.equal(edgeKind(g, FX, { x: 1, y: 1 }, 'N'), 'gate');
  assert.equal(edgeKind(g, FX, { x: 1, y: 1 }, 'W'), 'unexplored', '(7) the other exit is untouched');
  // Next turn: the view shows the test before the roll (attribute, value, modifiers, die, success rule).
  const pt = view(g, FX, 0).pendingTests;
  assert.deepEqual(pt, [{ action: { type: 'MOVE', seat: 0, dir: 'N' }, die: 'D12', stat: 'STR', target: 6, modifiers: [], modifier: 0, reason: 'portcullis', success: 'D12 <= STR 6', passingRolls: 6 }]);
  // (6) D12 7 > 6: stays, the turn ends.
  g = act(g, 'MOVE', { dir: 'N' });
  assert.deepEqual(g.heroes[0].coord, { x: 1, y: 1 });
  assert.equal(g.sun, 3, 'turn over');
  const fail = tests(g).at(-1);
  assert.deepEqual([fail.roll, fail.pass, fail.arithmetic], [7, false, 'D12 7 = 7 > STR 6: fail'], 'the roll, the arithmetic and the result');
  assert.deepEqual(acts(g).filter(a => a.type === 'MOVE').map(a => a.dir).sort(), ['N', 'W'], '(6) retry or another exit');
  // (4, 5) D12 6 <= 6 crosses; the portcullis is still down behind.
  g = act(g, 'MOVE', { dir: 'N' });
  assert.deepEqual(g.heroes[0].coord, { x: 1, y: 0 });
  assert.equal(g.board.edges['1,0|S'], 'gate', '(5) not permanently opened');
  // (5) Crossing back is another test; re-entering the red room drops it again; a monster there: no Flee (8).
  g = act(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(tests(g).map(e => [e.reason, e.roll, e.pass]), [['portcullis', 7, false], ['portcullis', 6, true], ['portcullis', 2, true]]);
  assert.equal(g.log.filter(e => e.kind === 'gate-falls').length, 2);
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.deepEqual(acts(g).map(a => a.choice), ['attack', 'wait'], '(8) no Flee through the fallen portcullis');
});

test('v3 one test shape: well jump and rubble show attribute, modifiers with their source, die and rule before the roll; the log carries the same after (spec v3 section 3)', () => {
  let g = setup({ tileOrder: slotsOf('FX_WELL').slice(0, 1), script: [3, 5] });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  give(g, 0, 'TREASURY', 'FX_TREASURY_A');
  g = act(g, 'MOVE', { dir: 'S' }); // well entry: AGI 4, D12 3 passes
  assert.equal(g.log.find(e => e.kind === 'test').reason, 'well entry');
  const jump = view(g, FX, 0).pendingTests.find(t => t.action.type === 'WELL_JUMP');
  assert.deepEqual(jump.modifiers, [{ source: 'treasure chamber cards carried', value: 1 }]);
  assert.equal(jump.success, 'D12 + 1 (treasure chamber cards carried) <= AGI 4');
  assert.equal(jump.passingRolls, 3);
  g = act(g, 'WELL_JUMP');
  const t = g.log.filter(e => e.kind === 'test').at(-1);
  assert.deepEqual([t.roll, t.modifier, t.pass, t.arithmetic], [5, 1, false, 'D12 5 + 1 (treasure chamber cards carried) = 6 > AGI 4: fail']);
  const r = setup();
  place(r, '1,1', 'FX_RUBBLE');
  putHero(r, 0, '1,1');
  r.heroes[0].conditions.push({ id: 'rubble', turns: null });
  r.heroes[0].enteredFrom = 'N';
  r.turn.stage = 'act';
  r.phase = 'TURN_START';
  r.pending = { kind: 'rubble', seat: 0 };
  assert.deepEqual(view(r, FX, 0).pendingTests.map(x => [x.action.type, x.stat, x.success]), [['RUBBLE_FORCE', 'AGI', 'D12 <= AGI 4']]);
});
