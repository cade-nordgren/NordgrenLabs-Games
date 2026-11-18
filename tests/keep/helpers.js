// Shared test helpers. Fixture content is NON-AUTHENTIC TEST DATA.
import FX from '../../site/keep/content/fixtures/fixtures.js';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';

export { FX };
export const walled = { N: 'wall', E: 'wall', S: 'wall', W: 'wall' };

// Fixture content with some towers fully walled in (index -> walled).
export function withWalledTowers(indexes) {
  return { ...FX, board: { ...FX.board, towers: FX.board.towers.map((t, i) => (indexes.includes(i) ? { ...t, sides: walled } : t)) } };
}

export const run = (game, actions, content = FX) => actions.reduce((g, a) => reduce(g, a, content), game);

// Create a game and finish setup. firstRolls are the first-player D12s (scripted);
// heroes and rings take the first legal option; towers[seat] picks each seat's tower.
export function setup({ players = 1, content = FX, firstRolls, towers = [], script = [], tileOrder = null, rules = {}, seed = 7 } = {}) {
  const rolls = firstRolls || Array.from({ length: players }, (_, i) => 12 - i);
  let g = createGame({ players: Array.from({ length: players }, (_, i) => `P${i + 1}`), seed, content, rules, diceScript: [...rolls, ...script], tileOrder });
  g = reduce(g, { type: 'ROLL_FIRST_PLAYER' }, content);
  while (g.status === 'setup') {
    const acts = legalActions(g, content);
    const a = acts[0].type === 'PICK_TOWER' ? acts.find(x => x.tower === (towers[acts[0].seat] ?? 0)) : acts[0];
    g = reduce(g, a, content);
  }
  return g;
}

export const move = (g, dir) => ({ type: 'MOVE', seat: g.activeSeat, dir });

// Slot ids of a fixture tile definition, in order.
export function slotsOf(defId, content = FX) {
  const out = [];
  let n = 0;
  for (const d of content.tiles) for (let i = 0; i < d.copies; i++) { n++; if (d.id === defId) out.push(`TILE_${String(n).padStart(3, '0')}`); }
  return out;
}
