// Pure UI helpers: hand sorting, the lobby QR code, and the ranking the results screens show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortHand } from '../../site/salad/ui/cards.js';
import { qr } from '../../site/salad/ui/qr.js';
import { standings } from '../../site/salad/engine/score.js';

test('sortHand: by suit then rank, by rank then suit, identical cards by deck', () => {
  const hand = ['d1-2H', 'd2-AS', 'd1-AS', 'd1-10C', 'd1-KD', 'd1-AH'];
  const suit = sortHand(hand, 'suit');
  assert.deepEqual(suit.slice(0, 2), ['d1-AS', 'd2-AS'], 'identical cards keep deck order');
  assert.equal(new Set(suit.map(id => id.at(-1))).size, 4);
  for (let i = 1; i < suit.length; i++) if (suit[i].at(-1) === suit[i - 1].at(-1)) {
    assert.ok(['A', 'K', 'Q', 'J', '10', '2'].indexOf(suit[i].slice(3, -1)) >= ['A', 'K', 'Q', 'J', '10', '2'].indexOf(suit[i - 1].slice(3, -1)), 'high to low within a suit');
  }
  assert.deepEqual(sortHand(hand, 'rank').slice(0, 3).map(id => id.slice(3, -1)), ['A', 'A', 'A']);
  assert.deepEqual([...hand].sort(), [...suit].sort(), 'nothing lost or added');
});

test('sortHand manual: the saved order first, new cards after it by suit, played cards dropped', () => {
  const manual = ['d1-2H', 'd1-KD', 'd1-AS', 'd1-9C'];
  assert.deepEqual(sortHand(['d1-AS', 'd1-2H', 'd1-QS', 'd1-KD'], 'manual', manual), ['d1-2H', 'd1-KD', 'd1-AS', 'd1-QS']);
  assert.deepEqual(sortHand(['d1-AS', 'd1-2H'], 'manual', null), sortHand(['d1-AS', 'd1-2H'], 'suit'));
});

test('qr: the production share link fits, with all three finder patterns', () => {
  const m = qr('https://games.nordgrenlabs.com/salad/?room=ABCDEF');
  assert.equal(m.length, 33, 'version 4');
  assert.ok(m.every(row => row.length === m.length));
  // A finder's outer ring is dark all round and its inner ring light.
  const finder = (x, y) => [0, 1, 2, 3, 4, 5, 6].every(k => m[y][x + k] && m[y + 6][x + k] && m[y + k][x] && m[y + k][x + 6])
    && [1, 2, 3, 4, 5].every(k => !m[y + 1][x + k] && !m[y + 5][x + k]);
  for (const [x, y] of [[0, 0], [m.length - 7, 0], [0, m.length - 7]]) assert.ok(finder(x, y), `finder at ${x},${y}`);
  assert.deepEqual(qr('https://games.nordgrenlabs.com/salad/?room=ABCDEF'), m, 'deterministic');
  assert.throws(() => qr('x'.repeat(200)));
});

test('ranking with ties: equal totals share a rank and every lowest total wins', () => {
  const s = standings([120, 85, 85, 300, 120]);
  assert.deepEqual(s.winners, [1, 2]);
  assert.deepEqual(s.rows.map(r => [r.seat, r.rank]), [[1, 1], [2, 1], [0, 3], [4, 3], [3, 5]]);
  assert.deepEqual(standings([0, 0, 0]).winners, [0, 1, 2]);
});
