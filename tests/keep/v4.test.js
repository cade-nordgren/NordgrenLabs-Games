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
