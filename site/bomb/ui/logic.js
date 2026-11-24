// Pure helpers for the Bomb screens: names, sorting, selection, labels, who goes first and the local save shape. No DOM, so tests/bomb/ui.test.js runs them under node --test. Rules stay in ../engine.
import { label, MIN_PLAYERS, MAX_PLAYERS, allowedDecks, defaultDecks } from '../engine/cards.js';
import { checkState, FIRST_ORDER } from '../engine/reducer.js';
import { STYLES } from './styles.js';
import { deckOf } from '../../decks/decks.js';

export const SUIT = { S: ['♠', 'spades'], H: ['♥', 'hearts'], D: ['♦', 'diamonds'], C: ['♣', 'clubs'] };
export const isRed = suit => suit === 'H' || suit === 'D';
const FACE = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const WORD = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
export const rankName = rank => FACE[rank] || String(rank);
export const cardName = c => `${rankName(c.rank)} of ${SUIT[c.suit][1]}`;
// "a Queen", "2 Queens", "a seven", "3 sixes", "an Ace", "an eight".
export function rankCount(rank, n) {
  const w = FACE[rank] || WORD[rank];
  if (n === 1) return `${/^[AEae]/.test(w) ? 'an' : 'a'} ${w}`;
  return `${n} ${w}${rank === 6 ? 'es' : 's'}`;
}
export const listOf = names => new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Hand order: by rank, 2 low to Ace high (or high to low with desc), then suit, so equal ranks sit together.
const SUIT_ORDER = 'SHCD';
export const sortHand = (cards, desc = false) => [...cards].sort((a, b) => (desc ? b.rank - a.rank : a.rank - b.rank)
  || SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.deck - b.deck);

// Tapping a card: only cards the engine says are playable can be chosen; a card of another rank replaces the selection.
export function toggle(sel, card, playable) {
  if (!playable.includes(card.id)) return sel;
  if (sel.some(c => c.id === card.id)) return sel.filter(c => c.id !== card.id);
  return sel.length && sel[0].rank !== card.rank ? [card] : [...sel, card];
}
// Drops picks that are no longer playable (a new view arrived), keeping the rest in order.
export const keepPlayable = (sel, playable) => sel.filter(c => playable.includes(c.id));
export const canPlaySel = (sel, playable) => sel.length > 0 && sel.every(c => playable.includes(c.id) && c.rank === sel[0].rank);
export const playLabel = sel => sel.length ? `Play ${rankCount(sel[0].rank, sel.length)}` : 'Play';

// The centre panel's "to beat": the rank (or Any) and a short note under it.
export function beatInfo(view) {
  if (!view.pile.length) return { rank: 'Any', note: 'empty pile' };
  if (view.required === null) return { rank: 'Any', note: 'reset by a 2' };
  const r = view.required;
  if (view.streak >= 2) return { rank: label(r), note: `${rankCount(r, view.streak)} in a row` };
  return { rank: label(r), note: 'or higher, or a 2 or 10' };
}

// What just happened, in words, for the status line and the live region. names[seat] is a display name; you is the
// viewer's seat (or null), so it can say "You".
export function lastLine(view, names, you) {
  const l = view.last;
  if (!l) return '';
  const who = l.seat === you ? 'You' : names[l.seat];
  if (l.type === 'pickUp') return `${who} picked up ${plural(l.count, 'card')}.`;
  if (l.type === 'failed') return `${who} turned ${cardName(l.card)}: too low, so ${l.seat === you ? 'you take' : 'they take'} the pile (${plural(l.count, 'card')}).`;
  const what = l.cards.length === 1 ? cardName(l.cards[0]) : rankCount(l.cards[0].rank, l.cards.length);
  const blind = l.from === 'down' ? ' face down' : '';
  if (l.bomb) return `${who} played ${what}${blind}. Bomb! The pile is gone and ${l.seat === you ? 'you go' : 'they go'} again.`;
  if (l.cards[0].rank === 2) return `${who} played ${what}${blind}. Reset: ${l.seat === you ? 'you go' : 'they go'} again, anything goes.`;
  return `${who} played ${what}${blind}.`;
}

// Who goes first and why, from view.firstWhy (null in games from before it existed): "Sam goes first: most 3s."
const ranks = r => `${rankName(r)}s`;
export function firstLine(view, names, you) {
  const w = view.firstWhy;
  if (!w) return '';
  const who = view.first === you ? 'You go first' : `${names[view.first]} goes first`;
  if (w.rank === null) return `${who}: same cards, so picked at random.`;
  const what = w.tied ? `more ${ranks(w.rank)}` : w.count === 1 ? `the only ${rankName(w.rank)}` : `most ${ranks(w.rank)}`;
  const below = FIRST_ORDER.slice(0, FIRST_ORDER.indexOf(w.rank));
  const pre = !below.length ? '' : w.tied ? 'tied on lower cards, so '
    : `no ${below.length === 1 ? ranks(below[0]) : below.length === 2 ? `${ranks(below[0])} or ${ranks(below[1])}` : `${ranks(below[0])} to ${ranks(below.at(-1))}`}, so `;
  return `${who}: ${pre}${what}.`;
}

// One phone: the Next Turn button's words once a move is pending.
export const nextLabel = (view, names) => !view.pending ? 'Next turn'
  : view.pending.next === view.turn ? `Next turn: ${names[view.turn]} again` : `Next turn: ${names[view.pending.next]}`;

// One phone: face-up choices go round in seat order (from first, which is seat 0 while choosing). -1 once everyone is ready.
export function choosingSeat(g) {
  const n = g.players.length;
  for (let k = 0; k < n; k++) if (!g.players[(g.first + k) % n].ready) return (g.first + k) % n;
  return -1;
}
// Online: who left between two views of one room. Seats are re-packed, so compare by style (unique in a room).
export const leavers = (was, now) => !was || was.id !== now.id || now.seats.length >= was.seats.length ? []
  : was.seats.filter(s => !now.seats.some(t => t.style === s.style)).map(s => s.name);

// ---- The local save: the engine state plus names, styles, each player's hand order and times. Stored data is a trust
// boundary, so readGame checks every field and returns null for anything not shaped right.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_NAME = 20;
const okName = n => typeof n === 'string' && n.trim().length > 0 && n.length <= MAX_NAME;
export const okRoster = (names, styles) => Array.isArray(names) && Array.isArray(styles) && names.length === styles.length
  && names.length >= MIN_PLAYERS && names.length <= MAX_PLAYERS && names.every(okName)
  && styles.every(s => STYLES.some(x => x.id === s)) && new Set(styles).size === styles.length;

// Which picture deck each of the four possible decks wears ('' for Bomb's own drawn cards). Unknown ids become ''.
export const cleanArt = a => Array.from({ length: 4 }, (_, i) => Array.isArray(a) && deckOf(a[i]) ? a[i] : '');
export function readGame(x) {
  if (!x || typeof x !== 'object') return null;
  try { checkState(x.g); } catch { return null; }
  if (!okRoster(x.names, x.styles) || x.names.length !== x.g.players.length) return null;
  return {
    g: x.g, names: x.names, styles: x.styles, art: cleanArt(x.art),
    desc: x.names.map((_, i) => Array.isArray(x.desc) && x.desc[i] === true), // hand order per player: true is high to low
    saveId: UUID.test(x.saveId) ? x.saveId : null,
    createdAt: ISO.test(x.createdAt) ? x.createdAt : null,
    startedAt: ISO.test(x.startedAt) ? x.startedAt : null,
    endedAt: ISO.test(x.endedAt) ? x.endedAt : null,
  };
}

// Setup: decks follow the player count until the user picks a number, and always stay allowed.
export const decksFor = (players, chosen) => {
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, players));
  return allowedDecks(n).includes(chosen) ? chosen : defaultDecks(n);
};

export const minutes = (a, b) => {
  const m = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
