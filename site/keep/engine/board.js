// Board, connectivity and occupancy (system 2; RB 5, RB 6.1, SP 3, SP 5).
// The BoardDefinition is the authority for movement geometry: grid size (anything outside it is off the
// board), tower openings, the chamber (two cells that are one room, open on every outer side, D39), printed
// walls and fixed edges. Correcting the map is a data edit only.
import { SIDES, OPPOSITE, sideOnBoard } from './tiles.js';
import { contentIndex } from '../content/schema.js';
import { isActive } from './heroes.js';

const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const key = c => `${c.x},${c.y}`;
const same = (a, b) => a && b && a.x === b.x && a.y === b.y;

// Orthogonal only: anything other than N/E/S/W (a diagonal) has no neighbour.
export function neighbour(c, dir) {
  const d = DELTA[dir];
  return d ? { x: c.x + d[0], y: c.y + d[1] } : null;
}

export function squareKind(boardDef, c) {
  if (c.x < 0 || c.y < 0 || c.x >= boardDef.width || c.y >= boardDef.height) return 'off';
  if (boardDef.towers.some(t => same(t, c))) return 'tower';
  if (boardDef.center.some(t => same(t, c))) return 'center';
  return 'maze';
}

// Feature on one side of a square: wall/open/door/gate, or 'unknown' for an unexplored maze square.
export function sideAt(game, content, c, side) {
  const bd = content.board;
  const kind = squareKind(bd, c);
  if (kind === 'tower') return bd.towers.find(t => same(t, c)).sides[side];
  if (kind === 'center') return 'open'; // D39: open toward every outer neighbour (the inner edge is never crossed)
  const inst = game.board.tiles[key(c)];
  if (!inst) return 'unknown';
  return sideOnBoard(contentIndex(content).tiles.get(inst.defId), inst.rotation, side);
}

// One key per shared edge, whichever side it is seen from.
export const edgeKey = (c, dir) => (dir === 'N' || dir === 'W' ? `${key(neighbour(c, dir))}|${OPPOSITE[dir]}` : `${key(c)}|${dir}`);

// RB 6.1, SP 5: a free passage is open on both sides. A wall on either side wins, then a gate
// (printed, or one that fell behind a red-dot entrant, RB 6.7), then a door. Printed board walls and
// fixed board edges ('x,y|SIDE' -> wall/door/gate, from either side) count as a third side.
export function edgeKind(game, content, a, dir) {
  const b = neighbour(a, dir);
  const { walls = [], edges = {} } = content.board;
  if (walls.includes(`${key(a)}|${dir}`) || walls.includes(`${key(b)}|${OPPOSITE[dir]}`)) return 'wall';
  const fixed = edges[`${key(a)}|${dir}`] || edges[`${key(b)}|${OPPOSITE[dir]}`];
  const pair = [sideAt(game, content, a, dir), sideAt(game, content, b, OPPOSITE[dir])];
  if (fixed) pair.push(fixed);
  if (pair.includes('wall')) return 'wall';
  if (game.board.edges?.[edgeKey(a, dir)] === 'gate') return 'gate';
  for (const k of ['gate', 'door']) if (pair.includes(k)) return k;
  return pair[1] === 'unknown' ? 'unexplored' : 'open';
}

// RB 5, SP 5: one hero per ordinary room; towers and the chamber hold any number.
export function occupiedBy(game, c) {
  return game.heroes.find(h => isActive(h) && same(h.coord, c)) || null;
}

// Sides the hero could try this turn. Doors (door card) and gates (STR test) are tries, not free
// passages; a door that stayed closed this turn is not offered again (RB 6.6). A secret passage
// found this turn (D11) may cross a printed wall. Tower transit (spec v2) goes on through another passage.
// D39: the chamber is one room over two cells. A hero in it is offered every outer side of both cells (six
// on the fixture board), whichever cell their coord records; `from` is the cell an exit leaves by. There is
// no move between the two halves.
export function exits(game, content, seat) {
  const hero = game.heroes[seat];
  const turn = game.turn && game.turn.seat === seat ? game.turn : null;
  const room = squareKind(content.board, hero.coord) === 'center' ? content.board.center : [hero.coord];
  // D42 (spec v4): on a well tile the hero is at one edge: the entry side (near), or after a jump the opposite one
  // (CROSSED). Only that side's opening can be left by; any other needs a jump (interpretation for other shapes).
  const rs = hero.roomState;
  const wellSide = rs?.special === 'well' ? (rs.phase === 'CROSSED' ? OPPOSITE[rs.entryEdge] : rs.entryEdge) : null;
  const out = [];
  for (const from of room) for (const dir of SIDES) {
    const to = neighbour(from, dir);
    const kind = squareKind(content.board, to);
    if (kind === 'off' || (kind === 'center' && room.length > 1)) continue;
    let edge = edgeKind(game, content, from, dir);
    if (edge === 'wall' && turn?.secret && (turn.secret === 'any-orthogonal' || turn.secret === dir)) edge = 'secret';
    const unrevealed = kind === 'maze' && !game.board.tiles[key(to)];
    let reason = null;
    if (edge === 'wall') reason = 'wall';
    else if (wellSide && dir !== wellSide) reason = 'across-the-well';

    else if (edge === 'door' && turn?.triedDoors.includes(edgeKey(from, dir))) reason = 'door-closed';
    else if (turn?.transitFrom === dir) reason = 'tower-entry'; // transit: not back the way the hero came in
    else if (unrevealed && !game.board.tileBag.length) reason = 'no-tiles-left'; // D27
    else if (kind === 'maze' && occupiedBy(game, to)) reason = 'occupied';
    out.push({ dir, from: { x: from.x, y: from.y }, to, edge, legal: !reason, reason });
  }
  return out;
}

// The exit a MOVE names: its side, plus its `from` cell when the hero is in the chamber (D39).
export const exitFor = (game, content, seat, dir, from = null) => exits(game, content, seat).find(e => e.dir === dir && (!from || key(e.from) === from));
