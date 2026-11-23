// Canadian Salad scoring: the six rounds, per-trick penalties, expected totals and standings. Pure functions.
import { isHeart, isQueen, isKingOfSpades, validPlayers, validDecks } from './cards.js';

export const ROUNDS = [
  { n: 1, key: 'tricks', name: 'No Tricks' },
  { n: 2, key: 'hearts', name: 'No Hearts' },
  { n: 3, key: 'queens', name: 'No Queens' },
  { n: 4, key: 'kings', name: 'No King of Spades' },
  { n: 5, key: 'last', name: 'No Last Trick' },
  { n: 6, key: 'salad', name: 'Canadian Salad' },
];
export const CATEGORIES = ['tricks', 'hearts', 'queens', 'kings', 'last'];
export const POINTS = { tricks: 10, hearts: 10, queens: 25, kings: 100, last: 100 };
export const scores = (round, cat) => round === 6 || ROUNDS[round - 1]?.key === cat;

// Counts -> breakdown: { tricks, hearts, queens, kings, last, points: { tricks, hearts, queens, kings, last, total } }.
// Every category is always counted; points are 0 for categories this round does not score.
export function breakdown(counts, round) {
  const points = {};
  for (const cat of CATEGORIES) points[cat] = scores(round, cat) ? counts[cat] * POINTS[cat] : 0;
  points.total = CATEGORIES.reduce((s, cat) => s + points[cat], 0);
  const b = {};
  for (const cat of CATEGORIES) b[cat] = counts[cat];
  b.points = points;
  return b;
}

// Penalty for one captured trick. `cards` is every card the winner takes with it (the plays, plus the kitty on trick 1).
export const trickPenalty = (cards, round, isLast) => breakdown({
  tricks: 1,
  hearts: cards.filter(isHeart).length,
  queens: cards.filter(isQueen).length,
  kings: cards.filter(isKingOfSpades).length,
  last: isLast ? 1 : 0,
}, round);

// Sum of breakdowns (counts added, points recomputed for the round, which equals adding the points).
export const sumBreakdowns = (list, round) => breakdown(
  Object.fromEntries(CATEGORIES.map(cat => [cat, list.reduce((s, b) => s + b[cat], 0)])), round);

const count = players => Array.isArray(players) ? players.length : players;

// The lobby summary for a table of `players` (a count or the players list) and whole decks.
export function describeConfig(players, decks) {
  const n = count(players);
  if (!validPlayers(n) || !validDecks(decks)) throw new Error('Canadian Salad needs 2 to 8 players and 1 to 3 decks.');
  const cardsEach = Math.floor(52 * decks / n);
  return {
    cardsEach, kitty: 52 * decks - cardsEach * n, tricks: cardsEach,
    hearts: 13 * decks, queens: 4 * decks, kingsOfSpades: decks, long: cardsEach > 26,
  };
}

// Points one round hands out in total, across all players.
export function expectedRound({ players, decks }, round) {
  const c = describeConfig(players, decks);
  return breakdown({ tricks: c.tricks, hearts: c.hearts, queens: c.queens, kings: c.kingsOfSpades, last: 1 }, round).points.total;
}
// Total penalties of a whole game: 2 * (10T + 10H + 25Q + 100K + 100).
export const expectedTotal = config => ROUNDS.reduce((s, r) => s + expectedRound(config, r.n), 0);

// Lowest total first; equal totals share a rank (1, 1, 3); ties keep seat order. winners: every seat with rank 1.
export function standings(totals) {
  const rows = totals.map((total, seat) => ({ seat, total, rank: 1 + totals.filter(t => t < total).length }));
  rows.sort((a, b) => a.total - b.total || a.seat - b.seat);
  return { rows, winners: rows.filter(r => r.rank === 1).map(r => r.seat) };
}
