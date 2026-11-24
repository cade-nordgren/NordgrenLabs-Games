// What one seat may see. Never carries the deck order, the PRNG, face-down identities, or other players' hand cards.
import { required, streak } from './cards.js';
import { source, playable, canPickUp, mustPickUp, livePile, opening } from './reducer.js';

// seat: the viewer, or null for the one-phone handoff screen (no private hand at all).
export function viewFor(g, seat = null) {
  const me = Number.isInteger(seat) && seat >= 0 && seat < g.players.length ? seat : null;
  const p = me === null ? null : g.players[me];
  // The draw pile on show: the viewer's own (the player to move on the handoff screen), or the shared deck in older games.
  const pile = g.players[me ?? g.turn].draw ?? g.deck, live = livePile(g);
  return structuredClone({
    v: g.v, phase: g.phase, decks: g.decks, first: g.first, firstWhy: g.firstWhy ?? null,
    turn: g.turn, pending: g.pending, winner: g.winner, turns: g.turns,
    deck: pile.length, nextDeck: pile[0]?.deck ?? null, removed: g.removed.length,
    pile: g.pile, kitty: g.kitty ?? 0, required: required(live), streak: streak(live), opening: opening(g),
    last: g.last,
    players: g.players.map((q, i) => ({
      hand: q.hand.length,
      draw: q.draw ? q.draw.length : null, // null: an older game with one shared deck
      // Face-up choices stay private until everyone has confirmed.
      up: g.phase !== 'choose' || i === me ? q.up : null,
      down: q.down.map(Boolean),
      downDeck: q.down.map(c => c ? c.deck : null), // which deck each face-down card came from: its back shows it
      left: q.hand.length + q.up.filter(Boolean).length + q.down.filter(Boolean).length + (q.draw?.length ?? 0),
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
