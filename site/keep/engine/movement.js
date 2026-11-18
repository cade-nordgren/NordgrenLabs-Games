// Movement, tile entry, dot types, special rooms, doors and gates (system 3; RB 5, RB 6, SP 4, SP 5).
// Dot and special behaviour come from engine rules keyed on the tile's mark and special fields.
import { roll, testStat, logEvent } from './dice.js';
import { key, squareKind, exits, edgeKey } from './board.js';
import { SIDES, OPPOSITE, rotationFor, sideOnBoard } from './tiles.js';
import { contentIndex } from '../content/schema.js';
import { killHero, setCondition, clearCondition, statOf, TILE_CONDITIONS, hasCondition } from './heroes.js';
import { drawAndResolve, run } from './effects.js';
import { collect } from './treasury.js';

const tileDefAt = (g, content, c) => contentIndex(content).tiles.get(g.board.tiles[key(c)].defId);

// Turn-scoped state: set at TURN_START, read by exits() and the resolution loop.
export function freshTurn(seat) {
  return { seat, stage: 'start', mayContinue: false, endAfter: false, endNow: false, openedDoor: null, triedDoors: [], secret: null };
}

// SP 4 step 2, RB 5 step 1: carry-over effects resolve before a fresh action. Card conditions with
// turn-start effects run first; then a tile condition (dark, well edge, rubble) takes the turn.
export function beginTurn(g, content) {
  g.turn = freshTurn(g.activeSeat);
  g.stack = [];
  g.pending = null;
  const hero = g.heroes[g.activeSeat];
  for (const c of [...hero.conditions]) {
    if (!c.onTurnStart?.length) continue;
    g.stack.push({ effects: c.onTurnStart, i: 0 });
    if (c.turns !== null && --c.turns <= 0) clearCondition(g, hero.seat, c.id);
  }
  run(g, content);
}

export function beginCarryOver(g, content) {
  const hero = g.heroes[g.activeSeat];
  const cond = hero.conditions.find(c => TILE_CONDITIONS.includes(c.id));
  if (cond) {
    g.phase = 'TURN_START';
    g.pending = { kind: cond.id, seat: hero.seat };
  } else g.phase = 'CHOOSE_ACTION';
}

// Try to leave the active hero's square through side dir. noDetour: a compulsory move (dark-room
// exit, well or rubble retreat), where a closed door ends the turn instead of offering another exit.
export function attemptMove(g, content, dir, { noDetour = false } = {}) {
  const seat = g.activeSeat;
  const hero = g.heroes[seat];
  const ex = exits(g, content, seat).find(e => e.dir === dir);
  g.turn.mayContinue = false;
  if (ex.edge === 'door') {
    // RB 6.6, SP 5: draw the top door card before crossing.
    g.phase = 'RESOLVE_CARD';
    const drawn = drawAndResolve(g, content, 'DOOR', 'door', { door: { dir, edge: edgeKey(hero.coord, dir), noDetour } });
    if (!drawn) g.turn.endAfter = true; // shortcut: empty door deck counts as a door that stays shut
    return;
  }
  if (ex.edge === 'gate') {
    // RB 6.7, SP 5: Strength test; failure ends the turn; success crosses and the gate drops again.
    g.phase = 'REQUIRED_STAT_TEST';
    const { pass } = testStat(g, 'STR', statOf(content, hero, 'STR'), 'portcullis');
    if (!pass) { g.turn.endAfter = true; return; }
    return enterTile(g, content, seat, ex.to, { dir, via: 'gate' });
  }
  enterTile(g, content, seat, ex.to, { dir, via: ex.edge === 'secret' ? 'secret' : 'move' });
}

// RB 6.4, SP 5: 90 degrees clockwise, connectivity changes for everyone.
export function rotateTile(g, c) {
  const inst = g.board.tiles[key(c)];
  if (!inst) return;
  inst.rotation = (inst.rotation + 90) % 360;
  logEvent(g, { kind: 'rotate', at: key(c), rotation: inst.rotation });
}

// Enter square `to` through side dir of the hero's current square.
// via: move | door | gate | secret | card | flight | forced.
// drawRoom false: no room card (flight D16, forced move after the wake D19). applyTile false: no tile effects.
export function enterTile(g, content, seat, to, { dir, via, drawRoom = true, applyTile = true }) {
  const hero = g.heroes[seat];
  const own = seat === g.activeSeat && via !== 'forced'; // effects on the active hero's own turn
  const retreat = via === 'flight' || via === 'forced';
  const kind = squareKind(content.board, to);
  let first = false;
  if (kind === 'maze' && !g.board.tiles[key(to)]) {
    g.phase = 'REVEAL_TILE';
    const slotId = g.board.tileBag.shift();
    const def = contentIndex(content).tileSlots.get(slotId);
    logEvent(g, { kind: 'draw', deck: 'TILE', value: slotId, defId: def.id });
    const entrySide = OPPOSITE[dir]; // RB 5 step 3: the entry dot faces the side the hero comes from
    g.board.tiles[key(to)] = { slotId, defId: def.id, coord: to, rotation: rotationFor(def.entrySide, entrySide), entrySide, revealedRound: g.round };
    logEvent(g, { kind: 'reveal', at: key(to), defId: def.id, rotation: g.board.tiles[key(to)].rotation });
    first = true;
  }
  if (kind === 'center' && !g.board.chamberPlaced) {
    g.board.chamberPlaced = true; // RB 9.1, SP 8: chamber tile placed on first entry to either square
    logEvent(g, { kind: 'place-chamber' });
  }
  hero.conditions = hero.conditions.filter(c => !TILE_CONDITIONS.includes(c.id)); // leaving the old room
  hero.prevCoord = hero.coord;
  hero.coord = to;
  hero.enteredFrom = OPPOSITE[dir];
  hero.enteredVia = via;
  if (own) g.turn.secret = null; // RB 6.8: a temporary passage is gone once used (or the hero moved on)
  logEvent(g, { kind: 'move', seat, dir, to: key(to), via });
  if (kind === 'tower') {
    // D23: a hero starts in a tower and must leave it first, so entering any tower is escape.
    hero.status = 'escaped';
    logEvent(g, { kind: 'escape', seat });
    if (own || via === 'flight') g.turn.endNow = true;
    return;
  }
  // D31: no room card in the chamber. D18: collect on the entry turn; a forced move never targets it.
  if (kind === 'center') return collect(g, content, seat);

  g.phase = 'RESOLVE_TILE_ENTRY';
  const def = tileDefAt(g, content, to);
  const effects = via === 'forced' ? applyTile && g.rules.forcedMoveTileEffects : applyTile;
  if (effects) {
    // Order for tiles that combine a special and a mark (D29, data decides): rotation, gate behind,
    // well test, turn-ending conditions, then the room card.
    if (def.special === 'rotating') rotateTile(g, to); // D10: first reveal orients by the dot, then rotates
    if (def.mark === 'red') {
      // RB 6.1, RB 6.7: a portcullis falls behind the entrant.
      g.board.edges[edgeKey(to, hero.enteredFrom)] = 'gate';
      logEvent(g, { kind: 'gate-falls', edge: edgeKey(to, hero.enteredFrom) });
    }
    if (def.special === 'well') {
      // RB 6.3, SP 5: Agility test on entry; failure is death, success clings to the near edge.
      const { pass } = testStat(g, 'AGI', statOf(content, hero, 'AGI'), 'well entry');
      if (!pass) return killHero(g, content, seat, 'fell into the well');
      setCondition(g, seat, { id: 'well-edge', turns: null });
    }
    if (def.special === 'rubble') setCondition(g, seat, { id: 'rubble', turns: null });
    // RB 6.2, D06: dark on first discovery; a retreat keeps the effect; ordinary re-entry per darkRoomOnReentry.
    if (def.mark === 'blue' && (first || retreat || g.rules.darkRoomOnReentry)) setCondition(g, seat, { id: 'dark', turns: null });
    if (own && ['well', 'rubble'].includes(def.special)) g.turn.endAfter = true;
    if (own && def.mark === 'blue' && hasCondition(hero, 'dark')) g.turn.endAfter = true;
  }
  // RB 5 step 4, SP 6: every black or red entry draws one room card, revisits included.
  if ((def.mark === 'black' || def.mark === 'red') && drawRoom && hero.status === 'inside') {
    g.phase = 'DRAW_ROOM';
    drawAndResolve(g, content, 'ROOM', 'room entry');
  }
  // RB 6.1, SP 5: a yellow corridor lets the hero keep moving this turn.
  if (def.mark === 'yellow' && own && !retreat && effects) g.turn.mayContinue = true;
}

// RB 6.2, SP 5: compulsory dark-room exit from a D6. exitSides: the tile's non-wall board sides.
export function darkExitFor(exitSides, dot, d6) {
  if (exitSides.length === 2) return d6 <= 3 ? dot : exitSides.find(s => s !== dot);
  const i = SIDES.indexOf(dot);
  const cw = [1, 2, 3].map(k => SIDES[(i + k) % 4]).find(s => exitSides.includes(s));
  const ccw = [1, 2, 3].map(k => SIDES[(i - k + 4) % 4]).find(s => exitSides.includes(s));
  return d6 <= 2 ? dot : d6 <= 4 ? cw : ccw;
}

export function rollDarkExit(g, content) {
  const hero = g.heroes[g.activeSeat];
  const inst = g.board.tiles[key(hero.coord)];
  const def = tileDefAt(g, content, hero.coord);
  const exitSides = SIDES.filter(s => sideOnBoard(def, inst.rotation, s) !== 'wall');
  const dot = SIDES[(SIDES.indexOf(def.entrySide) + inst.rotation / 90) % 4];
  const d6 = roll(g, 'D6', 'dark room exit');
  const dir = darkExitFor(exitSides, dot, d6);
  logEvent(g, { kind: 'dark-exit', roll: d6, dir, exits: exitSides.length });
  const ex = exits(g, content, hero.seat).find(e => e.dir === dir);
  if (!ex || !ex.legal) {
    // D07 (house rule, provisional): a blocked rolled exit keeps the hero here to roll again next turn.
    logEvent(g, { kind: 'dark-blocked', dir, reason: ex ? ex.reason : 'off-board' });
    g.turn.endAfter = true;
    return;
  }
  attemptMove(g, content, dir, { noDetour: true });
}

// Legal sides for MOVE_HERO adjacent-choice.
export const moveChoices = (g, content, seat) => exits(g, content, seat).filter(e => e.legal).map(e => e.dir);

// RB 8.6, SP 7: flight goes back to the previous tile only, and only if the way back still exists:
// not through a used secret door (RB 8.6), not through the gate that fell behind (D15), not through
// a door unless it was opened this same turn (RB 6.6 exception).
export function canFlee(g, content, seat) {
  const hero = g.heroes[seat];
  if (!hero.prevCoord || hero.enteredVia === 'secret') return false;
  const ex = exits(g, content, seat).find(e => e.to.x === hero.prevCoord.x && e.to.y === hero.prevCoord.y);
  if (!ex || ex.reason === 'occupied') return false;
  if (ex.edge === 'open') return true;
  return ex.edge === 'door' && g.turn.openedDoor === edgeKey(hero.coord, ex.dir);
}

// D16 (explicit rule): no room card on the return, tile effects still apply. The turn ends.
export function flee(g, content, seat) {
  const hero = g.heroes[seat];
  const ex = exits(g, content, seat).find(e => e.to.x === hero.prevCoord.x && e.to.y === hero.prevCoord.y);
  logEvent(g, { kind: 'flight', seat, to: key(hero.prevCoord) });
  enterTile(g, content, seat, ex.to, { dir: ex.dir, via: 'flight', drawRoom: false, applyTile: true });
  g.turn.endNow = true;
}
