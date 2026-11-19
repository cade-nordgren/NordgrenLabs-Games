// Owner play-test questions (2026-11-19): when search is offered, and when the game ends.
// Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { view } from '../../site/keep/engine/view.js';
import { FX, setup, act, types, place, putHero, EMPTY_ROOMS } from './helpers.js';

const picker = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const why = g => view(g, FX).searchUnavailable;

test('search (RB 7.1, R55-R57): offered at the start of every turn in a black or red room, no limit; otherwise a reason', () => {
  let g = setup({ players: 2, towers: [0, 3], deckOrders: { ROOM_SEARCH: Array(2).fill('FX_RSEARCH_EMPTY'), ROOM: EMPTY_ROOMS } });
  place(g, '4,2', 'FX_CROSS'); // black
  putHero(g, 0, '4,2');
  assert.ok(types(g).includes('SEARCH'));
  assert.equal(why(g), null);
  g = act(g, 'SEARCH');           // seat 0 searches
  g = act(g, 'MOVE', { dir: 'N' }); // seat 1 moves out of its tower
  assert.ok(types(g).includes('SEARCH'), 'R57: the same room again on a later turn');
  // Not a room square: tower, chamber, yellow corridor, dark room.
  for (const [at, id, word] of [['0,0', null, 'a tower'], ['4,5', null, 'the treasure chamber'], ['4,2', 'FX_STRAIGHT', 'a yellow corridor'], ['4,2', 'FX_DARK', 'a dark room']]) {
    const h = setup();
    if (id) place(h, at, id);
    putHero(h, 0, at);
    assert.ok(!types(h).includes('SEARCH'));
    assert.match(why(h), new RegExp(`not a room square.*${word}`), at);
  }
  // Mid-turn, after a move (a card said continue): search is instead of moving.
  let m = setup({ deckOrders: { ROOM: ['FX_ROOM_PASSAGE'] } });
  place(m, '3,0', 'FX_CROSS');
  place(m, '4,0', 'FX_CROSS');
  putHero(m, 0, '3,0');
  m = act(m, 'MOVE', { dir: 'E' });
  assert.equal(m.phase, 'CHOOSE_EXIT');
  assert.match(why(m), /already moved this turn/);
});

test('random play: searchUnavailable is null exactly when SEARCH is offered', () => {
  for (let i = 0; i < 12; i++) {
    const pick = picker(77 + i);
    let g = createGame({ players: ['A', 'B'], seed: 300 + i, content: FX });
    for (let step = 0; g.status !== 'over' && step < 3000; step++) {
      const la = legalActions(g, FX);
      if (g.status === 'playing') assert.equal(view(g, FX).searchUnavailable === null, la.some(a => a.type === 'SEARCH'), `${g.phase}`);
      g = reduce(g, la[Math.floor(pick() * la.length)], FX);
    }
  }
});

// Seat 0 next to tower 0 (0,0), exploring; seat 1 in tower 3.
function besideTower(players = 2) {
  const g = setup({ players, towers: [0, 3, 3, 3] });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  g.heroes[0].status = 'EXPLORING';
  return g;
}
const turnSeats = g => g.log.filter(e => e.kind === 'turn').map(e => e.seat);

test('one hero escaping does not end the game: the others play on, the escaped hero is skipped, its escape sun is kept', () => {
  let g = besideTower();
  g = act(g, 'MOVE', { dir: 'W' });
  g = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' });
  assert.equal(g.status, 'playing', 'seat 1 is still inside');
  assert.deepEqual([g.heroes[0].status, g.heroes[0].escapeSun], ['ESCAPED', 1]);
  assert.equal(g.activeSeat, 1);
  g = act(g, 'MOVE', { dir: 'N' }); // sun 1, seat 1
  assert.equal(g.sun, 2);
  assert.equal(g.activeSeat, 1, 'sun 2 starts with seat 1: the escaped seat 0 is skipped');
  assert.deepEqual(turnSeats(g), [0, 1, 1]);
});

test('turn order skips dead heroes too', () => {
  let g = besideTower(3);
  g.heroes[1].status = 'DEAD';
  g = act(g, 'MOVE', { dir: 'E' }); // seat 0 into an unexplored square
  assert.equal(g.activeSeat, 2, 'seat 1 is dead: seat 2 next');
});

test('the game ends early only when no hero is still in play (all escaped or dead); results keep each escape sun', () => {
  let g = besideTower();
  g = act(g, 'MOVE', { dir: 'W' });
  g = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' }); // seat 0 escapes at sun 1
  place(g, '9,9', 'FX_CROSS');
  putHero(g, 1, '9,9');
  g.heroes[1].status = 'EXPLORING';
  g.sun = 4; // seat 1 gets out later
  g = act(g, 'MOVE', { dir: 'S' });
  g = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' });
  assert.equal(g.status, 'over');
  assert.equal(g.phase, 'GAME_OVER');
  assert.deepEqual(g.result.escaped.map(e => [e.seat, e.escapeSun]).sort(), [[0, 1], [1, 4]]);
  assert.deepEqual(view(g, FX).result.escaped.map(e => e.escapeSun).sort(), [1, 4], 'the results view shows it');
  assert.deepEqual(g.result.winners, [0, 1], 'D01 unchanged: equal gold (0 and 0) still shares the win');
});

test('with heroes still inside, the game runs to sunset (sun 27), not to the first escape', () => {
  let g = besideTower();
  g = act(g, 'MOVE', { dir: 'W' });
  g = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' });
  g.sun = 26; // seat 1's last turn
  g = act(g, 'MOVE', { dir: 'N' });
  assert.equal(g.status, 'over');
  assert.equal(g.phase, 'SUNSET_GAME_OVER');
  assert.equal(g.result.others[0].endResult, 'INSIDE_AT_SUNSET');
  assert.equal(g.result.others[0].escapeSun, null);
});

test('fixture names read as placeholders and each card says in plain words what its made-up effect does', async () => {
  const { shownEffectText } = await import('../../site/keep/engine/describe.js');
  for (const k of ['specialWeapons', 'combat', 'treasury', 'dragon', 'room', 'search', 'roomSearch', 'chest', 'door', 'monster', 'rings']) {
    for (const e of FX[k]) {
      assert.equal(e.status, 'FIXTURE', e.id);
      assert.match(e.name, /^Test /, e.id);
      assert.match(e.text, /^Made-up test /, e.id);
      assert.equal(e.text, shownEffectText(e), `${e.id}: the text is generated from the data, so it cannot drift`);
      if (e.reactions) assert.doesNotMatch(e.text, /HP/, 'D37: no monster HP in its text');
    }
  }
  const salve = FX.room.find(c => c.id === 'FX_ROOM_SALVE');
  assert.equal(salve.name, 'Test salve');
  assert.match(salve.text, /heals 2 HP \(1 use\), then it goes to the bottom of its deck/);
  assert.equal(FX.room.find(c => c.id === 'FX_ROOM_STOP').text, 'Made-up test card: your turn ends at once', 'nothing after END_TURN runs, so it is not described');
});

test('the view gives each inventory item and each visible drawn card an effectText; private entries keep none', () => {
  let g = setup({ players: 2, towers: [0, 3], deckOrders: { ROOM: ['FX_ROOM_SALVE', ...EMPTY_ROOMS] } });
  place(g, '1,0', 'FX_CROSS');
  g = act(g, 'MOVE', { dir: 'E' });
  const v = view(g, FX, 0);
  const item = v.heroes[0].inventory.items[0];
  assert.deepEqual([item.name, item.effectText], ['Test salve', FX.room.find(c => c.id === 'FX_ROOM_SALVE').text]);
  assert.match(v.heroes[0].inventory.ring.effectText, /^Made-up test ring/);
  const drawn = v.log.find(e => e.kind === 'draw' && e.deck === 'ROOM');
  assert.deepEqual([drawn.cardName, drawn.effectText], [item.name, item.effectText]);
  g.log.push({ seq: 999, kind: 'draw', deck: 'TREASURY', value: 'FX_TREASURY_A#1', private: 0 });
  const other = view(g, FX, 1).log.at(-1);
  assert.equal(other.effectText, undefined);
  assert.equal(other.cardName, undefined);
});
