// Monster encounters and combat. T19-T23, T28, T28b, T31 and sub-cases T04c, T19b, T19c, T22b, T22c, D14
// (SP 12 #19-#23, #28). Fixture monsters, combat cards and heroes are NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllerSeat } from '../../site/keep/engine/monsters.js';
import { abcExchange, targetThrow } from '../../site/keep/engine/combat.js';
import { view } from '../../site/keep/engine/view.js';
import { FX, setup, acts, act, place, putHero, give, draws, slotsOf, assertCensus, EMPTY_ROOMS } from './helpers.js';

const choices = g => acts(g).filter(a => a.type === 'RESPOND').map(a => a.choice);

// Seat 0 at (1,0) steps S into a black room at (1,1) whose card is a monster (or the given room card).
function meet(monsterId, { players = 2, room = 'FX_ROOM_MONSTER', script = [], heroes = [], rules = {}, from = 'FX_CROSS', fromRot = 0, prep = () => {} } = {}) {
  let g = setup({ players, towers: [0, 1], heroes, script, rules, deckOrders: { ROOM: [room, ...EMPTY_ROOMS], MONSTER: [monsterId] } });
  place(g, '1,0', from, fromRot);
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  prep(g);
  return act(g, 'MOVE', { dir: 'S' });
}
const respond = (g, choice) => act(act(g, 'RESPOND', { choice }), 'ANNOUNCE');
const pick = (g, hero, monster) => act(act(g, 'COMBAT_PICK', { side: 'monster', letter: monster }), 'COMBAT_PICK', { side: 'hero', letter: hero });

test('T19 the hero commits before anything about the monster exists; the right-hand seat controls it (RB 8.1, SP 7, SP 12 #19, D12)', () => {
  let g = meet('FX_MON_BRUTE');
  const deckBefore = [...g.decks.MONSTER.order];
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.equal(g.encounter.monster, null, 'no monster card drawn yet');
  assert.deepEqual(draws(g, 'MONSTER'), []);
  assert.deepEqual(choices(g), ['attack', 'wait', 'flee']);
  g = act(g, 'RESPOND', { choice: 'attack' });
  assert.deepEqual(deckBefore.slice(1), g.decks.MONSTER.order, 'top card drawn only after the commit');
  const drawn = g.log.find(e => e.kind === 'draw' && e.deck === 'MONSTER');
  assert.equal(drawn.private, 1, 'drawn privately for the controller (seat 1, right of seat 0)');
  assert.equal(g.phase, 'MONSTER_REACT');
  assert.deepEqual(acts(g), [{ type: 'ANNOUNCE', seat: 1 }]);
  // HP hidden from the hero in multiplayer, visible to the controller (RB 8.3, SP 9).
  assert.equal(view(g, FX, 0).encounter.monster.hp, undefined);
  assert.equal(view(g, FX, 0).encounter.reaction, null, 'reaction not announced yet');
  assert.equal(view(g, FX, 1).encounter.monster.hp, 4);
  g = act(g, 'ANNOUNCE');
  assert.equal(view(g, FX, 0).encounter.reaction.type, 'combat');
  assert.equal(view(g, FX, 0).encounter.monster.hp, undefined, 'still hidden during combat');
  // D12: seats are clockwise, the right-hand seat is the previous one, dead or escaped or not; solo: the hero.
  const four = { seats: [0, 1, 2, 3] };
  assert.deepEqual([0, 1, 2, 3].map(s => controllerSeat(four, s)), [3, 0, 1, 2]);
  assert.equal(controllerSeat({ seats: [0] }, 0), 0);
});

test('T19b special weapon: offered only with an eligible weapon, reads the Attack reaction, applies its own effect (RB 8.1, SP 7)', () => {
  assert.ok(!choices(meet('FX_MON_BRUTE')).includes('special'), 'the knight has none');
  let g = meet('FX_MON_BRUTE', { heroes: ['FX_HERO_2'] });
  assert.deepEqual(choices(g), ['attack', 'wait', 'flee', 'special']);
  g = act(g, 'RESPOND', { choice: 'special' });
  assert.equal(g.encounter.reaction.type, 'combat', "the BRUTE's attack reaction");
  g = act(g, 'ANNOUNCE');
  assert.equal(g.encounter.monster.wounds, 1, 'the fixture crossbow deals 1');
  assert.equal(g.phase, 'COMBAT_SELECT');
  assert.equal(g.heroes[0].weaponUses, 1);
  const again = meet('FX_MON_BRUTE', { heroes: ['FX_HERO_2'], prep: h => { h.heroes[0].weaponUses = 1; } });
  assert.ok(!choices(again).includes('special'), 'single use spent');
});

test('T19c monster flees: no combat, both cards under their decks, turn ends (RB 8.2, SP 7)', () => {
  const g = respond(meet('FX_MON_SHY'), 'attack');
  assert.equal(g.encounter, null);
  assert.equal(g.activeSeat, 1, 'turn over');
  assert.equal(g.decks.MONSTER.order.at(-1), 'FX_MON_SHY#1');
  assert.equal(g.decks.ROOM.order.at(-1), 'FX_ROOM_MONSTER#1');
  assert.ok(!g.log.some(e => e.kind === 'combat'));
  assertCensus(assert, g);
});

test('T20, T20b A/B/C matchups: A>B, B>C, C>A, ties 1 each, doubles only from card data (RB 8.4, SP 7, D13)', () => {
  const cases = [
    { h: 'A', m: 'A', heroDmg: 1, monsterDmg: 1 }, { h: 'B', m: 'B', heroDmg: 1, monsterDmg: 1 }, { h: 'C', m: 'C', heroDmg: 1, monsterDmg: 1 },
    { h: 'A', m: 'B', heroDmg: 0, monsterDmg: 1 }, { h: 'B', m: 'C', heroDmg: 0, monsterDmg: 1 }, { h: 'C', m: 'A', heroDmg: 0, monsterDmg: 1 },
    { h: 'B', m: 'A', heroDmg: 1, monsterDmg: 0 }, { h: 'C', m: 'B', heroDmg: 1, monsterDmg: 0 }, { h: 'A', m: 'C', heroDmg: 1, monsterDmg: 0 },
    { cite: 'printed double on the winner', h: 'A', m: 'B', hd: ['B'], heroDmg: 0, monsterDmg: 2 },
    { cite: 'monster double', h: 'A', m: 'C', md: ['A'], heroDmg: 2, monsterDmg: 0 },
    { cite: "a loser's double does nothing", h: 'B', m: 'A', hd: ['C'], heroDmg: 1, monsterDmg: 0 },
    { cite: 'T20b D13: a tie is 1 each even when both cards list a double', h: 'A', m: 'A', hd: ['B'], md: ['B'], heroDmg: 1, monsterDmg: 1 },
  ];
  for (const c of cases) assert.deepEqual(abcExchange(c.h, c.m, c.hd, c.md), { heroDmg: c.heroDmg, monsterDmg: c.monsterDmg }, c.cite || `${c.h} vs ${c.m}`);
});

test('T21 the rulebook troll example: five exchanges, hero -3, 4-HP monster dead, turn ends (RB 8.5, SP 7, SP 12 #21)', () => {
  let g = respond(meet('FX_MON_BRUTE'), 'attack'); // knight (hero set FX_S01: A hits B twice) vs a 4-HP fixture monster
  const steps = [
    { hero: 'A', monster: 'C', heroLost: 1, wounds: 0 },
    { hero: 'B', monster: 'B', heroLost: 2, wounds: 1 },
    { hero: 'A', monster: 'B', heroLost: 2, wounds: 3 },
    { hero: 'C', monster: 'B', heroLost: 3, wounds: 3 },
    { hero: 'C', monster: 'A', heroLost: 3, wounds: 4 },
  ];
  steps.forEach((s, i) => {
    if (i < 4) {
      g = pick(g, s.hero, s.monster);
      assert.equal(17 - g.heroes[0].hp, s.heroLost, `exchange ${i + 1}`);
      assert.equal(g.encounter.monster.wounds, s.wounds, `exchange ${i + 1}`);
    } else g = pick(g, s.hero, s.monster);
  });
  assert.equal(g.heroes[0].hp, 14, 'hero lost 3');
  assert.deepEqual(g.log.filter(e => e.kind === 'exchange').map(e => [e.hero, e.monster, e.heroDmg, e.monsterDmg]),
    [['A', 'C', 1, 0], ['B', 'B', 1, 1], ['A', 'B', 0, 2], ['C', 'B', 1, 0], ['C', 'A', 0, 1]]);
  assert.ok(g.log.some(e => e.kind === 'monster-dead'));
  assert.equal(g.encounter, null);
  assert.equal(g.activeSeat, 1, "the hero's turn ended");
  assert.equal(g.decks.MONSTER.order.at(-1), 'FX_MON_BRUTE#1');
  assert.equal(g.decks.ROOM.order.at(-1), 'FX_ROOM_MONSTER#1');
  assertCensus(assert, g);
});

test('D14 hero and monster reach 0 in the same exchange: both die (D14); T04c the dead hero\'s cards return to their decks (D28)', () => {
  let g = respond(meet('FX_MON_BRUTE', { prep: h => { give(h, 0, 'ROOM', 'FX_ROOM_COINS'); give(h, 0, 'TREASURY', 'FX_TREASURY_A'); } }), 'attack');
  g.encounter.monster.wounds = 3;
  g.heroes[0].hp = 1;
  const held = g.heroes[0].held[0], chamber = g.heroes[0].treasury[0];
  g = pick(g, 'B', 'B');
  assert.ok(g.log.some(e => e.kind === 'monster-dead'));
  assert.equal(g.heroes[0].status, 'DEAD');
  assert.deepEqual([g.heroes[0].held, g.heroes[0].treasury], [[], []]);
  assert.ok(g.decks.ROOM.order.includes(held), 'D28: room loot under the room deck');
  assert.equal(g.decks.TREASURY.order.at(-1), chamber, 'D28: treasure-chamber card under the treasury deck');
  assert.equal(g.seats[0].heroId, 'FX_HERO_1', 'the hero card itself never becomes loot');
  assertCensus(assert, g);
});

test('T22 flight: back to the previous tile, no room card there, its tile effects still apply; strike then flight; strike then combat (RB 8.6, SP 7, SP 12 #22, D16)', () => {
  // The previous tile is a rotating room: flight re-enters it, so it turns (D16).
  let g = respond(meet('FX_MON_SHY', { from: 'FX_ROTATE', fromRot: 0 }), 'flee');
  assert.deepEqual(g.heroes[0].coord, { x: 1, y: 0 });
  assert.equal(draws(g, 'ROOM').length, 1, 'no room card on the way back');
  assert.equal(g.board.tiles['1,0'].rotation, 90, 'tile effect applied');
  assert.equal(g.activeSeat, 1, 'turn ends');
  assertCensus(assert, g);
  const hit = respond(meet('FX_MON_BITER'), 'flee'); // strike 3, then flight
  assert.equal(hit.heroes[0].hp, 14);
  assert.deepEqual(hit.heroes[0].coord, { x: 1, y: 0 });
  const fight = respond(meet('FX_MON_BRUTE'), 'flee'); // strike 2, then combat
  assert.equal(fight.heroes[0].hp, 15);
  assert.deepEqual(fight.heroes[0].coord, { x: 1, y: 1 });
  assert.equal(fight.phase, 'COMBAT_SELECT');
});

test('T22, T22c no flight when the way back is gone: used secret door (RB 8.6) or the red-room gate behind (D15)', () => {
  const secret = meet('FX_MON_BRUTE', { prep: h => { h.turn.secret = 'any-orthogonal'; place(h, '1,0', 'FX_DEADEND', 180); } }); // only N open: S is a printed wall
  assert.equal(secret.heroes[0].enteredVia, 'secret');
  assert.deepEqual(choices(secret), ['attack', 'wait']);
  // Red room: CORNER entered from the north (rotation 180: open N and W).
  let g = setup({ players: 2, towers: [0, 1], tileOrder: slotsOf('FX_CORNER').slice(0, 1), deckOrders: { ROOM: ['FX_ROOM_MONSTER'], MONSTER: ['FX_MON_BRUTE'] } });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(g.board.tiles['1,1'].defId, 'FX_CORNER');
  assert.equal(g.board.edges['1,0|S'], 'gate');
  assert.deepEqual(choices(g), ['attack', 'wait']);
});

test('T22b damage formulas floor at 0 (D03): D6-2 strike with 1, 2 and 6 (RB 8.6)', () => {
  for (const [d6, lost] of [[1, 0], [2, 0], [6, 4]]) {
    const g = respond(meet('FX_MON_BITER', { script: [d6] }), 'wait'); // wait: strike D6-2, then combat
    assert.equal(17 - g.heroes[0].hp, lost, `D6 ${d6}`);
    assert.equal(g.phase, 'COMBAT_SELECT');
  }
});

test('T23 ambush: D12 - Luck damage first, then Attack or Flee only (RB 8.7, SP 7, SP 12 #23)', () => {
  const cases = [
    { cite: 'RB 8.7: 9 - LCK 4 = 5', d12: 9, lost: 5 },
    { cite: 'D03: 3 - 4 is 0', d12: 3, lost: 0 },
  ];
  for (const c of cases) {
    const g = meet('FX_MON_BRUTE', { room: 'FX_ROOM_AMBUSH', script: [c.d12] });
    assert.equal(17 - g.heroes[0].hp, c.lost, c.cite);
    assert.deepEqual(choices(g), ['attack', 'flee'], 'no Wait');
    assert.deepEqual(draws(g, 'MONSTER'), [], 'monster card still unread');
  }
  const hunter = meet('FX_MON_BRUTE', { room: 'FX_ROOM_AMBUSH', script: [5], heroes: ['FX_HERO_2'] });
  assert.deepEqual(choices(hunter), ['attack', 'flee'], 'no special weapon either (shortcut)');
  const killed = meet('FX_MON_BRUTE', { room: 'FX_ROOM_AMBUSH', script: [12], prep: h => { h.heroes[0].hp = 8; } });
  assert.equal(killed.heroes[0].status, 'DEAD');
  assert.equal(killed.encounter, null);
});

test('T28 solo: commit before the reveal, monster HP visible, manual target entry is the combat (RB 10, SP 9, SP 12 #28, D17)', () => {
  let g = meet('FX_MON_BRUTE', { players: 1 });
  assert.equal(g.encounter.monster, null);
  assert.equal(g.encounter.controller, 0, 'the hero reveals the card');
  g = act(g, 'RESPOND', { choice: 'attack' });
  assert.equal(view(g, FX, 0).encounter.monster.hp, 4, 'no hidden HP in solo');
  g = act(g, 'ANNOUNCE');
  assert.equal(g.encounter.combat.mode, 'target');
  assert.ok(acts(g).every(a => a.type === 'TARGET_RESULT'));
  assert.equal(acts(g).length, 18, 'six placements x three faces, no random throw button');
});

test('T28b the A/B/C variant in solo is a labelled digital variant with computer-chosen monster cards (D17, class 4)', () => {
  let g = respond(meet('FX_MON_BRUTE', { players: 1, rules: { soloCombat: 'abc-digital-variant' }, script: [1, 4, 6] }), 'attack');
  assert.equal(g.encounter.combat.variant, 'DIGITAL VARIANT (not an original rule)');
  assert.ok(acts(g).every(a => a.type === 'COMBAT_PICK' && a.side === 'hero'));
  for (const letter of ['B', 'B', 'B']) g = act(g, 'COMBAT_PICK', { side: 'hero', letter });
  assert.deepEqual(g.log.filter(e => e.kind === 'exchange').map(e => e.monster), ['A', 'B', 'C'], 'D6 1-2 A, 3-4 B, 5-6 C');
  assert.ok(g.log.filter(e => e.kind === 'roll').some(e => /digital variant/.test(e.reason)));
});

test('T31 target scoring and the rulebook\'s five-throw example: hero -4, monster -6 and dead (RB 8.8, RB 8.9)', () => {
  const table = [
    ['outer', 'other', 0, 1], ['inner', 'other', 0, 2], ['inner', 'sword', 0, 4], ['outer', 'sword', 0, 2],
    ['corner', 'other', 1, 0], ['corner-skull', 'other', 2, 0], ['corner', 'skull', 2, 0], ['corner-skull', 'skull', 4, 0],
    ['outside', 'sword', 0, 0], ['outside', 'skull', 0, 0], ['inner', 'skull', 0, 2], ['corner', 'sword', 1, 0],
  ];
  for (const [p, f, h, m] of table) assert.deepEqual(targetThrow(p, f), { rethrow: false, heroDmg: h, monsterDmg: m }, `${p}/${f}`);
  assert.equal(targetThrow('unclear', 'sword').rethrow, true, 'unclear: rethrow, never guess');
  let g = respond(meet('FX_MON_BRUTE', { players: 1 }), 'attack');
  const throws = [['corner', 'skull'], ['inner', 'skull'], ['unclear', 'other'], ['corner-skull', 'other'], ['outside', 'other'], ['inner', 'sword']];
  for (const [placement, face] of throws) g = act(g, 'TARGET_RESULT', { placement, face });
  assert.equal(17 - g.heroes[0].hp, 4);
  assert.deepEqual(g.log.filter(e => e.kind === 'monster-wound').map(e => e.wounds), [2, 6]);
  assert.ok(g.log.some(e => e.kind === 'monster-dead'));
  assert.equal(g.encounter, null);
  assert.equal(g.sun, 2, 'combat over, turn ended');
});
