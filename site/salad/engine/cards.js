// Canadian Salad cards: ids, ranks, the shoe and the seeded shuffle. Plain data, no DOM, no side effects.
// A card is its id string everywhere in state and views: 'd2-QH' is the Queen of Hearts from deck 2.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11 J, 12 Q, 13 K, 14 A (Ace high)
export const MIN_PLAYERS = 2, MAX_PLAYERS = 8, MAX_DECKS = 3;

export const label = rank => rank <= 10 ? String(rank) : 'JQKA'[rank - 11];
export const cardId = (rank, suit, deck) => `d${deck}-${label(rank)}${suit}`;
const ID = /^d([1-3])-(10|[2-9JQKA])([SHDC])$/;
// { id, deck, rank, suit } for a valid id, else null.
export function cardOf(id) {
  const m = typeof id === 'string' && ID.exec(id);
  if (!m) return null;
  const rank = /\d/.test(m[2]) ? +m[2] : 11 + 'JQKA'.indexOf(m[2]);
  return { id, deck: +m[1], rank, suit: m[3] };
}
export const rankOf = id => cardOf(id).rank;
export const suitOf = id => id.at(-1);

// Every card id of `decks` whole decks, in a fixed order (deck 1 spades 2..A, hearts, diamonds, clubs, then deck 2...).
export const shoe = decks =>
  Array.from({ length: decks }, (_, d) => SUITS.flatMap(s => RANKS.map(r => cardId(r, s, d + 1)))).flat();

export const isHeart = id => suitOf(id) === 'H';
export const isQueen = id => rankOf(id) === 12;
export const isKingOfSpades = id => rankOf(id) === 13 && suitOf(id) === 'S';
export const isPenaltyCard = id => isHeart(id) || isQueen(id) || isKingOfSpades(id);

export const validPlayers = n => Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
export const validDecks = d => Number.isInteger(d) && d >= 1 && d <= MAX_DECKS;
export const defaultDecks = players => players <= 5 ? 1 : 2;

// Seeded PRNG (mulberry32) whose state lives in g.rng, so the same seed always gives the same game.
export function rand(g) {
  let t = g.rng = (g.rng + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// Fisher-Yates, in place; returns the array.
export function shuffle(cards, g) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
