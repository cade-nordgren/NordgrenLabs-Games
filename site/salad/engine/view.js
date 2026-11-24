// What one seat may see. Never carries the PRNG, the shuffled order, the kitty before it is taken, or other hands.
import { isPenaltyCard, suitOf } from './cards.js';
import { ROUNDS, describeConfig, sumBreakdowns, standings } from './score.js';
import { legalCards } from './reducer.js';

// seat: the viewer, or null (any non-seat) for a spectator view with no private cards.
export function viewFor(g, seat = null) {
  const me = Number.isInteger(seat) && seat >= 0 && seat < g.players.length ? seat : null;
  // 'roundEnd' scoring keeps this round's penalties secret until the round is over.
  const hide = g.scoreDisplay === 'roundEnd' && g.phase === 'play';
  const won = s => g.tricks.filter(t => t.winner === s);
  const last = g.tricks.at(-1) ?? null;
  return structuredClone({
    v: g.v, phase: g.phase, round: g.round, roundName: ROUNDS[g.round - 1].name,
    decks: g.decks, scoreDisplay: g.scoreDisplay, config: describeConfig(g.players.length, g.decks),
    players: g.players, cut: g.cut, firstDealer: g.firstDealer, dealer: g.dealer, turn: g.turn,
    trick: g.trick && { ...g.trick, leadSuit: g.trick.plays.length ? suitOf(g.trick.plays[0].card) : null },
    tricksPlayed: g.tricks.length,
    last: last && { ...last, penalty: hide ? null : last.penalty },
    kitty: { count: g.kitty.length, to: g.kittyTo, cards: g.kittyTo === null ? null : g.kitty },
    seats: g.players.map((_, s) => ({
      hand: g.hands[s].length,
      tricks: won(s).length,
      // Spec 18: captured cards stay public even while the round's points are hidden.
      captured: [...won(s).flatMap(t => t.plays.map(p => p.card)), ...(g.kittyTo === s ? g.kitty : [])].filter(isPenaltyCard),
      roundScore: hide ? null : sumBreakdowns(won(s).map(t => t.penalty), g.round),
    })),
    totals: g.totals, history: g.history, standings: standings(g.totals),
    you: me === null ? null : { seat: me, hand: g.hands[me], legal: legalCards(g, me) },
  });
}
