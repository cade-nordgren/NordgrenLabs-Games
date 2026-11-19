// Mobile pass helpers: the auto-zoom decision (board.js) and the thumb-reach undo label (words.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearInView, MIN_CELL } from '../../site/keep/ui/board.js';
import { undoLabel } from '../../site/keep/ui/words.js';
import { view } from '../../site/keep/engine/view.js';
import { FX, setup, act, acts, place, putHero, give, EMPTY_ROOMS } from './helpers.js';

const bd = { width: 10, height: 11 };
const C = 100, M = 34; // board.js: one square, and the band around the board
const centred = (c, s, [vw, vh]) => ({ s, x: vw / 2 - (M + (c.x + 0.5) * C) * s, y: vh / 2 - (M + (c.y + 0.5) * C) * s });

test('auto-zoom: the 3x3 around the hero must be on screen at 48px a square or more', () => {
  const size = [343, 360], hero = { x: 5, y: 5 };
  assert.equal(nearInView(centred(hero, 0.3, size), hero, size, bd), false, '30px squares are too small');
  assert.equal(nearInView(centred(hero, MIN_CELL / C, size), hero, size, bd), true, 'centred at 48px: in view');
  assert.equal(nearInView(centred({ x: 0, y: 0 }, 0.6, size), hero, size, bd), false, 'readable, but looking elsewhere');
  assert.equal(nearInView(centred({ x: 5, y: 3 }, 0.6, size), hero, size, bd), false, 'the row below the hero is cut off');
  // A corner hero: the neighbourhood is clipped to the board, so the panned-to-the-edge view still counts.
  assert.equal(nearInView({ s: 0.5, x: 0, y: 0 }, { x: 0, y: 0 }, size, bd), true);
});

// The UI drops the "pass back to the table" cover: the public view must never show more than the seat that was
// looking. a (public) is within b (a seat) when every difference is a redaction: 'hidden', null, a count for a
// list, fewer keys, or less gold (the public figure is held loot only).
function within(a, b, path = '') {
  if (a === b || a === 'hidden' || a === null) return;
  if (typeof a === 'number' && Array.isArray(b)) return assert.equal(a, b.length, path);
  if (path.endsWith('.gold')) return assert.ok(a <= b, path);
  assert.equal(typeof a, 'object', `${path}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`);
  assert.equal(typeof b, 'object', path);
  for (const k of Object.keys(a)) within(a[k], b[k], `${path}.${k}`);
}

test('the public view is within every seat\'s view, through a fight with private cards (item 4 of the mobile pass)', () => {
  let g = setup({ players: 2, towers: [0, 1], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  give(g, 0, 'TREASURY', 'FX_TREASURY_B');
  give(g, 1, 'TREASURY', 'FX_TREASURY_A');
  give(g, 1, 'ROOM', 'FX_ROOM_COINS');
  const states = [g];
  for (const [type, f] of [['MOVE', { dir: 'S' }], ['RESPOND', { choice: 'attack' }], ['ANNOUNCE', {}], ['COMBAT_PICK', { side: 'hero', letter: 'C' }], ['COMBAT_PICK', { side: 'monster', letter: 'A' }]]) states.push(g = act(g, type, f));
  for (const s of states) for (const seat of [0, 1]) within(view(s, FX, null), view(s, FX, seat));
});

test('undo label names the seat whose action it takes back', () => {
  const name = s => `P${s + 1}`;
  const g0 = setup({ players: 2, towers: [0, 1] });
  const mv = acts(g0).find(a => a.type === 'MOVE');
  const g1 = act(g0, 'MOVE', { dir: mv.dir });
  assert.equal(undoLabel(g0, g1, FX, name), `Undo ${name(g0.activeSeat)}'s move`);

  // An A, B or C fight: the hero's card first (seat 0), then the controller's (seat 1).
  let g = setup({ players: 2, towers: [0, 1], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  give(g, 1, 'TREASURY', 'FX_TREASURY_A');
  g = act(act(act(g, 'MOVE', { dir: 'S' }), 'RESPOND', { choice: 'attack' }), 'ANNOUNCE');
  assert.equal(g.phase, 'COMBAT_SELECT');
  const picked = act(g, 'COMBAT_PICK', { side: 'hero', letter: 'C' });
  assert.equal(undoLabel(g, picked, FX, name), 'Undo P1\'s card');
  const both = act(picked, 'COMBAT_PICK', { side: 'monster', letter: 'A' });
  assert.match(undoLabel(picked, both, FX, name), /^Undo P2's /);
});

test('the chamber is one room whether the board gives it one cell or two', async () => {
  const { chamberRoom } = await import('../../site/keep/ui/board.js');
  const two = chamberRoom({ center: [{ x: 4, y: 5 }, { x: 5, y: 5 }] });
  assert.equal(two.where, 'row 6, columns 5 to 6');
  assert.equal(two.canon('5,5'), '4,5');
  assert.equal(two.canon('4,5'), '4,5');
  assert.equal(two.canon('3,5'), '3,5');
  assert.deepEqual([two.w, two.h, two.cols, two.rows], [200, 100, 2, 1]);
  const one = chamberRoom({ center: [{ x: 4, y: 5 }] });
  assert.equal(one.where, 'row 6, column 5');
  assert.deepEqual([one.w, one.h], [100, 100]);
});

test('roll and exchange results read as plain words', async () => {
  const { testWords, exchangeWords } = await import('../../site/keep/ui/words.js');
  assert.deepEqual(testWords({ roll: 11, stat: 'STR', target: 6, modifiers: [], modifier: 0 }), ['You rolled 11.', 'You needed 6 or less (Strength 6).']);
  assert.deepEqual(testWords({ roll: 9, stat: 'AGI', target: 8, modifiers: [{ source: 'treasure chamber cards carried', value: 2 }], modifier: 2 }),
    ['Roll 9 + 2 (treasure chamber cards carried) = 11.', 'You needed 8 or less (Agility 8).']);
  assert.equal(exchangeWords({ hero: 'A', monster: 'C', heroDmg: 1, monsterDmg: 0 }, 'Cade'), 'Cade played A, the monster played C: C beats A, Cade takes 1');
  assert.equal(exchangeWords({ hero: 'A', monster: 'B', heroDmg: 0, monsterDmg: 2 }, 'Cade'), 'Cade played A, the monster played B: A beats B, the monster takes 2');
  assert.equal(exchangeWords({ hero: 'B', monster: 'B', heroDmg: 1, monsterDmg: 1 }, 'Cade'), 'Cade played B, the monster played B: same letter, both take 1');
});
