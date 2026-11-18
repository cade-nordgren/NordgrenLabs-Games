// Sun clock, turn order, escape and winning (system 9; RB 1, RB 5, RB 12, SP 4, SP 10).
import { logEvent } from './dice.js';
import { heroGold } from './heroes.js';
import { beginTurn } from './movement.js';

export const SUNSET = 27; // sun 1..26 are playable rounds: 26 turns per hero (RB 1, SP 4)

const inside = h => h && h.status === 'inside';

export function startTurn(game, seat, content) {
  game.activeSeat = seat;
  game.phase = 'TURN_START';
  logEvent(game, { kind: 'turn', round: game.round, sun: game.sun, seat });
  beginTurn(game, content); // carry-over effects first (RB 5 step 1, SP 4 step 2)
}

// Next living, unescaped hero clockwise. Passing the first seat starts a new round:
// the sun steps once per round whoever is first player (D02, D30), and reaching
// sunset ends the game before anyone acts.
export function endTurn(game, content) {
  game.phase = 'TURN_END';
  if (!game.heroes.some(inside)) return finish(game, content, 'GAME_OVER');
  const n = game.seats.length;
  const pos = (game.activeSeat - game.firstSeat + n) % n;
  for (let k = pos + 1; k < n; k++) {
    const seat = (game.firstSeat + k) % n;
    if (inside(game.heroes[seat])) return startTurn(game, seat, content);
  }
  game.round += 1;
  game.sun += 1;
  logEvent(game, { kind: 'sun', sun: game.sun });
  if (game.sun >= SUNSET) {
    for (const h of game.heroes) if (inside(h)) { h.status = 'lost-at-sunset'; logEvent(game, { kind: 'lost-at-sunset', seat: h.seat }); }
    return finish(game, content, 'SUNSET_GAME_OVER');
  }
  for (let k = 0; k < n; k++) {
    const seat = (game.firstSeat + k) % n;
    if (inside(game.heroes[seat])) return startTurn(game, seat, content);
  }
}

// RB 1, SP 10: only escapees are compared, highest gold wins, none means the castle wins.
// D01 (house rule): equal top gold gives co-winners.
export function ranking(entries) {
  const escaped = entries.filter(e => e.status === 'escaped').sort((a, b) => b.gold - a.gold || a.seat - b.seat);
  const top = escaped.length ? escaped[0].gold : null;
  const winners = escaped.filter(e => e.gold === top).map(e => e.seat);
  return { castleWins: !escaped.length, winners, shared: winners.length > 1, escaped, others: entries.filter(e => e.status !== 'escaped') };
}

function finish(game, content, phase) {
  game.phase = phase;
  game.stack = [];
  game.pending = null;
  game.status = 'over';
  game.activeSeat = null;
  game.result = ranking(game.heroes.map(h => ({ seat: h.seat, heroId: h.heroId, status: h.status, gold: heroGold(h, content) })));
  logEvent(game, { kind: 'game-over', phase, winners: game.result.winners });
}

export { heroGold };
