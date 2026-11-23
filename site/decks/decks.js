// Shared card art that any card game can offer next to its own drawn cards. Each deck is a folder here holding
// <rank><suit>.jpg in lower case for all 52 cards (qh.jpg, 10s.jpg; the site holds only lower-case names), back.jpg,
// and joker1.jpg, joker2.jpg.
// Cards are 200 x 286 (a 1:1.43 card); jokers keep their own width at 286 tall.
// Adding a deck: put its 57 files in a new folder and add a line below; every game that reads this list offers it.
// color: the player colour that goes with the deck where a game uses it as a player's style (Bomb); white text must
// read on it and it must show against light and dark pages (tests/bomb/contrast.test.js).
export const DECKS = [
  { id: 'honor', name: 'Honor Deck', color: '#3a64c8' },
  { id: 'odium', name: 'Odium Deck', color: '#a8329a' },
  { id: 'classic-deck', name: 'Classic Deck', color: '#b8323f' },
  { id: 'dark', name: 'Dark Deck', color: '#8e7230' },
  { id: 'parchment', name: 'Parchment Deck', color: '#8b5a2b' },
];
export const deckOf = id => DECKS.find(d => d.id === id) || null;

const ROOT = '/decks/'; // where site/decks is served (the Worker imports this file too, so no import.meta)
const LABEL = /^(10|[2-9JQKA])$/, SUIT = /^[SHDC]$/;
// label is the rank as printed ('2'..'10', 'J', 'Q', 'K', 'A'); suit is 'S', 'H', 'D' or 'C'.
export function faceUrl(id, label, suit) {
  if (!deckOf(id) || !LABEL.test(label) || !SUIT.test(suit)) return null;
  return `${ROOT}${id}/${label}${suit}`.toLowerCase() + '.jpg';
}
export const backUrl = id => deckOf(id) ? `${ROOT}${id}/back.jpg` : null;
export const jokerUrl = (id, n) => deckOf(id) && (n === 1 || n === 2) ? `${ROOT}${id}/joker${n}.jpg` : null;
