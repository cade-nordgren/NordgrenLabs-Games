// Setup: player count, first player, drafts, towers, rules config. T02, T03, T03b, T30 (start gate part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, DEFAULT_RULES, RULE_TAGS, AUTHORITY_TAGS } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { validateContent } from '../../site/keep/content/schema.js';
import { FX, setup } from './helpers.js';

const names = n => Array.from({ length: n }, (_, i) => `P${i + 1}`);

test('T02 player count: 1 to 4 accepted, 0 and 5 rejected (RB 1, SP 2, SP 12 #2)', () => {
  const cases = [
    { cite: 'SP 12 #2', players: 1, ok: true },
    { cite: 'SP 12 #2', players: 2, ok: true },
    { cite: 'SP 12 #2', players: 3, ok: true },
    { cite: 'SP 12 #2', players: 4, ok: true },
    { cite: 'SP 12 #2 fifth rejected', players: 5, ok: false },
    { cite: 'RB 1', players: 0, ok: false },
  ];
  for (const c of cases) {
    const make = () => createGame({ players: names(c.players), seed: 1, content: FX });
    if (c.ok) assert.equal(make().seats.length, c.players, c.cite);
    else assert.throws(make, RangeError, c.cite);
  }
});

// Walk setup recording which seat acts at each step.
function draftOrder(players, firstRolls) {
  let g = createGame({ players: names(players), seed: 1, content: FX, diceScript: firstRolls });
  if (players > 1) g = reduce(g, { type: 'ROLL_FIRST_PLAYER' }, FX);
  const order = { heroes: [], rings: [], towers: [] };
  while (g.status === 'setup') {
    const a = legalActions(g, FX)[0];
    order[g.setup.step].push(a.seat);
    g = reduce(g, a, FX);
  }
  return { g, order };
}

test('T03 first player by highest D12; heroes clockwise; rings from last picker counterclockwise; towers clockwise (RB 4, SP 3, SP 12 #3)', () => {
  const cases = [
    { cite: 'RB 4 steps 5-6, 9', players: 3, rolls: [3, 9, 5], first: 1, heroes: [1, 2, 0], rings: [0, 2, 1], towers: [1, 2, 0] },
    { cite: 'RB 4', players: 4, rolls: [2, 4, 11, 7], first: 2, heroes: [2, 3, 0, 1], rings: [1, 0, 3, 2], towers: [2, 3, 0, 1] },
    { cite: 'RB 4', players: 4, rolls: [12, 4, 11, 7], first: 0, heroes: [0, 1, 2, 3], rings: [3, 2, 1, 0], towers: [0, 1, 2, 3] },
    { cite: 'RB 4', players: 2, rolls: [1, 6], first: 1, heroes: [1, 0], rings: [0, 1], towers: [1, 0] },
    { cite: 'RB 10 solo', players: 1, rolls: [], first: 0, heroes: [0], rings: [0], towers: [0] },
  ];
  for (const c of cases) {
    const { g, order } = draftOrder(c.players, c.rolls);
    assert.equal(g.firstSeat, c.first, c.cite);
    assert.deepEqual(order, { heroes: c.heroes, rings: c.rings, towers: c.towers }, c.cite);
    assert.equal(g.status, 'playing');
    assert.equal(g.sun, 1);
    assert.equal(g.round, 1);
    assert.equal(g.activeSeat, c.first, 'first player acts first');
    // Distinct heroes and rings; starting HP from the hero card (RB 4 step 8).
    assert.equal(new Set(g.seats.map(s => s.heroId)).size, c.players);
    assert.equal(new Set(g.seats.map(s => s.ringId)).size, c.players);
    for (const h of g.heroes) {
      const def = FX.heroes.find(d => d.id === h.heroId);
      assert.equal(h.hp, def.hp);
      assert.equal(h.hpStart, def.hp);
    }
  }
});

test('a solo game skips the first-player roll: straight to hero choice, no die rolled, nothing logged (owner, 2026-11-19)', () => {
  const g = createGame({ players: names(1), seed: 1, content: FX });
  assert.equal(g.setup.step, 'heroes');
  assert.equal(g.firstSeat, 0);
  assert.deepEqual(g.log.filter(e => e.kind === 'roll' || e.kind === 'first-player'), []);
  assert.deepEqual(new Set(legalActions(g, FX).map(a => a.type)), new Set(['PICK_HERO']));
  assert.ok(legalActions(g, FX).every(a => a.seat === 0));
  assert.throws(() => reduce(g, { type: 'ROLL_FIRST_PLAYER' }, FX), /Illegal/);
});

test('T03b tied highest first-player rolls reroll among the tied only (D05, house rule)', () => {
  const cases = [
    { cite: 'D05', players: 3, rolls: [9, 12, 12, 5, 8], first: 2, rollCount: 5 },
    { cite: 'D05 repeated tie', players: 2, rolls: [12, 12, 7, 7, 2, 6], first: 1, rollCount: 6 },
    { cite: 'D05 lower tie ignored', players: 3, rolls: [4, 4, 10], first: 2, rollCount: 3 },
  ];
  for (const c of cases) {
    const g = reduce(createGame({ players: names(c.players), seed: 1, content: FX, diceScript: c.rolls }), { type: 'ROLL_FIRST_PLAYER' }, FX);
    assert.equal(g.firstSeat, c.first, c.cite);
    assert.equal(g.log.filter(e => e.kind === 'roll').length, c.rollCount, c.cite);
  }
});

test('out-of-turn and repeated picks are rejected; towers may be shared (RB 4 step 9, SP 4)', () => {
  let g = reduce(createGame({ players: names(2), seed: 1, content: FX, diceScript: [8, 3] }), { type: 'ROLL_FIRST_PLAYER' }, FX);
  assert.throws(() => reduce(g, { type: 'PICK_HERO', seat: 1, heroId: 'FX_HERO_1' }, FX), /Illegal/);
  const pick = { type: 'PICK_HERO', seat: 0, heroId: 'FX_HERO_1' };
  g = reduce(g, pick, FX);
  assert.throws(() => reduce(g, pick, FX), /Illegal/, 'double click cannot pick twice');
  assert.throws(() => reduce(g, { type: 'PICK_HERO', seat: 1, heroId: 'FX_HERO_1' }, FX), /Illegal/, 'hero already taken');
  assert.throws(() => reduce(g, { type: 'ROLL_FIRST_PLAYER' }, FX), /Illegal/, 'no second first-player roll');
  const both = setup({ players: 2, towers: [3, 3] });
  assert.deepEqual(both.heroes[0].coord, both.heroes[1].coord);
});

test('T30 full-fidelity start blocked without verified content; fixtures flagged (SP 11, SP 12 #30)', () => {
  // The shipped owner content blocks the full Start for exactly as long as the checker says it is incomplete.
  const start = () => createGame({ players: names(1), seed: 1, content: ORIGINAL });
  if (validateContent(ORIGINAL).fullStartAllowed) assert.equal(start().banner, null);
  else assert.throws(start, /Full-fidelity start blocked/);
  const g = createGame({ players: names(1), seed: 1, content: FX });
  assert.equal(g.contentMode, 'fixture');
  assert.equal(g.banner, 'NON-AUTHENTIC TEST DATA');
});

test('rules config: defaults, settable values, unknown rules and values rejected, every entry tagged (plan section 9, spec v2)', () => {
  assert.deepEqual(DEFAULT_RULES, { darkRoomPolicy: 'ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY', forcedMoveTileEffects: true, soloCombat: 'target', towerAtSunsetCountsAsEscape: false, escapeWithoutExploring: false, soloMonsterHp: 'visible', rotatingRoomRing: 'every-entry' });
  assert.equal(createGame({ players: names(1), seed: 1, content: FX }).rules.darkRoomPolicy, 'ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY');
  assert.equal(createGame({ players: names(1), seed: 1, content: FX, rules: { darkRoomPolicy: 'EVERY_ENTRY' } }).rules.darkRoomPolicy, 'EVERY_ENTRY');
  assert.throws(() => createGame({ players: names(1), seed: 1, content: FX, rules: { darkRoomOnReentry: true } }), /Unknown rule/, 'the old flag is gone');
  assert.throws(() => createGame({ players: names(1), seed: 1, content: FX, rules: { darkRoomPolicy: 'NEVER' } }), /cannot be/);
  assert.throws(() => createGame({ players: names(1), seed: 1, content: FX, rules: { voluntaryPass: true } }), /Unknown rule/);
  assert.ok(Object.keys(DEFAULT_RULES).every(k => RULE_TAGS[k]), 'every rules-config entry has an authority tag');
  assert.deepEqual(Object.keys(RULE_TAGS).filter(k => !(k in DEFAULT_RULES)), ['towerEscapeOnLaterTurns'], 'fixed rulings tagged without a switch');
  for (const tags of Object.values(RULE_TAGS)) assert.ok(tags.length && tags.every(t => AUTHORITY_TAGS.includes(t)));
  assert.deepEqual([RULE_TAGS.towerAtSunsetCountsAsEscape, RULE_TAGS.escapeWithoutExploring, RULE_TAGS.darkRoomPolicy], [['interpretation'], ['interpretation'], ['interpretation']]);
  // Spec v4: solo monster HP visible is the printed rule; hidden only as a house rule (no user-facing switch yet).
  assert.deepEqual(RULE_TAGS.soloMonsterHp, ['explicit2023', 'houseRule']);
  assert.equal(createGame({ players: names(1), seed: 1, content: FX, rules: { soloMonsterHp: 'hidden-house-rule' } }).rules.soloMonsterHp, 'hidden-house-rule');
  assert.throws(() => createGame({ players: names(1), seed: 1, content: FX, rules: { soloMonsterHp: 'hidden' } }), /cannot be/);
  // Spec v9 (D67): the Protection Ring at the rotating room on every entry by default; 'first-reveal' and 'never' stay settable.
  assert.deepEqual(RULE_TAGS.rotatingRoomRing, ['interpretation']);
  for (const v of ['first-reveal', 'never']) assert.equal(createGame({ players: names(1), seed: 1, content: FX, rules: { rotatingRoomRing: v } }).rules.rotatingRoomRing, v);
  assert.throws(() => createGame({ players: names(1), seed: 1, content: FX, rules: { rotatingRoomRing: 'always' } }), /cannot be/);

});
