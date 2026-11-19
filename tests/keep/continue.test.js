// Owner play-test (2026-11-19): "moving onto a black tile allows the user to then move through more than one room
// at a time". Entering a black or red room and resolving its card ends movement for the turn, unless a cited rule
// or the drawn card's own data says otherwise, and every such case logs a 'may-continue' entry saying why.
// Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { CONTINUE_REASONS } from '../../site/keep/engine/movement.js';
import { FX, setup, act, acts, place, putHero } from './helpers.js';

const picker = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('random play: a second MOVE in a turn after entering a room square always follows a logged, allowed reason', () => {
  let rooms = 0, second = 0;
  const reasons = new Set();
  for (let i = 0; i < (+process.env.KEEP_PLAY_GAMES || 60); i++) {
    const pick = picker(1000 + i);
    const players = [1, 2, 4][i % 3];
    let g = createGame({ players: Array.from({ length: players }, (_, k) => `P${k + 1}`), seed: 500 + i, content: FX });
    let turnSeat = null, inRoom = false, allowed = false;
    for (let step = 0; g.status !== 'over' && step < 4000; step++) {
      const la = legalActions(g, FX);
      const a = la[Math.floor(pick() * la.length)];
      if (a.type === 'MOVE' && inRoom) {
        assert.ok(allowed, `game ${i} step ${step}: a MOVE after a room entry with no logged reason`);
        second++;
      }
      const before = g.log.length;
      g = reduce(g, a, FX);
      for (const e of g.log.slice(before)) {
        if (e.kind === 'turn') { turnSeat = e.seat; inRoom = false; allowed = false; }
        if (e.kind === 'move' && e.seat === turnSeat && ['black', 'red'].includes(e.mark) && !['flight', 'forced'].includes(e.via)) { inRoom = true; allowed = false; rooms++; }
        if (e.kind === 'may-continue') {
          assert.ok(CONTINUE_REASONS[e.reason] && e.rule, `a known reason with its rule: ${e.reason}`);
          // After a room entry only the card's own data can grant more movement (doors, corridors, secret
          // passages and towers need a move first, which needs this permission).
          if (inRoom && !allowed) assert.equal(e.reason, 'card', `game ${i}: first reason after a room entry`);
          if (inRoom) { allowed = true; reasons.add(e.reason); }
        }
      }
    }
  }
  assert.ok(rooms > 100, `enough room entries (${rooms})`);
  assert.ok(second > 0 && reasons.has('card'), `card continuations seen (${second})`);
});

test('a room card that pushes the hero into a yellow corridor does not grant the corridor\'s extra movement', () => {
  // Corridor (4,1) then room (4,2): the room card FX_ROOM_PUSH moves the hero back into the corridor.
  let g = setup({ deckOrders: { ROOM: ['FX_ROOM_PUSH'] } });
  place(g, '4,1', 'FX_STRAIGHT');
  place(g, '4,2', 'FX_CROSS');
  putHero(g, 0, '4,0');
  place(g, '4,0', 'FX_STRAIGHT');
  g = act(g, 'MOVE', { dir: 'S' }); // into the corridor: may continue (logged)
  assert.equal(g.log.at(-1).reason, 'yellow-corridor');
  g = act(g, 'MOVE', { dir: 'S' }); // into the room: the card pushes back to (4,1)
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 1 });
  assert.equal(g.sun, 2, 'the turn ended: the card says end-turn, the corridor does not override it');
});

test('cards whose own data says continue are kept, and log why', () => {
  for (const id of ['FX_ROOM_DRAFT', 'FX_ROOM_PASSAGE']) {
    let g = setup({ deckOrders: { ROOM: [id] } });
    place(g, '4,0', 'FX_CROSS');
    putHero(g, 0, '3,0');
    place(g, '3,0', 'FX_CROSS');
    g = act(g, 'MOVE', { dir: 'E' });
    assert.equal(g.phase, 'CHOOSE_EXIT', id);
    const e = g.log.filter(x => x.kind === 'may-continue').at(-1);
    assert.deepEqual([e.reason, e.card], ['card', `${id}#1`]);
    assert.ok(acts(g).some(a => a.type === 'STOP'));
  }
});

test('a room card that pushes the hero into a tower offers Escape or Stay, not Continue (no transit after a card move)', () => {
  let g = setup({ deckOrders: { ROOM: ['FX_ROOM_PUSH'] } });
  place(g, '1,0', 'FX_CROSS');
  g = act(g, 'MOVE', { dir: 'E' }); // from the start tower into a room; the card pushes back into the tower
  assert.equal(g.phase, 'TOWER_CHOICE');
  assert.deepEqual(acts(g).map(a => a.choice), ['ESCAPE', 'STAY']);
});
