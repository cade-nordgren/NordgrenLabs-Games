// Dots and Boxes rules: a pure, serialisable reducer over any board geometry. No DOM, no randomness.
import { buildGeometry } from './boards.js';

export function newGame({ spec, players, first, roll }) {
  const geo = buildGeometry(spec);
  return {
    v: 1, spec, players, first, roll,
    edges: Array(geo.edges.length).fill(-1),
    faces: Array(geo.faces.length).fill(-1),
    scores: [0, 0],
    active: first,
    pending: null,
    last: null,
    status: 'playing',
    moves: [],
  };
}

// Draws an edge already known to be legal, in place: claims every adjacent face it completes.
function draw(g, geo, edge) {
  const by = g.active;
  g.edges[edge] = by;
  g.moves.push(edge);
  const took = geo.edgeFaces[edge].filter(f => g.faces[f] === -1 && geo.faces[f].edges.every(e => g.edges[e] !== -1));
  for (const f of took) g.faces[f] = by;
  g.scores[by] += took.length;
  g.last = { edge, faces: took, by };
  if (g.edges.includes(-1)) g.pending = { by, next: took.length > 0 ? by : 1 - by, claimed: took.length, edge };
  else { g.status = 'over'; g.pending = null; }
}

// Takes back the line drawn this turn (Next Turn not pressed yet): its edge, the faces it took and their score.
function takeBack(g) {
  const { edge, faces, by } = g.last;
  g.edges[edge] = -1;
  for (const f of faces) g.faces[f] = -1;
  g.scores[by] -= faces.length;
  g.moves.pop();
  g.pending = null;
  g.last = null;
}

function next(g) {
  g.active = g.pending.next;
  g.pending = null;
}

// Until Next Turn is pressed the mover may draw elsewhere: that moves this turn's line instead of adding one.
const canDraw = (g, edge) => g.status === 'playing' && Number.isInteger(edge) && g.edges[edge] === -1;

export function reduce(state, action) {
  if (!state) return state;
  if (action?.type === 'draw' && canDraw(state, action.edge)) {
    const g = structuredClone(state);
    if (g.pending) takeBack(g);
    draw(g, buildGeometry(g.spec), action.edge);
    return g;
  }
  if (action?.type === 'next' && state.pending) {
    const g = structuredClone(state);
    next(g);
    return g;
  }
  return state;
}

export const legalEdges = g =>
  g.status !== 'playing' ? [] : g.edges.flatMap((o, e) => o === -1 ? [e] : []);

export const result = g => ({ scores: [...g.scores], winner: g.scores[0] === g.scores[1] ? null : g.scores[0] > g.scores[1] ? 0 : 1 });

export const countSteps = g => buildGeometry(g.spec).rows.map(row => row.map(face => ({ face, owner: g.faces[face] })));

{
  // Three boxes in a row: close the middle shared edge last but one, it takes two boxes and keeps one turn.
  const spec = { kind: 'square', mask: ['####'] };
  const geo = buildGeometry(spec);
  let g = newGame({ spec, players: [{}, {}], first: 0, roll: null });
  const shared = geo.edgeFaces.findIndex((f, e) => f.length === 2 && f.includes(0) && f.includes(1));
  const keep = geo.faces[3].edges.find(e => geo.edgeFaces[e].length === 1);
  for (const e of geo.edges.keys()) if (e !== shared && e !== keep) {
    if (g.pending) g = reduce(g, { type: 'next' });
    g = reduce(g, { type: 'draw', edge: e });
  }
  const moved = reduce(g, { type: 'draw', edge: shared });
  console.assert(moved.moves.length === g.moves.length && moved.edges[g.pending.edge] === -1 && moved.edges[shared] === g.active, 'a draw before Next Turn moves the line');
  g = reduce(g, { type: 'next' });
  const mover = g.active, before = g.scores[mover];
  g = reduce(g, { type: 'draw', edge: shared });
  console.assert(g.scores[mover] === before + 2 && g.pending.next === mover && g.pending.claimed === 2, 'double capture');
  g = reduce(reduce(g, { type: 'next' }), { type: 'draw', edge: keep });
  console.assert(g.status === 'over' && g.pending === null && g.scores[0] + g.scores[1] === 4, 'last line ends the game');
}

// Stored state is a trust boundary: check the shape, then replay the moves and require the same board.
const fail = msg => { throw new Error('Invalid Dots and Boxes state: ' + msg); };
const owners = (a, n) => Array.isArray(a) && a.length === n && a.every(x => x === -1 || x === 0 || x === 1);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function checkState(g) {
  if (!g || typeof g !== 'object' || g.v !== 1) fail('not a version 1 game.');
  let geo;
  try { geo = buildGeometry(g.spec); } catch (e) { fail(e.message); }
  if (!Array.isArray(g.players) || g.players.length !== 2 ||
      !g.players.every(p => p && typeof p.name === 'string' && typeof p.marker === 'string' && typeof p.color === 'string')) {
    fail('needs two players with a name, marker and color.');
  }
  if (g.first !== 0 && g.first !== 1) fail('first player must be 0 or 1.');
  if (g.roll != null && (typeof g.roll !== 'object' || !['digital', 'physical'].includes(g.roll.mode) || !Array.isArray(g.roll.rounds) ||
      !g.roll.rounds.every(r => Array.isArray(r) && r.length === 2 && r.every(d => Number.isInteger(d) && d >= 1 && d <= 6)))) {
    fail('bad dice roll record.');
  }
  if (!owners(g.edges, geo.edges.length) || !owners(g.faces, geo.faces.length)) fail('edges or faces do not match the board.');
  if (!Array.isArray(g.scores) || g.scores.length !== 2 || !g.scores.every(Number.isInteger)) fail('bad scores.');
  if (g.faces.some((o, f) => o !== -1 && geo.faces[f].edges.some(e => g.edges[e] === -1))) fail('a claimed box is not closed.');
  if (g.scores.some((s, p) => s !== g.faces.filter(o => o === p).length)) fail('scores do not match claimed boxes.');
  if (!Array.isArray(g.moves) || g.moves.length !== g.edges.filter(o => o !== -1).length) fail('moves do not match drawn lines.');
  if (g.status !== (g.edges.includes(-1) ? 'playing' : 'over')) fail('status does not match the board.');
  const r = newGame(g);
  for (const e of g.moves) {
    if (r.pending) next(r);
    if (!canDraw(r, e)) fail('moves are not a legal sequence.');
    draw(r, geo, e);
  }
  const fields = s => [s.edges, s.faces, s.scores, s.active, s.pending, s.last, s.status];
  if (same(fields(g), fields(r))) return;
  if (r.pending) next(r); // the stored game may already have pressed Next Turn after the last line
  if (!same(fields(g), fields(r))) fail('the board does not match its moves, turn or pending Next Turn.');
}
