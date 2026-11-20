// Owner specification v10 (docs/plans/spec-v10-owner-2026-11-20.md): six behaviours approved as already implemented,
// checked here bullet by bullet against the owner's clarifications. No behaviour was changed for them; where an older test
// already pins a bullet, it is named in a comment rather than repeated. Owner cards and rings (draft) on the NON-AUTHENTIC
// fixture board and tiles (a known geometry); the lair and the well use the fixture set, as in spec-v4.test.js.
// Printed mechanics vs owner-approved interpretations are recorded in plan section 9 (D40, D42, D47, D49, D50, D53).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent } from '../../site/keep/content/schema.js';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { statOf } from '../../site/keep/engine/heroes.js';
import { view } from '../../site/keep/engine/view.js';
import { exits } from '../../site/keep/engine/board.js';
import { FX, setup, act, types, place, putHero, give, draws, slotsOf, EMPTY_ROOMS } from './helpers.js';

const C = ORIGINAL;
const M = mixContent(ORIGINAL, FX);
const T = { ...M, board: FX.board, tiles: FX.tiles, chamber: FX.chamber }; // owner cards, fixture board and tiles
const OWN = { ...M, board: FX.board, tiles: C.tiles, chamber: FX.chamber }; // owner tiles too (the rotating room TILE_014)
const EMPTY = Array(10).fill('ROOM_013');
const go = (g, type, fields = {}, content = T) => act(g, type, fields, content);
const dice = (g, ...v) => { const c = structuredClone(g); c.rng.script.push(...v); return c; };
const logged = (g, kind, from = 0) => g.log.slice(from).filter(e => e.kind === kind);
const FLASKS = new Set(['ROOM_002', 'RSEARCH_001', 'SEARCH_007', 'CHEST_006']);
const isFlask = a => a.type === 'USE_ITEM' && FLASKS.has(a.item.split('#')[0]);
const flaskActs = (g, content = T) => legalActions(g, content).filter(isFlask);
const ringActs = (g, content = T) => legalActions(g, content).filter(a => a.type === 'USE_RING');
const FLASK = (seat = 0) => x => give(x, seat, 'ROOM', 'ROOM_002');
const ring = (id, seat = 0) => x => { x.seats[seat].ringId = id; };
const both = (...fns) => x => fns.forEach(f => f(x));

// Seat 0 steps from (1,0) south into (1,1), whose room card is `card` (as in spec-v6.test.js).
function enter(card, { hero = 'HERO_1', players = 1, script = [], decks = {}, prep, toTile = 'FX_CROSS', rot = 0 } = {}) {
  const heroes = [hero, ...C.heroes.map(h => h.id).filter(id => id !== hero)];
  const g = setup({ players, content: T, towers: [0, 1, 2, 3], heroes, script, deckOrders: { ROOM: [card, ...EMPTY], ...decks } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', toTile, rot);
  putHero(g, 0, '1,0');
  prep?.(g);
  return go(g, 'MOVE', { dir: 'S' });
}
// Seat 0 at the start of its turn on a placed four-way room at (1,1).
function atStart({ prep, hero = 'HERO_1' } = {}) {
  const g = setup({ content: T, heroes: [hero], deckOrders: { ROOM: EMPTY } });
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,1');
  prep?.(g);
  return g;
}
const monsterType = id => C.room.find(r => r.id === id).effects.find(e => e.op === 'MONSTER_ENCOUNTER').monster;
const fightCard = type => C.monster.find(m => m.rows[type].attack.type === 'combat').id; // a card whose Attack reaction is a fight

// ---- 1. Strength Ring (D47). Printed: skip a turn, gain 5 HP. Approved interpretation: usable at full HP, no cap,
// offered only as the turn's first action. spec-v5.test.js also pins the item log and the inventory.
test('spec v10 #1 Strength Ring: offered at full HP as the turn\'s first action; the turn is skipped; exactly +5, above the starting HP; Strength unchanged; consumed', () => {
  const g = atStart({ prep: ring('RING_1') });
  assert.equal(g.phase, 'CHOOSE_ACTION');
  assert.equal(g.heroes[0].hp, g.heroes[0].hpStart, 'at full starting HP');
  assert.deepEqual(ringActs(g), [{ type: 'USE_RING', seat: 0 }], 'offered at full HP');
  const str = statOf(T, g.heroes[0], 'STR'), sun = g.sun, from = g.log.length;
  const used = go(g, 'USE_RING');
  assert.equal(used.heroes[0].hp, 17 + 5, 'exactly 5 HP, above the starting 17');
  assert.equal(used.heroes[0].hpStart, 17, 'the starting HP is unchanged');
  assert.equal(statOf(T, used.heroes[0], 'STR'), str, 'the Strength attribute is unchanged');
  assert.deepEqual(used.heroes[0].coord, g.heroes[0].coord, 'no move');
  assert.ok(!used.log.slice(from).some(e => ['move', 'search', 'stay'].includes(e.kind)), 'no other action this turn');
  assert.equal(used.sun, sun + 1, 'the turn is skipped');
  assert.equal(used.heroes[0].ringUsed, true, 'consumed');
  assert.deepEqual(ringActs(used), [], 'single use');
  const high = structuredClone(g);
  high.heroes[0].hp = 20;
  assert.equal(go(high, 'USE_RING').heroes[0].hp, 25, 'exactly +5 again from above the starting HP');
  // Only the turn's first action: not while choosing whether to keep moving, not in an encounter.
  const corridor = enter('ROOM_013', { toTile: 'FX_STRAIGHT', prep: ring('RING_1') });
  assert.equal(corridor.phase, 'CHOOSE_EXIT');
  assert.deepEqual(ringActs(corridor), []);
  const monster = enter('ROOM_019', { prep: ring('RING_1') });
  assert.equal(monster.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.deepEqual(ringActs(monster), []);
});

// ---- 2. Thunder Ring (D49). Printed: the monster flees in a normal encounter, no protection against surprise attacks.
// Approved interpretation: no monster reaction card is drawn; not offered in an ambush.
test('spec v10 #2 Thunder Ring: the monster flees at once, no monster card is drawn (deck unchanged), no A/B/C; consumed; never in an ambush', () => {
  const type = monsterType('ROOM_019');
  const g = enter('ROOM_019', { players: 2, prep: ring('RING_3'), decks: { MONSTER: [fightCard(type)] } });
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.equal(g.encounter.ambush, false);
  assert.deepEqual(ringActs(g), [{ type: 'USE_RING', seat: 0 }]);
  const deck = [...g.decks.MONSTER.order], from = g.log.length;
  const used = go(g, 'USE_RING');
  assert.deepEqual(used.decks.MONSTER.order, deck, 'the monster deck is untouched: no reaction card drawn');
  assert.deepEqual(draws(used, 'MONSTER'), []);
  assert.deepEqual(logged(used, 'encounter-end', from).map(e => e.outcome), ['monster-fled']);
  assert.ok(!used.log.slice(from).some(e => ['commit', 'reaction', 'exchange', 'throw', 'damage', 'monster-wound'].includes(e.kind)), 'no commitment, reaction, damage or A/B/C exchange');
  assert.equal(used.encounter, null);
  assert.equal(used.heroes[0].hp, 17);
  assert.equal(used.heroes[0].ringUsed, true, 'consumed');
  assert.notEqual(used.activeSeat, 0, 'the turn ends as for any monster that fled');
  // An ambush (D12 - Luck first): Attack or Flee, never the ring.
  const ambush = enter('ROOM_021', { players: 2, prep: ring('RING_3'), script: [1] });
  assert.equal(ambush.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.equal(ambush.encounter.ambush, true);
  assert.deepEqual(ringActs(ambush), [], 'not offered in an ambush');
});

// ---- 3. Small flask (D53). Printed: roll D12 and D6, net HP change. Approved interpretation: a free action in the hero's
// normal action window, never interrupting anything unresolved; no cap; death at 0 or less; back to its own deck.
// Today the window is two phases: CHOOSE_ACTION (the start of the hero's own turn, after any carry-over) and CHOOSE_EXIT
// (choosing whether and where to keep moving), both with nothing pending. spec-v6.test.js pins all five copies (no cap,
// death, own deck); catalogue.test.js pins the forced skip (D20) offering the flask beside it.
test('spec v10 #3 flask: offered in the normal action window (start of turn, choosing whether to keep moving); drinking does not use the turn; net D12 - D6, no cap, death at 0 or less, back to its own deck', () => {
  const g = atStart({ prep: FLASK() });
  assert.deepEqual(flaskActs(g).map(a => a.item), ['ROOM_002#1']);
  const up = go(dice(g, 12, 1), 'USE_ITEM', { item: 'ROOM_002#1' });
  assert.deepEqual([up.heroes[0].hp, up.phase, up.sun, up.activeSeat], [28, 'CHOOSE_ACTION', g.sun, 0], '+12 - 1 above the starting 17; the turn goes on');
  assert.equal(up.decks.ROOM.order.at(-1), 'ROOM_002#1', 'to the bottom of its own deck');
  const low = structuredClone(g);
  low.heroes[0].hp = 3;
  const dead = go(dice(low, 2, 5), 'USE_ITEM', { item: 'ROOM_002#1' });
  assert.equal(dead.heroes[0].status, 'DEAD', '3 + 2 - 5 = 0: death');
  const corridor = enter('ROOM_013', { toTile: 'FX_STRAIGHT', prep: FLASK() });
  assert.equal(corridor.phase, 'CHOOSE_EXIT');
  assert.equal(flaskActs(corridor).length, 1, 'while choosing whether to keep moving');
  assert.equal(go(dice(corridor, 3, 3), 'USE_ITEM', { item: 'ROOM_002#1' }).phase, 'CHOOSE_EXIT', 'and the move can go on');
});

test('spec v10 #3 flask: never during an encounter, a trap or ring prompt, a combat exchange, a pending roll or choice, a carry-over, a tower choice, the dragon\'s forced move or a skipped turn', () => {
  const none = (g, phase, why, content = T, seat = 0) => {
    assert.equal(g.phase, phase, why);
    assert.ok(g.heroes[seat].held.some(i => FLASKS.has(i.split('#')[0])), `${why}: the flask is held`);
    assert.deepEqual(flaskActs(g, content), [], `${why}: no flask`);
  };
  const type = monsterType('ROOM_019');
  // Encounters: the commitment, an ambush, the monster player's announcement, an A/B/C exchange.
  none(enter('ROOM_019', { prep: FLASK() }), 'CHOOSE_MONSTER_RESPONSE', 'a monster appears');
  none(enter('ROOM_021', { prep: FLASK(), script: [1] }), 'CHOOSE_MONSTER_RESPONSE', 'an ambush');
  const react = go(enter('ROOM_019', { players: 2, prep: FLASK(), decks: { MONSTER: [fightCard(type)] } }), 'RESPOND', { choice: 'attack' });
  none(react, 'MONSTER_REACT', 'the reaction not yet announced');
  none(go(react, 'ANNOUNCE'), 'COMBAT_SELECT', 'a combat exchange');
  // Trap and ring prompts.
  const trap = enter('ROOM_006', { prep: both(FLASK(), ring('RING_4')) });
  assert.equal(trap.pending.kind, 'trap-ring');
  none(trap, 'RESOLVE_CARD', 'the Protection Ring offered on a trap');
  let room = setup({ content: OWN, script: Array(20).fill(3), deckOrders: { ROOM: EMPTY } });
  room.seats[0].ringId = 'RING_4';
  place(room, '2,3', 'TILE_014', 0);
  place(room, '2,4', 'TILE_006');
  putHero(room, 0, '2,4');
  give(room, 0, 'ROOM', 'ROOM_002');
  room = go(room, 'MOVE', { dir: 'N' }, OWN);
  assert.equal(room.pending.kind, 'rotation-ring');
  none(room, 'RESOLVE_TILE_ENTRY', 'the Protection Ring offered at a rotating room', OWN);
  // A pending roll (name the numbers), an optional draw, a stuck state's choice next turn.
  const ceiling = enter('ROOM_008', { prep: FLASK() });
  assert.equal(ceiling.pending.kind, 'name-numbers');
  none(ceiling, 'RESOLVE_CARD', 'a number pick before the roll');
  none(enter('ROOM_009', { prep: FLASK() }), 'RESOLVE_CARD', 'open the chest or leave it');
  const pit = enter('ROOM_015', { prep: FLASK(), script: [10, 3] });
  assert.deepEqual(pit.pending.options, ['Climb out']);
  none(pit, 'RESOLVE_CARD', 'the trapdoor climb-out at the start of the next turn');
  // Tile carry-overs at the start of the next turn: dark room, well edge, rubble.
  for (const [tile, script, kind] of [['FX_DARK', [], 'dark'], ['FX_WELL', [4], 'well-edge'], ['FX_RUBBLE', [], 'rubble']]) {
    let g = setup({ content: T, heroes: ['HERO_1'], script, tileOrder: [...slotsOf(tile, T).slice(0, 1), ...slotsOf('FX_CROSS', T).slice(0, 1)], deckOrders: { ROOM: EMPTY } });
    place(g, '1,0', 'FX_CROSS');
    putHero(g, 0, '1,0');
    give(g, 0, 'ROOM', 'ROOM_002');
    g = go(g, 'MOVE', { dir: 'S' });
    assert.equal(g.pending?.kind, kind, tile);
    none(g, 'TURN_START', `the ${kind} carry-over`);
  }
  // A tower choice: back into tower 0 at (0,0) from (1,0).
  const tower = setup({ content: T, heroes: ['HERO_1'], deckOrders: { ROOM: EMPTY } });
  place(tower, '1,0', 'FX_CROSS');
  putHero(tower, 0, '1,0');
  tower.heroes[0].status = 'EXPLORING';
  give(tower, 0, 'ROOM', 'ROOM_002');
  none(go(tower, 'MOVE', { dir: 'W' }), 'TOWER_CHOICE', 'Escape, Stay or Continue');
  // The dragon's forced move after a wake (seat 0 woke it and holds a flask).
  const lair = setup({ players: 2, content: T, towers: [0, 1], script: [3, 4], deckOrders: { ROOM: EMPTY, DRAGON: [['DRAGON_8']] } });
  place(lair, '4,4', 'FX_CROSS');
  place(lair, '5,4', 'FX_CROSS');
  putHero(lair, 0, '4,4');
  putHero(lair, 1, '4,5');
  for (const h of lair.heroes) h.status = 'EXPLORING';
  lair.board.chamberPlaced = true;
  lair.board.tileBag = [];
  give(lair, 0, 'ROOM', 'ROOM_002');
  none(go(lair, 'MOVE', { dir: 'S' }), 'FORCED_MOVE', 'the forced move after the wake');
  // A skipped turn (D54) has no decision point at all: the explosion's missed turn passes and the next one begins.
  const boom = enter('ROOM_005', { prep: FLASK() });
  assert.equal(logged(boom, 'turn-skipped').length, 1);
  assert.deepEqual([boom.sun, boom.phase, boom.heroes[0].held], [3, 'CHOOSE_ACTION', ['ROOM_002#1']], 'sun 2 passed with nothing offered; the flask comes back in the next normal window');
  assert.equal(flaskActs(boom).length, 1);
});

const picker = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
test('spec v10 #3 flask (random play, owner content): a flask is offered exactly in the active hero\'s action window, never with anything pending', () => {
  const COPIES = [['ROOM', 'ROOM_002'], ['ROOM_SEARCH', 'RSEARCH_001'], ['SEARCH', 'SEARCH_007'], ['CHEST', 'CHEST_006']];
  let offered = 0;
  for (let i = 0; i < 60; i++) {
    const players = [1, 2, 4][i % 3], pick = picker(7000 + i);
    let g = createGame({ players: Array.from({ length: players }, (_, s) => `P${s + 1}`), seed: 7000 + i, content: M });
    while (g.status === 'setup') { const la = legalActions(g, M); g = reduce(g, la[Math.floor(pick() * la.length)], M); }
    COPIES.slice(0, players).forEach(([deck, id], s) => give(g, s, deck, id));
    for (let step = 0; g.status === 'playing'; step++) {
      assert.ok(step < 6000, 'the game ends');
      const la = legalActions(g, M), fl = la.filter(isFlask);
      const window = ['CHOOSE_ACTION', 'CHOOSE_EXIT'].includes(g.phase) && !g.pending && !g.encounter && !g.wake;
      const holds = g.heroes[g.activeSeat]?.held.some(x => FLASKS.has(x.split('#')[0]));
      if (fl.length) { offered++; assert.ok(window, `flask offered in ${g.phase} with ${JSON.stringify(g.pending)}`); assert.ok(fl.every(a => a.seat === g.activeSeat)); }
      else assert.ok(!(window && holds), `the active hero holds a flask in ${g.phase} but it is not offered`);
      g = reduce(g, la[Math.floor(pick() * la.length)], M);
    }
  }
  assert.ok(offered > 100, `the flask was offered ${offered} times`);
});

// ---- 4. Entering the lair while the dragon is awake (D40). Printed (10.1): the dragon sleeps again once everyone has
// left. Approved interpretation: another hero may walk in while it is awake; nothing is drawn; no reset.
function lair3() {
  // Seat 0 north of the chamber at (4,4), seat 1 inside at (4,5), seat 2 north of the other half at (5,4); no tiles left.
  const g = setup({ players: 3, towers: [0, 1, 2], script: [3, 4], deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: [['FX_DRAGON_AWAKE']] } });
  for (const at of ['4,4', '4,3', '5,4']) place(g, at, 'FX_CROSS');
  putHero(g, 0, '4,4');
  putHero(g, 1, '4,5');
  putHero(g, 2, '5,4');
  for (const h of g.heroes) h.status = 'EXPLORING';
  g.board.chamberPlaced = true;
  g.board.tileBag = [];
  return g;
}
test('spec v10 #4 lair: another hero may enter while the dragon is awake; nothing is drawn; the dragon is not reset; the forced exit and the reset are unchanged', () => {
  let g = act(lair3(), 'MOVE', { dir: 'S' }); // seat 0 enters and draws the awake card
  assert.equal(g.phase, 'FORCED_MOVE');
  assert.deepEqual(g.pending.targets, ['4,4'], 'forced exit: a revealed, free tile next to the chamber');
  g = act(g, 'FORCED_MOVE', { to: '4,4' }); // seat 1 has no free tile: stays, the dragon stays awake
  assert.ok(g.log.some(e => e.kind === 'forced-move-none' && e.seat === 1));
  assert.deepEqual([g.dragon.awake, g.dragon.resets], [true, 0]);
  g = act(g, 'FORCED_SKIP'); // seat 1, stuck
  assert.equal(g.activeSeat, 2);
  const before = structuredClone(g.dragon), treasury = draws(g, 'TREASURY').length, dragonCards = draws(g, 'DRAGON').length;
  g = act(g, 'MOVE', { dir: 'S' }); // seat 2 was never inside: it walks in while the dragon is awake
  assert.deepEqual(g.heroes[2].coord, { x: 5, y: 5 }, 'the entry is allowed');
  assert.ok(g.log.some(e => e.kind === 'dragon-awake-no-collect' && e.seat === 2));
  assert.deepEqual([draws(g, 'TREASURY').length, draws(g, 'DRAGON').length], [treasury, dragonCards], 'no treasure, no dragon card');
  assert.deepEqual(g.dragon, before, 'not reset, still awake, deck untouched');
  assert.equal(g.activeSeat, 0, 'the entry ends the move');
  assert.ok(!types(g).includes('COLLECT'));
  // The reset ruling: only once every surviving hero has left.
  g = act(g, 'MOVE', { dir: 'N' }); // seat 0 to (4,3)
  g = act(g, 'MOVE', { dir: 'N', from: '4,5' }); // seat 1 out to (4,4)
  assert.deepEqual([g.dragon.awake, g.dragon.resets], [true, 0], 'seat 2 is still inside');
  g = act(g, 'MOVE', { dir: 'N', from: '5,5' }); // seat 2 out: the chamber is empty
  assert.deepEqual([g.dragon.awake, g.dragon.resets, g.dragon.remaining.length, g.dragon.aside.length], [false, 1, 8, 0]);
});

// ---- 5. Reverse well jump (D42). Printed (5.6): Agility test with +1 per chamber card, discard first; failure is death
// (D08, not printed). Approved interpretation: from the far edge the hero may jump back to the original side.
function well(script) {
  const g = setup({ tileOrder: slotsOf('FX_WELL').slice(0, 1), script });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,2', 'FX_CROSS');
  putHero(g, 0, '1,0');
  return act(g, 'MOVE', { dir: 'S' }); // the knight (Agility 4) passes the entry test on 4
}
test('spec v10 #5 reverse well jump: same Agility test and modifiers (discard first allowed); success puts the hero on the original side and ends the turn; failure is death; no other new way out', () => {
  let g = act(well([4, 2]), 'WELL_JUMP'); // across: the far edge (CROSSED)
  give(g, 0, 'TREASURY', 'FX_TREASURY_A');
  give(g, 0, 'TREASURY', 'FX_TREASURY_B');
  const preview = () => view(g, FX, 0).pendingTests.find(t => t.action.type === 'WELL_JUMP');
  assert.deepEqual([preview().stat, preview().target, preview().modifier], ['AGI', 4, 2], '+1 per chamber card, as for the first jump');
  assert.deepEqual(types(g).sort(), ['MOVE', 'WELL_DISCARD', 'WELL_JUMP'], 'out by the far side, discard, or jump back');
  const card = g.heroes[0].treasury[0];
  g = act(g, 'WELL_DISCARD', { card });
  assert.equal(g.decks.TREASURY.order.at(-1), card, 'the discard goes to the bottom of the treasury deck (D09)');
  assert.equal(preview().modifier, 1);
  const sun = g.sun, at = g.heroes[0].coord;
  const back = act(dice(g, 3), 'WELL_JUMP'); // 3 + 1 = 4 <= 4
  assert.deepEqual([back.heroes[0].coord, back.heroes[0].roomState.phase], [at, 'AT_NEAR_EDGE'], 'the original side of the same well tile');
  assert.equal(back.sun, sun + 1, 'the turn ends');
  assert.ok(!back.log.slice(g.log.length).some(e => e.kind === 'move'), 'not moved off the tile');
  assert.deepEqual(exits(back, FX, 0).filter(e => e.legal).map(e => e.dir), ['N'], 'only the way the hero first came in');
  assert.deepEqual(types(back), ['WELL_RETURN', 'WELL_DISCARD', 'WELL_JUMP'], 'next turn: the normal clinging choices, nothing new');
  const failed = act(dice(g, 4), 'WELL_JUMP'); // 4 + 1 = 5 > 4
  assert.equal(failed.heroes[0].status, 'DEAD', 'the normal well consequence (D08)');
});

// ---- 6. Protection Ring timing (D50, D63, D67). Printed: ignore one trap; the rotating room is a trap (5.7). Approved
// interpretation: offered once, before any consequence; use cancels, decline keeps the ring; never retroactively.
// spec-v6.test.js pins "offered before any roll, use cancels, decline resolves" for the nine trap cards; spec-v9.test.js
// the rotating room's 19 cases. Here: after a decline, nothing of that trap ever offers the ring again.
const TRAPS = {
  ROOM_001: o => enter('ROOM_001', o), ROOM_003: o => enter('ROOM_003', o), ROOM_005: o => enter('ROOM_005', o),
  ROOM_006: o => enter('ROOM_006', o), ROOM_008: o => enter('ROOM_008', o), ROOM_015: o => enter('ROOM_015', o),
  DOOR_003: o => enter('ROOM_013', { ...o, toTile: 'FX_DOORWAY', decks: { DOOR: ['DOOR_003'] } }),
  DOOR_004: o => enter('ROOM_013', { ...o, toTile: 'FX_DOORWAY', decks: { DOOR: ['DOOR_004'] } }),
  CHEST_008: o => go(enter('ROOM_009', { ...o, decks: { CHEST: ['CHEST_008'] } }), 'CHOOSE', { option: 0 }),
};
test('spec v10 #6 Protection Ring: on each of the nine trap cards, offered before any consequence and never again once the trap resolves (no retroactive use)', () => {
  const later = [];
  for (const [id, at] of Object.entries(TRAPS)) {
    const g = at({ prep: ring('RING_4') });
    assert.equal(g.pending?.kind, 'trap-ring', id);
    assert.equal(g.heroes[0].hp, 17, `${id}: no damage yet`);
    let d = go(dice(g, 6, 3, 3, 3, 3, 3), 'DECLINE_RING');
    assert.ok(logged(d, 'ring-kept').length === 1 && !d.heroes[0].ringUsed, `${id}: declined, the ring is kept`);
    assert.deepEqual(ringActs(d), [], `${id}: no ring once the trap has started`);
    if (d.pending?.kind === 'name-numbers') { later.push(id); d = go(dice(d, 3, 3), 'NAME_NUMBERS', { numbers: '1' }); assert.deepEqual(ringActs(d), [], `${id}: nor after its roll`); }
    if (d.pending?.options?.[0] === 'Climb out') { later.push(id); assert.deepEqual(ringActs(d), [], `${id}: nor in the pit next turn`); }
  }
  assert.deepEqual(later, ['ROOM_008', 'ROOM_015'], 'the number pick at the ceiling and the trapdoor pit were reached');
});

test('spec v10 #6 Protection Ring: at a rotating room, offered before it turns; declined, the room turns and the ring is not offered again; staying offers nothing', () => {
  const g = setup({ content: OWN, script: Array(20).fill(3), deckOrders: { ROOM: EMPTY } });
  g.seats[0].ringId = 'RING_4';
  place(g, '2,3', 'TILE_014', 0);
  place(g, '2,4', 'TILE_006');
  putHero(g, 0, '2,4');
  const entered = go(g, 'MOVE', { dir: 'N' }, OWN);
  assert.equal(entered.pending.kind, 'rotation-ring');
  assert.equal(entered.board.tiles['2,3'].rotation, 0, 'not turned yet');
  const kept = go(entered, 'DECLINE_RING', {}, OWN);
  assert.equal(kept.board.tiles['2,3'].rotation, 90, 'turned at once');
  assert.equal(kept.heroes[0].ringUsed, false);
  assert.deepEqual(ringActs(kept, OWN), [], 'no second offer after the turn');
});
