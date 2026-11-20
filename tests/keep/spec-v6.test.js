// Owner specification v6 (docs/plans/spec-v6-owner-2026-11-19.md): the FP cells, the ceiling's second roll, the door
// deck's "shuffle again", the torch card's return, the treasure chamber coins, the Protection Ring's trap list and
// timing, the uncapped flask, and the dragon sequence. Owner cards (draft) on the NON-AUTHENTIC fixture board and tiles.
// None of this is an in-browser test: the repo has no browser runner; the dragon test drives the reducer and the UI's
// DOM-free word helpers (ui/words.js) that the screen uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent, validateContent, flaggedByStatus, STATUSES, toConfirm } from '../../site/keep/content/schema.js';
import { view } from '../../site/keep/engine/view.js';
import { instances } from '../../site/keep/engine/decks.js';
import { key } from '../../site/keep/engine/board.js';
import { shownEffectText } from '../../site/keep/engine/describe.js';
import { entries, dragonStatus, collectWords, forcedMoveWords } from '../../site/keep/ui/words.js';
import { FX, setup, act, acts, place, putHero, give, draws, assertCensus } from './helpers.js';

const C = ORIGINAL;
const M = mixContent(ORIGINAL, FX);
const T = { ...M, board: FX.board, tiles: FX.tiles, chamber: FX.chamber };
const EMPTY = Array(10).fill('ROOM_013');
const byId = (k, id) => C[k].find(e => e.id === id);
const go = (g, type, fields = {}) => act(g, type, fields, T);
const dice = (g, ...v) => { const c = structuredClone(g); c.rng.script.push(...v); return c; };
const hp = (g, s = 0) => g.heroes[s].hp;
const logged = (g, kind) => g.log.filter(e => e.kind === kind);
const ROLLS = new Set(['roll', 'test', 'named-roll', 'damage', 'formula']);

// Seat 0 steps from (1,0) south into (1,1), whose room card is `card` (as in catalogue.test.js).
function enter(card, { hero = 'HERO_1', script = [], decks = {}, prep, toTile = 'FX_CROSS', rot = 0 } = {}) {
  const heroes = [hero, ...C.heroes.map(h => h.id).filter(id => id !== hero)];
  const g = setup({ players: 1, content: T, heroes, script, deckOrders: { ROOM: [card, ...EMPTY], ...decks } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', toTile, rot);
  putHero(g, 0, '1,0');
  prep?.(g);
  return go(g, 'MOVE', { dir: 'S' });
}

// ---- 1. FP cells: source metadata only.
test('spec v6 FP cells: the four cells carry printedStat FP, nothing else does, and the engine fights at those HP', () => {
  const marked = C.monster.flatMap(d => Object.entries(d.rows).flatMap(([type, row]) => Object.entries(row).filter(([, r]) => r.printedStat).map(([choice, r]) => `${d.id} ${choice} ${type} ${r.printedStat} hp ${r.hp}`)));
  assert.deepEqual(marked, ['MONSTER_006 flee S11 FP hp 2', 'MONSTER_014 flee S12 FP hp 2', 'MONSTER_015 flee S09 FP hp 1', 'MONSTER_015 flee S11 FP hp 4']);
  for (const [id, type, room, hpWant] of [['MONSTER_006', 'S11', 'ROOM_017', 2], ['MONSTER_014', 'S12', 'ROOM_020', 2], ['MONSTER_015', 'S09', 'ROOM_019', 1], ['MONSTER_015', 'S11', 'ROOM_017', 4]]) {
    let g = enter(room, { decks: { MONSTER: [id] }, script: [6] });
    assert.equal(g.encounter.type, type);
    g = go(g, 'RESPOND', { choice: 'flee' });
    assert.equal(g.phase, 'COMBAT_SELECT', `${id} ${type}: strike, then a fight`);
    assert.equal(g.encounter.monster.hp, hpWant, `${id} ${type}: fights at the printed number`);
    assert.equal(JSON.stringify(view(g, T, 0)).includes('printedStat'), false, 'never in what a player is given');
  }
  // The schema accepts FP and nothing else there.
  const bad = structuredClone(C.monster);
  bad[5].rows.S11.flee.printedStat = 'KP';
  assert.match(validateContent({ ...C, monster: bad }).errors.map(e => e.message).join(), /printedStat may only be 'FP'/);
});

// ---- 2. Ceiling collapses: death check first, then a separate damage roll.
test('spec v6 ceiling: a match on the first D6 kills with no second roll; a miss rolls a second D6 for the damage', () => {
  const g = enter('ROOM_008');
  const dead = go(dice(g, 4), 'NAME_NUMBERS', { numbers: '4' });
  assert.equal(dead.heroes[0].status, 'DEAD');
  assert.equal(logged(dead, 'roll').length, 1, 'no second roll after death');
  const hurt = go(dice(g, 2, 5), 'NAME_NUMBERS', { numbers: '4' });
  assert.equal(hp(hurt), 12, 'the second D6 (5) is the damage, not the first (2)');
  assert.deepEqual(logged(hurt, 'roll').map(e => [e.die, e.value, e.reason]), [['D6', 2, 'named roll (Ceiling collapses)'], ['D6', 5, 'card roll collapse']], 'two distinct rolls, both shown on the roll card');
  const same = go(dice(g, 2, 4), 'NAME_NUMBERS', { numbers: '4' });
  assert.notEqual(same.heroes[0].status, 'DEAD', 'a second roll equal to the named number does not kill');
  assert.equal(hp(same), 13);
  // The log reads both: the named roll with no match, then the damage with the second die.
  const said = entries(hurt.log, { content: T, name: s => `P${s + 1}` });
  assert.ok(said.some(x => /named 4 and rolled 2: no match/.test(x.text)));
  assert.ok(said.some(x => /takes 5 damage from the card/.test(x.text) && /D6 5/.test(x.detail)));
  assert.match(shownEffectText(byId('room', 'ROOM_008')), /if it shows that number, you die; if not, roll a D6, you take damage equal to the roll/);
});

// ---- 3. Door "shuffle again": back in, shuffled, the replacement drawn at once.
test('spec v6 door shuffle: the card goes back, the pile is shuffled, the next door card resolves at once, repeated if needed', () => {
  // Scripted orders, one per shuffle: setup, then each reshuffle.
  let g = enter('ROOM_013', { toTile: 'FX_DOORWAY', decks: { DOOR: [['DOOR_005'], ['DOOR_001']] } });
  assert.deepEqual(draws(g, 'DOOR'), ['DOOR_005#1', 'DOOR_001#1']);
  assert.equal(key(g.heroes[0].coord), '1,1', 'the replacement opened the door: through it, the same turn');
  const plain = enter('ROOM_013', { toTile: 'FX_DOORWAY', decks: { DOOR: ['DOOR_001'] } });
  assert.deepEqual([g.sun, g.round, g.activeSeat], [plain.sun, plain.round, plain.activeSeat], 'no extra turn spent: the same as a door that opens at once');
  assert.equal(logged(g, 'turn').length, logged(plain, 'turn').length);
  g = enter('ROOM_013', { toTile: 'FX_DOORWAY', decks: { DOOR: [['DOOR_005'], ['DOOR_005'], ['DOOR_001']] } });
  assert.deepEqual(draws(g, 'DOOR'), ['DOOR_005#1', 'DOOR_005#1', 'DOOR_001#1'], 'again on a second "shuffle again"');
  assert.equal(g.decks.DOOR.shuffles, 3);
  assert.equal(key(g.heroes[0].coord), '1,1');
  assertCensus(assert, g, T);
  // A trap as the replacement is a trap: the turn ends, and the Protection Ring is offered first.
  g = enter('ROOM_013', { toTile: 'FX_DOORWAY', decks: { DOOR: [['DOOR_005'], ['DOOR_004']] }, script: [3] });
  assert.equal(hp(g), 14);
  assert.equal(g.sun, 2);
  g = enter('ROOM_013', { toTile: 'FX_DOORWAY', decks: { DOOR: [['DOOR_005'], ['DOOR_004']] }, prep: x => { x.seats[0].ringId = 'RING_4'; } });
  assert.equal(g.pending.kind, 'trap-ring');
  assert.match(shownEffectText(byId('door', 'DOOR_005')), /draw another door card at once/);
  assert.doesNotMatch(shownEffectText(byId('door', 'DOOR_005')), /shuffl|bottom of|stays shut/);
});

// The other four "shuffle again" cards were reshuffle-only under spec v6; spec v7 makes them redraw too (spec-v7.test.js).

// ---- 4. Torch: back under the room deck once relit.
test('spec v6 torch: kept while out; once relit it leaves the hero for the bottom of the room deck, and the turn goes on', () => {
  let g = enter('ROOM_004');
  assert.deepEqual(g.heroes[0].held, ['ROOM_004#1']);
  assert.equal(g.decks.ROOM.order.length, 59, 'one room card held');
  g = go(dice(g, 6), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.deepEqual(g.heroes[0].held, ['ROOM_004#1'], 'still out: still held');
  const sun = g.sun;
  g = go(dice(g, 2), 'NAME_NUMBERS', { numbers: '1,2,3' });
  assert.deepEqual(g.heroes[0].held, []);
  assert.equal(g.decks.ROOM.order.length, 60);
  assert.equal(g.decks.ROOM.order.at(-1), 'ROOM_004#1');
  assert.equal(g.phase, 'CHOOSE_ACTION', 'movement goes on this turn');
  assert.equal(g.sun, sun);
  assert.ok(logged(g, 'item').some(e => e.action === 'discard' && e.value === 'ROOM_004#1'));
  assertCensus(assert, g, T);
});

// ---- 5. Treasure chamber coins: their own deck, provisional.
test('spec v6 chamber coins: one each of 100 to 300 by 10, provisional; never sharing an id, deck or value with other coins', () => {
  const coins = C.treasury.filter(e => e.name === 'Coins');
  assert.deepEqual(coins.map(e => e.gold), Array.from({ length: 21 }, (_, i) => 100 + 10 * i));
  assert.ok(coins.every(e => e.copies === 1 && e.deck === 'TREASURY' && e.notes.includes('Status: PROVISIONAL/INFERRED') && !e.notes.includes('NEEDS OWNER')));
  const other = ['room', 'roomSearch', 'search', 'chest'].flatMap(k => C[k].filter(e => e.name === 'Coins'));
  assert.deepEqual(other.map(e => [e.deck, e.gold]), [['ROOM_SEARCH', 10], ['SEARCH', 60], ['CHEST', 50]]);
  const ids = new Set(instances(coins));
  assert.ok(instances(other).every(i => !ids.has(i)));
  assert.ok(other.every(e => !coins.some(c => c.gold === e.gold)), 'no 10, 50 or 60 gold card in the chamber');
  assert.equal(C.treasury.reduce((s, e) => s + e.copies, 0), 33);
});

// ---- 6. Protection Ring: the nine traps, offered before anything of the trap is rolled.
const RING = x => { x.seats[0].ringId = 'RING_4'; };
const TRAPS = {
  'ROOM_001 snakes': (o = {}) => enter('ROOM_001', o),
  'ROOM_003 mist': (o = {}) => enter('ROOM_003', o),
  'ROOM_005 explosion': (o = {}) => enter('ROOM_005', o),
  'ROOM_006 arrows': (o = {}) => enter('ROOM_006', o),
  'ROOM_008 ceiling': (o = {}) => enter('ROOM_008', o),
  'ROOM_015 trapdoor': (o = {}) => enter('ROOM_015', o),
  'DOOR_003 door trap (Luck)': (o = {}) => enter('ROOM_013', { ...o, toTile: 'FX_DOORWAY', decks: { DOOR: ['DOOR_003'] } }),
  'DOOR_004 door trap (D6)': (o = {}) => enter('ROOM_013', { ...o, toTile: 'FX_DOORWAY', decks: { DOOR: ['DOOR_004'] } }),
  'CHEST_008 chest trap': (o = {}) => go(enter('ROOM_009', { ...o, decks: { CHEST: ['CHEST_008'] } }), 'CHOOSE', { option: 0 }),
};
for (const [name, at] of Object.entries(TRAPS)) {
  test(`spec v6 Protection Ring on ${name}: offered before any roll or test; using it skips the whole trap; declining lets it happen`, () => {
    const g = at({ prep: RING });
    assert.equal(g.pending?.kind, 'trap-ring');
    const from = g.log.findLastIndex(e => e.kind === 'resolve-card');
    assert.deepEqual(g.log.slice(from).filter(e => ROLLS.has(e.kind)), [], 'nothing of the trap has happened yet');
    const before = hp(g);
    const used = go(g, 'USE_RING'); // the dice script is empty: any roll would throw
    assert.equal(hp(used), before, 'no damage');
    assert.equal(used.heroes[0].ringUsed, true, 'the ring is spent');
    assert.deepEqual(used.heroes[0].conditions, [], 'no pit, no missed turns');
    assert.notEqual(used.heroes[0].status, 'DEAD');
    assert.ok(logged(used, 'trap-ignored').length === 1);
    assert.equal(logged(used, 'turn-skipped').length, 0);
    const declined = go(dice(g, 6, 6, 6), 'DECLINE_RING');
    assert.equal(declined.heroes[0].ringUsed, false, 'declined: the ring stays');
    const happened = declined.log.slice(from).some(e => ROLLS.has(e.kind)) || declined.pending?.kind === 'name-numbers';
    assert.ok(happened, 'the trap resolves normally');
  });
}

test('spec v6: not traps for the ring: bats, giant spider, centipede, scorpion, monsters, torch, curse; the rotating room offers the ring by its own prompt (spec v9), never as a trap card', () => {
  for (const [k, id] of [['room', 'ROOM_023'], ['room', 'ROOM_024'], ['room', 'ROOM_025'], ['roomSearch', 'RSEARCH_002'], ['search', 'SEARCH_002'], ['room', 'ROOM_004'], ['room', 'ROOM_007'], ['room', 'ROOM_017'], ['room', 'ROOM_018']]) assert.notEqual(byId(k, id).kind, 'trap', id);
  assert.notEqual(enter('ROOM_023', { prep: RING, script: [6] }).pending?.kind, 'trap-ring');
  assert.notEqual(enter('ROOM_025', { prep: RING }).pending?.kind, 'trap-ring');
  assert.match(byId('room', 'ROOM_007').notes, /Status: OWNER_APPROVED_INTERPRETATION \(owner interpretation, spec v8/);
  // A rotating room (fixture tile): no trap-card prompt; spec v9 (D67) offers the ring by the rotating room's own prompt, before it turns.
  const spun = [0, 90, 180, 270].map(rot => { try { return enter('ROOM_013', { prep: RING, toTile: 'FX_ROTATE', rot }); } catch { return null; } }).find(x => x && key(x.heroes[0].coord) === '1,1');
  assert.ok(spun, 'the hero got into the rotating room');
  assert.equal(spun.pending?.kind, 'rotation-ring');
  assert.equal(spun.heroes[0].ringUsed, false);
});

// ---- 7. Small flask: uncapped, death at 0 or less, back to its own deck.
test('spec v6 flask: every copy gains D12 and loses D6 as one change with no cap; 0 or less is death; the card goes back under its own deck', () => {
  for (const [deck, id] of [['ROOM', 'ROOM_002'], ['ROOM_SEARCH', 'RSEARCH_001'], ['SEARCH', 'SEARCH_007'], ['CHEST', 'CHEST_006']]) {
    const g = enter('ROOM_013', { prep: x => give(x, 0, deck, id) });
    const inst = g.heroes[0].held[0];
    const size = g.decks[deck].order.length;
    const up = go(dice(g, 12, 1), 'USE_ITEM', { item: inst });
    assert.equal(hp(up), 17 + 11, `${id}: above starting HP`);
    assert.deepEqual(up.heroes[0].held, []);
    assert.equal(up.decks[deck].order.length, size + 1, `${id}: back in its own deck`);
    assert.equal(up.decks[deck].order.at(-1), inst, `${id}: at the bottom`);
    assertCensus(assert, up, T);
    const low = structuredClone(g);
    low.heroes[0].hp = 4;
    const dead = go(dice(low, 1, 5), 'USE_ITEM', { item: inst });
    assert.equal(dead.heroes[0].status, 'DEAD', `${id}: final HP 0 is death`);
    assert.equal(dead.decks[deck].order.includes(inst), true, `${id}: the card is not lost on death`);
    assert.match(byId({ ROOM: 'room', ROOM_SEARCH: 'roomSearch', SEARCH: 'search', CHEST: 'chest' }[deck], id).notes, /Status: OWNER_APPROVED_INTERPRETATION/);
  }
  assert.doesNotMatch(shownEffectText(byId('room', 'ROOM_002')), /stops at your starting HP/);
});

// ---- 8. The dragon, scripted end to end with two heroes in the lair.
test('spec v6 dragon sequence (Node, reducer + DOM-free UI words; not an in-browser test): collect, rising odds, the wake, the reset', () => {
  const TREAS = ['TREASURY_001', 'TREASURY_002', 'TREASURY_003', 'TREASURY_004', 'TREASURY_005', 'TREASURY_006'];
  let g = setup({ players: 2, content: T, heroes: ['HERO_1', 'HERO_2'], script: [5, 7], deckOrders: { ROOM: EMPTY, DRAGON: ['DRAGON_1', 'DRAGON_2', 'DRAGON_8'], TREASURY: TREAS } });
  for (const at of ['4,4', '5,4', '4,6', '6,5']) place(g, at, 'FX_CROSS');
  putHero(g, 0, '4,4');
  putHero(g, 1, '5,4');
  give(g, 0, 'ROOM', 'ROOM_010'); // ordinary treasure
  give(g, 1, 'SEARCH', 'SEARCH_005'); // an ordinary item
  const rope = [...g.heroes[1].held];
  const name = s => `P${s + 1}`;
  const status = () => dragonStatus(view(g, T, 0));
  assert.equal(g.activeSeat, 0);
  assert.equal(status(), 'Dragon wakes on 1 in 8');
  // Seat 0's chamber turn: two chamber cards, then a sleeping dragon card set aside.
  g = go(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(g.heroes[0].treasury, ['TREASURY_001#1', 'TREASURY_002#1']);
  assert.equal(status(), 'Dragon wakes on 1 in 7');
  assert.equal(g.activeSeat, 1);
  // Seat 1's chamber turn.
  g = go(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(g.heroes[1].treasury, ['TREASURY_003#1', 'TREASURY_004#1']);
  assert.equal(status(), 'Dragon wakes on 1 in 6');
  assert.deepEqual(g.dragon.aside, ['DRAGON_1#1', 'DRAGON_2#1'], 'sleeping cards stay set aside');
  assert.equal(g.activeSeat, 0);
  assert.equal(collectWords(view(g, T, 0), T), 'Two treasure chamber cards, then a dragon card. It wakes on 1 in 6.');
  const roomDraws = draws(g, 'ROOM').length;
  // Seat 0 stays: two more cards, then the awake card.
  g = go(g, 'COLLECT');
  assert.deepEqual(logged(g, 'dragon-odds').map(e => `${e.awake}/${e.remaining}`), ['1/8', '1/7', '1/6']);
  assert.ok(logged(g, 'dragon-wakes').some(e => e.waker === 0 && e.queue.join() === '0,1'), 'the waker first');
  // The waker: all four chamber cards to the bottom in order, a D12 of 5, then a move outside turn order.
  assert.deepEqual(g.heroes[0].treasury, []);
  assert.deepEqual(g.decks.TREASURY.order.slice(-4), ['TREASURY_001#1', 'TREASURY_002#1', 'TREASURY_005#1', 'TREASURY_006#1']);
  assert.equal(hp(g, 0), 12);
  assert.deepEqual(g.heroes[1].treasury, ['TREASURY_003#1', 'TREASURY_004#1'], 'the next hero not yet');
  assert.equal(g.pending.kind, 'forced-move');
  assert.equal(status(), 'The dragon is awake');
  assert.deepEqual(forcedMoveWords(name(g.pending.seat), T), ['The dragon drives you out', 'P1 must move to an explored room next to the treasure chamber. No room card is drawn.']);
  g = go(g, 'FORCED_MOVE', { to: '4,6' });
  assert.equal(key(g.heroes[0].coord), '4,6');
  assert.equal(g.dragon.resets, 0, 'no reset while seat 1 is still inside');
  assert.equal(g.dragon.awake, true);
  // Seat 1, in the same resolution: cards to the bottom, a D12 of 7, a forced move; still seat 0's turn.
  assert.deepEqual(g.decks.TREASURY.order.slice(-2), ['TREASURY_003#1', 'TREASURY_004#1']);
  assert.equal(hp(g, 1), 9);
  assert.equal(g.pending.seat, 1);
  assert.equal(g.activeSeat, 0, 'outside normal turn order');
  assert.deepEqual([...new Set(acts(g, T).map(a => a.seat))], [1]);
  g = go(g, 'FORCED_MOVE', { to: '6,5' });
  // The lair is empty: the dragon sleeps and all eight cards are shuffled back.
  assert.equal(g.dragon.resets, 1);
  assert.equal(g.dragon.awake, false);
  assert.equal(g.dragon.remaining.length, 8);
  assert.deepEqual(g.dragon.aside, []);
  assert.equal(status(), 'Dragon wakes on 1 in 8');
  assert.equal(draws(g, 'ROOM').length, roomDraws, 'no room card on either forced move');
  assert.deepEqual(g.heroes[0].held, ['ROOM_010#1'], 'ordinary treasure kept');
  assert.deepEqual(g.heroes[1].held, rope, 'ordinary items kept');
  assert.equal(g.activeSeat, 1, 'the normal order resumes after the waker');
  assert.equal(logged(g, 'turn').at(-1).seat, 1, "seat 1's own turn follows; its forced move did not use it");
  assertCensus(assert, g, T);
  // The log as the table reads it.
  const said = entries(view(g, T, null).log, { content: T, name }).map(x => x.text);
  for (const line of ['The dragon wakes on 1 in 8.', 'Dragon card: asleep.', 'The dragon wakes on 1 in 6.', 'Dragon card: awake.', 'The dragon wakes. Everyone in the treasure chamber, from P1 clockwise.', 'The dragon sleeps again.']) assert.ok(said.includes(line), line);
  assert.equal(said.filter(t => /driven out by the dragon/.test(t)).length, 2);
});

// ---- 9. Status labels.
test('spec v6 statuses: no entry keeps NEEDS OWNER CONFIRMATION; flagged entries are grouped by status (spec v9 adds OWNER_APPROVED_INTERPRETATION); none approved', () => {
  const groups = Object.fromEntries(flaggedByStatus(C));
  assert.deepEqual(Object.keys(groups), ['DIRECT 2023 RULE', 'DIRECT 2023 CARD', '1985-SUPPORTED INTERPRETATION', 'OWNER_APPROVED_INTERPRETATION', 'PROVISIONAL/INFERRED'], 'spec v8: no card waits on a ruling');
  assert.ok(Object.keys(groups).every(s => STATUSES.includes(s)));
  assert.deepEqual(groups['DIRECT 2023 RULE'], ['MONSTER_006', 'MONSTER_014', 'MONSTER_015']);
  assert.deepEqual(groups['DIRECT 2023 CARD'], ['ROOM_004']);
  assert.deepEqual(groups['1985-SUPPORTED INTERPRETATION'], ['ROOM_001', 'ROOM_003', 'ROOM_005', 'ROOM_008', 'ROOM_014', 'SEARCH_001', 'RSEARCH_008', 'CHEST_009', 'DOOR_005'], 'spec v7 adds the other four shuffle cards');
  assert.equal(groups['PROVISIONAL/INFERRED'].length, 21, 'the 21 chamber coins; the flasks were relabelled 2026-11-20');
  assert.deepEqual(groups.OWNER_APPROVED_INTERPRETATION, ['ROOM_002', 'ROOM_007', 'SEARCH_007', 'RSEARCH_001', 'CHEST_006'], 'the curse (spec v8, relabelled by spec v9) and the four flask copies (relabelled 2026-11-20)');
  assert.deepEqual(toConfirm(C), [], 'an owner-approved interpretation does not wait on a ruling');
  const every = Object.values(C).flat().filter(e => e && typeof e === 'object');
  assert.ok(every.every(e => !String(e.notes || '').includes('NEEDS OWNER CONFIRMATION')));
  assert.ok(every.every(e => e.status !== 'APPROVED'));
  assert.ok(every.every(e => !/owner approved/i.test(String(e.notes || ''))));
});

test('2026-11-20 relabel: the four flask copies are owner-approved interpretations; the 21 chamber coins stay provisional', () => {
  const byId = id => Object.values(C).flat().find(e => e && e.id === id);
  for (const id of ['ROOM_002', 'SEARCH_007', 'RSEARCH_001', 'CHEST_006']) {
    const n = byId(id).notes;
    assert.match(n, /Status: OWNER_APPROVED_INTERPRETATION/, id);
    assert.ok(!n.includes('PROVISIONAL/INFERRED'), id);
  }
  const coins = Object.values(C).flat().filter(e => e && /^TREASURY_0(1[3-9]|2\d|3[0-3])$/.test(e.id));
  assert.equal(coins.length, 21);
  assert.ok(coins.every(e => e.notes.includes('Status: PROVISIONAL/INFERRED')));
});
