// Board, connectivity and occupancy (system 2; RB 5, RB 6.1, SP 3, SP 5).
// The grid size, towers, center and printed walls all come from the BoardDefinition.
import { SIDES, OPPOSITE, sideOnBoard } from './tiles.js';
import { contentIndex } from '../content/schema.js';

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
  const { board: bd, chamber } = content;
  const kind = squareKind(bd, c);
  if (kind === 'tower') return bd.towers.find(t => same(t, c)).sides[side];
  if (kind === 'center') return chamber.sides[same(bd.center[0], c) ? 'a' : 'b'][side];
  const inst = game.board.tiles[key(c)];
  if (!inst) return 'unknown';
  return sideOnBoard(contentIndex(content).tiles.get(inst.defId), inst.rotation, side);
}

// One key per shared edge, whichever side it is seen from.
export const edgeKey = (c, dir) => (dir === 'N' || dir === 'W' ? `${key(neighbour(c, dir))}|${OPPOSITE[dir]}` : `${key(c)}|${dir}`);

// RB 6.1, SP 5: a free passage is open on both sides. A wall on either side wins, then a gate
// (printed, or one that fell behind a red-dot entrant, RB 6.7), then a door.
export function edgeKind(game, content, a, dir) {
  const b = neighbour(a, dir);
  const walls = content.board.walls || [];
  if (walls.includes(`${key(a)}|${dir}`) || walls.includes(`${key(b)}|${OPPOSITE[dir]}`)) return 'wall';
  const pair = [sideAt(game, content, a, dir), sideAt(game, content, b, OPPOSITE[dir])];
  if (pair.includes('wall')) return 'wall';
  if (game.board.edges?.[edgeKey(a, dir)] === 'gate') return 'gate';
  for (const k of ['gate', 'door']) if (pair.includes(k)) return k;
  return pair[1] === 'unknown' ? 'unexplored' : 'open';
}

// RB 5, SP 5: one hero per ordinary room; towers and the chamber hold any number.
export function occupiedBy(game, c) {
  return game.heroes.find(h => h && h.status === 'inside' && same(h.coord, c)) || null;
}

// Sides the hero could try this turn. Doors (door card) and gates (STR test) are tries, not free
// passages; a door that stayed closed this turn is not offered again (RB 6.6). A secret passage
// found this turn (D11) may cross a printed wall.
export function exits(game, content, seat) {
  const hero = game.heroes[seat];
  const turn = game.turn && game.turn.seat === seat ? game.turn : null;
  const out = [];
  for (const dir of SIDES) {
    const to = neighbour(hero.coord, dir);
    const kind = squareKind(content.board, to);
    if (kind === 'off') continue;
    let edge = edgeKind(game, content, hero.coord, dir);
    if (edge === 'wall' && turn?.secret && (turn.secret === 'any-orthogonal' || turn.secret === dir)) edge = 'secret';
    const unrevealed = kind === 'maze' && !game.board.tiles[key(to)];
    let reason = null;
    if (edge === 'wall') reason = 'wall';
    else if (edge === 'door' && turn?.triedDoors.includes(edgeKey(hero.coord, dir))) reason = 'door-closed';
    else if (unrevealed && !game.board.tileBag.length) reason = 'no-tiles-left'; // D27
    else if (kind === 'maze' && occupiedBy(game, to)) reason = 'occupied';
    out.push({ dir, to, edge, legal: !reason, reason });
  }
  return out;
}
