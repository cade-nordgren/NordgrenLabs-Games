// Legal actions per phase (system 1; SP 4). reduce() accepts only these, so a repeated
// click or a refresh cannot resolve anything twice.
import { exits } from './board.js';

export function legalActions(game, content) {
  if (game.status === 'setup') {
    const { step, order, index } = game.setup;
    const seat = order[index];
    if (step === 'first-player') return [{ type: 'ROLL_FIRST_PLAYER' }];
    if (step === 'heroes') {
      const taken = new Set(game.seats.map(s => s.heroId));
      return content.heroes.filter(h => !taken.has(h.id)).map(h => ({ type: 'PICK_HERO', seat, heroId: h.id }));
    }
    if (step === 'rings') {
      const taken = new Set(game.seats.map(s => s.ringId));
      return content.rings.filter(r => !taken.has(r.id)).map(r => ({ type: 'PICK_RING', seat, ringId: r.id }));
    }
    if (step === 'towers') return content.board.towers.map((_, tower) => ({ type: 'PICK_TOWER', seat, tower }));
  }
  if (game.status === 'playing' && game.phase === 'CHOOSE_ACTION') {
    const seat = game.activeSeat;
    const moves = exits(game, content, seat).filter(e => e.legal).map(e => ({ type: 'MOVE', seat, dir: e.dir }));
    // M2 adds room search and chamber collect here. D20: no voluntary pass; a forced
    // skip exists only when no legal action does.
    return moves.length ? moves : [{ type: 'FORCED_SKIP', seat }];
  }
  return [];
}

export const sameAction = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
};
