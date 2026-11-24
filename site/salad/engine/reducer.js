// Canadian Salad rules: a pure, JSON-serialisable reducer. reduce(state, action) returns a new state, or the same
// state object when the action is not legal now. Shuffles happen only when a game or a round starts.
import { SUITS, RANKS, shoe, cardOf, rankOf, suitOf, shuffle, rand, validPlayers, validDecks } from './cards.js';
import { describeConfig, trickPenalty, sumBreakdowns, breakdown, expectedRound, expectedTotal, CATEGORIES } from './score.js';

export const SCORE_DISPLAYS = ['live', 'roundEnd'];
export const PHASES = ['play', 'roundEnd', 'over'];

const isSeat = (g, s) => Number.isInteger(s) && s >= 0 && s < g.players.length;
const next = (g, seat) => (seat + 1) % g.players.length;

function checkPlayers(players) {
  if (!Array.isArray(players) || !validPlayers(players.length)) throw new Error('Canadian Salad needs 2 to 8 players.');
  if (!players.every(p => p && typeof p.name === 'string' && typeof p.color === 'string')) throw new Error('Every player needs a name and a color.');
}

export function createGame({ players, decks, seed, scoreDisplay = 'live' }) {
  checkPlayers(players);
  if (!validDecks(decks)) throw new Error('Pick 1, 2 or 3 decks.');
  if (!SCORE_DISPLAYS.includes(scoreDisplay)) throw new Error('scoreDisplay is live or roundEnd.');
  const g = {
    v: 1, rng: seed | 0, decks, scoreDisplay, players: players.map(({ name, color }) => ({ name, color })),
    phase: 'play', cut: [], firstDealer: 0, round: 1, dealer: 0, turn: 0,
    hands: [], kitty: [], kittyTo: null, trick: null, tricks: [], history: [], totals: players.map(() => 0),
  };
  const { dealer: high, cut } = cutForDealer(players.length, shuffle(shoe(decks), g), g);
  g.cut = cut;
  // Owner ruling 2026-11-24: the highest cut goes first, so it leads the first trick and the seat before it deals.
  g.firstDealer = g.dealer = (high + players.length - 1) % players.length;
  deal(g);
  return g;
}

// The cut: every seat cuts one card, the highest rank goes first (returned as `dealer`; createGame makes it the first
// leader), suits never break ties, and only the seats tied for
// highest cut again. Cut cards stay out until the shoe cannot serve a row, then everything is reshuffled.
// Exported so tests can feed a rigged shoe (the last card of `cards` is cut first).
export function cutForDealer(players, cards, g) {
  const cut = [];
  let out = [], left = [...Array(players).keys()];
  while (left.length > 1) {
    if (cards.length < left.length) { cards = shuffle(cards.concat(out), g); out = []; }
    // Rank and suit only: cut cards are shuffled back in, and views must never carry an id someone now holds.
    const row = left.map(seat => { const card = cards.pop(); out.push(card); return { seat, rank: rankOf(card), suit: suitOf(card) }; });
    cut.push(row);
    const top = Math.max(...row.map(c => c.rank));
    left = row.filter(c => c.rank === top).map(c => c.seat);
  }
  return { dealer: left[0], cut };
}

// Rebuild the whole shoe, shuffle, deal floor(52*decks/players) each; the rest is the face-down kitty.
function deal(g) {
  const n = g.players.length, { cardsEach } = describeConfig(n, g.decks);
  const cards = shuffle(shoe(g.decks), g);
  g.hands = g.players.map((_, s) => cards.slice(s * cardsEach, (s + 1) * cardsEach));
  g.kitty = cards.slice(n * cardsEach);
  g.kittyTo = null;
  g.tricks = [];
  g.trick = { n: 1, leader: next(g, g.dealer), plays: [] };
  g.turn = g.trick.leader;
  g.phase = 'play';
}

// Highest card of the lead suit; among identical highest cards the last one played wins (>=).
export function trickWinner(plays) {
  const lead = suitOf(plays[0].card);
  let best = plays[0];
  for (const p of plays) if (suitOf(p.card) === lead && rankOf(p.card) >= rankOf(best.card)) best = p;
  return best.seat;
}

// Card ids `seat` may play now: [] unless it is their turn; must follow the lead suit when they hold it.
export function legalCards(g, seat) {
  if (g.phase !== 'play' || seat !== g.turn) return [];
  const hand = g.hands[seat], lead = g.trick.plays[0];
  const follow = lead ? hand.filter(c => suitOf(c) === suitOf(lead.card)) : [];
  return follow.length ? follow : [...hand];
}

// Each handler gets a private clone and returns true when the action was legal (the clone becomes the new state).
const ACTIONS = {
  PLAY_CARD(g, { seat, card }) {
    if (!isSeat(g, seat) || !legalCards(g, seat).includes(card)) return false;
    const n = g.players.length, t = g.trick;
    g.hands[seat] = g.hands[seat].filter(c => c !== card);
    t.plays.push({ seat, card });
    if (t.plays.length < n) { g.turn = next(g, seat); return true; }
    // Every seat has played: resolve at once.
    const winner = trickWinner(t.plays), isLast = t.n === describeConfig(n, g.decks).tricks;
    const kitty = t.n === 1 ? [...g.kitty] : [];
    g.tricks.push({ ...t, winner, kitty, penalty: trickPenalty([...t.plays.map(p => p.card), ...kitty], g.round, isLast) });
    if (kitty.length) g.kittyTo = winner;
    if (!isLast) {
      g.trick = { n: t.n + 1, leader: winner, plays: [] };
      g.turn = winner;
      return true;
    }
    const bd = g.players.map((_, s) => sumBreakdowns(g.tricks.filter(x => x.winner === s).map(x => x.penalty), g.round));
    g.history.push({ round: g.round, dealer: g.dealer, breakdown: bd });
    g.totals = g.totals.map((total, s) => total + bd[s].points.total);
    g.trick = null;
    g.turn = null;
    g.phase = g.round === 6 ? 'over' : 'roundEnd';
    return true;
  },
  NEXT_ROUND(g) {
    if (g.phase !== 'roundEnd') return false;
    g.round++;
    g.dealer = next(g, g.dealer);
    deal(g);
    return true;
  },
  // Replaces the whole game, so it returns the new state rather than true.
  REMATCH(g, { seed }) {
    if (g.phase !== 'over' || (seed !== undefined && !Number.isInteger(seed))) return false;
    return createGame({ players: g.players, decks: g.decks, scoreDisplay: g.scoreDisplay, seed: seed ?? (rand(g) * 2 ** 32 | 0) });
  },
};

export function reduce(state, action) {
  if (!state || !action || !Object.hasOwn(ACTIONS, action.type)) return state;
  const g = structuredClone(state);
  const r = ACTIONS[action.type](g, action);
  return r === true ? g : r || state;
}

// For tests and prepared screens: a valid state at the first trick of `round`, before anyone has played.
// Codes: 'QH' is d1-QH, 'QH2' is d2-QH, full ids are accepted. Hands and the kitty are filled up from the unplaced
// cards in shoe order. Earlier rounds get a stand-in history where seat 0 took everything. Throws on a bad code.
export function layout({ players, decks = 1, round = 1, dealer = 0, hands = [], kitty = [], scoreDisplay = 'live' }) {
  const list = typeof players === 'number' ? Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, color: `c${i}` })) : players;
  checkPlayers(list);
  const n = list.length, cfg = describeConfig(n, decks), free = shoe(decks);
  const take = code => {
    const m = /^(10|[2-9JQKA])([SHDC])([1-3]?)$/.exec(code);
    const id = m ? `d${m[3] || 1}-${m[1]}${m[2]}` : code, i = free.indexOf(id);
    if (i < 0) throw new Error(`Unknown or repeated card ${code}.`);
    return free.splice(i, 1)[0];
  };
  const h = list.map((_, s) => (hands[s] ?? []).map(take)), k = kitty.map(take);
  if (h.some(x => x.length > cfg.cardsEach) || k.length > cfg.kitty) throw new Error('Too many cards placed.');
  for (const x of h) while (x.length < cfg.cardsEach) x.push(free.shift());
  while (k.length < cfg.kitty) k.push(free.shift());
  const firstDealer = ((dealer - round + 1) % n + n) % n;
  const history = Array.from({ length: round - 1 }, (_, i) => ({
    round: i + 1, dealer: (firstDealer + i) % n,
    breakdown: list.map((_, s) => breakdown(s ? { tricks: 0, hearts: 0, queens: 0, kings: 0, last: 0 }
      : { tricks: cfg.tricks, hearts: cfg.hearts, queens: cfg.queens, kings: cfg.kingsOfSpades, last: 1 }, i + 1)),
  }));
  return {
    v: 1, rng: 0, decks, scoreDisplay, players: list.map(({ name, color }) => ({ name, color })),
    phase: 'play', cut: [list.map((_, seat) => ({ seat, rank: seat === (firstDealer + 1) % n ? 14 : 2, suit: 'S' }))],
    firstDealer, round, dealer, turn: (dealer + 1) % n, hands: h, kitty: k, kittyTo: null,
    trick: { n: 1, leader: (dealer + 1) % n, plays: [] }, tricks: [], history,
    totals: list.map((_, s) => s ? 0 : history.reduce((sum, r) => sum + r.breakdown[0].points.total, 0)),
  };
}

// Stored or received state is a trust boundary: check the shape and every invariant of spec section 24.
const fail = msg => { throw new Error('Invalid Canadian Salad state: ' + msg); };
const nat = x => Number.isInteger(x) && x >= 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPlays = (g, plays, leader) => Array.isArray(plays) &&
  plays.every((p, k) => p && Object.keys(p).length === 2 && p.seat === (leader + k) % g.players.length && cardOf(p.card));
const goodBreakdown = (b, round) => b && CATEGORIES.every(c => nat(b[c])) && same(b, breakdown(b, round));

export function checkState(g) {
  if (!g || typeof g !== 'object' || g.v !== 1) fail('not a version 1 game.');
  try { checkPlayers(g.players); } catch { fail('bad players.'); }
  if (!validDecks(g.decks) || !SCORE_DISPLAYS.includes(g.scoreDisplay) || !PHASES.includes(g.phase)) fail('bad config or phase.');
  if (!Number.isInteger(g.rng) || !Number.isInteger(g.round) || g.round < 1 || g.round > 6) fail('bad counters.');
  const n = g.players.length, cfg = describeConfig(n, g.decks), T = cfg.tricks, playing = g.phase === 'play';
  if (!isSeat(g, g.firstDealer) || g.dealer !== (g.firstDealer + g.round - 1) % n) fail('bad dealer.');
  if ((g.phase === 'over') !== (!playing && g.round === 6)) fail('the game ends exactly after round 6.');

  // The cut: row 0 is every seat, each later row the seats tied for highest, the last row has one highest: the first dealer.
  if (!Array.isArray(g.cut) || !g.cut.length) fail('no cut.');
  let left = [...Array(n).keys()];
  g.cut.forEach((row, i) => {
    if (!Array.isArray(row) || !same(row.map(c => c?.seat), left) || !row.every(c => RANKS.includes(c.rank) && SUITS.includes(c.suit))) fail('bad cut row.');
    const top = Math.max(...row.map(c => c.rank));
    left = row.filter(c => c.rank === top).map(c => c.seat);
    if ((left.length === 1) !== (i === g.cut.length - 1)) fail('the cut stops exactly when one seat is highest.');
  });
  // The highest cut leads the first trick; rooms started before 2026-11-24 had it deal instead.
  if (left[0] !== next(g, g.firstDealer) && left[0] !== g.firstDealer) fail('the cut does not name the first leader.');

  if (!Array.isArray(g.hands) || g.hands.length !== n || !g.hands.every(Array.isArray)) fail('bad hands.');
  if (!Array.isArray(g.kitty) || g.kitty.length !== cfg.kitty || !Array.isArray(g.tricks) || g.tricks.length > T) fail('bad kitty or tricks.');
  if (playing && (!g.trick || !Array.isArray(g.trick.plays))) fail('no current trick.');

  // Every card of every deck exactly once: in a hand, the kitty, the current trick or a completed trick.
  const want = new Set(shoe(g.decks));
  const claim = id => { if (!want.delete(id)) fail(`bad or repeated card ${id}.`); };
  g.hands.flat().forEach(claim);
  g.kitty.forEach(claim);
  g.tricks.forEach(t => { if (!Array.isArray(t?.plays)) fail('bad trick.'); t.plays.forEach(p => claim(p?.card)); });
  if (playing) g.trick.plays.forEach(p => claim(p?.card));
  if (want.size) fail(`${want.size} card(s) missing.`);

  g.tricks.forEach((t, i) => {
    const leader = i ? g.tricks[i - 1].winner : next(g, g.dealer);
    if (t.n !== i + 1 || t.leader !== leader || !isPlays(g, t.plays, leader) || t.plays.length !== n) fail(`bad trick ${i + 1}.`);
    if (t.winner !== trickWinner(t.plays)) fail(`trick ${i + 1} has the wrong winner.`);
    const kitty = i ? [] : g.kitty;
    if (!same(t.kitty, kitty) || !same(t.penalty, trickPenalty([...t.plays.map(p => p.card), ...kitty], g.round, t.n === T))) fail(`trick ${i + 1} penalty is wrong.`);
  });
  if (g.kittyTo !== (g.tricks.length && g.kitty.length ? g.tricks[0].winner : null)) fail('the kitty belongs to the first trick winner.');

  const all = [...g.tricks];
  if (playing) {
    const t = g.trick, leader = g.tricks.length ? g.tricks.at(-1).winner : next(g, g.dealer);
    if (t.n !== g.tricks.length + 1 || t.leader !== leader || !isPlays(g, t.plays, leader) || t.plays.length >= n) fail('bad current trick.');
    if (Object.keys(t).length !== 3 || g.turn !== (leader + t.plays.length) % n) fail('wrong turn.');
    all.push(t);
  } else if (g.trick !== null || g.turn !== null || g.tricks.length !== T) fail('a finished round has all its tricks and no turn.');

  // Equal deals: every hand is cardsEach minus the cards that seat has played this round.
  g.hands.forEach((h, s) => {
    const played = g.tricks.length + (playing && g.trick.plays.some(p => p.seat === s) ? 1 : 0);
    if (h.length !== T - played) fail(`seat ${s} holds the wrong number of cards.`);
  });
  // Follow suit: whoever played off-suit had none of the lead suit then, so cannot hold any now.
  for (const t of all) {
    const lead = t.plays[0] && suitOf(t.plays[0].card);
    for (const p of t.plays) if (suitOf(p.card) !== lead && g.hands[p.seat].some(c => suitOf(c) === lead)) fail(`seat ${p.seat} did not follow suit.`);
  }

  // Scores: one history entry per finished round, each a valid breakdown handing out exactly that round's points.
  if (!Array.isArray(g.history) || g.history.length !== (playing ? g.round - 1 : g.round)) fail('bad history length.');
  g.history.forEach((h, i) => {
    if (!h || h.round !== i + 1 || h.dealer !== (g.firstDealer + i) % n || !Array.isArray(h.breakdown) || h.breakdown.length !== n) fail('bad history entry.');
    if (!h.breakdown.every(b => goodBreakdown(b, i + 1))) fail('bad breakdown.');
    const sum = sumBreakdowns(h.breakdown, i + 1);
    if (!same([sum.tricks, sum.hearts, sum.queens, sum.kings, sum.last], [T, cfg.hearts, cfg.queens, cfg.kingsOfSpades, 1])) fail(`round ${i + 1} counts do not add up.`);
    if (sum.points.total !== expectedRound({ players: n, decks: g.decks }, i + 1)) fail(`round ${i + 1} points do not add up.`);
  });
  if (!playing) {
    const bd = g.players.map((_, s) => sumBreakdowns(g.tricks.filter(t => t.winner === s).map(t => t.penalty), g.round));
    if (!same(bd, g.history.at(-1).breakdown)) fail('the round score does not match its tricks.');
  }
  if (!Array.isArray(g.totals) || !same(g.totals, g.players.map((_, s) => g.history.reduce((sum, h) => sum + h.breakdown[s].points.total, 0)))) fail('totals do not match the history.');
  if (g.phase === 'over' && g.totals.reduce((a, b) => a + b, 0) !== expectedTotal({ players: n, decks: g.decks })) fail('the game total is wrong.');
}
