// Movement, tile entry, dot types, special rooms, doors and gates (system 3; RB 5, RB 6, SP 4, SP 5).
// Dot and special behaviour come from engine rules keyed on the tile's mark and special fields.
import { roll, testStat, testPreview, logEvent } from './dice.js';
import { key, squareKind, exits, exitFor, edgeKey } from './board.js';
import { SIDES, OPPOSITE, rotationFor, sideOnBoard } from './tiles.js';
import { contentIndex, chamberCards } from '../content/schema.js';
import { killHero, setCondition, clearCondition, statOf, TILE_CONDITIONS, hasCondition, EXPLORING, IN_TOWER } from './heroes.js';
import { drawAndResolve, run } from './effects.js';
import { cardDef } from './decks.js';
import { collect } from './treasury.js';
import { ringFor, consumeRing } from './inventory.js';

const tileDefAt = (g, content, c) => contentIndex(content).tiles.get(g.board.tiles[key(c)].defId);

// Every way a hero may keep moving after a move this turn, with the rule that allows it. allowContinue is the
// only place that sets turn.mayContinue, and it logs a 'may-continue' entry saying why (for the UI and tests).
export const CONTINUE_REASONS = {
  'yellow-corridor': 'RB 6.1, SP 5 (R34): a yellow corridor lets the hero keep moving',
  'door-stayed-closed': 'RB 6.6, SP 5 (R48): the door stayed shut, another free passage may be used this turn',
  'secret-passage': 'RB 7.1, SP 6 (R56, D11): a secret passage was found, the hero may move through it this turn',
  card: "the drawn card's own data says continue (turnDisposition 'continue' or CONTINUE_MOVEMENT)",
  'tower-transit': 'spec v2 #2 (R111): continuing through the tower to another passage',
  'rubble-forced': 'RB 6.5, SP 5: the rubble was forced, the hero may leave through any exit this turn',
};
export function allowContinue(g, reason, extra = {}) {
  g.turn.mayContinue = true;
  logEvent(g, { kind: 'may-continue', seat: g.activeSeat, reason, rule: CONTINUE_REASONS[reason], ...extra });
}

// Turn-scoped state: set at TURN_START, read by exits() and the resolution loop.
export function freshTurn(seat) {
  return { seat, stage: 'start', mayContinue: false, endAfter: false, endNow: false, openedDoor: null, triedDoors: [], secret: null, transitFrom: null, resume: null };
}

// SP 4 step 2, RB 5 step 1: carry-over effects resolve before a fresh action. Card conditions with
// turn-start effects run first; then a tile condition (dark, well edge, rubble) takes the turn.
export function beginTurn(g, content) {
  g.turn = freshTurn(g.activeSeat);
  g.stack = [];
  g.pending = null;
  const hero = g.heroes[g.activeSeat];
  // Skipped turns (D54) are pushed last so they run first: a skipped turn does nothing else.
  for (const c of [...hero.conditions].sort((a, b) => (a.id === 'skip-turns') - (b.id === 'skip-turns'))) {
    if (!c.onTurnStart?.length) continue;
    // D55: a kept card whose data frees the hero from this effect (the rope and the trapdoor) does so, untested, unspent.
    const item = hero.held.find(inst => cardDef(content, inst).frees?.includes(c.id));
    if (item) { clearCondition(g, hero.seat, c.id); logEvent(g, { kind: 'freed', seat: hero.seat, id: c.id, item }); continue; }
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
// exit, well or rubble retreat), where a closed door ends the turn instead of offering another exit
// (plan 13 #14, D07 extended; compulsory moves only: on a voluntary move a closed door leaves the
// other free passages open this turn, RB 6.6).
// from: 'x,y' of the chamber cell to leave by (D39); ordinary squares have one exit per side.
export function attemptMove(g, content, dir, { noDetour = false, from = null } = {}) {
  const seat = g.activeSeat;
  const hero = g.heroes[seat];
  const ex = exitFor(g, content, seat, dir, from);
  hero.coord = { ...ex.from }; // D39: in the chamber, step to the half the exit leaves by (one room, no move)
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
    logEvent(g, { kind: 'gate', edge: edgeKey(hero.coord, dir), pass });
    if (!pass) { g.turn.endAfter = true; return; }
    return enterTile(g, content, seat, ex.to, { dir, via: 'gate' });
  }
  enterTile(g, content, seat, ex.to, { dir, via: ex.edge === 'secret' ? 'secret' : 'move' });
}

// Spec v5 Opening Ring (interpretation): instead of the door card or the Strength test, the door opens or the
// portcullis lifts, and the hero goes through exactly as after an opened door (it relocks behind them, same-turn
// flight back excepted, RB 6.6) or a lifted portcullis (it stays down, RB 6.7).
export function passBarrier(g, content, dir, from = null) {
  const seat = g.activeSeat;
  const hero = g.heroes[seat];
  const ex = exitFor(g, content, seat, dir, from);
  if (ex.edge !== 'door' && ex.edge !== 'gate') return;
  hero.coord = { ...ex.from };
  g.turn.mayContinue = false;
  const edge = edgeKey(hero.coord, dir);
  if (ex.edge === 'door') {
    logEvent(g, { kind: 'door', result: 'opens', edge, ring: true });
    g.turn.openedDoor = edge;
    return enterTile(g, content, seat, ex.to, { dir, via: 'door' });
  }
  logEvent(g, { kind: 'gate', edge, pass: true, ring: true });
  enterTile(g, content, seat, ex.to, { dir, via: 'gate' });
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
  hero.roomState = null;
  const from = hero.coord;
  hero.prevCoord = hero.coord;
  hero.coord = to;
  hero.enteredFrom = OPPOSITE[dir];
  hero.enteredVia = via;
  if (own) { g.turn.secret = null; g.turn.transitFrom = null; } // RB 6.8: a temporary passage is gone once used
  const mark = kind === 'maze' ? tileDefAt(g, content, to).mark : kind;
  logEvent(g, { kind: 'move', seat, dir, from: key(from), to: key(to), via, mark });
  if (kind === 'tower') {
    // Spec v2 and the owner's tower ruling (interpretation; replaces D23): towers are shared rooms. Being
    // in one is not escaping; entering one from the castle offers Escape, Stay or Continue (transit).
    hero.status = IN_TOWER;
    if (seat === g.activeSeat) {
      g.phase = 'TOWER_CHOICE';
      // A flight ends the turn: no transit. A card's move (MOVE_HERO) follows that card's turnDisposition, so no
      // transit either (owner play-test 2026-11-19: a room card never grants more movement unless it says so).
      g.pending = { kind: 'tower', seat, transit: via !== 'flight' && via !== 'card' };
    }
    return;
  }
  hero.status = EXPLORING;
  // D31: no room card in the chamber. D18: collect on the entry turn; a forced move never targets it.
  if (kind === 'center') return collect(g, content, seat);

  g.phase = 'RESOLVE_TILE_ENTRY';
  const def = tileDefAt(g, content, to);
  const effects = via === 'forced' ? applyTile && g.rules.forcedMoveTileEffects : applyTile;
  const ctx = { first, via, dir, drawRoom, effects };
  // Order for tiles that combine a special and a mark (D29, data decides): rotation, gate behind,
  // well test, turn-ending conditions, then the room card.
  if (effects && def.special === 'rotating') {
    // Spec v9 (owner-approved interpretation, D67): with the Protection Ring unused, the hero first chooses whether the
    // room turns on this entry; the room stays placed and unturned until then (answerRotationRing).
    if (rotationRingOffered(g, content, seat, first)) { g.pending = { kind: 'rotation-ring', seat, at: key(to), ...ctx }; return; }
    rotateTile(g, to); // D10: first reveal orients by the dot, then rotates
  }
  finishEntry(g, content, seat, ctx);
}

// Spec v9: rotatingRoomRing 'every-entry' (default: reveal, re-entry, flight, forced move), 'first-reveal' or 'never'.
const rotationRingOffered = (g, content, seat, first) =>
  (g.rules.rotatingRoomRing === 'every-entry' || (g.rules.rotatingRoomRing === 'first-reveal' && first)) && !!ringFor(g, content, seat, 'trap-drawn');

// Spec v9: Use the ring: consumed as on a trap card, the room does not turn this entry. Keep it: the normal quarter
// turn now. Either way the entry then resolves exactly as it would have (no extra turn or move); the caller runs on.
export function answerRotationRing(g, content, use) {
  const p = g.pending;
  g.pending = null;
  if (use) { consumeRing(g, content, p.seat); logEvent(g, { kind: 'rotation-ignored', seat: p.seat, at: p.at }); }
  else { logEvent(g, { kind: 'ring-kept', seat: p.seat }); rotateTile(g, g.heroes[p.seat].coord); }
  finishEntry(g, content, p.seat, p);
}

// The rest of a tile entry, after the rotation.
function finishEntry(g, content, seat, { first, via, dir, drawRoom, effects }) {
  const hero = g.heroes[seat];
  const to = hero.coord;
  const own = seat === g.activeSeat && via !== 'forced';
  const retreat = via === 'flight' || via === 'forced';
  const def = tileDefAt(g, content, to);
  if (effects) {
    if (def.mark === 'red') {
      // RB 6.1, RB 6.7: a portcullis falls behind the entrant.
      g.board.edges[edgeKey(to, hero.enteredFrom)] = 'gate';
      logEvent(g, { kind: 'gate-falls', edge: edgeKey(to, hero.enteredFrom) });
    }
    if (def.special === 'well') {
      // RB 6.3, SP 5: Agility test on entry; failure is death, success clings to the near edge.
      const { pass } = testStat(g, 'AGI', statOf(content, hero, 'AGI'), 'well entry', 0, seat);

      if (!pass) return killHero(g, content, seat, 'fell into the well');
      setCondition(g, seat, { id: 'well-edge', turns: null });
      hero.roomState = { special: 'well', entryEdge: hero.enteredFrom, phase: 'AT_NEAR_EDGE' }; // spec v2
    }
    if (def.special === 'rubble') {
      setCondition(g, seat, { id: 'rubble', turns: null });
      hero.roomState = { special: 'rubble', entryEdge: hero.enteredFrom, arrivalDir: dir }; // spec v2
    }
    // RB 6.2, D06 (interpretation): dark on the initial reveal and on a retreat back into it (special rooms
    // apply when fleeing); ordinary re-entry only under darkRoomPolicy EVERY_ENTRY.
    if (def.mark === 'blue' && (first || retreat || g.rules.darkRoomPolicy === 'EVERY_ENTRY')) setCondition(g, seat, { id: 'dark', turns: null });
    if (own && ['well', 'rubble'].includes(def.special)) g.turn.endAfter = true;
    if (own && def.mark === 'blue' && hasCondition(hero, 'dark')) g.turn.endAfter = true;
  }
  // RB 5 step 4, SP 6: every black or red entry draws one room card, revisits included.
  if ((def.mark === 'black' || def.mark === 'red') && drawRoom && hero.status === EXPLORING) {
    g.phase = 'DRAW_ROOM';
    drawAndResolve(g, content, 'ROOM', 'room entry');
  }
  // RB 6.1, SP 5: a yellow corridor lets the hero keep moving this turn, on the hero's own move only. A move a
  // card made (MOVE_HERO) follows that card's turnDisposition instead: no rule lets a card push into a corridor
  // grant more movement (owner play-test, 2026-11-19).
  if (def.mark === 'yellow' && own && !retreat && via !== 'card' && effects) allowContinue(g, 'yellow-corridor');
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
    // D07 (house rule; OWNER_APPROVED_INTERPRETATION, spec v11): a blocked rolled exit keeps the hero here to roll again next turn.
    logEvent(g, { kind: 'dark-blocked', dir, reason: ex ? ex.reason : 'off-board' });
    g.turn.endAfter = true;
    return;
  }
  attemptMove(g, content, dir, { noDetour: true });
}

// RB 6.3, spec v3 section 4: +1 on the jump per treasure-chamber card carried.
export const wellJumpModifiers = (hero, content) => [{ source: `${chamberCards(content)} carried`, value: hero.treasury.length }];

// Spec v3: the attribute tests an action may roll, for a confirmation before it (view.pendingTests).
// Only what the engine knows in advance: a portcullis on the edge (RB 6.7: only a fallen or printed one,
// never because the room ahead is red), a revealed well being entered, the well jump, forcing rubble.
// A card's CHECK_STAT is known only once the card is drawn; its result is the same 'test' log entry.
export function actionTests(g, content, action) {
  const hero = g.heroes[action.seat];
  const stat = s => statOf(content, hero, s);
  const dir = action.type === 'MOVE' ? action.dir : ['WELL_RETURN', 'RUBBLE_RETURN'].includes(action.type) ? hero.enteredFrom : null;
  if (dir) {
    const ex = exitFor(g, content, action.seat, dir, action.type === 'MOVE' ? action.from : null);
    const out = [];
    if (ex.edge === 'gate') out.push(testPreview('STR', stat('STR'), 'portcullis'));
    const inst = squareKind(content.board, ex.to) === 'maze' && g.board.tiles[key(ex.to)];
    if (inst && contentIndex(content).tiles.get(inst.defId).special === 'well') out.push(testPreview('AGI', stat('AGI'), 'well entry'));
    return out;
  }
  if (action.type === 'WELL_JUMP') return [testPreview('AGI', stat('AGI'), 'well jump', wellJumpModifiers(hero, content))];
  if (action.type === 'RUBBLE_FORCE') return [testPreview('AGI', stat('AGI'), 'force rubble')];
  return [];
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
