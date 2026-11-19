// Acceptance tests for the owner's specification v4 (docs/plans/spec-v4-owner-2026-11-19.md): solo monster HP (D37 as
// amended), the dragon awake until the chamber is empty (D40), a special weapon in an ambush (D41), the well jump's far
// edge (D42) and hero stats read directly (D43). Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../site/keep/engine/view.js';
import { exits } from '../../site/keep/engine/board.js';
import { fightRowModel } from '../../site/keep/ui/words.js';
import { ROW_FIXTURES } from '../../site/keep/content/fixtures/fixtures.js';
import { FX, setup, act, types, place, putHero, give, draws, slotsOf, assertCensus, EMPTY_ROOMS } from './helpers.js';

const names = s => `P${s + 1}`;
const row = (g, viewer) => { const v = view(g, FX, viewer); return fightRowModel(v, v.encounter.seat, v.encounter, names, FX); };

// Seat 0 at (1,0) steps S into a black room at (1,1) whose card is a monster (or the given room card).
function meet({ players = 1, room = 'FX_ROOM_MONSTER', script = [], rules = {}, heroes = [] } = {}) {
  const g = setup({ players, towers: [0, 1, 2], script, rules, heroes, deckOrders: { ROOM: [room, ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  return act(g, 'MOVE', { dir: 'S' });
}

test('spec v4 item A: the solo fight row shows the revealed monster HP, updating with each hit; a multiplayer hero and the table never get it (UI render model)', () => {
  let g = meet();
  assert.equal(view(g, FX, 0).encounter.monster, null, 'nothing before the reveal');
  assert.equal(row(g, 0).monster, null);
  g = act(g, 'RESPOND', { choice: 'attack' });
  assert.deepEqual(row(g, 0).monster, { left: 4, max: 4, label: 'Monster: 4 of 4 HP left' }, 'shown once revealed');
  assert.equal(row(g, 0).who, 'P1 against the monster', 'the card name stays with the computer');
  g = act(g, 'TARGET_RESULT', { placement: 'inner', face: 'other' }); // 2 to the monster
  assert.deepEqual(row(g, 0).monster, { left: 2, max: 4, label: 'Monster: 2 of 4 HP left' });
  assert.equal(row(g, null).monster, null, 'not on a public view');
  // House rule: hidden again (no switch in the UI yet).
  const hidden = act(meet({ rules: { soloMonsterHp: 'hidden-house-rule' } }), 'RESPOND', { choice: 'attack' });
  assert.equal(row(hidden, 0).monster, null);
  // Multiplayer: hero 0, controller 1. Only the controller's row has the HP.
  let m = act(act(meet({ players: 2 }), 'RESPOND', { choice: 'attack' }), 'ANNOUNCE');
  assert.equal(row(m, 0).monster, null, 'the multiplayer hero never sees it');
  assert.equal(row(m, null).monster, null);
  assert.deepEqual(row(m, 1).monster, { left: 4, max: 4, label: 'Monster: 4 of 4 HP left' }, 'the monster player does');
  m = act(act(m, 'COMBAT_PICK', { side: 'monster', letter: 'B' }), 'COMBAT_PICK', { side: 'hero', letter: 'A' }); // knight A hits B twice
  assert.equal(row(m, 1).monster.left, 2);
  assert.equal(row(m, 0).monster, null);
});

test('spec v4 item A: in the solo A/B/C variant the computer pick is never in the view before the reveal', () => {
  let g = act(meet({ rules: { soloCombat: 'abc-digital-variant' }, script: [1] }), 'RESPOND', { choice: 'attack' });
  const before = view(g, FX, 0);
  assert.equal(before.encounter.combat.monsterPick, null, 'not picked yet');
  assert.ok(!('rng' in before), 'and no dice future in the view');
  assert.ok(!g.log.some(e => /digital variant/.test(e.reason || '')), 'the computer rolls only when the hero locks in');
  assert.deepEqual(before.encounter.monster, { groupId: 'FX_S09', hp: 4, wounds: 0 }, 'its HP is shown');
  g = act(g, 'COMBAT_PICK', { side: 'hero', letter: 'B' });
  assert.deepEqual(g.encounter.combat.exchanges.at(-1), { hero: 'B', monster: 'A', heroDmg: 1, monsterDmg: 0 }, 'picked and revealed in the same step');
});

// Two heroes over the chamber (4,5)+(5,5): seat 0 north of it at (4,4), seat 1 inside; (4,3) explored; no tiles left.
function lair() {
  const g = setup({ players: 2, towers: [0, 1], script: [3, 4], deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: [['FX_DRAGON_AWAKE']] } });
  place(g, '4,4', 'FX_CROSS');
  place(g, '4,3', 'FX_CROSS');
  putHero(g, 0, '4,4');
  putHero(g, 1, '4,5');
  for (const h of g.heroes) h.status = 'EXPLORING';
  g.board.chamberPlaced = true;
  g.board.tileBag = []; // every unexplored square is closed
  return g;
}

test('spec v4 item B1 (D40): a hero who cannot leave keeps the dragon awake; no treasure for anyone inside; the deck resets only when the chamber is empty', () => {
  let g = act(lair(), 'MOVE', { dir: 'S' }); // seat 0 enters: two cards, the awake card
  assert.equal(g.phase, 'FORCED_MOVE');
  g = act(g, 'FORCED_MOVE', { to: '4,4' }); // seat 0 out; seat 1 has no free tile
  assert.ok(g.log.some(e => e.kind === 'forced-move-none' && e.seat === 1));
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.aside.length], [true, 0, 1], 'awake, not reset');
  assert.equal(view(g, FX, null).dragon.awake, true);
  assert.equal(g.activeSeat, 1);
  assert.deepEqual(types(g), ['FORCED_SKIP'], 'no Stay and collect while awake, and no way out yet (D20)');
  assert.match(view(g, FX, 1).collectUnavailable, /^the dragon is awake\. No treasure can be taken in the treasure chamber until every hero has left it\.$/);
  g = act(g, 'FORCED_SKIP');
  // Seat 0 walks back in while the dragon is awake (interpretation): allowed, but nothing is drawn.
  const treasury = draws(g, 'TREASURY').length;
  g = act(g, 'MOVE', { dir: 'S' });
  assert.ok(g.log.some(e => e.kind === 'dragon-awake-no-collect' && e.seat === 0));
  assert.deepEqual([draws(g, 'TREASURY').length, draws(g, 'DRAGON').length], [treasury, 1], 'no treasure, no dragon card');
  assert.equal(g.activeSeat, 1, 'the entry ends the turn');
  // Seat 1 may now leave: (4,4) is free.
  g = act(g, 'MOVE', { dir: 'N', from: '4,5' });
  assert.deepEqual(g.heroes[1].coord, { x: 4, y: 4 });
  assert.deepEqual([g.dragon.awake, g.dragon.resets], [true, 0], 'seat 0 is still inside');
  assert.ok(!types(g).includes('COLLECT'));
  g = act(g, 'FORCED_SKIP'); // seat 0: (4,4) taken, nothing else open
  g = act(g, 'MOVE', { dir: 'N' }); // seat 1 on to (4,3)
  g = act(g, 'MOVE', { dir: 'N', from: '4,5' }); // seat 0 leaves: the chamber is empty
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.remaining.length, g.dragon.aside.length], [false, 1, 8, 0], 'reset the moment it empties');
  assert.ok(g.log.some(e => e.kind === 'dragon-reset'));
  assertCensus(assert, g);
});

test('spec v4 item B1 (D40): a dead hero does not keep the dragon awake', () => {
  let g = act(act(lair(), 'MOVE', { dir: 'S' }), 'FORCED_MOVE', { to: '4,4' });
  g = act(g, 'FORCED_SKIP'); // seat 1 stuck inside
  g.heroes[1].status = 'DEAD'; // constructed: the stuck hero has died
  g = act(g, 'MOVE', { dir: 'N' }); // any action: the chamber holds no surviving hero
  assert.deepEqual([g.dragon.awake, g.dragon.resets], [false, 1]);
});

test('spec v4 item B2 (D41): in an ambush the damage comes first, then Attack, Flee or the special weapon (never Wait), resolved by the Attack column and the weapon card', () => {
  // The hunter (Luck 8, 10 HP, a one-use crossbow dealing 1) is ambushed: D12 10 - Luck 8 = 2.
  let g = meet({ players: 2, room: 'FX_ROOM_AMBUSH', heroes: ['FX_HERO_2'], script: [10] });
  assert.equal(g.heroes[0].hp, 8);
  const order = g.log.map(e => e.kind);
  assert.ok(order.includes('damage') && !order.includes('commit'), 'damage before any choice');

  assert.deepEqual(types(g), ['RESPOND']);
  assert.deepEqual(g.log.filter(e => e.kind === 'damage').map(e => e.raw), [2]);
  assert.deepEqual(view(g, FX, 0).heroes[0].inventory.equipment.find(x => x.id === 'FX_XBOW_1').usable, true);
  g = act(g, 'RESPOND', { choice: 'special' });
  assert.deepEqual(g.encounter.reaction, FX.monster.find(m => m.id === 'FX_MON_BRUTE').reactions.attack, "the monster's Attack reaction");
  g = act(g, 'ANNOUNCE');
  assert.equal(g.heroes[0].weaponUses, 1);
  assert.equal(g.encounter.monster.wounds, 1, "the weapon card's own effect");
  assert.equal(g.phase, 'COMBAT_SELECT', 'then the Attack reaction: combat');
});

// Solo knight (Agility 4) at (1,0) steps S into a well at (1,1): entered from the north, so the far side is south.
function well(script) {
  let g = setup({ tileOrder: slotsOf('FX_WELL').slice(0, 1), script });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,2', 'FX_CROSS');
  putHero(g, 0, '1,0');
  return act(g, 'MOVE', { dir: 'S' }); // well entry passes on 4
}

test('spec v4 item B3 (D42): a successful jump leaves the hero on the well tile at the far edge and ends the turn; later only the far side is open, the near side needs a jump back', () => {
  let g = act(well([4, 2]), 'WELL_JUMP');
  const h = g.heroes[0];
  assert.deepEqual([h.coord, h.roomState, h.conditions], [{ x: 1, y: 1 }, { special: 'well', entryEdge: 'N', phase: 'CROSSED' }, []], 'on the well tile, across');
  assert.equal(g.sun, 3, 'the jump ends the turn');
  assert.ok(!g.log.slice(g.log.findLastIndex(e => e.kind === 'test')).some(e => e.kind === 'move'), 'not moved into the next room');
  assert.equal(g.phase, 'CHOOSE_ACTION');
  assert.deepEqual(exits(g, FX, 0).map(e => [e.dir, e.reason]), [['N', 'across-the-well'], ['E', 'wall'], ['S', null], ['W', 'wall']]);
  assert.deepEqual(types(g), ['MOVE', 'WELL_JUMP']);
  const out = act(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(out.heroes[0].coord, { x: 1, y: 2 }, 'out by the far side');
  assert.equal(out.heroes[0].roomState, null);
});

test('spec v4 item B3 (D42): a jump back from the far edge is the same Agility test (+1 per chamber card) and puts the hero at the near edge; failing it is death', () => {
  let g = act(well([4, 2, 3]), 'WELL_JUMP');
  give(g, 0, 'TREASURY', 'FX_TREASURY_A');
  const preview = view(g, FX, 0).pendingTests.find(t => t.action.type === 'WELL_JUMP');
  assert.deepEqual([preview.stat, preview.target, preview.modifier], ['AGI', 4, 1]);
  g = act(g, 'WELL_JUMP'); // 3 + 1 = 4 <= 4
  assert.deepEqual([g.heroes[0].coord, g.heroes[0].roomState.phase], [{ x: 1, y: 1 }, 'AT_NEAR_EDGE']);
  assert.ok(g.heroes[0].conditions.some(c => c.id === 'well-edge'));
  assert.deepEqual(types(g), ['WELL_RETURN', 'WELL_DISCARD', 'WELL_JUMP'], 'next turn: climb back or jump, as at entry');
  const dead = act(well([4, 2, 5]), 'WELL_JUMP');
  assert.equal(act(dead, 'WELL_JUMP').heroes[0].status, 'DEAD', 'D08');
});

// Spec v4 item 4: every test reads the tested hero's own stat line. Knight 6/4/9/4, hunter 2/9/5/8 (STR/AGI/ARM/LCK).
const HEROES = { FX_HERO_1: { STR: 6, AGI: 4, ARM: 9, LCK: 4 }, FX_HERO_2: { STR: 2, AGI: 9, ARM: 5, LCK: 8 } };
const lastTest = g => { const t = g.log.filter(e => e.kind === 'test').at(-1); return [t.stat, t.target, t.seat]; };
const previewOf = (g, type) => { const t = view(g, FX, g.activeSeat).pendingTests.filter(x => x.action.type === type); return t.map(x => [x.stat, x.target]); };

test('spec v4 item B4 (D43): portcullis, well, rubble, card tests of every stat and the ambush read the acting hero\'s own stats', () => {
  for (const [heroId, s] of Object.entries(HEROES)) {
    const start = (opts = {}) => { const g = setup({ heroes: [heroId], ...opts }); place(g, '1,0', 'FX_CROSS'); putHero(g, 0, '1,0'); return g; };
    // Portcullis: Strength.
    let g = start({ script: [1] });
    place(g, '1,1', 'FX_CROSS');
    g.board.edges['1,0|S'] = 'gate';
    assert.deepEqual(previewOf(g, 'MOVE').filter(([k]) => k), [['STR', s.STR]], `${heroId} portcullis preview`);
    assert.deepEqual(lastTest(act(g, 'MOVE', { dir: 'S' })), ['STR', s.STR, 0], `${heroId} portcullis`);
    // Well entry and jump: Agility.
    g = start({ script: [1, 1] });
    place(g, '1,1', 'FX_WELL');
    assert.deepEqual(previewOf(g, 'MOVE'), [['AGI', s.AGI]], `${heroId} well entry preview`);
    g = act(g, 'MOVE', { dir: 'S' });
    assert.deepEqual(lastTest(g), ['AGI', s.AGI, 0]);
    assert.deepEqual(previewOf(g, 'WELL_JUMP'), [['AGI', s.AGI]]);
    assert.deepEqual(lastTest(act(g, 'WELL_JUMP')), ['AGI', s.AGI, 0], `${heroId} well jump`);
    // Rubble: Agility.
    g = start({ script: [1] });
    place(g, '1,1', 'FX_RUBBLE');
    g = act(g, 'MOVE', { dir: 'S' });
    assert.deepEqual(previewOf(g, 'RUBBLE_FORCE'), [['AGI', s.AGI]]);
    assert.deepEqual(lastTest(act(g, 'RUBBLE_FORCE')), ['AGI', s.AGI, 0], `${heroId} rubble`);
    // A card's test of each stat (Armour has no other use in the engine).
    for (const stat of ['STR', 'AGI', 'ARM', 'LCK']) {
      const content = { ...FX, room: FX.room.map(c => (c.id === 'FX_ROOM_TEST' ? { ...c, effects: [{ ...c.effects[0], stat }] } : c)) };
      let k = setup({ heroes: [heroId], content, script: [1], deckOrders: { ROOM: ['FX_ROOM_TEST'] } });
      place(k, '1,0', 'FX_CROSS');
      place(k, '1,1', 'FX_CROSS');
      putHero(k, 0, '1,0');
      k = act(k, 'MOVE', { dir: 'S' }, content);
      assert.deepEqual(lastTest(k), [stat, s[stat], 0], `${heroId} card test ${stat}`);
    }
    // Ambush: D12 - Luck.
    const a = meet({ room: 'FX_ROOM_AMBUSH', heroes: [heroId], script: [12] });
    assert.deepEqual(a.log.filter(e => e.kind === 'damage').map(e => e.raw), [12 - s.LCK], `${heroId} ambush`);
    assert.equal(a.heroes[0].hpStart, FX.heroes.find(h => h.id === heroId).hp, 'HP from the hero card');
  }
});

test('spec v4 item B4 (D43): a test for a hero who is not the active one (forced into a well after the wake) reads that hero\'s stat and names that seat', () => {
  // Seat 0 knight (Agility 4) already in the chamber; seat 1 hunter (Agility 9) walks in and wakes the dragon.
  let g = setup({ players: 2, towers: [0, 1], heroes: ['FX_HERO_1', 'FX_HERO_2'], script: [1, 1, 2], deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: [['FX_DRAGON_SLEEPING', 'FX_DRAGON_AWAKE']] } });
  place(g, '4,4', 'FX_CROSS');
  place(g, '5,4', 'FX_WELL');
  putHero(g, 0, '4,5');
  putHero(g, 1, '4,4');
  g.board.chamberPlaced = true;
  g = act(g, 'COLLECT'); // seat 0: sleeping
  g = act(g, 'MOVE', { dir: 'S' }); // seat 1: awake
  g = act(g, 'FORCED_MOVE', { to: '4,4' }); // seat 1 first
  g = act(g, 'FORCED_MOVE', { to: '5,4' }); // then seat 0, into the well: an Agility test (D16 analogy)
  assert.equal(g.activeSeat, 0, 'turn order has moved on');
  const t = g.log.filter(e => e.kind === 'test').at(-1);
  assert.deepEqual([t.reason, t.stat, t.target, t.seat], ['well entry', 'AGI', 4, 0], "the knight's Agility, logged for seat 0");
});

test('spec v4 item B4 (D43): monster HP comes from the monster-type row, whoever the hero', () => {
  const RF = ROW_FIXTURES;
  for (const heroId of Object.keys(HEROES)) {
    let g = setup({ players: 2, towers: [0, 1], heroes: [heroId], content: RF, deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_ROWS'] } });
    place(g, '1,0', 'FX_CROSS');
    place(g, '1,1', 'FX_CROSS');
    putHero(g, 0, '1,0');
    g = act(act(act(g, 'MOVE', { dir: 'S' }, RF), 'RESPOND', { choice: 'attack' }, RF), 'ANNOUNCE', {}, RF);
    const rowHp = RF.monster.find(m => m.id === 'FX_MON_ROWS').rows.FX_S09.attack.hp;
    assert.deepEqual([g.encounter.monster.hp, g.encounter.monster.groupId], [rowHp, 'FX_S09'], heroId);
  }
});
