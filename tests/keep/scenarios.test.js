// Scripted replays: the three manual scenarios of SP 12 (M-A, M-B, M-C) and acceptance replays where
// scripted dice, deck orders and decisions must give the outcome the rules predict (plan section 5).
// Content is NON-AUTHENTIC TEST DATA. Expectations are hand-derived from the cited rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX, setup, act, place, putHero, give, slotsOf, draws, assertCensus, withWalledTowers, EMPTY_ROOMS } from './helpers.js';

// steps: [type, fields] pairs taken as legal actions, or functions (checkpoints) called with the game.
// Every scripted die must be used: a leftover die fails the replay.
function replay({ setup: s, prep = () => {}, steps, content = FX }) {
  let g = setup({ ...s, content });
  prep(g);
  for (const step of steps) {
    if (typeof step === 'function') step(g);
    else g = act(g, step[0], step[1] || {}, content);
  }
  assert.deepEqual(g.rng.script, [], 'every scripted die was used');
  assertCensus(assert, g, content);
  return g;
}
const turns = g => g.log.filter(e => e.kind === 'turn');

test('M-C corridor chain into a room with a monster: one turn, room card, commit, controller, combat, turn ends (RB 6.1, RB 8.1, RB 8.4, SP 12)', () => {
  const g = replay({
    setup: { players: 2, towers: [0, 1], tileOrder: [...slotsOf('FX_STRAIGHT').slice(0, 2), ...slotsOf('FX_CROSS').slice(0, 1)], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } },
    steps: [
      ['MOVE', { dir: 'E' }], ['MOVE', { dir: 'E' }],
      g => assert.equal(g.phase, 'CHOOSE_EXIT', 'two corridors, still moving'),
      ['MOVE', { dir: 'E' }],
      g => { assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE'); assert.equal(g.encounter.monster, null); },
      ['RESPOND', { choice: 'attack' }],
      g => assert.deepEqual([g.phase, g.pending.seat], ['MONSTER_REACT', 1], 'cover screen: pass to the controller'),
      ['ANNOUNCE'],
      ['COMBAT_PICK', { side: 'monster', letter: 'B' }], ['COMBAT_PICK', { side: 'hero', letter: 'A' }], // A hits B twice: 2
      ['COMBAT_PICK', { side: 'hero', letter: 'A' }], ['COMBAT_PICK', { side: 'monster', letter: 'B' }], // 4: dead
    ],
  });
  assert.deepEqual(g.heroes[0].coord, { x: 3, y: 0 });
  assert.equal(g.heroes[0].hp, 17);
  assert.ok(g.log.some(e => e.kind === 'monster-dead'));
  assert.equal(turns(g).filter(t => t.seat === 0).length, 1, 'the whole chain and the fight were one turn');
  assert.equal(g.activeSeat, 1);
  assert.equal(draws(g, 'ROOM').length, 1, 'only the black room drew a card');
});

test('M-B day-26 near escape: one hero reaches a tower on the last turn, the other is one square short and lost; no 27th turn (RB 1, RB 12, SP 10, SP 12)', () => {
  const S = ['MOVE', { dir: 'S' }];
  const shuttle = [];
  for (let round = 2; round <= 25; round++) {
    const dir = round % 2 ? 'S' : 'N';
    shuttle.push(['MOVE', { dir }], ['STOP'], ['MOVE', { dir }], ['STOP']);
  }
  const g = replay({
    setup: { players: 2, towers: [0, 1], tileOrder: slotsOf('FX_STRAIGHT').slice(0, 18) },
    steps: [
      ...Array(8).fill(S), ['STOP'], ...Array(8).fill(S), ['STOP'], // round 1: corridors down to (0,8) and (9,8)
      ...shuttle,                                                  // rounds 2-25: rows 7 and 8, ending on row 8
      g => { assert.equal(g.sun, 26); assert.deepEqual([g.heroes[0].coord.y, g.heroes[1].coord.y], [8, 8]); },
      S, S,                                                        // seat 0: (0,9), then into tower (0,10)
      g => assert.deepEqual([g.phase, g.sun], ['TOWER_CHOICE', 26], 'the choice comes before sunset closes the turn'),
      ['TOWER_CHOICE', { choice: 'ESCAPE' }],
      g => assert.equal(g.heroes[0].status, 'ESCAPED'),
      S, ['STOP'],                                                 // seat 1: reaches (9,9), one short of (9,10)
    ],
  });
  assert.equal(g.phase, 'SUNSET_GAME_OVER');
  assert.equal(g.sun, 27);
  assert.equal(Math.max(...turns(g).map(t => t.sun)), 26, 'no turn at sun 27');
  assert.deepEqual(turns(g).filter(t => t.seat === 1).length, 26);
  assert.deepEqual([g.heroes[0].status, g.heroes[1].status, g.heroes[1].endResult], ['ESCAPED', 'EXPLORING', 'INSIDE_AT_SUNSET']);
  assert.deepEqual(g.heroes[1].coord, { x: 9, y: 9 });
  assert.deepEqual(g.result.winners, [0]);
});

test('M-A four players, two heroes in the chamber, one wakes the dragon: the other is processed next clockwise outside turn order (RB 9.2, SP 8, SP 12)', () => {
  const content = withWalledTowers([0]);
  const g = replay({
    content,
    setup: { players: 4, towers: [0, 1, 2, 3], deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: ['FX_DRAGON_AWAKE'] }, script: [4, 6] },
    prep: g => {
      place(g, '4,4', 'FX_CROSS');
      place(g, '5,4', 'FX_TEE', 180);
      place(g, '5,5', 'FX_CROSS');
      putHero(g, 1, '4,4');
      putHero(g, 3, '4,5');
      g.board.chamberPlaced = true;
      give(g, 3, 'TREASURY', 'FX_TREASURY_B');
      give(g, 3, 'TREASURY', 'FX_TREASURY_C');
    },
    steps: [
      ['FORCED_SKIP'],                       // seat 0, walled in
      ['MOVE', { dir: 'S' }],                // seat 1 enters the chamber: two cards, then the awake card
      g => {
        assert.ok(g.log.some(e => e.kind === 'dragon-wakes' && e.queue.join() === '1,3'), 'seat 2 is not in the chamber');
        assert.equal(g.heroes[1].hp, 6, 'hunter 10 - D12 4');
        assert.deepEqual(g.heroes[1].treasury, []);
        assert.equal(g.pending.seat, 1);
      },
      ['FORCED_MOVE', { to: '5,5' }],
      g => {
        assert.equal(g.pending.seat, 3, 'next clockwise from the waker, outside turn order');
        assert.equal(g.heroes[3].hp, 8, 'hero 4: 14 - D12 6');
        assert.deepEqual(g.heroes[3].treasury, []);
        assert.equal(g.activeSeat, 1, 'still the waker\'s turn');
      },
      ['FORCED_MOVE', { to: '4,4' }],
    ],
  });
  assert.equal(g.activeSeat, 2, 'turn order resumes with the seat after the waker');
  assert.equal(g.sun, 1);
  assert.deepEqual([g.heroes[1].coord, g.heroes[3].coord], [{ x: 5, y: 5 }, { x: 4, y: 4 }]);
  assert.deepEqual(draws(g, 'ROOM'), [], 'no room card for the forced moves');
  assert.equal(g.decks.TREASURY.order.slice(-4).filter(c => c.startsWith('FX_TREASURY_')).length, 4, 'all four chamber cards under the deck');
  assert.equal(g.dragon.remaining.length, 8);
});

test('acceptance: solo run from tower to chamber and out to a tower; gold is the sum of the cards kept (RB 1, RB 7.2, RB 9.1, RB 10, SP 9, SP 10)', () => {
  const g = replay({
    setup: { tileOrder: [...slotsOf('FX_STRAIGHT').slice(0, 3), slotsOf('FX_CROSS')[0], ...slotsOf('FX_STRAIGHT').slice(3, 6), slotsOf('FX_CROSS')[1]], deckOrders: { ROOM: ['FX_ROOM_COINS', ...EMPTY_ROOMS], TREASURY: ['FX_TREASURY_B', 'FX_TREASURY_A', 'FX_TREASURY_C', 'FX_TREASURY_C'], DRAGON: [Array(7).fill('FX_DRAGON_SLEEPING')] } },
    steps: [
      ['MOVE', { dir: 'E' }], ['MOVE', { dir: 'E' }], ['MOVE', { dir: 'E' }], ['MOVE', { dir: 'E' }], // corridors, then (4,0): coins
      ['MOVE', { dir: 'S' }], ['MOVE', { dir: 'S' }], ['MOVE', { dir: 'S' }], ['MOVE', { dir: 'S' }], // corridors, then (4,4)
      ['MOVE', { dir: 'S' }],                                                // chamber: 2 cards + a sleeping dragon
      ['COLLECT'],                                                           // 2 more + another sleeping dragon
      g => assert.equal(g.dragon.remaining.length, 6),
      ['MOVE', { dir: 'N' }],                                                // leaving: nothing drawn; chamber empty, deck resets (D22)
      g => assert.equal(g.dragon.remaining.length, 8),
      ['MOVE', { dir: 'N' }], ['MOVE', { dir: 'N' }], ['MOVE', { dir: 'N' }], ['MOVE', { dir: 'N' }], // up the corridors to (4,0)
      ['MOVE', { dir: 'W' }], ['MOVE', { dir: 'W' }], ['MOVE', { dir: 'W' }], ['MOVE', { dir: 'W' }], // back to tower (0,0)
      ['TOWER_CHOICE', { choice: 'ESCAPE' }],
    ],
  });
  assert.equal(g.heroes[0].status, 'ESCAPED');
  assert.deepEqual(g.heroes[0].held, ['FX_ROOM_COINS#1']);
  assert.equal(g.heroes[0].treasury.length, 4);
  assert.deepEqual(g.result.winners, [0]);
  assert.equal(g.result.escaped[0].gold, 7 + 20 + 10 + 5 + 5, 'RB 10 solo log: escaped, with this much gold');
  assert.equal(g.sun, 7);
});
