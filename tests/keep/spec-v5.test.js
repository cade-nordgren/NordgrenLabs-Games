// Acceptance tests for the owner's specification v5 (docs/plans/spec-v5-owner-2026-11-19.md): the eight heroes, the
// 24 hero combat cards, the two crossbows and the four rings, as the owner verified them from their cards. Hero,
// weapon, ring and hero combat data come from the owner's content files; the board, tiles, decks and monsters are the
// NON-AUTHENTIC fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent, validateContent, contentStatus, syntheticCategories } from '../../site/keep/content/schema.js';
import { abcExchange, BEATS, LETTERS } from '../../site/keep/engine/combat.js';
import { view } from '../../site/keep/engine/view.js';
import { statOf } from '../../site/keep/engine/heroes.js';
import { edgeKind } from '../../site/keep/engine/board.js';
import { FX, setup, act, acts, types, place, putHero, draws, assertCensus, EMPTY_ROOMS } from './helpers.js';

const M = mixContent(ORIGINAL, FX);
// The owner's heroes, weapons, rings and hero combat cards (plus the fixture monster sets the fixture monsters fight with)
// on the fixture board and decks.
const C = { ...FX, mode: 'mixed', heroes: M.heroes, specialWeapons: M.specialWeapons, rings: M.rings, combat: [...M.combat.filter(c => c.owner === 'hero'), ...FX.combat.filter(c => c.owner === 'monster-group')] };
const ringId = name => C.rings.find(r => r.name === name).id;

const HEROES = [
  ['HERO_1', [6, 4, 9, 4], 17, 'Sir Edric Vale', 'Knight', 'A', ['longsword', 'iron shield'], null],
  ['HERO_2', [5, 5, 9, 5], 16, 'Dame Elira Voss', 'Knight', 'A', ['longsword', 'iron shield'], null],
  ['HERO_3', [7, 5, 6, 5], 16, 'Halvar Ironfall', 'Warrior', 'C', ['double-bladed axe', 'leather shield'], null],
  ['HERO_4', [6, 6, 9, 6], 15, 'Brynja Stonehand', 'Warrior', 'C', ['double-bladed axe', 'leather shield'], null],
  ['HERO_5', [3, 8, 5, 7], 11, 'Rowan Fenmark', 'Hunter', 'A', ['crossbow', 'shortsword', 'wooden shield'], 'XBOW_1'],
  ['HERO_6', [2, 9, 5, 8], 10, 'Mira Quickthorn', 'Hunter', 'A', ['crossbow', 'shortsword', 'wooden shield'], 'XBOW_2'],
  ['HERO_7', [4, 7, 4, 8], 15, 'Corin Ashveil', 'Warrior-Monk', 'B', ['spiked club', 'staff'], null],
  ['HERO_8', [3, 8, 4, 9], 14, 'Talia Greyveil', 'Warrior-Monk', 'B', ['war club', 'staff'], null],
];
const DOUBLE = Object.fromEntries(HEROES.map(h => [h[0], h[5]])); // the winning letter of each hero's double-hit pairing

// Seat 0 at (1,0) steps S into a black room at (1,1) whose card is `room`. ring: a ring name for seat 0 (a constructed
// position: the draft itself is tested below).
function meet({ hero = 'HERO_5', players = 1, room = 'FX_ROOM_MONSTER', monster = 'FX_MON_BRUTE', script = [], ring = null, prep } = {}) {
  const heroes = [hero, ...C.heroes.map(h => h.id).filter(id => id !== hero)];
  const g = setup({ players, content: C, towers: [0, 1, 2], heroes, script, deckOrders: { ROOM: [room, ...EMPTY_ROOMS], MONSTER: [monster] } });
  if (ring) g.seats[0].ringId = ringId(ring);
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  prep?.(g);
  return act(g, 'MOVE', { dir: 'S' }, C);
}
const choices = g => acts(g, C).filter(a => a.type === 'RESPOND').map(a => a.choice);

test('spec v5 hero data: all eight have the exact stats, HP, names, classes, equipment, own combat set and weapon', () => {
  assert.deepEqual(validateContent(C).errors, []);
  assert.equal(ORIGINAL.heroes.length, 8);
  for (const [id, [STR, AGI, ARM, LCK], hp, name, cls, , equipment, weapon] of HEROES) {
    const h = ORIGINAL.heroes.find(x => x.id === id);
    assert.deepEqual([h.stats, h.hp, h.name, h.class, h.equipment, h.specialWeaponId], [{ STR, AGI, ARM, LCK }, hp, name, cls, equipment, weapon], id);
    assert.equal(h.combatSetId, `S0${id.slice(5)}`, `${id}: its own set`);
    assert.equal(h.text, '', `${id}: no biography (a separate owner task)`);
    assert.equal(h.status, 'DRAFT', `${id}: draft until the owner approves`);
  }
});

test('spec v5 hero data: choosing a hero loads its own combat set (play-test mode uses the owner sets, never fixture hero sets)', () => {
  for (const [id] of HEROES) {
    assert.equal(M.heroes.find(h => h.id === id).combatSetId, `S0${id.slice(5)}`, id);
    // A two-player A/B/C fight: the hero plays its double-hit letter against the letter it beats.
    let g = act(meet({ hero: id, players: 2 }), 'RESPOND', { choice: 'attack' }, C);
    g = act(g, 'ANNOUNCE', {}, C);
    g = act(act(g, 'COMBAT_PICK', { side: 'monster', letter: BEATS[DOUBLE[id]] }, C), 'COMBAT_PICK', { side: 'hero', letter: DOUBLE[id] }, C);
    assert.deepEqual(g.log.filter(e => e.kind === 'exchange').map(e => [e.hero, e.monster, e.heroDmg, e.monsterDmg]), [[DOUBLE[id], BEATS[DOUBLE[id]], 0, 2]], `${id} hits twice with its own card`);
  }
});

test('spec v5 combat: every hero hits 2 only on its own double pairing, 1 on the other wins, ties are 1 each; no hero gets another hero\'s modifier', () => {
  const plain = C.combat.filter(c => c.setId === 'FX_S09'); // a monster set with no double hits
  assert.equal(plain.length, 3);
  for (const [id] of HEROES) {
    const set = C.combat.filter(c => c.setId === `S0${id.slice(5)}` && c.owner === 'hero');
    assert.deepEqual(set.map(c => c.letter).sort(), LETTERS, `${id}: one A, one B, one C`);
    assert.deepEqual(set.filter(c => c.doubleAgainst.length).map(c => [c.letter, c.doubleAgainst]), [[DOUBLE[id], [BEATS[DOUBLE[id]]]]], `${id}: exactly one double, on its own card`);
    for (const h of LETTERS) for (const m of LETTERS) {
      const card = l => set.find(c => c.letter === l).doubleAgainst;
      const r = abcExchange(h, m, card(h), plain.find(c => c.letter === m).doubleAgainst);
      const want = h === m ? { heroDmg: 1, monsterDmg: 1 } : BEATS[h] === m ? { heroDmg: 0, monsterDmg: h === DOUBLE[id] ? 2 : 1 } : { heroDmg: 1, monsterDmg: 0 };
      assert.deepEqual(r, want, `${id}: ${h} against ${m}`);
    }
  }
  // Cross-check: every other hero's double pairing deals 1 for this hero unless the two pairings are the same.
  for (const [id] of HEROES) for (const [other] of HEROES) {
    const w = DOUBLE[other], set = C.combat.filter(c => c.setId === `S0${id.slice(5)}`);
    assert.equal(abcExchange(w, BEATS[w], set.find(c => c.letter === w).doubleAgainst).monsterDmg, w === DOUBLE[id] ? 2 : 1, `${id} with ${other}'s pairing`);
  }
});

test('spec v5 crossbows: both hunters start with exactly 4 shots, assigned to HERO_5 and HERO_6; nobody else has Shoot', () => {
  assert.deepEqual(ORIGINAL.specialWeapons.map(w => [w.id, w.heroIds, w.uses, w.verb]), [['XBOW_1', ['HERO_5'], 4, 'Shoot'], ['XBOW_2', ['HERO_6'], 4, 'Shoot']]);
  for (const id of ['HERO_5', 'HERO_6']) {
    const g = meet({ hero: id });
    assert.equal(g.heroes[0].weaponUses, 0);
    assert.ok(choices(g).includes('special'), `${id} may shoot`);
    const bow = view(g, C, 0).heroes[0].inventory.equipment.filter(x => /crossbow/i.test(x.name));
    assert.deepEqual(bow.map(x => [x.source, x.usesLeft, x.unit, x.verb]), [['specialWeapons', 4, 'shot', 'Shoot']], 'shown once, as the card, 4 shots left');
  }
  for (const id of ['HERO_1', 'HERO_2', 'HERO_3', 'HERO_4', 'HERO_7', 'HERO_8']) assert.ok(!choices(meet({ hero: id })).includes('special'), `${id} has no Shoot`);
  for (const x of view(meet({ hero: 'HERO_1' }), C, 0).heroes[0].inventory.equipment) assert.deepEqual([x.usable, x.pending, x.reason], [false, false, 'Starting equipment: it has no rules of its own'], 'equipment is words only');
});

const shoot = (script, opts = {}) => act(meet({ script, ...opts }), 'RESPOND', { choice: 'special' }, C); // solo: announced at once

test('spec v5 crossbow: D6 1-3 miss, 4-5 a second D6 for floor(second / 2) (0,1,1,2,2,3), 6 kills; one shot per firing', () => {
  for (const d of [1, 2, 3]) {
    const g = shoot([d]);
    assert.deepEqual([g.encounter.monster.wounds, g.heroes[0].weaponUses, g.phase], [0, 1, 'COMBAT_SELECT'], `D6 ${d}: a miss, then the Attack reaction (a fight)`);
    assert.equal(g.log.filter(e => e.kind === 'roll').length, 1, 'no second die on a miss');
  }
  [0, 1, 1, 2, 2, 3].forEach((dmg, i) => {
    const first = 4 + (i % 2), second = i + 1;
    const g = shoot([first, second]);
    assert.equal(g.encounter.monster.wounds, dmg, `D6 ${first} then ${second}: ${dmg} damage`);
    assert.equal(g.heroes[0].weaponUses, 1, 'one shot used');
    assert.equal(g.phase, 'COMBAT_SELECT', 'the 4-HP brute survives and answers with its Attack reaction');
    assert.ok(!g.log.some(e => e.kind === 'exchange'), 'no combat card is read for the shot: double hits never apply');
  });
  const dead = shoot([6]);
  assert.equal(dead.encounter, null);
  assert.deepEqual(dead.log.filter(e => e.kind === 'encounter-end').map(e => e.outcome), ['monster-killed']);
  assert.ok(!dead.log.some(e => e.kind === 'reaction'), 'a dead monster gives no reaction');
  assert.equal(dead.decks.MONSTER.order.at(-1), 'FX_MON_BRUTE#1');
  assertCensus(assert, dead);
  const twice = shoot([1], { prep: g => { g.heroes[0].weaponUses = 2; } });
  assert.equal(twice.heroes[0].weaponUses, 3, 'exactly one shot per firing');
});

test('spec v5 crossbow: a surviving monster answers with its Attack reaction; no shots left means no Shoot, and the Items sheet says why', () => {
  const shy = shoot([2], { monster: 'FX_MON_SHY' }); // Attack: it flees
  assert.equal(shy.encounter, null);
  assert.deepEqual(shy.log.filter(e => e.kind === 'reaction').map(e => e.type), ['monster-flees']);
  const brute = shoot([3]);
  assert.deepEqual(brute.encounter.reaction, FX.monster.find(m => m.id === 'FX_MON_BRUTE').reactions.attack);
  const empty = meet({ prep: g => { g.heroes[0].weaponUses = 4; } });
  assert.deepEqual(choices(empty), ['attack', 'wait', 'flee'], 'no Shoot at 0 shots, and no reload');
  const bow = view(empty, C, 0).heroes[0].inventory.equipment.find(x => x.id === 'XBOW_1');
  assert.deepEqual([bow.usesLeft, bow.usable], [0, false]);
  assert.match(bow.reason, /^No shots left: all 4 are used/);
  // Existing ambush rule (D41): after the ambush damage the hunter may still shoot.
  const amb = meet({ room: 'FX_ROOM_AMBUSH', script: [7] });
  assert.ok(choices(amb).includes('special') && !choices(amb).includes('wait'));
});

test('spec v5 crossbow: a multiplayer hero learns no monster HP from a non-lethal hit (only the hit); solo shows it', () => {
  let m = act(meet({ players: 2, script: [4, 4] }), 'RESPOND', { choice: 'special' }, C);
  m = act(m, 'ANNOUNCE', {}, C); // the controller announces; then the shot rolls
  assert.equal(m.encounter.monster.wounds, 2);
  const hero = view(m, C, 0);
  assert.deepEqual(hero.encounter.monster, { groupId: 'FX_S09' }, 'no HP or wounds for the hero');
  const hit = hero.log.find(e => e.kind === 'monster-wound');
  assert.deepEqual([hit.amount, 'wounds' in hit, 'hp' in hit], [2, false, false], 'only that it was hit for 2');
  assert.equal(view(m, C, 1).encounter.monster.hp, 4, 'the monster player sees it');
  const solo = shoot([4, 4]);
  assert.deepEqual(view(solo, C, 0).encounter.monster, { groupId: 'FX_S09', hp: 4, wounds: 2 }, 'solo: shown (spec v4)');
});

// A solo turn start with a given ring.
function start({ ring, hero = 'HERO_1', at = '1,1', prep } = {}) {
  const g = setup({ content: C, heroes: [hero], deckOrders: { ROOM: EMPTY_ROOMS, DOOR: ['FX_DOOR_TRAP', 'FX_DOOR_OPENS'] } });
  g.seats[0].ringId = ringId(ring);
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, at);
  prep?.(g);
  return g;
}
const ringActs = g => acts(g, C).filter(a => a.type === 'USE_RING');

test('spec v5 Strength Ring: only as the turn action; the turn is skipped, +5 HP (no cap printed), Strength unchanged, consumed', () => {
  let g = start({ ring: 'Strength Ring' });
  assert.deepEqual(ringActs(g), [{ type: 'USE_RING', seat: 0 }]);
  const str = statOf(C, g.heroes[0], 'STR');
  g = act(g, 'USE_RING', {}, C);
  assert.equal(g.heroes[0].hp, 17 + 5, 'gains 5 HP, above the starting 17');
  assert.equal(g.heroes[0].hpStart, 17);
  assert.equal(statOf(C, g.heroes[0], 'STR'), str, 'no stat change');
  assert.equal(g.sun, 2, 'the turn was skipped');
  assert.equal(g.heroes[0].ringUsed, true);
  assert.deepEqual(g.log.filter(e => e.kind === 'item').map(e => [e.action, e.group, e.to]), [['use', 'ring', undefined], ['discard', 'ring', 'out of the game']]);
  assert.deepEqual(ringActs(g), [], 'single use');
  assert.equal(view(g, C, 0).heroes[0].inventory.ring, null, 'gone from the inventory');
  // Not offered anywhere else: not mid-move, not in an encounter.
  assert.deepEqual(ringActs(meet({ ring: 'Strength Ring' })), []);
});

test('spec v5 Opening Ring: only at a door or portcullis; it opens and the hero goes through, with no door card or test; it relocks', () => {
  assert.deepEqual(ringActs(start({ ring: 'Opening Ring' })), [], 'no door or portcullis next to the hero');
  const door = start({ ring: 'Opening Ring', prep: g => place(g, '1,0', 'FX_DOORWAY', 180) });
  assert.deepEqual(ringActs(door), [{ type: 'USE_RING', seat: 0, dir: 'N' }]);
  let g = act(door, 'USE_RING', { dir: 'N' }, C);
  assert.equal(`${g.heroes[0].coord.x},${g.heroes[0].coord.y}`, '1,0');
  assert.deepEqual(draws(g, 'DOOR'), [], 'no door card');
  assert.equal(edgeKind(g, C, { x: 1, y: 0 }, 'S'), 'door', 'locked again behind the hero');
  assert.equal(g.heroes[0].ringUsed, true);
  const gate = start({ ring: 'Opening Ring', prep: x => place(x, '1,0', 'FX_GATEWAY', 180) });
  g = act(gate, 'USE_RING', { dir: 'N' }, C);
  assert.equal(`${g.heroes[0].coord.x},${g.heroes[0].coord.y}`, '1,0');
  assert.ok(!g.log.some(e => e.kind === 'test'), 'no Strength test');
  assert.equal(edgeKind(g, C, { x: 1, y: 0 }, 'S'), 'gate', 'the portcullis stays');
  assert.deepEqual(ringActs(meet({ ring: 'Opening Ring' })), [], 'not in an encounter');
});

test('spec v5 Thunder Ring: in a normal encounter only (never an ambush); the monster flees, no reaction, no damage; consumed', () => {
  let g = meet({ hero: 'HERO_1', ring: 'Thunder Ring' });
  assert.deepEqual(ringActs(g), [{ type: 'USE_RING', seat: 0 }]);
  g = act(g, 'USE_RING', {}, C);
  assert.equal(g.encounter, null);
  assert.deepEqual(g.log.filter(e => e.kind === 'encounter-end').map(e => e.outcome), ['monster-fled']);
  assert.deepEqual(draws(g, 'MONSTER'), [], 'no monster card is drawn');
  assert.ok(!g.log.some(e => e.kind === 'reaction' || e.kind === 'damage'));
  assert.equal(g.heroes[0].hp, 17);
  assert.equal(g.sun, 2, 'the turn ends as when any monster flees');
  assert.equal(g.decks.ROOM.order.at(-1), 'FX_ROOM_MONSTER#1', 'the room card goes under its deck');
  assert.equal(g.heroes[0].ringUsed, true);
  assert.deepEqual(ringActs(meet({ hero: 'HERO_1', ring: 'Thunder Ring', room: 'FX_ROOM_AMBUSH', script: [1] })), [], 'not in an ambush');
  assert.deepEqual(ringActs(start({ ring: 'Thunder Ring' })), [], 'not outside an encounter');
});

test('spec v5 Protection Ring: offered only on a drawn trap card; its effects are skipped; consumed; declining lets it happen', () => {
  const door = () => start({ ring: 'Protection Ring', prep: g => place(g, '1,0', 'FX_DOORWAY', 180) });
  let g = act(door(), 'MOVE', { dir: 'N' }, C); // the door card is the fixture trap
  assert.deepEqual(types(g, C), ['USE_RING', 'DECLINE_RING']);
  const used = act(g, 'USE_RING', {}, C);
  assert.equal(used.heroes[0].hp, 17, 'the trap does nothing');
  assert.ok(used.log.some(e => e.kind === 'trap-ignored'));
  assert.equal(used.sun, 2, 'the door stays shut and the move ends, as for a door trap');
  assert.equal(used.heroes[0].ringUsed, true);
  const declined = act(g, 'DECLINE_RING', {}, C);
  assert.deepEqual([declined.heroes[0].hp, declined.heroes[0].ringUsed], [15, false], 'the trap happens, the ring stays');
  // A room trap; not on a card that is not a trap; not without the ring.
  const room = setup({ content: C, heroes: ['HERO_1'], deckOrders: { ROOM: ['FX_ROOM_TRAP', ...EMPTY_ROOMS] } });
  room.seats[0].ringId = ringId('Protection Ring');
  place(room, '1,0', 'FX_CROSS'); place(room, '1,1', 'FX_CROSS'); putHero(room, 0, '1,0');
  assert.deepEqual(types(act(room, 'MOVE', { dir: 'S' }, C), C), ['USE_RING', 'DECLINE_RING']);
  assert.notEqual(act(start({ ring: 'Protection Ring' }), 'MOVE', { dir: 'E' }, C).phase, 'RESOLVE_CARD', 'an empty room card is no trap');
  assert.equal(act(start({ ring: 'Thunder Ring', prep: x => place(x, '1,0', 'FX_DOORWAY', 180) }), 'MOVE', { dir: 'N' }, C).heroes[0].hp, 15, 'no offer without the ring');
});

test('spec v5 rings: four, single-use, chosen by the existing draft (last hero picker first, counterclockwise)', () => {
  assert.deepEqual(ORIGINAL.rings.map(r => [r.name, r.use.timing]), [['Strength Ring', 'turn-action'], ['Opening Ring', 'door-or-portcullis'], ['Thunder Ring', 'encounter-choice'], ['Protection Ring', 'trap-drawn']]);
  let g = setup({ players: 3, content: C });
  const order = g.log.filter(e => e.kind === 'pick-hero').map(e => e.seat);
  assert.deepEqual(g.log.filter(e => e.kind === 'pick-ring').map(e => e.seat), [...order].reverse());
  assert.equal(new Set(g.seats.map(s => s.ringId)).size, 3);
  assert.ok(g.seats.every(s => C.rings.some(r => r.id === s.ringId)));
});

test('spec v5 content integrity: 8 heroes, 24 hero combat cards, 2 crossbows, 4 rings; no fixture entries in those categories in play-test; the rest still incomplete', () => {
  const s = contentStatus(ORIGINAL, FX);
  assert.deepEqual(s.report.errors, []);
  const n = key => s.report.categories.find(c => c.key === key);
  assert.deepEqual(['heroes', 'specialWeapons', 'rings', 'combat'].map(k => n(k).defined), [8, 2, 4, 36]);
  assert.equal(ORIGINAL.combat.filter(c => c.owner === 'hero').length, 24);
  for (const k of ['heroes', 'specialWeapons', 'rings']) assert.ok(!M[k].some(e => e.status === 'FIXTURE'), k);
  assert.ok(!M.combat.some(c => c.status === 'FIXTURE' && c.owner === 'hero'), 'no fixture hero sets');
  assert.ok(!M.combat.some(c => c.status === 'FIXTURE'), 'the owner monster sets complete combat: no fixture combat cards');
  assert.ok(!syntheticCategories(M).some(x => /^Combat cards:/.test(x)));
  assert.ok(!syntheticCategories(M).some(x => /^(Heroes|Special weapon cards|Ring cards):/.test(x)));
  assert.deepEqual(s.report.pending, [], 'the heroes no longer wait on S01-S08');
  assert.equal(s.report.fullStartAllowed, false, 'drafts and incomplete categories keep Start off');
  for (const k of ['treasury', 'dragon', 'room', 'search', 'roomSearch', 'chest', 'door']) assert.ok(n(k).defined < n(k).required, `${k} still incomplete`);
  const r = spawnSync(process.execPath, ['tools/keep-content.js', 'check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Combat cards 36\/36: hero sets 24\/24, monster sets 12\/12 \(0 approved, 36 draft\)$/m);
  assert.match(r.stdout, /^Heroes 8\/8 \(0 approved, 8 draft\)$/m);
  assert.doesNotMatch(r.stdout, /waiting on/);
});

test('spec v5 content checks: a result table covers each face once; div is a whole number; a ring use names a ring timing', () => {
  const bow = C.specialWeapons[0];
  const errs = w => validateContent({ ...C, specialWeapons: [w, C.specialWeapons[1]] }).errors.map(e => e.message);
  const rows = bow.effects[0].rows;
  assert.deepEqual(errs(bow), []);
  assert.ok(errs({ ...bow, effects: [{ ...bow.effects[0], rows: rows.slice(0, 2) }] }).some(m => /cover each face 1 to 6 exactly once/.test(m)), 'a face left out');
  assert.ok(errs({ ...bow, effects: [{ ...bow.effects[0], rows: [...rows, { min: 6, max: 6, effects: [] }] }] }).some(m => /exactly once/.test(m)), 'a face twice');
  assert.ok(errs({ ...bow, effects: [{ op: 'DEAL_DAMAGE', target: 'monster', amount: { die: 'D6', div: 0 } }] }).some(m => /div must be/.test(m)));
  const ring = C.rings[0];
  assert.ok(validateContent({ ...C, rings: [{ ...ring, use: { timing: 'whenever', effects: [] } }, ...C.rings.slice(1)] }).errors.some(e => /use timing whenever not one of/.test(e.message)));
});
