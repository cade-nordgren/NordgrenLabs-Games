// Legal actions per phase (system 1; SP 4). reduce() accepts only these, so a repeated
// click or a refresh cannot resolve anything twice. No PvP, trading or revival action exists (SP 9).
import { exits, key, squareKind } from './board.js';
import { contentIndex } from '../content/schema.js';
import { responseOptions, combatActions } from './monsters.js';
import { usableHeld } from './inventory.js';

// D39: a move out of the chamber also names the cell it leaves by (from: 'x,y'), as two sides share a direction.
const moves = (game, content, seat) => {
  const room = squareKind(content.board, game.heroes[seat].coord) === 'center';
  return exits(game, content, seat).filter(e => e.legal).map(e => ({ type: 'MOVE', seat, dir: e.dir, ...(room ? { from: key(e.from) } : {}) }));
};

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
  if (game.status !== 'playing') return [];
  const seat = game.activeSeat;
  const hero = game.heroes[seat];
  const p = game.pending;
  switch (game.phase) {
    case 'CHOOSE_ACTION': {
      const out = moves(game, content, seat);
      const kind = squareKind(content.board, hero.coord);
      // RB 7.1, SP 6: search only in a black or red room.
      if (kind === 'maze' && ['black', 'red'].includes(contentIndex(content).tiles.get(game.board.tiles[key(hero.coord)].defId).mark)) out.push({ type: 'SEARCH', seat });
      if (kind === 'center') out.push({ type: 'COLLECT', seat }); // RB 9.1: stay and collect
      // Spec v3 section 4: a Use action only where the item's own card data allows it now.
      out.push(...usableHeld(game, content, seat, 'turn-action').map(item => ({ type: 'USE_ITEM', seat, item })));
      // D33 (interpretation): escaping straight from the start tower only if escapeWithoutExploring is on.
      if (hero.status === 'READY_IN_START_TOWER' && game.rules.escapeWithoutExploring) out.push({ type: 'TOWER_CHOICE', seat, choice: 'ESCAPE' });
      // Plan 13 #25 (interpretation): a hero who stayed in a tower after exploring may escape on any later turn.
      if (hero.status === 'IN_TOWER_NOT_ESCAPED') out.push({ type: 'TOWER_CHOICE', seat, choice: 'ESCAPE' });
      // D20: no voluntary pass; a forced skip exists only when no legal action does.
      return out.length ? out : [{ type: 'FORCED_SKIP', seat }];
    }
    case 'CHOOSE_EXIT': return [...moves(game, content, seat), { type: 'STOP', seat }];
    case 'TURN_START': {
      if (p.kind === 'dark') return [{ type: 'ROLL_DARK_EXIT', seat }];
      const back = exits(game, content, seat).find(e => e.dir === hero.enteredFrom)?.legal;
      if (p.kind === 'well-edge') {
        return [...(back ? [{ type: 'WELL_RETURN', seat }] : []), ...hero.treasury.map(card => ({ type: 'WELL_DISCARD', seat, card })), { type: 'WELL_JUMP', seat }];
      }
      return [...(back ? [{ type: 'RUBBLE_RETURN', seat }] : []), { type: 'RUBBLE_FORCE', seat }];
    }
    case 'RESOLVE_CARD': return p.options.map((_, option) => ({ type: 'CHOOSE', seat: p.seat, option }));
    case 'TOWER_CHOICE': {
      // Continue only through another legal tower passage (not back the way in).
      const onward = p.transit && exits(game, content, seat).some(e => e.legal && e.dir !== hero.enteredFrom);
      return ['ESCAPE', 'STAY', ...(onward ? ['CONTINUE'] : [])].map(choice => ({ type: 'TOWER_CHOICE', seat, choice }));
    }
    case 'CHOOSE_MONSTER_RESPONSE': return [
      ...responseOptions(game, content).map(choice => ({ type: 'RESPOND', seat, choice })),
      // Spec v3: a held special weapon card whose data allows it (not in an ambush, as the hero's own weapon).
      ...(game.encounter.ambush ? [] : usableHeld(game, content, seat, 'encounter-special').map(item => ({ type: 'RESPOND', seat, choice: 'special', item }))),
    ];
    case 'MONSTER_REACT': return [{ type: 'ANNOUNCE', seat: p.seat }];
    case 'COMBAT_SELECT': return combatActions(game);
    case 'FORCED_MOVE': return p.targets.map(to => ({ type: 'FORCED_MOVE', seat: p.seat, to }));
    default: return [];
  }
}

export const sameAction = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
};
