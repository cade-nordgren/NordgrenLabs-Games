// Decks, the effect interpreter and card-data validation. T18, T18b, T04b, T09b, T22b (D03), T30 (SP 12 #18, #30).
// Fixture cards are NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { EFFECT_OPS as ENGINE_OPS } from '../../site/keep/engine/effects.js';
import { EFFECT_OPS as SCHEMA_OPS, validateContent } from '../../site/keep/content/schema.js';
import { FX, setup, types, act, place, putHero, give, draws, assertCensus, EMPTY_ROOMS } from './helpers.js';

// Hero at (1,0), steps S into a black room at (1,1) and draws the scripted room card.
function enterRoom(roomOrder, { script = [], other = {}, players = 1, prep = () => {} } = {}) {
  const empties = EMPTY_ROOMS.slice(roomOrder.filter(id => id === 'FX_ROOM_EMPTY').length);
  let g = setup({ players, script, towers: [0, 1], deckOrders: { ROOM: [...roomOrder, ...empties], ...other } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  place(g, '1,2', 'FX_CROSS');
  putHero(g, 0, '1,0');
  prep(g);
  return act(g, 'MOVE', { dir: 'S' });
}

test('T18 used cards go under their own deck; retained cards stay held; decks never merge (RB 7.2, RB 7.4, SP 6, SP 12 #18)', () => {
  const g = enterRoom(['FX_ROOM_EMPTY', 'FX_ROOM_COINS']);
  assert.equal(g.decks.ROOM.order.at(-1), 'FX_ROOM_EMPTY#1', 'empty room card is now at the bottom of the room deck');
  assert.ok(Object.entries(g.decks).every(([cat, d]) => cat === 'ROOM' || !d.order.includes('FX_ROOM_EMPTY#1')), 'and in no other deck');
  const kept = act(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(kept.heroes[0].held, ['FX_ROOM_COINS#1']);
  assert.ok(!kept.decks.ROOM.order.includes('FX_ROOM_COINS#1'), 'a kept card leaves the deck');
  assertCensus(assert, kept);
});

test('T18 branch draws go to the named sub-deck (RB 7.3, SP 6)', () => {
  const cases = [
    { cite: 'RB 7.3 chest card', room: 'FX_ROOM_CHEST', other: { CHEST: ['FX_CHEST_GOLD'] }, deck: 'CHEST', held: ['FX_CHEST_GOLD#1'] },
    { cite: 'RB 7.3 captive -> search deck', room: 'FX_ROOM_CAPTIVE', other: { SEARCH: ['FX_SEARCH_CAPTIVE'] }, deck: 'SEARCH', held: ['FX_SEARCH_CAPTIVE#1'] },
  ];
  for (const c of cases) {
    const g = enterRoom([c.room], { other: c.other });
    assert.deepEqual(draws(g, c.deck), c.held, c.cite);
    assert.deepEqual(g.heroes[0].held, c.held, c.cite);
    assert.equal(g.decks.ROOM.order.at(-1), `${c.room}#1`, `${c.cite}: the room card itself goes under the room deck`);
    assertCensus(assert, g);
  }
  // A branch to the monster deck is an encounter: commit first, the monster card after (RB 7.3, RB 8.1).
  const s = setup({ deckOrders: { ROOM: EMPTY_ROOMS, ROOM_SEARCH: ['FX_RSEARCH_LURKER'] } });
  place(s, '1,1', 'FX_CROSS');
  putHero(s, 0, '1,1');
  const m = act(s, 'SEARCH');
  assert.equal(m.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.deepEqual(draws(m, 'MONSTER'), []);
});

test('T18b a "shuffle again" card reshuffles its own pile only (RB 7.4, SP 6)', () => {
  const g = enterRoom(['FX_ROOM_CHEST'], { other: { CHEST: ['FX_CHEST_SHUFFLE'] } });
  assert.equal(g.decks.CHEST.shuffles, 2);
  assert.ok(g.decks.CHEST.order.includes('FX_CHEST_SHUFFLE#1'), 'returned, then shuffled in');
  assert.equal(g.decks.ROOM.shuffles, 1, 'other decks untouched');
  // SHUFFLE_DECK naming another deck shuffles that deck.
  const n = enterRoom(['FX_ROOM_CHEST'], { other: { CHEST: ['FX_CHEST_NEEDLE'] } });
  assert.equal(n.decks.ROOM_SEARCH.shuffles, 2);
  assert.equal(n.decks.CHEST.shuffles, 1);
  assertCensus(assert, n);
});

test('effect primitives from card data (plan 4.6; RB 5.1, RB 7.2, SP 6)', () => {
  const hp = g => g.heroes[0].hp; // knight: 17 HP, ARM 9, LCK 4
  const cases = [
    { cite: 'T22b D03: D6-2 with a 1 is 0, never heals', room: 'FX_ROOM_TRAP', script: [1], check: g => assert.equal(hp(g), 17) },
    { cite: 'RB 5.1: D6-2 with a 6 is 4', room: 'FX_ROOM_TRAP', script: [6], check: g => assert.equal(hp(g), 13) },
    { cite: 'RB 5.1 CHECK_STAT: D12 10 > ARM 9 fails', room: 'FX_ROOM_TEST', script: [10], check: g => assert.equal(hp(g), 15) },
    { cite: 'RB 5.1 CHECK_STAT: D12 9 <= ARM 9 passes', room: 'FX_ROOM_TEST', script: [9], check: g => assert.equal(hp(g), 17) },
    { cite: 'ROLL_D6 into a register, then damage from it', room: 'FX_ROOM_DICE', script: [5], check: g => assert.equal(hp(g), 15) },
    { cite: 'DRAW_CARD keep: drawn straight into held', room: 'FX_ROOM_SATCHEL', other: { CHEST: ['FX_CHEST_EMPTY'] }, check: g => assert.deepEqual(g.heroes[0].held, ['FX_CHEST_EMPTY#1']) },
    { cite: 'CONTINUE_MOVEMENT', room: 'FX_ROOM_DRAFT', check: g => { assert.equal(g.phase, 'CHOOSE_EXIT'); assert.equal(g.sun, 1); } },
    { cite: 'turnDisposition continue', room: 'FX_ROOM_PASSAGE', check: g => assert.equal(g.phase, 'CHOOSE_EXIT') },
    { cite: 'ROTATE_TILE', room: 'FX_ROOM_SPIN', check: g => assert.equal(g.board.tiles['1,1'].rotation, 90) },
    { cite: 'END_TURN stops the card: later effects never run', room: 'FX_ROOM_STOP', prep: g => { g.heroes[0].hp = 5; }, check: g => { assert.equal(hp(g), 5); assert.equal(g.sun, 2); } },
    { cite: 'MOVE_HERO prev: no room card on the way back', room: 'FX_ROOM_PUSH', check: g => { assert.deepEqual(g.heroes[0].coord, { x: 1, y: 0 }); assert.equal(draws(g, 'ROOM').length, 1); } },
    { cite: 'REMOVE_TREASURY_CARDS: to the bottom of the treasury deck', room: 'FX_ROOM_THIEF', prep: g => give(g, 0, 'TREASURY', 'FX_TREASURY_B'), check: g => { assert.deepEqual(g.heroes[0].treasury, []); assert.match(g.decks.TREASURY.order.at(-1), /^FX_TREASURY_B#/); } },
  ];
  for (const c of cases) {
    const g = enterRoom([c.room], { script: c.script, other: c.other, prep: c.prep });
    c.check(g);
    assertCensus(assert, g);
  }
});

test('T09b heal is capped at starting HP (D04); T04b death at exactly 0 HP (RB 3, SP 7)', () => {
  const healed = enterRoom(['FX_ROOM_TONIC'], { prep: g => { g.heroes[0].hp = 16; } });
  assert.equal(healed.heroes[0].hp, 17, 'D04: 16 + 3 stops at 17');
  const low = enterRoom(['FX_ROOM_TONIC'], { prep: g => { g.heroes[0].hp = 10; } });
  assert.equal(low.heroes[0].hp, 13);
  const dead = enterRoom(['FX_ROOM_TEST'], { script: [12], prep: g => { g.heroes[0].hp = 2; } });
  assert.equal(dead.heroes[0].hp, 0);
  assert.equal(dead.heroes[0].status, 'DEAD', 'T04b: 0 HP is death');
  const alive = enterRoom(['FX_ROOM_TEST'], { script: [12], prep: g => { g.heroes[0].hp = 3; } });
  assert.equal(alive.heroes[0].status, 'EXPLORING');
});

test('REQUEST_CHOICE waits for the player; RETAIN_CARD and RETURN_CARD_TO_BOTTOM (plan 4.6)', () => {
  const g = enterRoom(['FX_ROOM_FORK']);
  assert.equal(g.phase, 'RESOLVE_CARD');
  assert.deepEqual(types(g), ['CHOOSE']);
  const take = act(g, 'CHOOSE', { option: 0 });
  assert.deepEqual(take.heroes[0].held, ['FX_ROOM_FORK#1']);
  const leave = act(g, 'CHOOSE', { option: 1 });
  assert.deepEqual(leave.heroes[0].held, []);
  assert.equal(leave.decks.ROOM.order.at(-1), 'FX_ROOM_FORK#1');
  assert.equal(take.sun, 2);
  // MOVE_HERO adjacent-choice: the player picks a legal side, then the move resolves normally.
  const shove = enterRoom(['FX_ROOM_SHOVE']);
  assert.equal(shove.phase, 'RESOLVE_CARD');
  const s2 = act(shove, 'CHOOSE', { option: shove.pending.options.indexOf('S') });
  assert.deepEqual(s2.heroes[0].coord, { x: 1, y: 2 });
  assert.equal(draws(s2, 'ROOM').length, 2, 'drawRoom true: the room it lands in draws a card');
});

test('SET_CONDITION runs at the start of the hero\'s next turns; CLEAR_CONDITION removes it (RB 5 step 1, SP 4 step 2)', () => {
  const empties = { ROOM_SEARCH: ['FX_RSEARCH_EMPTY', 'FX_RSEARCH_EMPTY', 'FX_RSEARCH_TRINKET'] };
  let g = enterRoom(['FX_ROOM_CURSE'], { other: empties });
  assert.deepEqual(g.heroes[0].conditions.map(c => c.id), ['FX_CURSE']);
  assert.equal(g.heroes[0].hp, 16, 'solo: the next turn started at once and the curse struck first');
  g = act(g, 'SEARCH');
  assert.equal(g.heroes[0].hp, 15, 'second and last turn');
  assert.deepEqual(g.heroes[0].conditions, []);
  g = act(g, 'SEARCH');
  assert.equal(g.heroes[0].hp, 15, 'expired');
  const killed = enterRoom(['FX_ROOM_CURSE'], { prep: h => { h.heroes[0].hp = 1; } });
  assert.equal(killed.heroes[0].status, 'DEAD', 'a turn-start effect can kill');
  assert.equal(killed.status, 'over', 'and the dead hero gets no action');
  let b = enterRoom(['FX_ROOM_CURSE', 'FX_ROOM_BLESSING']);
  b = act(b, 'MOVE', { dir: 'S' }); // the blessing card clears it
  assert.deepEqual(b.heroes[0].conditions, []);
  assert.equal(b.heroes[0].hp, 16, 'no damage after it was cleared');
});

test('card data validation: effect ops, expressions, decks, reactions, combat sets, cross references (plan 4.7)', () => {
  assert.deepEqual([...ENGINE_OPS].sort(), [...SCHEMA_OPS].sort(), 'the interpreter and the validator know the same primitives');
  for (const op of ['ROLL_D12', 'ROLL_D6', 'CHECK_STAT', 'DEAL_DAMAGE', 'DRAW_CARD', 'RETAIN_CARD', 'RETURN_CARD_TO_BOTTOM', 'SHUFFLE_DECK', 'GRANT_TREASURE', 'REMOVE_TREASURY_CARDS', 'MOVE_HERO', 'END_TURN', 'SET_CONDITION', 'REQUEST_CHOICE', 'REQUEST_COMBAT', 'OPEN_TEMPORARY_PASSAGE', 'ROTATE_TILE']) assert.ok(SCHEMA_OPS.includes(op), `SP 11 primitive ${op}`);
  const swap = (key, i, over) => ({ ...FX, [key]: FX[key].map((e, j) => (j === i ? { ...e, ...over } : e)) });
  const cases = [
    { cite: 'unknown op', content: swap('room', 0, { effects: [{ op: 'TELEPORT' }] }), match: /FX_ROOM_EMPTY: unknown effect op TELEPORT/ },
    { cite: 'bad expression', content: swap('room', 0, { effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D20' } }] }), match: /die D20 not D6\/D12/ },
    { cite: 'nested effects are checked', content: swap('room', 0, { effects: [{ op: 'CHECK_STAT', stat: 'AGI', onFail: [{ op: 'NOPE' }] }] }), match: /unknown effect op NOPE/ },
    { cite: 'follow-up deck', content: swap('room', 0, { followUpDeck: 'TREASURY' }), match: /followUpDeck TREASURY not one of/ },
    { cite: 'deck field', content: swap('door', 0, { deck: 'ROOM' }), match: /FX_DOOR_OPENS: deck must be DOOR/ },
    { cite: 'door kinds', content: swap('door', 0, { kind: 'treasure' }), match: /kind treasure not allowed in DOOR/ },
    { cite: 'card disposition', content: swap('chest', 0, { cardDisposition: 'BURN' }), match: /cardDisposition BURN/ },
    { cite: 'monster reactions', content: swap('monster', 0, { reactions: { attack: { type: 'combat' }, wait: { type: 'combat' } } }), match: /FX_MON_BRUTE: reaction flee missing/ },
    { cite: 'strike needs damage', content: swap('monster', 0, { reactions: { ...FX.monster[0].reactions, flee: { type: 'strike-then-flight', damage: null } } }), match: /reaction flee: damage expression/ },
    { cite: 'flight only under flee', content: swap('monster', 0, { reactions: { ...FX.monster[0].reactions, attack: { type: 'flight-succeeds' } } }), match: /reaction attack: flight-succeeds only under flee/ },
    { cite: 'monster group set', content: swap('monster', 0, { groupId: 'FX_S01' }), match: /groupId FX_S01 is not a monster-group/ },
    { cite: 'D13: a card lists only the letter it beats', content: swap('combat', 0, { doubleAgainst: ['C'] }), match: /may only list B/ },
    { cite: 'one A, B and C per set', content: swap('combat', 1, { letter: 'A' }), match: /FX_S01: a combat set needs exactly one A, one B and one C/ },
    { cite: 'hero to combat set', content: swap('heroes', 0, { combatSetId: 'FX_S09' }), match: /combatSetId FX_S09 is not a hero combat set/ },
    { cite: 'hero to special weapon', content: swap('heroes', 0, { specialWeaponId: 'NOPE' }), match: /specialWeaponId NOPE does not exist/ },
    { cite: 'weapon to hero', content: swap('specialWeapons', 0, { heroIds: ['NOBODY'] }), match: /heroIds must name existing heroes/ },
    { cite: 'plan 13 #8 pending gate: door on the entry side', content: swap('tiles', 0, { sides: { N: 'open', E: 'open', S: 'door', W: 'open' } }), match: /FX_CROSS: entrySide is a door: PENDING owner ruling/ },
  ];
  for (const c of cases) {
    const msgs = validateContent(c.content).errors.map(e => e.message);
    assert.ok(msgs.some(m => c.match.test(m)), `${c.cite}: ${msgs.join(' | ')}`);
    assert.equal(validateContent(c.content).fixturePlayable, false, `${c.cite}: an invalid fixture set cannot start`);
  }
  assert.deepEqual(validateContent(FX).errors, []);
});

test('T30 no PvP, trading, revival or shared-turn actions exist (SP 9, SP 12 #30)', () => {
  const allowed = new Set(['MOVE', 'STOP', 'SEARCH', 'COLLECT', 'FORCED_SKIP', 'ROLL_DARK_EXIT', 'WELL_RETURN', 'WELL_DISCARD', 'WELL_JUMP', 'RUBBLE_RETURN', 'RUBBLE_FORCE', 'CHOOSE', 'RESPOND', 'ANNOUNCE', 'COMBAT_PICK', 'TARGET_RESULT', 'FORCED_MOVE', 'TOWER_CHOICE', 'USE_ITEM']); // USE_ITEM: only where a card's own use data allows (spec v3)
  const seen = new Set();
  for (const seed of [3, 11, 19, 27]) {
    let g = createGame({ players: ['A', 'B', 'C', 'D'], seed, content: FX });
    for (let i = 0; i < 400 && g.status !== 'over'; i++) {
      const legal = legalActions(g, FX);
      legal.forEach(a => seen.add(a.type));
      g = reduce(g, legal[(i * 5) % legal.length], FX);
    }
  }
  for (const t of seen) if (!['ROLL_FIRST_PLAYER', 'PICK_HERO', 'PICK_RING', 'PICK_TOWER'].includes(t)) assert.ok(allowed.has(t), `unexpected action ${t}`);
  assert.ok(!['TRADE', 'GIVE', 'ATTACK_HERO', 'REVIVE', 'PASS'].some(t => seen.has(t)));
});
