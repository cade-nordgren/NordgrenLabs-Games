// Acceptance tests for the owner's card catalogue (2026-11-19; audit in docs/plans/audit-card-catalogue-2026-11-19.md).
// Every table below is typed from the owner's package, so a later content edit that changes a count, a value or a
// monster cell fails loudly. Mechanics run the owner's cards on the NON-AUTHENTIC fixture board and tiles (a known
// geometry); the soak at the end plays the full owner content, board and tiles included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent, validateContent, bannerLines, contentStatus, DRAFT_BANNER, toConfirm } from '../../site/keep/content/schema.js';
import { createGame, reduce, restore, serialize, MECHANICS_VERSION } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { view } from '../../site/keep/engine/view.js';
import { instances } from '../../site/keep/engine/decks.js';
import { abcExchange } from '../../site/keep/engine/combat.js';
import { exits, neighbour, squareKind, key } from '../../site/keep/engine/board.js';
import { heroGold } from '../../site/keep/engine/heroes.js';
import { entries, cardText, fightRowModel, conditionWords } from '../../site/keep/ui/words.js';
import { shownEffectText } from '../../site/keep/engine/describe.js';
import { FX, setup, act, acts, place, putHero, give, draws, assertCensus } from './helpers.js';

// Queue dice on a copy, so one position can be branched with different rolls.
const dice = (g, ...v) => { const c = structuredClone(g); c.rng.script.push(...v); return c; };

const C = ORIGINAL;
const M = mixContent(ORIGINAL, FX); // play-test content: every slot is the owner's, so no fixture fill-in
const T = { ...M, board: FX.board, tiles: FX.tiles, chamber: FX.chamber }; // owner cards on the fixture board
const EMPTY = Array(10).fill('ROOM_013'); // the owner's Empty room (12 copies)
const byId = (k, id) => C[k].find(e => e.id === id);
const copies = list => list.reduce((s, e) => s + (e.copies ?? 1), 0);

// ---- Exact frequencies and values, typed from the package (section A, D-J). [name, copies, gold or null].
const DECKS = {
  room: [['Poisonous snakes', 1], ['Small flask', 1], ['Poisonous mist', 1], ['Torch goes out', 1], ['Explosion', 1], ['Arrow trap', 1], ["Wizard's curse", 1], ['Ceiling collapses', 1],
    ['Chest', 3], ['Arm ring', 1, 40], ['Costume jewelry', 1, 30], ['Costume jewelry', 1, 25], ['Empty room', 12], ['Shuffle again', 1], ['Trapdoor', 2], ['Sarcophagus', 3], ['Skeleton', 3],
    ['Ambush skeleton', 2], ['Dark elf', 5], ['Orc', 4], ['Ambush orc', 2], ['Fallen warrior', 4], ['Vampire bats', 1], ['Vampire bats', 1], ['Giant spider', 2], ['Mountain troll', 3], ['Ambush mountain troll', 1]],
  roomSearch: [['Small flask', 1], ['Centipede', 1], ['Secret door', 5], ['Costume jewelry', 1, 200], ['Ring', 1, 90], ['Coins', 1, 10], ['Nothing found', 3], ['Shuffle again', 1]],
  search: [['Shuffle again', 1], ['Scorpion', 2], ['Necklace', 1, 150], ['Nothing', 5], ['Rope', 3], ['Coins', 2, 60], ['Small flask', 1]],
  door: [['Door opens', 7], ['Door stays shut', 5], ['Door trap', 1], ['Door trap', 1], ['Shuffle again', 1]],
  chest: [['Empty', 4], ['Jewelry', 1, 100], ['Arm ring', 1, 120], ['Coins', 1, 50], ['Dagger', 1, 250], ['Small flask', 2], ['Bones', 1], ['Trap', 2], ['Shuffle again', 1]],
  treasury: [['Pearl necklace', 1, 1800], ['Gemstones', 1, 3800], ['Scepter', 1, 1100], ['Gold chain', 1, 500], ['Arm ring', 1, 800], ['Giant ruby', 1, 4500], ['Gold chain', 1, 700], ['Crown', 1, 4000],
    ['Jewels', 1, 3200], ['Goblet', 1, 1500], ['Pitcher', 1, 2000], ['Golden apple', 1, 2200], ...Array.from({ length: 21 }, (_, i) => ['Coins', 1, 100 + 10 * i])],
};
const TOTALS = { room: 60, treasury: 33, roomSearch: 14, search: 15, door: 15, monster: 15, chest: 14, dragon: 8, rings: 4, specialWeapons: 2, heroes: 8 };

test('catalogue: exact deck sizes and variant frequencies in every category', () => {
  for (const [k, n] of Object.entries(TOTALS)) assert.equal(copies(C[k]), n, `${k} has ${n} cards`);
  assert.equal(C.combat.filter(c => c.owner === 'hero').length, 24, 'hero combat 24');
  assert.equal(C.combat.filter(c => c.owner === 'monster-group').length, 12, 'monster combat 12');
  assert.equal(copies(C.combat), 36);
  for (const [k, table] of Object.entries(DECKS)) {
    assert.equal(C[k].length, table.length, `${k}: ${table.length} variants`);
    table.forEach(([name, n, gold = null], i) => {
      const e = C[k][i];
      assert.equal(e.name, name, `${e.id} name`);
      assert.equal(e.copies, n, `${e.id} (${name}) copies`);
      assert.equal(e.gold ?? null, gold, `${e.id} (${name}) gold`);
      assert.equal(e.status, 'DRAFT', `${e.id} is draft, never approved by the build`);
      assert.equal(e.text, '', `${e.id}: no copied wording`);
    });
  }
  // Separate physical copies: each copy is its own instance, and the five flasks are five cards in four decks.
  const flasks = ['room', 'roomSearch', 'search', 'chest'].flatMap(k => instances(C[k].filter(e => e.name === 'Small flask')));
  assert.deepEqual(flasks, ['ROOM_002#1', 'RSEARCH_001#1', 'SEARCH_007#1', 'CHEST_006#1', 'CHEST_006#2']);
  assert.equal(instances(C.room.filter(e => e.name === 'Empty room')).length, 12);
  assert.equal(new Set(instances(C.room)).size, 60);
  // The dragon deck: 7 sleeping and 1 awake (data entry only, rules unchanged).
  assert.deepEqual(C.dragon.map(d => d.kind), [...Array(7).fill('sleeping'), 'awake']);
  // Hero data stays as verified in spec v5 (the names on screen are the owner's own choice, kept).
  assert.deepEqual(C.heroes.map(h => [h.stats.STR, h.stats.AGI, h.stats.ARM, h.stats.LCK, h.hp]), [[6, 4, 9, 4, 17], [5, 5, 9, 5, 16], [7, 5, 6, 5, 16], [6, 6, 9, 6, 15], [3, 8, 5, 7, 11], [2, 9, 5, 8, 10], [4, 7, 4, 8, 15], [3, 8, 4, 9, 14]]);
  assert.ok(C.heroes.every(h => h.text === ''), 'no biographies');
  assert.deepEqual(C.specialWeapons.map(w => [w.heroIds[0], w.uses]), [['HERO_5', 4], ['HERO_6', 4]]);
  assert.deepEqual(C.rings.map(r => r.name), ['Strength Ring', 'Opening Ring', 'Thunder Ring', 'Protection Ring']);
  const v = validateContent(C);
  assert.deepEqual(v.errors, []);
  assert.ok(v.categories.every(c => c.defined === c.required), 'every category N/N');
  assert.equal(v.fullStartAllowed, false, 'drafts keep the full Start off');
});

test('catalogue: traps are exactly the cards the catalogue names a trap (Protection Ring, D50, D63)', () => {
  const traps = ['room', 'roomSearch', 'search', 'door', 'chest', 'treasury'].flatMap(k => C[k].filter(e => e.kind === 'trap').map(e => `${e.id} ${e.name}`));
  assert.deepEqual(traps, ['ROOM_006 Arrow trap', 'ROOM_015 Trapdoor', 'DOOR_003 Door trap', 'DOOR_004 Door trap', 'CHEST_008 Trap']);
});

test('catalogue: damage expressions are stored exactly as catalogued', () => {
  const amount = (k, id) => byId(k, id).effects.find(e => e.op === 'DEAL_DAMAGE').amount;
  assert.deepEqual(amount('room', 'ROOM_001'), { die: 'D12', minusStat: 'AGI' });
  assert.deepEqual(amount('room', 'ROOM_003'), { die: 'D6', plus: -3 });
  assert.equal(amount('room', 'ROOM_005'), 4);
  assert.deepEqual(amount('room', 'ROOM_006'), { die: 'D12', minusStat: 'ARM' });
  assert.deepEqual(amount('room', 'ROOM_023'), { die: 'D6', plus: -2 });
  assert.deepEqual(amount('room', 'ROOM_024'), { die: 'D6', plus: -3 });
  assert.deepEqual(amount('roomSearch', 'RSEARCH_002'), { die: 'D12' });
  assert.deepEqual(amount('search', 'SEARCH_002'), { die: 'D6', plus: -2 });
  assert.deepEqual(amount('door', 'DOOR_003'), { die: 'D12', minusStat: 'LCK' });
  assert.deepEqual(amount('door', 'DOOR_004'), { die: 'D6' });
  assert.deepEqual(amount('chest', 'CHEST_008'), { die: 'D12', plus: -3, minusStat: 'ARM' }, 'exactly D12 - 3 - Armour');
});

// ---- All 180 monster reaction cells, typed from the package (section J). Per card: Dark Elf, Mountain Troll, Skeleton,
// Orc, each "attack wait flee". R monster retreats; E hero escapes; Fn fight at HP n; Hx>Fn strike x then fight at n;
// Hx>E strike x then the hero escapes. x: a number, or Dd-s (a d-sided die minus s; "D6-0" as printed).
const MATRIX = [
  [1, 'R R H1>F1', 'F2 R E', 'F4 F4 HD6-2>F3', 'R F6 HD6-0>F5'],
  [2, 'F2 F1 H1>F1', 'R R E', 'F4 F2 E', 'F5 F4 HD6-2>F5'],
  [3, 'R R E', 'F3 F4 E', 'F5 F4 HD6-3>E', 'F3 F3 HD6-3>F4'],
  [4, 'R R HD6-3>F2', 'F4 F5 HD12-4>F4', 'F5 F5 H2>F3', 'F4 F4 HD6-3>F5'],
  [5, 'R R H1>F1', 'F2 R E', 'F5 F4 HD6-3>E', 'R R E'],
  [6, 'R R E', 'F2 F3 E', 'F3 F3 H3>F2', 'F2 F3 HD6-0>E'],
  [7, 'R R E', 'F1 R E', 'F4 F4 E', 'F4 F3 HD6-3>F3'],
  [8, 'F1 F1 F1', 'F1 R E', 'R R E', 'F5 R F3'],
  [9, 'R R E', 'R R E', 'F2 F3 HD6-3>E', 'R F2 E'],
  [10, 'R R F1', 'F2 F3 E', 'F5 F5 HD6-3>E', 'R F1 E'],
  [11, 'F3 F2 H1>F2', 'F3 F4 HD12-0>F3', 'F4 F4 H3>F4', 'F3 F3 HD6-3>F2'],
  [12, 'R R F1', 'F2 F3 E', 'F2 F3 E', 'F2 F2 HD6-2>F2'],
  [13, 'F4 F2 E', 'F2 F2 E', 'F3 F3 E', 'F3 F3 HD6-1>E'],
  [14, 'R R E', 'F2 R E', 'F5 F4 E', 'R R HD6-4>F2'],
  [15, 'R R H1>F1', 'R R E', 'F2 F2 HD6-3>F4', 'R R E'],
];
const TYPES = ['S09', 'S10', 'S11', 'S12'];
const TYPE_NAME = { S09: 'Dark Elf', S10: 'Mountain Troll', S11: 'Skeleton', S12: 'Orc' };
const ROOM_OF = { S09: 'ROOM_019', S10: 'ROOM_026', S11: 'ROOM_017', S12: 'ROOM_020' }; // the normal encounter card of each type
const FP = ['6 flee S11', '14 flee S12', '15 flee S09', '15 flee S11']; // the four cells printed FP, not KP
function parseCell(s) {
  if (s === 'R') return { type: 'monster-flees' };
  if (s === 'E') return { type: 'flight-succeeds' };
  if (/^F\d+$/.test(s)) return { type: 'combat', hp: +s.slice(1) };
  const m = /^H(\d+|D(6|12)-(\d))>(F(\d+)|E)$/.exec(s);
  const damage = m[2] ? { die: `D${m[2]}`, plus: m[3] === '0' ? 0 : -m[3] } : +m[1];
  return m[5] ? { type: 'strike-then-combat', damage, hp: +m[5] } : { type: 'strike-then-flight', damage };
}

// Seat 0 steps from (1,0) south into a black room at (1,1) whose room card is `card` (owner cards, fixture board).
function enter(card, { hero = 'HERO_1', players = 1, script = [], decks = {}, prep, toTile = 'FX_CROSS', rot = 0 } = {}) {
  const heroes = [hero, ...C.heroes.map(h => h.id).filter(id => id !== hero)];
  const g = setup({ players, content: T, heroes, script, deckOrders: { ROOM: [card, ...EMPTY], ...decks } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', toTile, rot);
  putHero(g, 0, '1,0');
  prep?.(g);
  return act(g, 'MOVE', { dir: 'S' }, T);
}
const go = (g, type, fields = {}) => act(g, type, fields, T);
const hp = g => g.heroes[0].hp;
const at = g => key(g.heroes[0].coord);
const logged = (g, kind) => g.log.filter(e => e.kind === kind);

for (const [n, ...rows] of MATRIX) {
  test(`catalogue monster card ${n}: all 12 cells (content and engine)`, () => {
    const def = byId('monster', `MONSTER_${String(n).padStart(3, '0')}`);
    assert.deepEqual(Object.keys(def.rows), TYPES, 'four rows, one per monster type');
    TYPES.forEach((type, ti) => rows[ti].split(' ').forEach((cell, ci) => {
      const choice = ['attack', 'wait', 'flee'][ci], want = parseCell(cell), where = `card ${n} ${choice} ${TYPE_NAME[type]}`;
      assert.deepEqual(def.rows[type][choice], want, `${where}: content`);
      // The engine: the room card names the type, the hero commits, the monster card (this one) answers.
      const strike = want.damage?.die ? [{ D6: 6, D12: 12 }[want.damage.die]] : [];
      let g = enter(ROOM_OF[type], { decks: { MONSTER: [def.id] }, script: strike });
      assert.equal(g.encounter.type, type);
      g = go(g, 'RESPOND', { choice });
      const struck = logged(g, 'damage').find(e => e.reason === 'monster strike');
      const dmg = want.damage === undefined ? null : Number.isInteger(want.damage) ? want.damage : { D6: 6, D12: 12 }[want.damage.die] + want.damage.plus;
      assert.equal(struck?.amount ?? null, dmg, `${where}: strike damage`);
      if (want.type === 'monster-flees') assert.equal(logged(g, 'encounter-end')[0]?.outcome, 'monster-fled', `${where}: monster retreats`);
      if (want.type.endsWith('flight') || want.type === 'flight-succeeds') { assert.equal(at(g), '1,0', `${where}: hero escapes back`); assert.equal(logged(g, 'flight').length, 1); }
      if (want.hp) {
        assert.equal(g.phase, 'COMBAT_SELECT', `${where}: a fight`);
        assert.equal(view(g, T, 0).encounter.monster.hp, want.hp, `${where}: fight HP (solo sees it after the reveal)`);
      }
    }));
    // The four printed FP cells are flagged for the owner in the card's notes; no other card is.
    const flagged = FP.filter(x => x.startsWith(`${n} `));
    assert.equal(def.notes.includes('NEEDS OWNER CONFIRMATION'), flagged.length > 0, 'FP flag in the notes');
  });
}

test('catalogue: an ambush deals D12 - Luck first, then Attack or Flee (no Wait), and reads the same card row', () => {
  // HERO_1 Luck 4: a D12 of 10 deals 6; monster card 1 Skeleton attack is a fight at HP 4.
  let g = enter('ROOM_018', { decks: { MONSTER: ['MONSTER_001'] }, script: [10] });
  assert.equal(hp(g), 11);
  assert.deepEqual(acts(g, T).filter(a => a.type === 'RESPOND').map(a => a.choice), ['attack', 'flee']);
  g = go(g, 'RESPOND', { choice: 'attack' });
  assert.equal(view(g, T, 0).encounter.monster.hp, 4);
  assert.deepEqual(['ROOM_021', 'ROOM_027'].map(id => byId('room', id).effects[0]), [{ op: 'MONSTER_ENCOUNTER', ambush: true, monster: 'S12' }, { op: 'MONSTER_ENCOUNTER', ambush: true, monster: 'S10' }]);
});

test('catalogue: the 12 monster combat cards: four types x A/B/C, normal hits only, letters B/C flagged as inferred', () => {
  for (const type of TYPES) {
    const set = C.combat.filter(c => c.setId === type);
    assert.deepEqual(set.map(c => [c.letter, c.owner, c.groupName, c.doubleAgainst]), ['A', 'B', 'C'].map(l => [l, 'monster-group', TYPE_NAME[type], []]));
    for (const c of set) assert.equal(c.notes.includes('inferred'), c.letter !== 'A', `${c.id}: B/C corner letter inferred`);
    // A beats B, B beats C, C beats A for 1; a tie 1 each; no monster double hit.
    assert.deepEqual(abcExchange('B', 'A', [], []), { heroDmg: 1, monsterDmg: 0 });
    assert.deepEqual(abcExchange('A', 'C', [], set.find(c => c.letter === 'C').doubleAgainst), { heroDmg: 1, monsterDmg: 0 });
    assert.deepEqual(abcExchange('C', 'C', [], []), { heroDmg: 1, monsterDmg: 1 });
  }
});

test('catalogue: multiplayer never shows the monster card, its HP or reaction before the announce; the type is public', () => {
  let g = enter('ROOM_017', { players: 2, decks: { MONSTER: ['MONSTER_001'] } });
  g = go(g, 'RESPOND', { choice: 'attack' });
  assert.equal(g.phase, 'MONSTER_REACT');
  const hero = view(g, T, 0).encounter, ctrl = view(g, T, 1).encounter;
  assert.deepEqual(hero.monster, { groupId: 'S11' });
  assert.equal(hero.reaction, null);
  assert.equal(ctrl.monster.hp, 4, 'the monster player reads it');
  assert.match(fightRowModel(view(g, T, 0), 0, hero, s => `P${s + 1}`, T).who, /against the Skeleton$/);
  g = go(g, 'ANNOUNCE');
  assert.deepEqual(view(g, T, 0).encounter.monster, { groupId: 'S11' }, 'no HP for the multiplayer hero after the reveal either');
});

// ---- Stateful card mechanics, with forced dice.
test('catalogue: poisonous snakes, vampire bats, centipede, scorpion: damage floored at 0, never healing', () => {
  let g = enter('ROOM_001', { script: [10] }); // D12 10 - Agility 4
  assert.equal(hp(g), 11);
  g = enter('ROOM_001', { script: [2] });
  assert.equal(hp(g), 17, 'a negative result is 0 (D03)');
  assert.equal(logged(g, 'damage')[0].raw, -2);
  assert.equal(hp(enter('ROOM_024', { script: [6] })), 14);
});

test('catalogue: poisonous mist: D6 - 3 damage, then one skipped turn per point taken; none for 0', () => {
  let g = enter('ROOM_003', { script: [5] }); // 2 damage: the next two turns pass
  assert.equal(hp(g), 15);
  assert.equal(logged(g, 'turn-skipped').length, 2);
  assert.deepEqual(logged(g, 'turn-skipped').map(e => e.left), [1, 0]);
  assert.equal(g.sun, 4);
  assert.equal(g.phase, 'CHOOSE_ACTION');
  assert.equal(conditionWords({ id: 'skip-turns', label: 'Unconscious', turns: 2 }), 'Unconscious: 2 turns to miss');
  g = enter('ROOM_003', { script: [3] });
  assert.equal(logged(g, 'turn-skipped').length, 0);
  assert.equal(g.sun, 2);
});

test('catalogue: explosion: lose 4 HP and miss the next turn', () => {
  const g = enter('ROOM_005');
  assert.equal(hp(g), 13);
  assert.equal(logged(g, 'turn-skipped').length, 1);
  assert.equal(g.sun, 3);
});

test('catalogue: small flask: kept, drunk on the hero\'s own turn without using it; D12 gained and D6 lost at once; back to its own deck', () => {
  let g = enter('ROOM_002');
  assert.deepEqual(g.heroes[0].held, ['ROOM_002#1']);
  assert.ok(acts(g, T).some(a => a.type === 'USE_ITEM' && a.item === 'ROOM_002#1'));
  g.heroes[0].hp = 10;
  const sun = g.sun;
  let u = go(dice(g, 9, 3), 'USE_ITEM', { item: 'ROOM_002#1' });
  assert.equal(hp(u), 16, '+9 - 3');
  assert.equal(u.phase, 'CHOOSE_ACTION', 'the turn goes on');
  assert.equal(u.sun, sun);
  assert.deepEqual(u.heroes[0].held, []);
  assert.equal(u.decks.ROOM.order.at(-1), 'ROOM_002#1', 'to the bottom of the room deck');
  g.heroes[0].hp = 15;
  assert.equal(hp(go(dice(g, 9, 3), 'USE_ITEM', { item: 'ROOM_002#1' })), 17, 'a gain stops at starting HP (D04)');
  u = go(dice(g, 2, 6), 'USE_ITEM', { item: 'ROOM_002#1' });
  assert.equal(hp(u), 11, 'a net loss is damage');
  // Offered while choosing whether to keep moving too (a yellow corridor).
  g = enter('ROOM_013', { toTile: 'FX_STRAIGHT', prep: x => give(x, 0, 'CHEST', 'CHEST_006') });
  assert.equal(g.phase, 'CHOOSE_EXIT');
  u = go(dice(g, 4, 4), 'USE_ITEM', { item: 'CHEST_006#1' });
  assert.equal(u.phase, 'CHOOSE_EXIT');
  assert.equal(u.decks.CHEST.order.at(-1), 'CHEST_006#1', 'the chest copy goes back under the chest deck');
  assertCensus(assert, u, T);
});

test('catalogue: a flask never stands in for the forced skip of a hero with no way on (D20, D53)', () => {
  const g = setup({ players: 1, content: T, deckOrders: { ROOM: EMPTY } });
  place(g, '1,1', 'FX_STRAIGHT'); // a yellow corridor: no search; both neighbours unexplored and no tiles left
  putHero(g, 0, '1,1');
  g.board.tileBag = [];
  give(g, 0, 'SEARCH', 'SEARCH_007');
  g.seats[0].ringId = 'RING_4'; // a ring with no turn-start use
  assert.deepEqual(acts(g, T).map(a => a.type).sort(), ['FORCED_SKIP', 'USE_ITEM']);
});

test('catalogue: torch goes out: kept; each later turn name three numbers; a match relights it, a miss ends the turn', () => {
  let g = enter('ROOM_004');
  assert.deepEqual(g.heroes[0].held, ['ROOM_004#1']);
  assert.equal(g.pending.kind, 'name-numbers');
  assert.equal(g.pending.count, 3);
  assert.equal(acts(g, T).length, 20, 'every set of three different numbers');
  g = go(dice(g, 6), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.equal(logged(g, 'named-roll').at(-1).match, false);
  assert.equal(g.pending.kind, 'name-numbers', 'still out: the next turn asks again');
  assert.equal(g.sun, 3);
  g = go(dice(g, 5), 'NAME_NUMBERS', { numbers: '4,5,6' });
  assert.equal(g.phase, 'CHOOSE_ACTION', 'relit: the turn goes on');
  assert.equal(g.sun, 3);
  assert.deepEqual(g.heroes[0].conditions, []);
  assert.deepEqual(g.heroes[0].held, ['ROOM_004#1'], 'the card stays kept (D56, to confirm)');
});

test('catalogue: trapdoor: Luck test avoids it; a fall is D6 damage, then a climb-out Agility test each later turn; a rope frees untested', () => {
  let g = enter('ROOM_015', { script: [3] }); // Luck 4: a pass
  assert.equal(hp(g), 17);
  assert.equal(g.phase, 'CHOOSE_ACTION');
  g = enter('ROOM_015', { script: [10, 3] }); // fail, D6 3
  assert.equal(hp(g), 14);
  assert.deepEqual(g.pending.options, ['Climb out']);
  g = go(dice(g, 9), 'CHOOSE', { option: 0 }); // Agility 4: a fail
  assert.deepEqual(g.pending.options, ['Climb out'], 'still in the pit next turn');
  g = go(dice(g, 2), 'CHOOSE', { option: 0 });
  assert.equal(g.phase, 'CHOOSE_ACTION', 'out, and the turn goes on');
  g = enter('ROOM_015', { script: [10, 3], prep: x => give(x, 0, 'SEARCH', 'SEARCH_005') });
  assert.equal(g.phase, 'CHOOSE_ACTION', 'the rope: out at once, no test');
  assert.equal(logged(g, 'freed').length, 1);
  assert.match(g.heroes[0].held.join(), /^SEARCH_005#[123]$/, 'the rope is not used up');
  assert.equal(logged(g, 'test').length, 1, 'only the Luck test was rolled');
});

test("catalogue: wizard's curse turns every placed yellow corridor; heroes stay; fallen portcullises stay", () => {
  for (const [roll, turn] of [[1, 90], [4, 180], [6, 270]]) {
    let g = setup({ players: 2, content: T, script: [roll], deckOrders: { ROOM: ['ROOM_007', ...EMPTY] } });
    place(g, '1,0', 'FX_CROSS'); place(g, '1,1', 'FX_CROSS');
    place(g, '3,3', 'FX_STRAIGHT', 0); place(g, '5,5', 'FX_STRAIGHT', 90); place(g, '4,4', 'FX_TEE', 0);
    putHero(g, 0, '1,0'); putHero(g, 1, '3,3');
    g.board.edges['5,5|N'] = 'gate';
    g = go(g, 'MOVE', { dir: 'S' });
    assert.equal(g.board.tiles['3,3'].rotation, turn % 360);
    assert.equal(g.board.tiles['5,5'].rotation, (90 + turn) % 360);
    assert.equal(g.board.tiles['4,4'].rotation, 0, 'other tiles stay');
    assert.equal(key(g.heroes[1].coord), '3,3', 'the hero on a corridor stays on its square');
    assert.equal(g.board.edges['5,5|N'], 'gate');
    const open = exits(g, T, 1).filter(e => e.edge !== 'wall').map(e => e.dir).sort().join('');
    assert.equal(open, turn === 180 ? 'NS' : 'EW', 'its ways out follow the new rotation');
    assert.deepEqual(logged(g, 'tiles-rotated')[0].at.sort(), ['3,3', '5,5']);
  }
});

test('catalogue: ceiling collapses: name one number; a match is death, otherwise damage equal to the roll (D59, to confirm)', () => {
  let g = enter('ROOM_008');
  assert.equal(g.pending.count, 1);
  assert.equal(acts(g, T).length, 6);
  const dead = go(dice(g, 4), 'NAME_NUMBERS', { numbers: '4' });
  assert.equal(dead.heroes[0].status, 'DEAD');
  g = go(dice(g, 3), 'NAME_NUMBERS', { numbers: '4' });
  assert.equal(hp(g), 14);
});

test('catalogue: chest, sarcophagus and fallen warrior: an optional draw from the chest or search deck', () => {
  let g = enter('ROOM_009', { decks: { CHEST: ['CHEST_005'] } });
  assert.deepEqual(g.pending.options, ['Open the chest', 'Leave it']);
  const left = go(g, 'CHOOSE', { option: 1 });
  assert.deepEqual(draws(left, 'CHEST'), []);
  g = go(g, 'CHOOSE', { option: 0 });
  assert.deepEqual(g.heroes[0].held, ['CHEST_005#1']);
  assert.equal(heroGold(g.heroes[0], T), 250);
  g = enter('ROOM_016', { decks: { CHEST: ['CHEST_001'] } });
  assert.deepEqual(g.pending.options, ['Open the sarcophagus', 'Leave it']);
  g = enter('ROOM_022', { decks: { SEARCH: ['SEARCH_005'] } });
  assert.deepEqual(g.pending.options, ['Search the body', 'Leave it']);
  g = go(g, 'CHOOSE', { option: 0 });
  assert.deepEqual(g.heroes[0].held, ['SEARCH_005#1']);
  assertCensus(assert, g, T);
});

test('catalogue: bones: an odd D12 wakes a normal Skeleton encounter with a monster card; even is nothing', () => {
  let g = go(enter('ROOM_009', { decks: { CHEST: ['CHEST_007'] }, script: [7] }), 'CHOOSE', { option: 0 });
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.equal(g.encounter.type, 'S11');
  assert.deepEqual(acts(g, T).filter(a => a.type === 'RESPOND').map(a => a.choice), ['attack', 'wait', 'flee']);
  assert.equal(g.encounter.monster, null, 'no fixed HP: the monster card decides');
  g = go(enter('ROOM_009', { decks: { CHEST: ['CHEST_007'] }, script: [8] }), 'CHOOSE', { option: 0 });
  assert.equal(g.encounter, null);
  assert.equal(g.phase, 'CHOOSE_ACTION');
});

test('catalogue: chest trap is exactly D12 - 3 - Armour, and the Protection Ring is offered on it', () => {
  assert.equal(hp(go(enter('ROOM_009', { decks: { CHEST: ['CHEST_008'] }, script: [12] }), 'CHOOSE', { option: 0 })), 17, 'Armour 9: 12 - 3 - 9 = 0');
  assert.equal(hp(go(enter('ROOM_009', { hero: 'HERO_7', decks: { CHEST: ['CHEST_008'] }, script: [12] }), 'CHOOSE', { option: 0 })), 10, 'Armour 4: 5');
  const g = go(enter('ROOM_009', { decks: { CHEST: ['CHEST_008'] }, prep: x => { x.seats[0].ringId = 'RING_4'; } }), 'CHOOSE', { option: 0 });
  assert.equal(g.pending.kind, 'trap-ring');
});

test('catalogue: giant spider: Fight or Flee; flee on 3-6; the fight names three numbers, a miss costs 1 and goes on next turn', () => {
  let g = enter('ROOM_025');
  assert.deepEqual(g.pending.options, ['Fight', 'Flee']);
  let f = go(dice(go(g, 'CHOOSE', { option: 0 }), 2), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.equal(f.phase, 'CHOOSE_ACTION', 'killed: no lasting fight');
  assert.equal(hp(f), 17);
  f = go(dice(go(g, 'CHOOSE', { option: 0 }), 5), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.equal(hp(f), 16);
  assert.equal(f.pending.label, 'Fight the giant spider', 'the fight goes on at the next turn');
  f = go(dice(f, 6), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.equal(hp(f), 15);
  const sun = f.sun;
  f = go(dice(f, 1), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.deepEqual(f.heroes[0].conditions, []);
  assert.equal(f.sun, sun + 1, 'the kill ends that turn');
  // Flee: 3-6 is the normal flight back; 1-2 is the fight.
  const fled = go(dice(g, 4), 'CHOOSE', { option: 1 });
  assert.equal(at(fled), '1,0');
  assert.equal(go(dice(g, 2), 'CHOOSE', { option: 1 }).pending.kind, 'name-numbers');
  // No way back (the portcullis that fell behind a red room): only Fight.
  assert.deepEqual(enter('ROOM_025', { toTile: 'FX_CORNER', rot: 180 }).pending.options, ['Fight']);
});

test('catalogue: door cards: opens, stays shut (try another way), the two door traps end the turn, shuffle leaves it shut (D62)', () => {
  const door = (id, script = []) => enter('ROOM_013', { toTile: 'FX_DOORWAY', decks: { DOOR: [id] }, script });
  assert.equal(at(door('DOOR_001')), '1,1');
  let g = door('DOOR_002');
  assert.equal(at(g), '1,0');
  assert.equal(g.phase, 'CHOOSE_EXIT');
  g = door('DOOR_003', [12]); // D12 12 - Luck 4
  assert.equal(hp(g), 9);
  assert.equal(g.sun, 2, 'the turn ended');
  assert.equal(hp(door('DOOR_004', [4])), 13);
  g = door('DOOR_005');
  assert.equal(at(g), '1,0');
  assert.equal(g.phase, 'CHOOSE_EXIT');
  assert.equal(g.decks.DOOR.shuffles, 2, 'the door deck was reshuffled (R62)');
  assertCensus(assert, g, T);
});

test('catalogue: secret door: one use, the hero may cross a wall to a neighbouring square this turn (R56, D11)', () => {
  let g = setup({ players: 1, content: T, deckOrders: { ROOM: EMPTY, ROOM_SEARCH: ['RSEARCH_003'] } });
  place(g, '1,0', 'FX_CROSS'); place(g, '1,1', 'FX_TEE', 0); // the tee is walled to the north
  putHero(g, 0, '1,1');
  assert.equal(exits(g, T, 0).find(e => e.dir === 'N').edge, 'wall');
  g = go(g, 'SEARCH');
  assert.equal(g.phase, 'CHOOSE_EXIT');
  assert.ok(acts(g, T).some(a => a.type === 'MOVE' && a.dir === 'N'), 'through the wall');
  g = go(g, 'MOVE', { dir: 'N' });
  assert.equal(at(g), '1,0');
});

test('catalogue: every "shuffle again" card reshuffles only its own deck; counts are preserved', () => {
  let g = enter('ROOM_014');
  assert.equal(g.decks.ROOM.shuffles, 2);
  assert.equal(g.decks.SEARCH.shuffles, 1);
  assertCensus(assert, g, T);
  for (const [k, id] of [['roomSearch', 'RSEARCH_008'], ['search', 'SEARCH_001'], ['door', 'DOOR_005'], ['chest', 'CHEST_009']]) {
    const def = byId(k, id);
    assert.equal(def.kind, 'reshuffle');
    assert.equal(def.cardDisposition, 'RESHUFFLE_DECK');
  }
});

test('catalogue: treasure scores at escape: kept room, search and chest treasure plus chamber cards', () => {
  let g = setup({ players: 1, content: T, deckOrders: { ROOM: EMPTY } });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  give(g, 0, 'ROOM', 'ROOM_010'); give(g, 0, 'SEARCH', 'SEARCH_003'); give(g, 0, 'CHEST', 'CHEST_005'); give(g, 0, 'ROOM_SEARCH', 'RSEARCH_005');
  give(g, 0, 'TREASURY', 'TREASURY_006');
  g = go(go(g, 'MOVE', { dir: 'W' }), 'TOWER_CHOICE', { choice: 'ESCAPE' });
  assert.equal(g.status, 'over');
  assert.equal(g.result.escaped[0].gold, 40 + 150 + 250 + 90 + 4500, 'the ordinary ring is plain treasure');
});

test('catalogue: a dragon wake takes the chamber cards only; kept room treasure stays (owner dragon data, rules unchanged)', () => {
  const c = FX.board.center[0], dir = ['N', 'S', 'E', 'W'].find(d => squareKind(FX.board, neighbour(neighbour(c, d), d === 'N' ? 'S' : d === 'S' ? 'N' : d === 'E' ? 'W' : 'E')) === 'center' && squareKind(FX.board, neighbour(c, d)) === 'maze');
  const from = neighbour(c, dir), back = { N: 'S', S: 'N', E: 'W', W: 'E' }[dir];
  let g = setup({ players: 1, content: T, script: [1], deckOrders: { ROOM: EMPTY, TREASURY: ['TREASURY_006', 'TREASURY_008'], DRAGON: ['DRAGON_8'] } });
  place(g, key(from), 'FX_CROSS');
  putHero(g, 0, key(from));
  give(g, 0, 'ROOM', 'ROOM_010');
  assert.deepEqual(view(g, T, 0).dragon.odds, { awake: 1, remaining: 8 });
  g = go(g, 'MOVE', { dir: back });
  assert.equal(logged(g, 'dragon-wakes').length, 1);
  assert.deepEqual(g.heroes[0].treasury, [], 'chamber cards back under their deck');
  assert.deepEqual(g.heroes[0].held, ['ROOM_010#1']);
  assert.equal(heroGold(g.heroes[0], T), 40);
  assertCensus(assert, g, T);
});

test('catalogue: the dragon odds and reset behave as ruled with the owner dragon cards (D22, D40 regression)', () => {
  const c = FX.board.center[0], dir = ['N', 'S', 'E', 'W'].find(d => squareKind(FX.board, neighbour(c, d)) === 'maze');
  const from = neighbour(c, dir), back = { N: 'S', S: 'N', E: 'W', W: 'E' }[dir];
  let g = setup({ players: 1, content: T, deckOrders: { ROOM: EMPTY, DRAGON: ['DRAGON_1'] } });
  place(g, key(from), 'FX_CROSS');
  putHero(g, 0, key(from));
  g = go(g, 'MOVE', { dir: back });
  assert.deepEqual(view(g, T, 0).dragon.odds, { awake: 1, remaining: 7 }, 'a sleeping card set aside: 1 in 7');
  assert.equal(g.heroes[0].treasury.length, 2);
  g = go(g, 'MOVE', { dir, from: key(g.heroes[0].coord) });
  assert.equal(g.dragon.resets, 1, 'the chamber emptied: all eight back (D22)');
  assert.deepEqual(view(g, T, 0).dragon.odds, { awake: 1, remaining: 8 });
});

test('catalogue: play-test runs on owner data only; the banner says draft, not NON-AUTHENTIC; saves from v6 are refused', () => {
  assert.equal(M.label, DRAFT_BANNER);
  const g = createGame({ players: ['A', 'B'], seed: 3, content: M });
  assert.equal(g.banner, DRAFT_BANNER);
  assert.doesNotMatch(g.banner, /NON-AUTHENTIC/);
  const lines = bannerLines(M);
  assert.match(lines[0], /^Draft, not approved: /);
  assert.match(lines[1], /entries wait on your ruling/);
  assert.match(contentStatus(ORIGINAL, FX).play, /all \d+ slots are your own entries, still draft/);
  assert.deepEqual(toConfirm(C).sort(), ['DOOR_005', 'MONSTER_006', 'MONSTER_014', 'MONSTER_015', 'ROOM_004', 'ROOM_008', ...Array.from({ length: 21 }, (_, i) => `TREASURY_${String(13 + i).padStart(3, '0')}`)].sort());
  assert.equal(MECHANICS_VERSION, 'rb-0.2/sp-1.0/v7');
  const old = JSON.parse(serialize(g));
  old.mechanicsVersion = 'rb-0.2/sp-1.0/v6';
  assert.throws(() => restore(JSON.stringify(old), M), /Unsupported save version/);
  // A category falling back to fixtures keeps the placeholder banner.
  const part = mixContent({ ...ORIGINAL, room: ORIGINAL.room.slice(1) }, FX);
  assert.match(createGame({ players: ['A'], seed: 1, content: part }).banner, /NON-AUTHENTIC/);
});

// ---- Soak: random legal play over the full owner content (board and tiles included), 1, 2 and 4 players, with the
// leak and text checks of play.test.js. KEEP_CATALOGUE_GAMES=600 for a longer run.
const BAD = /undefined|NaN|\bnull\b|\[object Object\]/;
const CITATION = /\b(RB|SP) \d|\bD(0\d|1[01]|[2-9]\d)\b|\bR\d{2,3}\b|NON-AUTHENTIC|NEEDS OWNER/;
const clean = (t, where) => assert.ok(typeof t === 'string' && !BAD.test(t) && !CITATION.test(t), `${where}: ${JSON.stringify(t)}`);
const picker = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('catalogue soak: several hundred random games on the owner content, every view clean and nothing hidden leaks', () => {
  for (const k of ['room', 'roomSearch', 'search', 'door', 'chest', 'treasury']) for (const def of M[k]) clean(cardText(def, null, M), def.id);
  const seen = new Set();
  const games = +process.env.KEEP_CATALOGUE_GAMES || 300;
  for (let i = 0; i < games; i++) {
    const players = [1, 2, 4][i % 3], pick = picker(5000 + i);
    let g = createGame({ players: Array.from({ length: players }, (_, s) => `P${s + 1}`), seed: 5000 + i, content: M });
    const name = s => g.seats[s].name;
    for (let step = 0; g.status !== 'over'; step++) {
      assert.ok(step < 6000, 'the game ends');
      const la = legalActions(g, M);
      assert.ok(la.length, `${g.phase}: a legal action exists`);
      g = reduce(g, la[Math.floor(pick() * la.length)], M);
      for (const h of g.heroes) for (const cnd of h?.conditions || []) { const w = conditionWords(cnd); if (w) clean(w, 'condition words'); }
      if (!g.encounter || g.status !== 'playing') continue;
      for (const viewer of [null, ...g.seats.keys()]) {
        const enc = view(g, M, viewer).encounter;
        const controller = players > 1 && viewer === enc.controller;
        if (players > 1 && !controller) {
          if (enc.monster) assert.deepEqual(Object.keys(enc.monster), ['groupId'], 'no monster card or HP for the hero or the table');
          if (!enc.announced) assert.equal(enc.reaction, null, 'no reaction before the announce');
          if (enc.combat?.monsterPick) assert.equal(enc.combat.monsterPick, 'hidden', 'the monster pick stays hidden');
        }
        clean(fightRowModel(view(g, M, viewer), enc.seat, enc, name, M).who, 'fight row');
      }
    }
    // Every line of every seat's log and the table's, once the game is over.
    for (const viewer of [null, ...g.seats.keys()]) for (const x of entries(view(g, M, viewer).log, { content: M, name })) { clean(x.text, `log ${x.e.kind}`); if (x.detail) clean(x.detail, `detail ${x.e.kind}`); seen.add(x.e.kind); }
    for (const e of g.log) if (e.kind === 'resolve-card') seen.add(e.value.split('#')[0]);
  }
  for (const k of ['named-roll', 'turn-skipped', 'tiles-rotated', 'encounter', 'exchange', 'throw', 'escape', 'death']) assert.ok(seen.has(k), `the soak reached ${k}`);
  const cards = [...seen].filter(x => /^(ROOM|RSEARCH|SEARCH|DOOR|CHEST)_/.test(x));
  assert.ok(cards.length >= 50, `the soak resolved ${cards.length} different owner cards`);
});

test('catalogue: every owner card text reads in plain words (no deck bookkeeping, no rule citations)', () => {
  for (const k of ['room', 'roomSearch', 'search', 'door', 'chest', 'treasury', 'dragon']) for (const def of C[k]) {
    const t = shownEffectText(def, "Dragon's Lair");
    clean(t, def.id);
    assert.doesNotMatch(t, /bottom of|shuffled/, `${def.id}: no deck bookkeeping`);
  }
});
