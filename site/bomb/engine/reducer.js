// Bomb rules: a pure, serialisable reducer. reduce(state, action) returns a new state, or the same state object when
// the action is not legal now. All shuffling happens in createGame; play itself has no randomness.
import { SUITS, RANKS, fullDeck, allowedDecks, defaultDecks, canPlay, streak, shuffle } from './cards.js';

export const HAND = 5, TABLE = 4, DEAL = 9;

const player = () => ({ hand: [], up: [], down: [], ready: false, bombs: 0, pickups: 0 });

export function createGame({ players, decks = defaultDecks(players), seed }) {
  if (!allowedDecks(players).length) throw new Error('Bomb needs 2 to 6 players.');
  if (!allowedDecks(players).includes(decks)) throw new Error(`${players} players cannot use ${decks} deck(s).`);
  const g = {
    v: 1, rng: seed | 0, decks, phase: 'choose', first: 0, draws: [], turn: 0, pending: null, winner: null, turns: 0,
    deck: [], pile: [], removed: [], players: Array.from({ length: players }, player), last: null,
  };
  Object.assign(g, drawForFirst(players, shuffle(fullDeck(decks), g), g));
  g.deck = shuffle(fullDeck(decks), g);
  g.turn = g.first;
  for (const p of g.players) { p.down = g.deck.splice(0, TABLE); p.hand = g.deck.splice(0, DEAL); }
  return g;
}

// Draw for first: everyone draws one card, the highest rank starts and only those tied for highest draw again.
// Drawn cards stay out until the shoe cannot serve a round, then everything is reshuffled. Exported for tests.
export function drawForFirst(players, shoe, g) {
  const draws = [];
  let out = [], left = [...Array(players).keys()];
  while (left.length > 1) {
    if (shoe.length < left.length) { shoe = shuffle(shoe.concat(out), g); out = []; }
    const round = left.map(seat => { const c = shoe.pop(); out.push(c); return { seat, rank: c.rank, suit: c.suit }; });
    draws.push(round);
    const top = Math.max(...round.map(d => d.rank));
    left = round.filter(d => d.rank === top).map(d => d.seat);
  }
  return { first: left[0], draws };
}

// For tests and prepared scenarios: a play-phase state from card codes ('QH' is deck 0, 'QH1' deck 1, '10S').
// Lists are in order: deck[0] is drawn first, pile's last card is on top, up/down are padded with empty slots to 4.
// Every card not placed goes to removed. Throws on an unknown or repeated card; does not check the rules (checkState does).
export function layout({ decks = 1, players, pile = [], deck = [], turn = 0 }) {
  const free = new Map(fullDeck(decks).map(c => [c.id, c]));
  const take = code => {
    if (code == null) return null;
    const m = /^(10|[2-9JQKA])([SHDC])(\d?)$/.exec(code);
    const c = m && free.get(m[1] + m[2] + (m[3] || '0'));
    if (!c) throw new Error(`Unknown or repeated card ${code}.`);
    free.delete(c.id);
    return c;
  };
  const slots = (codes = []) => [...codes, null, null, null, null].slice(0, TABLE).map(take);
  const g = {
    v: 1, rng: 0, decks, phase: 'play', first: turn, draws: [], turn, pending: null, winner: null, turns: 0,
    deck: deck.map(take), pile: pile.map(take), removed: [], last: null,
    players: players.map(p => ({ ...player(), ready: true, hand: (p.hand ?? []).map(take), up: slots(p.up), down: slots(p.down) })),
  };
  g.removed = [...free.values()];
  return g;
}

// Which zone a player plays from now: hand first, then face-up, then face-down; null once they have no cards.
export const source = p => p.hand.length ? 'hand' : p.up.some(Boolean) ? 'up' : p.down.some(Boolean) ? 'down' : null;
const isSeat = (g, s) => Number.isInteger(s) && s >= 0 && s < g.players.length;
const onTurn = (g, seat) => g.phase === 'play' && !g.pending && seat === g.turn;
const cardsLeft = p => p.hand.length + p.up.filter(Boolean).length + p.down.filter(Boolean).length;

// Ids of the seat's cards that may be played now (hand or face-up); [] when it is not their turn or they play blind.
export function playable(g, seat) {
  if (!onTurn(g, seat)) return [];
  const p = g.players[seat], from = source(p);
  return from === 'hand' || from === 'up' ? p[from].filter(c => c && canPlay(c.rank, g.pile)).map(c => c.id) : [];
}
export const canPickUp = (g, seat) => onTurn(g, seat) && g.pile.length > 0;
// Stuck: nothing playable from hand or face-up. Face-down play is always possible, so never forced there.
export const mustPickUp = (g, seat) =>
  canPickUp(g, seat) && ['hand', 'up'].includes(source(g.players[seat])) && !playable(g, seat).length;

const nextSeat = (g, seat) => (seat + 1) % g.players.length;

// Cards already moved off the player land on the pile: bomb, refill, then win or pending Next Turn.
function land(g, seat, cards, from) {
  const p = g.players[seat];
  g.pile.push(...cards);
  g.turns++;
  const bomb = cards[0].rank === 10 || streak(g.pile) >= 4;
  if (bomb) { g.removed.push(...g.pile); g.pile = []; p.bombs++; }
  let drew = 0;
  while (p.hand.length < HAND && g.deck.length) { p.hand.push(g.deck.shift()); drew++; }
  g.last = { seat, type: 'play', from, cards, bomb, drew };
  if (cardsLeft(p)) g.pending = { next: bomb ? seat : nextSeat(g, seat) };
  else { g.phase = 'over'; g.winner = seat; }
}

function takePile(g, seat) {
  const p = g.players[seat], count = g.pile.length;
  p.hand.push(...g.pile);
  g.pile = [];
  p.pickups++;
  g.turns++;
  g.pending = { next: nextSeat(g, seat) };
  return count;
}

// Each handler gets a private clone and returns true when the action was legal (the clone becomes the new state).
const ACTIONS = {
  arrange(g, { seat, ids }) {
    if (g.phase !== 'choose' || !isSeat(g, seat) || g.players[seat].ready) return false;
    if (!Array.isArray(ids) || ids.length !== TABLE || new Set(ids).size !== TABLE) return false;
    const p = g.players[seat], pool = [...p.hand, ...p.up];
    const up = ids.map(id => pool.find(c => c.id === id));
    if (up.some(c => !c)) return false;
    p.up = up;
    p.hand = pool.filter(c => !ids.includes(c.id));
    return true;
  },
  confirm(g, { seat }) {
    if (g.phase !== 'choose' || !isSeat(g, seat) || g.players[seat].ready || g.players[seat].up.length !== TABLE) return false;
    g.players[seat].ready = true;
    if (g.players.every(p => p.ready)) { g.phase = 'play'; g.turn = g.first; }
    return true;
  },
  play(g, { seat, ids }) {
    if (!onTurn(g, seat) || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return false;
    const p = g.players[seat], from = source(p);
    if (from !== 'hand' && from !== 'up') return false;
    const cards = ids.map(id => p[from].find(c => c?.id === id));
    if (cards.some(c => !c || c.rank !== cards[0].rank) || !canPlay(cards[0].rank, g.pile)) return false;
    if (from === 'hand') p.hand = p.hand.filter(c => !ids.includes(c.id));
    else p.up = p.up.map(c => c && ids.includes(c.id) ? null : c);
    land(g, seat, cards, from);
    return true;
  },
  playDown(g, { seat, slot }) {
    if (!onTurn(g, seat)) return false;
    const p = g.players[seat];
    if (source(p) !== 'down' || !Number.isInteger(slot) || !p.down[slot]) return false;
    const c = p.down[slot];
    p.down[slot] = null;
    if (canPlay(c.rank, g.pile)) land(g, seat, [c], 'down');
    else {
      g.pile.push(c);
      // Only rank and suit: the card is now in a hand, and views must never carry hand card ids of other players.
      g.last = { seat, type: 'failed', card: { rank: c.rank, suit: c.suit }, count: takePile(g, seat) };
    }
    return true;
  },
  pickUp(g, { seat }) {
    if (!canPickUp(g, seat)) return false;
    g.last = { seat, type: 'pickUp', count: takePile(g, seat) };
    return true;
  },
  next(g) {
    if (!g.pending) return false;
    g.turn = g.pending.next;
    g.pending = null;
    return true;
  },
};

export function reduce(state, action) {
  if (!state || !action || !Object.hasOwn(ACTIONS, action.type)) return state;
  const g = structuredClone(state);
  return ACTIONS[action.type](g, action) ? g : state;
}

// Stored or received state is a trust boundary: check the shape and the invariants (spec Part 1 section 20).
const fail = msg => { throw new Error('Invalid Bomb state: ' + msg); };
const nat = x => Number.isInteger(x) && x >= 0;

export function checkState(g) {
  if (!g || typeof g !== 'object' || g.v !== 1) fail('not a version 1 game.');
  const n = Array.isArray(g.players) ? g.players.length : 0;
  if (!allowedDecks(n).includes(g.decks)) fail('bad player or deck count.');
  if (!['choose', 'play', 'over'].includes(g.phase)) fail('unknown phase.');
  if (!Number.isInteger(g.rng) || !nat(g.turns) || !isSeat(g, g.first) || !isSeat(g, g.turn)) fail('bad counters or seats.');
  if (![g.deck, g.pile, g.removed].every(Array.isArray)) fail('deck, pile and removed must be lists.');

  // Every card exactly once across all zones, and each card is the real one for its id.
  const want = new Map(fullDeck(g.decks).map(c => [c.id, c]));
  const claim = c => {
    const w = want.get(c?.id);
    if (!w || c.rank !== w.rank || c.suit !== w.suit || c.deck !== w.deck || Object.keys(c).length !== 4) fail(`bad or repeated card ${c?.id}.`);
    want.delete(c.id);
  };
  [g.deck, g.pile, g.removed].forEach(z => z.forEach(claim));
  for (const p of g.players) {
    if (!p || ![p.hand, p.up, p.down].every(Array.isArray) || typeof p.ready !== 'boolean' || !nat(p.bombs) || !nat(p.pickups)) fail('bad player.');
    if (p.down.length !== TABLE) fail('every player has four face-down slots.');
    p.hand.forEach(claim);
    [...p.up, ...p.down].forEach(c => c !== null && claim(c));
  }
  if (want.size) fail(`${want.size} card(s) missing.`);

  if (g.phase === 'choose') {
    if (g.pile.length || g.removed.length || g.pending !== null || g.winner !== null || g.turns || g.last !== null || g.turn !== g.first) fail('play has not started.');
    if (g.deck.length !== g.decks * 52 - n * 13) fail('deck does not match the deal.');
    if (g.players.every(p => p.ready)) fail('everyone confirmed but play has not started.');
    for (const p of g.players) {
      if (!p.down.every(Boolean) || ![0, TABLE].includes(p.up.length) || p.up.includes(null) || p.hand.length + p.up.length !== DEAL) fail('bad face-up choice.');
      if (p.ready && p.up.length !== TABLE) fail('confirmed without four face-up cards.');
    }
  } else {
    for (const p of g.players) {
      if (!p.ready || p.up.length !== TABLE) fail('every player has confirmed four face-up slots.');
      if ((p.up.includes(null) || p.down.includes(null)) && g.deck.length) fail('table cards played before the deck ran out.');
      if (p.down.includes(null) && p.up.some(Boolean)) fail('face-down card played before the face-up cards.');
      if (g.deck.length && p.hand.length < HAND) fail('a hand is short while the deck has cards.');
    }
    if (g.pile.some(c => c.rank === 10) || (g.pile.length && streak(g.pile) >= 4)) fail('the pile should have bombed.');
    if (g.pile.some((c, i) => i && !canPlay(c.rank, g.pile.slice(0, i)))) fail('the pile is not a legal sequence.');
    const left = g.players.map(cardsLeft);
    if (g.phase === 'play') {
      if (g.winner !== null || left.includes(0)) fail('a player with no cards should have won.');
      if (g.pending !== null && (Object.keys(g.pending).join() !== 'next' || !isSeat(g, g.pending.next))) fail('bad pending turn.');
    } else if (!isSeat(g, g.winner) || left[g.winner] || left.filter(x => !x).length !== 1 || g.pending !== null || g.deck.length) {
      fail('bad finished game.');
    }
  }

  if (!Array.isArray(g.draws) || !g.draws.every(r => Array.isArray(r) && r.length &&
      r.every(d => d && isSeat(g, d.seat) && RANKS.includes(d.rank) && SUITS.includes(d.suit)))) fail('bad draw for first.');
  if (g.last !== null && (typeof g.last !== 'object' || !isSeat(g, g.last.seat) || !['play', 'pickUp', 'failed'].includes(g.last.type))) fail('bad last move.');
}
