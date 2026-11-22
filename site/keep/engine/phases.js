// Legal actions per phase (system 1; SP 4). reduce() accepts only these, so a repeated
// click or a refresh cannot resolve anything twice. No PvP, trading or revival action exists (SP 9).
import { exits, key, squareKind } from './board.js';
import { contentIndex, theChamber } from '../content/schema.js';
import { responseOptions, combatActions } from './monsters.js';
import { usableHeld, ringFor } from './inventory.js';

// D39: a move out of the chamber also names the cell it leaves by (from: 'x,y'), as two sides share a direction.
const moves = (game, content, seat) => {
  const room = squareKind(content.board, game.heroes[seat].coord) === 'center';
  return exits(game, content, seat).filter(e => e.legal).map(e => ({ type: 'MOVE', seat, dir: e.dir, ...(room ? { from: key(e.from) } : {}) }));
};

// Spec v5 ring uses, each only at its own moment (owner: no universal ring use). Opening Ring: one per door or
// portcullis the hero could try now, in place of the door card or the Strength test.
const ringAt = (game, content, seat, timing) => (ringFor(game, content, seat, timing) ? [{ type: 'USE_RING', seat }] : []);
const ringPassages = (game, content, seat) => {
  if (!ringFor(game, content, seat, 'door-or-portcullis')) return [];
  const room = squareKind(content.board, game.heroes[seat].coord) === 'center';
  return exits(game, content, seat).filter(e => e.legal && (e.edge === 'door' || e.edge === 'gate')).map(e => ({ type: 'USE_RING', seat, dir: e.dir, ...(room ? { from: key(e.from) } : {}) }));
};

// Every set of count different D6 numbers, as sorted lists '1,2,3' (20 sets of three, 6 of one).
const numberSets = count => {
  const out = [];
  const pick = (from, chosen) => { if (chosen.length === count) return out.push(chosen.join(',')); for (let n = from; n <= 6; n++) pick(n + 1, [...chosen, n]); };
  pick(1, []);
  return out;
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
      // RB 9.1: stay and collect. D40 (spec v4): not while the dragon is awake (view.collectUnavailable says why).
      if (kind === 'center' && !game.dragon.awake) out.push({ type: 'COLLECT', seat });
      // D42 (spec v4, interpretation): across the well, the near side is reached only by jumping back (cards may go first).
      if (hero.roomState?.special === 'well' && hero.roomState.phase === 'CROSSED') out.push(...hero.treasury.map(card => ({ type: 'WELL_DISCARD', seat, card })), { type: 'WELL_JUMP', seat });
      // Spec v3 section 4: a Use action only where the item's own card data allows it now. D53: 'free' items too.
      out.push(...usableHeld(game, content, seat, 'turn-action').map(item => ({ type: 'USE_ITEM', seat, item })));
      // D53: a 'free' item (the flask) is never the turn's action, so it never stands in for a forced skip either.
      const free = usableHeld(game, content, seat, 'free').map(item => ({ type: 'USE_ITEM', seat, item }));
      // Spec v5: the Strength Ring skips this turn (turn-action); the Opening Ring at a door or portcullis.
      out.push(...ringAt(game, content, seat, 'turn-action'), ...ringPassages(game, content, seat));
      // D33 (interpretation): escaping straight from the start tower only if escapeWithoutExploring is on.
      if (hero.status === 'READY_IN_START_TOWER' && game.rules.escapeWithoutExploring) out.push({ type: 'TOWER_CHOICE', seat, choice: 'ESCAPE' });
      // Plan 13 #25 (interpretation): a hero who stayed in a tower after exploring may escape on any later turn.
      if (hero.status === 'IN_TOWER_NOT_ESCAPED') out.push({ type: 'TOWER_CHOICE', seat, choice: 'ESCAPE' });
      // D20: no voluntary pass; a forced skip exists only when no legal action does.
      return [...(out.length ? out : [{ type: 'FORCED_SKIP', seat }]), ...free];
    }
    case 'CHOOSE_EXIT': return [...moves(game, content, seat), ...ringPassages(game, content, seat), ...usableHeld(game, content, seat, 'free').map(item => ({ type: 'USE_ITEM', seat, item })), { type: 'STOP', seat }];
    case 'TURN_START': {
      if (p.kind === 'dark') return [{ type: 'ROLL_DARK_EXIT', seat }];
      const back = exits(game, content, seat).find(e => e.dir === hero.enteredFrom)?.legal;
      if (p.kind === 'well-edge') {
        return [...(back ? [{ type: 'WELL_RETURN', seat }] : []), ...hero.treasury.map(card => ({ type: 'WELL_DISCARD', seat, card })), { type: 'WELL_JUMP', seat }];
      }
      return [...(back ? [{ type: 'RUBBLE_RETURN', seat }] : []), { type: 'RUBBLE_FORCE', seat }];
    }
    case 'RESOLVE_CARD':
      // Spec v5: a trap card just drawn, with the Protection Ring unused: use it, or let the trap happen.
      if (p.kind === 'trap-ring') return [{ type: 'USE_RING', seat: p.seat }, { type: 'DECLINE_RING', seat: p.seat }];
      if (p.kind === 'name-numbers') return numberSets(p.count).map(numbers => ({ type: 'NAME_NUMBERS', seat: p.seat, numbers }));
      return p.options.map((_, option) => ({ type: 'CHOOSE', seat: p.seat, option }));
    case 'TOWER_CHOICE': {
      // Continue only through another legal tower passage (not back the way in).
      const onward = p.transit && exits(game, content, seat).some(e => e.legal && e.dir !== hero.enteredFrom);
      return ['ESCAPE', 'STAY', ...(onward ? ['CONTINUE'] : [])].map(choice => ({ type: 'TOWER_CHOICE', seat, choice }));
    }
    case 'CHOOSE_MONSTER_RESPONSE': return [
      ...responseOptions(game, content).map(choice => ({ type: 'RESPOND', seat, choice })),
      // Spec v3: a held special weapon card whose data allows it. D41 (spec v4): also in an ambush, after its damage.
      ...usableHeld(game, content, seat, 'encounter-special').map(item => ({ type: 'RESPOND', seat, choice: 'special', item })),
      // Spec v5: the Thunder Ring in a normal encounter only, never in an ambush.
      ...(game.encounter.ambush ? [] : ringAt(game, content, seat, 'encounter-choice')),
    ];
    case 'MONSTER_REACT': return [{ type: 'ANNOUNCE', seat: p.seat }];
    case 'COMBAT_SELECT': return combatActions(game);
    case 'FORCED_MOVE': return p.targets.map(to => ({ type: 'FORCED_MOVE', seat: p.seat, to }));
    // Spec v9: entering a rotating room with the Protection Ring unused, before it turns; the entering (or driven) hero's seat.
    case 'RESOLVE_TILE_ENTRY': return p?.kind === 'rotation-ring' ? [{ type: 'USE_RING', seat: p.seat }, { type: 'DECLINE_RING', seat: p.seat }] : [];
    default: return [];
  }
}

// Why the active hero is not offered SEARCH right now, or null when it is offered (owner question 2026-11-19).
// RB 7.1, SP 6 (R55-R57): search instead of moving, in a black or red room only, any number of times.
const TILE_CONDITION_WORDS = { dark: 'a dark room', 'well-edge': 'the well', rubble: 'the rubble' };
export function searchUnavailable(game, content) {
  if (game.status !== 'playing' || game.activeSeat === null) return null;
  const hero = game.heroes[game.activeSeat];
  const kind = squareKind(content.board, hero.coord);
  const mark = kind === 'maze' ? contentIndex(content).tiles.get(game.board.tiles[key(hero.coord)].defId).mark : null;
  if (kind !== 'maze' || !['black', 'red'].includes(mark)) {
    const where = kind === 'tower' ? 'a tower' : kind === 'center' ? theChamber(content) : mark === 'yellow' ? 'a yellow corridor' : mark === 'blue' ? 'a dark room' : 'a special room with no dot';
    return `not a room square (this is ${where}). Only black or red dot rooms can be searched.`;
  }
  if (game.phase === 'CHOOSE_ACTION') return null;
  if (game.phase === 'CHOOSE_EXIT') return 'already moved this turn. A search replaces moving, at the start of a turn.';
  if (game.phase === 'TURN_START' && game.pending && TILE_CONDITION_WORDS[game.pending.kind]) return `${TILE_CONDITION_WORDS[game.pending.kind]} takes this turn first`;
  return 'not now: something else is being resolved this turn';
}

export const sameAction = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
};
