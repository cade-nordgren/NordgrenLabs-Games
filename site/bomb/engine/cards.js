// Bomb cards: ids, ranks, pile rules and the seeded shuffle. Plain data, no DOM, no side effects.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11 J, 12 Q, 13 K, 14 A
export const MIN_PLAYERS = 2, MAX_PLAYERS = 6, MAX_DECKS = 4;

export const label = rank => rank <= 10 ? String(rank) : 'JQKA'[rank - 11];
export const card = (rank, suit, deck) => ({ id: label(rank) + suit + deck, rank, suit, deck });
export const fullDeck = decks =>
  Array.from({ length: decks }, (_, d) => SUITS.flatMap(s => RANKS.map(r => card(r, s, d)))).flat();

// Every player needs 13 cards, so only deck counts that cover that are offered.
export const allowedDecks = players =>
  Number.isInteger(players) && players >= MIN_PLAYERS && players <= MAX_PLAYERS
    ? [1, 2, 3, 4].filter(d => d * 52 >= players * 13) : [];
export const defaultDecks = players => players <= 3 ? 1 : 2;

// The rank a play must equal or beat; null when anything goes (empty pile, or a 2 on top).
export const required = pile => {
  const top = pile.at(-1);
  return !top || top.rank === 2 ? null : top.rank;
};
export const canPlay = (rank, pile) => {
  const r = required(pile);
  return rank === 2 || rank === 10 || r === null || rank >= r;
};
export const legalRanks = pile => RANKS.filter(r => canPlay(r, pile));
// How many cards of the top card's rank sit consecutively on top; four or more bomb.
export const streak = pile => {
  let n = 0;
  while (n < pile.length && pile[pile.length - 1 - n].rank === pile.at(-1).rank) n++;
  return n;
};

// Seeded PRNG (mulberry32) whose state lives in g.rng, so the same seed always gives the same game.
function rand(g) {
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
