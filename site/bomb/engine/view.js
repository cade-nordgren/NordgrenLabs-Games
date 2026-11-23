// What one seat may see. Never carries the deck order, the PRNG, face-down identities, or other players' hand cards.
import { required, streak } from './cards.js';
import { source, playable, canPickUp, mustPickUp } from './reducer.js';

// seat: the viewer, or null for the one-phone handoff screen (no private hand at all).
export function viewFor(g, seat = null) {
  const me = Number.isInteger(seat) && seat >= 0 && seat < g.players.length ? seat : null;
  const p = me === null ? null : g.players[me];
  return structuredClone({
    v: g.v, phase: g.phase, decks: g.decks, first: g.first, draws: g.draws,
    turn: g.turn, pending: g.pending, winner: g.winner, turns: g.turns,
    deck: g.deck.length, removed: g.removed.length,
    pile: g.pile, required: required(g.pile), streak: streak(g.pile),
    last: g.last,
    players: g.players.map((q, i) => ({
      hand: q.hand.length,
      // Face-up choices stay private until everyone has confirmed.
      up: g.phase !== 'choose' || i === me ? q.up : null,
      down: q.down.map(Boolean),
      left: q.hand.length + q.up.filter(Boolean).length + q.down.filter(Boolean).length,
      ready: q.ready, bombs: q.bombs, pickups: q.pickups,
    })),
    you: p && {
      seat: me,
      hand: p.hand,
      source: g.phase === 'play' ? source(p) : null,
      playable: playable(g, me),
      blind: g.phase === 'play' && !g.pending && g.turn === me && source(p) === 'down'
        ? p.down.flatMap((c, i) => c ? [i] : []) : [],
      canPickUp: canPickUp(g, me),
      mustPickUp: mustPickUp(g, me),
      canArrange: g.phase === 'choose' && !p.ready,
    },
  });
}
