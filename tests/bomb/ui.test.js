// Pure UI logic: names, sorting, selection, labels, the draw-for-first sequence and the local save round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, layout, reduce } from '../../site/bomb/engine/reducer.js';
import { viewFor } from '../../site/bomb/engine/view.js';
import { cardName, rankCount, sortHand, toggle, keepPlayable, canPlaySel, playLabel, beatInfo, lastLine, nextLabel,
  drawPlan, drawFinal, readGame, decksFor, okRoster } from '../../site/bomb/ui/logic.js';

const c = (rank, suit, deck = 0) => ({ id: `${rank}${suit}${deck}`, rank, suit, deck });

test('cards announce by name and counts read naturally', () => {
  assert.equal(cardName(c(12, 'H')), 'Queen of hearts');
  assert.equal(cardName(c(10, 'S')), '10 of spades');
  assert.equal(rankCount(12, 2), '2 Queens');
  assert.equal(rankCount(14, 1), 'an Ace');
  assert.equal(rankCount(8, 1), 'an eight');
  assert.equal(rankCount(6, 3), '3 sixes');
  assert.equal(rankCount(7, 1), 'a seven');
});

test('hands sort by rank, 2 low to Ace high, equal ranks together', () => {
  const hand = [c(14, 'S'), c(2, 'D'), c(9, 'H'), c(2, 'S'), c(9, 'C', 1)];
  assert.deepEqual(sortHand(hand).map(x => x.rank), [2, 2, 9, 9, 14]);
  assert.equal(hand[0].rank, 14, 'does not mutate');
});

test('selection: only playable cards, one rank at a time; another rank replaces it', () => {
  const q1 = c(12, 'H'), q2 = c(12, 'S'), k = c(13, 'D'), low = c(3, 'C');
  const playable = [q1.id, q2.id, k.id];
  let sel = toggle([], q1, playable);
  sel = toggle(sel, q2, playable);
  assert.deepEqual(sel.map(x => x.id), [q1.id, q2.id]);
  assert.ok(canPlaySel(sel, playable));
  assert.equal(playLabel(sel), 'Play 2 Queens');
  assert.deepEqual(toggle(sel, low, playable), sel, 'an unplayable card is ignored');
  assert.deepEqual(toggle(sel, k, playable).map(x => x.id), [k.id], 'another rank replaces the selection');
  assert.deepEqual(toggle(sel, q1, playable).map(x => x.id), [q2.id], 'tapping again deselects');
  assert.deepEqual(keepPlayable(sel, [q2.id]).map(x => x.id), [q2.id]);
  assert.ok(!canPlaySel([], playable));
  assert.ok(!canPlaySel([q1, k], playable), 'mixed ranks never play');
  assert.equal(playLabel([]), 'Play');
});

test('to beat: empty, reset by a 2, a streak, and the plain case', () => {
  const v = (pile, required, streak) => ({ pile, required, streak });
  assert.deepEqual(beatInfo(v([], null, 0)), { rank: 'Any', note: 'empty pile' });
  assert.deepEqual(beatInfo(v([c(2, 'H')], null, 1)), { rank: 'Any', note: 'reset by a 2' });
  assert.deepEqual(beatInfo(v([c(12, 'H'), c(12, 'S')], 12, 2)), { rank: 'Q', note: '2 Queens in a row' });
  assert.deepEqual(beatInfo(v([c(9, 'H')], 9, 1)), { rank: '9', note: 'or higher, or a 2 or 10' });
});

test('what just happened, and the Next Turn label', () => {
  const names = ['Alex', 'Brooke'];
  let g = layout({ players: [{ hand: ['10H', '4C'], up: ['5C'], down: ['6C'] }, { hand: ['9D'], up: ['5D'], down: ['6D'] }], pile: ['9S'] });
  g = reduce(g, { type: 'play', seat: 0, ids: ['10H0'] });
  const v = viewFor(g, 0);
  assert.match(lastLine(v, names, 0), /^You played 10 of hearts\. Bomb!.*you go again/);
  assert.equal(nextLabel(v, names), 'Next turn: Alex again');
  g = reduce(reduce(g, { type: 'next' }), { type: 'play', seat: 0, ids: ['4C0'] });
  assert.equal(nextLabel(viewFor(g, 0), names), 'Next turn: Brooke');
  assert.equal(lastLine(viewFor(g, 1), names, 1), 'Alex played 4 of clubs.');
  g = reduce(g, { type: 'next' });
  g = reduce(g, { type: 'pickUp', seat: 1 });
  assert.equal(lastLine(viewFor(g, 0), names, 0), 'Brooke picked up 1 card.');
});

test('draw for first: rounds, ties called out, only the tied redraw, one winner', () => {
  const draws = [
    [{ seat: 0, rank: 7, suit: 'C' }, { seat: 1, rank: 13, suit: 'H' }, { seat: 2, rank: 13, suit: 'S' }],
    [{ seat: 1, rank: 9, suit: 'C' }, { seat: 2, rank: 12, suit: 'D' }],
  ];
  const plan = drawPlan(draws);
  assert.deepEqual(plan.map(r => [r.tied, r.winner]), [[[1, 2], null], [null, 2]]);
  const f = drawFinal(draws);
  assert.equal(f[2].result, 'starts');
  assert.equal(f[1].result, 'out');
  assert.equal(f[1].rank, 9, 'shows the last card that seat drew');
  assert.equal(f[0].round, 0);
  // Real games: the plan always ends on the engine's first player.
  for (let seed = 1; seed < 200; seed++) {
    const g = createGame({ players: 6, decks: 2, seed });
    assert.equal(drawPlan(g.draws).at(-1).winner, g.first);
  }
});

test('local save round trip: exact cards come back, and bad saves are refused', () => {
  const g = createGame({ players: 3, decks: 1, seed: 42 });
  const save = { g, names: ['Alex', 'Brooke', 'Sam'], styles: ['cobalt', 'tangerine', 'forest'], drawSeen: true,
    saveId: null, createdAt: '2026-11-23T10:00:00.000Z', startedAt: null, endedAt: null };
  const back = readGame(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.g, g, 'never reshuffled');
  assert.deepEqual(back.names, save.names);
  assert.equal(back.drawSeen, true);
  assert.equal(readGame({ ...save, styles: ['cobalt', 'cobalt', 'forest'] }), null, 'two players, one style');
  assert.equal(readGame({ ...save, names: ['Alex', 'Brooke'] }), null, 'names must match the seats');
  assert.equal(readGame({ ...save, names: ['Alex', '', 'Sam'] }), null);
  const lost = structuredClone(g);
  lost.deck.pop();
  assert.equal(readGame({ ...save, g: lost }), null, 'a missing card fails checkState');
  assert.equal(readGame(null), null);
  assert.equal(readGame({ ...save, saveId: 'nope' }).saveId, null);
});

test('decks follow the player count until chosen, and stay allowed', () => {
  assert.equal(decksFor(2, null), 1);
  assert.equal(decksFor(4, null), 2);
  assert.equal(decksFor(3, 4), 4);
  assert.equal(decksFor(5, 1), 2, '1 deck cannot serve 5 players');
  assert.equal(decksFor(0, null), 1);
  assert.ok(okRoster(['A', 'B'], ['cobalt', 'sky']));
  assert.ok(!okRoster(['A'], ['cobalt']));
  assert.ok(!okRoster(['A', 'B'], ['cobalt', 'plaid']));
});

test('views for the handoff screen carry no private cards', () => {
  let g = createGame({ players: 2, decks: 1, seed: 7 });
  const v = JSON.stringify(viewFor(g, null));
  for (const p of g.players) for (const x of [...p.hand, ...p.down]) assert.ok(!v.includes(`"${x.id}"`));
});
