// Pure helpers for the Bomb screens: names, sorting, selection, labels, the draw-for-first sequence and the local
// save shape. No DOM, so tests/bomb/ui.test.js runs them under node --test. Rules stay in ../engine.
import { label, MIN_PLAYERS, MAX_PLAYERS, allowedDecks, defaultDecks } from '../engine/cards.js';
import { checkState } from '../engine/reducer.js';
import { STYLES } from './styles.js';

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

// Hand order: by rank, 2 low to Ace high, then suit, so equal ranks sit together.
const SUIT_ORDER = 'SHCD';
export const sortHand = cards => [...cards].sort((a, b) => a.rank - b.rank || SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.deck - b.deck);

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
  if (l.cards[0].rank === 2) return `${who} played ${what}${blind}. Reset: anything goes next.`;
  return `${who} played ${what}${blind}.`;
}

// One phone: the Next Turn button's words once a move is pending.
export const nextLabel = (view, names) => !view.pending ? 'Next turn'
  : view.pending.next === view.turn ? `Next turn: ${names[view.turn]} again` : `Next turn: ${names[view.pending.next]}`;

// One phone: face-up choices go round from whoever won the draw, in turn order. -1 once everyone is ready.
export function choosingSeat(g) {
  const n = g.players.length;
  for (let k = 0; k < n; k++) if (!g.players[(g.first + k) % n].ready) return (g.first + k) % n;
  return -1;
}
// Online: who left between two views of one room. Seats are re-packed, so compare by style (unique in a room).
export const leavers = (was, now) => !was || was.id !== now.id || now.seats.length >= was.seats.length ? []
  : was.seats.filter(s => !now.seats.some(t => t.style === s.style)).map(s => s.name);

// Draw for first, as a sequence to present: each round's cards flip one by one, then that round's outcome.
// Returns [{ round, cards: [{ seat, rank, suit }], tied: [seat] | null, winner: seat | null }].
export function drawPlan(draws) {
  return draws.map((cards, round) => {
    const top = Math.max(...cards.map(d => d.rank));
    const best = cards.filter(d => d.rank === top).map(d => d.seat);
    return { round, cards, tied: best.length > 1 ? best : null, winner: best.length === 1 ? best[0] : null };
  });
}
// The final card each seat drew and how they ended: 'starts', or 'out' (with the round they went out in).
export function drawFinal(draws) {
  const plan = drawPlan(draws), out = {};
  for (const r of plan) for (const d of r.cards) out[d.seat] = { rank: d.rank, suit: d.suit, result: r.winner === d.seat ? 'starts' : r.tied?.includes(d.seat) ? 'tie' : 'out', round: r.round };
  return out;
}

// ---- The local save: the engine state plus names, styles and where the screens were. Stored data is a trust
// boundary, so readGame checks every field and returns null for anything not shaped right.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_NAME = 20;
const okName = n => typeof n === 'string' && n.trim().length > 0 && n.length <= MAX_NAME;
export const okRoster = (names, styles) => Array.isArray(names) && Array.isArray(styles) && names.length === styles.length
  && names.length >= MIN_PLAYERS && names.length <= MAX_PLAYERS && names.every(okName)
  && styles.every(s => STYLES.some(x => x.id === s)) && new Set(styles).size === styles.length;

export function readGame(x) {
  if (!x || typeof x !== 'object') return null;
  try { checkState(x.g); } catch { return null; }
  if (!okRoster(x.names, x.styles) || x.names.length !== x.g.players.length) return null;
  return {
    g: x.g, names: x.names, styles: x.styles,
    drawSeen: x.drawSeen === true,
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
