import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, PRESETS, preset, buildGeometry, validateSpec } from '../../site/dots/engine/boards.js';
import { newGame, reduce, legalEdges, result, countSteps, checkState, startEdges } from '../../site/dots/engine/reducer.js';

const PLAYERS = [{ name: 'Alex', marker: 'A', color: 'blue' }, { name: 'Brooke', marker: 'B', color: 'red' }];
const ROLL = { mode: 'digital', rounds: [[5, 2]] };
const start = (mask, kind = 'square') => newGame({ spec: { kind, mask }, players: PLAYERS, first: 0, roll: ROLL });
const act = (g, a) => { const n = reduce(g, a); assert.notEqual(n, g, `rejected: ${JSON.stringify(a)}`); return n; };
const draw = (g, edge) => act(g, { type: 'draw', edge });
const next = g => act(g, { type: 'next' });
// Square edge between lattice points (x1,y1) and (x2,y2) (layout units, mask starting at 0,0).
const edgeAt = (g, x1, y1, x2, y2) => {
  const geo = buildGeometry(g.spec), v = (x, y) => geo.vertices.findIndex(p => p.x === x && p.y === y);
  const a = v(x1, y1), b = v(x2, y2);
  return geo.edges.findIndex(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
};
// Draws the given edges, pressing Next Turn whenever it is pending.
const play = (g, edges) => edges.reduce((s, e) => draw(s.pending ? next(s) : s, e), g);

// Core rules

test('a new game starts empty with the first player active and nothing pending', () => {
  const g = start(['###', '###']);
  assert.equal(g.edges.length, 17);
  assert.equal(g.faces.length, 6);
  assert.ok(g.edges.every(o => o === -1) && g.faces.every(o => o === -1));
  assert.deepEqual([g.scores, g.active, g.pending, g.last, g.status, g.moves], [[0, 0], 0, null, null, 'playing', []]);
  assert.equal(legalEdges(g).length, 17);
  checkState(g);
});

test('a valid line is drawn by the active player and hands the turn over', () => {
  const g0 = start(['##', '##']);
  const g = draw(g0, 0);
  assert.equal(g0.edges[0], -1, 'old state untouched');
  assert.equal(g.edges[0], 0);
  assert.deepEqual(g.pending, { by: 0, next: 1, claimed: 0, edge: 0 });
  assert.deepEqual(g.last, { edge: 0, faces: [], by: 0 });
  assert.equal(legalEdges(g).length, 11, 'the mover can still move their line to any open one');
  const h = next(g);
  assert.equal(h.active, 1);
  assert.equal(h.pending, null);
  assert.equal(legalEdges(h).length, 11);
  assert.equal(draw(h, 1).edges[1], 1, 'second player owns their line');
});

test('duplicate, invalid and out-of-range lines are rejected with the same object', () => {
  const g = next(draw(start(['##', '##']), 0));
  for (const edge of [0, -1, 12, 1.5, '1', null, undefined, NaN]) assert.equal(reduce(g, { type: 'draw', edge }), g, String(edge));
  assert.equal(reduce(g, { type: 'next' }), g, 'next without pending');
  assert.equal(reduce(g, { type: 'jump' }), g);
  assert.equal(reduce(g, null), g);
});

test('square boards have no diagonals: every edge is one unit, horizontal or vertical', () => {
  for (const p of PRESETS.filter(p => p.spec.kind === 'square')) {
    const geo = buildGeometry(p.spec);
    for (const { a, b } of geo.edges) {
      const dx = Math.abs(geo.vertices[a].x - geo.vertices[b].x), dy = Math.abs(geo.vertices[a].y - geo.vertices[b].y);
      assert.ok((dx === 1 && dy === 0) || (dx === 0 && dy === 1), p.id);
    }
  }
  const g = start(['##', '##']);
  assert.equal(edgeAt(g, 0, 0, 1, 1), -1, 'no diagonal edge exists to draw');
  assert.equal(edgeAt(g, 0, 0, 2, 0), -1, 'no edge skips a dot');
});

test('a draw before Next Turn moves the line drawn this turn instead of adding one', () => {
  const s = start(['##', '##']);
  const g = play(s, [0]);
  const m = draw(g, 1);
  assert.deepEqual([m.edges[0], m.edges[1], m.moves, m.pending], [-1, 0, [1], { by: 0, next: 1, claimed: 0, edge: 1 }]);
  assert.equal(reduce(m, { type: 'draw', edge: 1 }), m, 'the line already there cannot be drawn again');
  assert.deepEqual(legalEdges(m), m.edges.flatMap((o, e) => o === -1 ? [e] : []), 'every open line stays drawable while choosing');
  checkState(m);
  // Moving a capturing line off the box gives the box and the score back, and the turn now passes.
  const top = edgeAt(s, 0, 0, 1, 0), right = edgeAt(s, 1, 0, 1, 1), bottom = edgeAt(s, 1, 1, 0, 1), left = edgeAt(s, 0, 1, 0, 0);
  const g2 = play(s, [top, right, bottom, left]);
  assert.deepEqual([g2.pending.claimed, g2.faces[0], g2.scores[g2.active]], [1, g2.active, 1]);
  const off = draw(g2, edgeAt(s, 1, 0, 2, 0));
  assert.deepEqual([off.faces[0], off.scores, off.edges[left], off.pending.claimed, off.pending.next], [-1, [0, 0], -1, 0, 1 - off.active]);
  checkState(off);
  // And moving it back onto the box claims it again.
  const back = draw(off, left);
  assert.deepEqual([back.faces[0], back.pending.claimed, back.pending.next], [back.active, 1, back.active]);
});

test('one box keeps the turn; repeated captures keep it again and again', () => {
  const s = start(['####']);
  // Everything but box 0's top and box 3's right side; then one player closes box 0, then box 3.
  const geo = buildGeometry(s.spec), top0 = edgeAt(s, 0, 0, 1, 0), right3 = edgeAt(s, 4, 0, 4, 1);
  let g = play(s, geo.edges.map((_, e) => e).filter(e => e !== top0 && e !== right3));
  assert.equal(g.faces.filter(o => o !== -1).length, 2, 'boxes 1 and 2 closed on the way');
  g = next(g);
  const mover = g.active;
  const before = g.scores[mover];
  g = draw(g, top0);
  assert.deepEqual([g.scores[mover], g.pending.next, g.pending.claimed, g.last.faces], [before + 1, mover, 1, [0]]);
  g = next(g);
  assert.equal(g.active, mover);
  g = draw(g, right3); // closes box 3, last line
  assert.equal(g.scores[mover], before + 2);
  assert.equal(g.status, 'over');
});

test('two boxes with one line: +2 and exactly one extra turn', () => {
  const s = start(['####']);
  const shared = edgeAt(s, 1, 0, 1, 1), keep = edgeAt(s, 4, 0, 4, 1);
  const rest = buildGeometry(s.spec).edges.map((_, e) => e).filter(e => e !== shared && e !== keep);
  let g = next(play(s, rest));
  const mover = g.active, before = g.scores[mover];
  g = draw(g, shared);
  assert.equal(g.scores[mover], before + 2);
  assert.deepEqual(g.last.faces, [0, 1]);
  assert.deepEqual(g.pending, { by: mover, next: mover, claimed: 2, edge: shared });
  g = next(g);
  assert.equal(g.active, mover);
  assert.equal(g.pending, null);
  g = draw(g, keep);
  assert.equal(g.status, 'over', 'one move, then over: the double did not queue a second extra turn');
  checkState(g);
});

test('the last line ends the game with no pending Next Turn and no legal moves', () => {
  const s = start(['####']);
  const g = play(s, s.edges.map((_, e) => e));
  assert.deepEqual([g.status, g.pending, g.scores[0] + g.scores[1]], ['over', null, 4]);
  assert.deepEqual(legalEdges(g), []);
  assert.equal(reduce(g, { type: 'next' }), g);
  assert.equal(reduce(g, { type: 'draw', edge: 0 }), g);
});

test('result totals and tie detection', () => {
  const g = start(['##', '##']);
  assert.deepEqual(result({ ...g, scores: [3, 1] }), { scores: [3, 1], winner: 0 });
  assert.deepEqual(result({ ...g, scores: [1, 3] }), { scores: [1, 3], winner: 1 });
  assert.deepEqual(result({ ...g, scores: [2, 2] }), { scores: [2, 2], winner: null });
});

// Results

test('the 4 x 4 example counts row by row: 3-1, 4-4, 7-5, 9-7', () => {
  const g = start(['####', '####', '####', '####']);
  const owners = 'AABA BBBA AAAB BABA'.replace(/ /g, '');
  const steps = countSteps({ ...g, faces: [...owners].map(c => c === 'A' ? 0 : 1) });
  assert.deepEqual(steps.map(r => r.map(s => s.face)), [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]);
  const tally = [0, 0];
  const perRow = steps.map(row => { for (const s of row) tally[s.owner]++; return [...tally]; });
  assert.deepEqual(perRow, [[3, 1], [4, 4], [7, 5], [9, 7]]);
});

test('scoring rows: every face exactly once, top to bottom, left to right, for every preset', () => {
  for (const p of PRESETS) {
    const geo = buildGeometry(p.spec);
    const flat = geo.rows.flat();
    assert.equal(flat.length, geo.faces.length, p.id);
    assert.equal(new Set(flat).size, geo.faces.length, p.id);
    const eps = 1e-9;
    geo.rows.forEach((row, r) => {
      assert.ok(row.every(f => Math.abs(geo.faces[f].cy - geo.faces[row[0]].cy) < eps), `${p.id} row ${r} shares a center y`);
      row.forEach((f, i) => i && assert.ok(geo.faces[f].cx > geo.faces[row[i - 1]].cx, `${p.id} left to right`));
      if (r) assert.ok(geo.faces[row[0]].cy > geo.faces[geo.rows[r - 1][0]].cy + eps, `${p.id} top to bottom`);
    });
  }
});

test('triangle rows follow face centers: down triangles count before up triangles in a mask row', () => {
  const geo = buildGeometry({ kind: 'tri', mask: ['####'] }); // up, down, up, down
  assert.deepEqual(geo.rows, [[1, 3], [0, 2]]);
});

// Boards

test('categories and preset catalogue', () => {
  assert.deepEqual(CATEGORIES.map(c => c.id), ['classic', 'rect', 'shapes', 'geo', 'holes', 'letters', 'things', 'nature', 'large', 'tri', 'hex']);
  for (const c of ['geo', 'holes', 'letters', 'things', 'nature', 'large']) assert.ok(PRESETS.filter(p => p.category === c).length >= 8, c);
  const ids = PRESETS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['sq-2x2', 'sq-3x3', 'sq-4x4', 'sq-5x5', 'sq-6x6', 'sq-8x8', 'sq-10x10', 'rect-5x3', 'rect-7x3', 'rect-6x4',
    'rect-8x4', 'rect-8x5', 'rect-10x6', 'rect-2x8', 'rect-8x2', 'shape-diamond', 'shape-pyramid', 'shape-inverted-pyramid',
    'shape-staircase', 'shape-cross', 'shape-x', 'shape-l', 'shape-t', 'shape-u', 'shape-h', 'shape-hourglass', 'shape-ring',
    'shape-heart', 'shape-zigzag', 'shape-snake', 'shape-lightning', 'shape-random']) assert.ok(preset(id), id);
  assert.equal(preset('nope'), undefined);
  assert.ok(PRESETS.filter(p => p.category === 'tri').length >= 3);
  assert.ok(PRESETS.filter(p => p.category === 'hex').length >= 3);
  for (const p of PRESETS) {
    assert.ok(CATEGORIES.some(c => c.id === p.category), p.id);
    assert.ok(!/—/.test(p.name) && p.name[0] === p.name[0].toUpperCase(), p.name);
    const n = buildGeometry(p.spec).faces.length;
    assert.equal(p.size, n <= 9 ? 'small' : n <= 25 ? 'medium' : n <= 49 ? 'large' : 'huge', p.id);
    if (p.category === 'shapes') assert.ok(n >= 12 && n <= 31, `${p.id} has ${n} cells`);
    if (['geo', 'holes', 'letters', 'things', 'nature'].includes(p.category)) assert.ok(n >= 12 && n <= 40, `${p.id} has ${n} cells`);
    if (p.category === 'large') assert.ok(p.spec.mask.length <= 12 && p.spec.mask.every(r => r.length <= 12), `${p.id} fits 12 x 12`);
  }
  assert.equal(buildGeometry(preset('sq-4x4').spec).faces.length, 16);
  assert.equal(buildGeometry(preset('sq-4x4').spec).vertices.length, 25, '4 x 4 boxes is 5 x 5 dots');
  assert.equal(preset('rect-5x3').name, '5 × 3 wide');
  assert.equal(preset('rect-2x8').name, '2 × 8 tall');
  assert.equal(buildGeometry(preset('rect-5x3').spec).width, 5);
});

test('every preset has sound geometry', () => {
  for (const p of PRESETS) {
    const geo = buildGeometry(p.spec);
    const sides = { square: 4, tri: 3, hex: 6 }[geo.kind];
    const vkeys = geo.vertices.map(v => `${v.x.toFixed(9)},${v.y.toFixed(9)}`);
    assert.equal(new Set(vkeys).size, geo.vertices.length, `${p.id}: no duplicate vertices`);
    const ekeys = geo.edges.map(e => [e.a, e.b].sort((x, y) => x - y).join('-'));
    assert.equal(new Set(ekeys).size, geo.edges.length, `${p.id}: no duplicated shared edges`);
    assert.ok(geo.faces.every(f => f.edges.length === sides && f.verts.length === sides), `${p.id}: ${sides} sides`);
    const usedV = new Set(geo.faces.flatMap(f => f.verts));
    assert.equal(usedV.size, geo.vertices.length, `${p.id}: every vertex belongs to a face`);
    geo.edgeFaces.forEach((fs, e) => assert.ok(fs.length === 1 || fs.length === 2, `${p.id}: edge ${e} has 1 or 2 faces`));
    geo.faces.forEach((f, id) => f.edges.forEach((e, i) => {
      assert.ok(geo.edgeFaces[e].includes(id), `${p.id}: edgeFaces agrees with faces`);
      const { a, b } = geo.edges[e], u = f.verts[i], w = f.verts[(i + 1) % sides];
      assert.ok((a === u && b === w) || (a === w && b === u), `${p.id}: edges follow the drawing order`);
    }));
    const len = { square: 1, tri: 1, hex: 1 }[geo.kind];
    for (const { a, b } of geo.edges) {
      const d = Math.hypot(geo.vertices[a].x - geo.vertices[b].x, geo.vertices[a].y - geo.vertices[b].y);
      assert.ok(Math.abs(d - len) < 1e-9, `${p.id}: equal edge lengths (regular faces)`);
    }
    assert.equal(Math.min(...geo.vertices.map(v => v.x)), 0);
    assert.equal(Math.min(...geo.vertices.map(v => v.y)), 0);
    assert.ok(Math.abs(geo.width - Math.max(...geo.vertices.map(v => v.x))) < 1e-12 && geo.height > 0);
  }
});

test('holes and empty cells are not claimable and their dots and edges do not exist', () => {
  const geo = buildGeometry(preset('shape-ring').spec);
  assert.equal(geo.faces.length, 16);
  assert.ok(!geo.faces.some(f => f.cx > 1 && f.cx < 4 && f.cy > 1 && f.cy < 4), 'no face in the hole');
  assert.ok(!geo.vertices.some(v => v.x === 2.5 || (v.x === 2 && v.y === 2) || (v.x === 3 && v.y === 3)), 'no dots inside the hole');
  // Inner rim edges of the hole are real and border exactly one face.
  const inner = geo.edges.filter(({ a, b }) => [a, b].every(v => geo.vertices[v].x >= 1 && geo.vertices[v].x <= 4 &&
    geo.vertices[v].y >= 1 && geo.vertices[v].y <= 4));
  assert.equal(inner.length, 12, 'only the hole rim lies within the hole square');
  // Drawing every hole rim edge claims nothing.
  const s = newGame({ spec: preset('shape-ring').spec, players: PLAYERS, first: 0, roll: ROLL });
  const rim = geo.edges.map((_, e) => e).filter(e => {
    const { a, b } = geo.edges[e], A = geo.vertices[a], B = geo.vertices[b];
    return [A, B].every(v => v.x >= 1 && v.x <= 4 && v.y >= 1 && v.y <= 4) && (A.x === B.x ? (A.x === 1 || A.x === 4) : (A.y === 1 || A.y === 4));
  });
  assert.equal(rim.length, 12);
  const g = play(s, rim);
  assert.deepEqual(g.scores, [0, 0]);
  // An L with a missing corner: the missing cell's outer corner dot is absent.
  const L = buildGeometry({ kind: 'square', mask: ['#.', '##', '##'] });
  assert.equal(L.vertices.length, 11);
  assert.ok(!L.vertices.some(v => v.x === 2 && v.y === 0));
});

test('triangles have 3 edges, hexagons 6, and they share edges and dots', () => {
  const t = buildGeometry({ kind: 'tri', mask: ['####'] }); // up, down, up, down
  assert.deepEqual([t.vertices.length, t.edges.length, t.edgeFaces.filter(f => f.length === 2).length], [6, 9, 3]);
  const h = buildGeometry({ kind: 'hex', mask: ['####'] });
  assert.deepEqual([h.vertices.length, h.edges.length, h.edgeFaces.filter(f => f.length === 2).length], [18, 21, 3]);
  const h7 = buildGeometry(preset('hex-7').spec);
  assert.equal(h7.edgeFaces.filter(f => f.length === 2).length, 12, 'center hex shares all 6 sides, ring shares 6 more');
  assert.equal(h7.faces.findIndex(f => f.edges.every(e => h7.edgeFaces[e].length === 2)), 3, 'the middle hex is fully inside');
});

test('a single hexagon and triangle need every side to be claimed (via a larger valid board)', () => {
  const s = newGame({ spec: preset('hex-7').spec, players: PLAYERS, first: 0, roll: ROLL });
  const geo = buildGeometry(s.spec), center = geo.faces[3];
  let g = play(s, center.edges.slice(0, 5));
  assert.equal(g.faces[3], -1);
  g = play(g, center.edges.slice(5));
  assert.equal(g.faces[3], g.last.by);
  const t = newGame({ spec: preset('tri-small').spec, players: PLAYERS, first: 0, roll: ROLL });
  const tg = buildGeometry(t.spec);
  let tt = play(t, tg.faces[0].edges.slice(0, 2));
  assert.equal(tt.faces[0], -1);
  tt = play(tt, tg.faces[0].edges.slice(2));
  assert.equal(tt.faces[0], tt.last.by);
});

test('every preset plays to the end without getting stuck, with checkState passing at every step', () => {
  for (const p of PRESETS) {
    let g = newGame({ spec: p.spec, players: PLAYERS, first: 1, roll: ROLL });
    const geo = buildGeometry(p.spec);
    let steps = 0;
    while (g.status === 'playing') {
      assert.ok(steps++ < 4 * geo.edges.length, `${p.id} stuck`);
      if (g.pending) g = next(g);
      else { const legal = legalEdges(g); g = draw(g, legal[(g.moves.length * 7) % legal.length]); }
      if (geo.faces.length <= 49 || g.status === 'over') checkState(g); // shortcut: per step is cubic on the large boards; the last check replays every move
    }
    assert.equal(g.moves.length, geo.edges.length, p.id);
    assert.ok(g.faces.every(o => o !== -1), `${p.id}: every face completed`);
    assert.equal(g.scores[0] + g.scores[1], geo.faces.length, `${p.id}: scores sum to the face count`);
    assert.equal(countSteps(g).flat().length, geo.faces.length);
    assert.ok(countSteps(g).flat().every(s => s.owner === g.faces[s.face]));
  }
});

test('validateSpec accepts good masks and rejects bad ones', () => {
  assert.deepEqual(validateSpec({ kind: 'square', mask: ['##', '##'] }), { ok: true, faces: 4 });
  assert.deepEqual(validateSpec({ kind: 'square', mask: Array(12).fill('#'.repeat(12)) }), { ok: true, faces: 144 });
  const bad = [
    null, 'x', {}, { kind: 'octagon', mask: ['##'] }, { kind: 'square' }, { kind: 'square', mask: '####' },
    { kind: 'square', mask: ['##', 3] }, { kind: 'square', mask: ['#x', '##'] }, { kind: 'square', mask: [] },
    { kind: 'square', mask: ['###'] }, // too small
    { kind: 'square', mask: ['##.##'] }, // disconnected
    { kind: 'square', mask: ['##.', '..#', '.##'] }, // diagonal touch only
    { kind: 'square', mask: ['###', '##'] }, // ragged
    { kind: 'square', mask: Array(13).fill('##') }, // too many rows
    { kind: 'square', mask: ['#'.repeat(13), '#'.repeat(13)] }, // too many columns
    { kind: 'square', mask: ['', ''] },
    { kind: 'hex', mask: ['#.#', '...', '#.#'] },
  ];
  for (const spec of bad) {
    const v = validateSpec(spec);
    assert.equal(v.ok, false, JSON.stringify(spec));
    assert.ok(typeof v.reason === 'string' && v.reason.length > 0);
    if (spec && typeof spec === 'object') assert.throws(() => buildGeometry(spec));
  }
});

test('geometry is memoised by spec', () => {
  assert.equal(buildGeometry({ kind: 'square', mask: ['##', '##'] }), buildGeometry({ kind: 'square', mask: ['##', '##'] }));
});

// Stored state

test('checkState accepts saved games, including a pending Next Turn and after Next Turn', () => {
  const s = start(['##', '##']);
  const g = play(s, [0, 1]);
  checkState(JSON.parse(JSON.stringify(g)));
  checkState(JSON.parse(JSON.stringify(next(g))));
  checkState({ ...s, roll: null });
});

test('checkState rejects broken states', () => {
  const s = start(['##', '##']);
  const geo = buildGeometry(s.spec);
  const box0 = geo.faces[0].edges;
  const g = play(s, box0); // box 0 claimed
  const owner = g.faces[0];
  const breaks = [
    x => { x.v = 2; },
    x => { x.spec = { kind: 'square', mask: ['#'] }; },
    x => { x.players = [PLAYERS[0]]; },
    x => { x.first = 2; },
    x => { x.roll = { mode: 'digital', rounds: [[7, 1]] }; },
    x => { x.edges.pop(); },
    x => { x.edges[5] = 2; },
    x => { x.faces[1] = 0; },
    x => { x.scores[owner] = 0; },
    x => { x.scores = [1]; },
    x => { x.moves.pop(); },
    x => { x.moves.reverse(); },
    x => { x.moves[0] = 99; },
    x => { x.status = 'over'; },
    x => { x.active = 1 - x.active; },
    x => { x.pending = null; x.active = 1 - owner; }, // a capture never hands the turn over
    x => { x.pending.next = 1 - x.pending.next; },
    x => { x.edges[box0[0]] = 1 - x.edges[box0[0]]; },
    x => { x.last = null; },
    x => { x.faces[0] = -1; x.scores[owner]--; },
  ];
  checkState(structuredClone(g));
  breaks.forEach((brk, i) => {
    const x = structuredClone(g);
    brk(x);
    assert.throws(() => checkState(x), Error, `break ${i}`);
  });
  for (const junk of [null, 1, 'x', {}, []]) assert.throws(() => checkState(junk));
});

// Starting lines (Swedish and Icelandic variations)

const sorted = a => [...a].sort((x, y) => x - y);
const H = (g, x, y) => edgeAt(g, x, y, x + 1, y), V = (g, x, y) => edgeAt(g, x, y, x, y + 1);

test('Swedish and Icelandic starting lines on a 2 x 2', () => {
  const g = start(['##', '##']);
  assert.deepEqual(startEdges(g.spec, 'none'), []);
  assert.deepEqual(startEdges(g.spec, 'swedish'),
    sorted([H(g, 0, 0), H(g, 1, 0), H(g, 0, 2), H(g, 1, 2), V(g, 0, 0), V(g, 0, 1), V(g, 2, 0), V(g, 2, 1)]));
  assert.deepEqual(startEdges(g.spec, 'icelandic'), sorted([V(g, 0, 0), V(g, 0, 1), H(g, 0, 2), H(g, 1, 2)]));
});

test('Swedish includes the rim of a hole; Icelandic takes left and bottom sides, hole rims too', () => {
  const spec = preset('shape-ring').spec, g = newGame({ spec, players: PLAYERS, first: 0, roll: ROLL });
  const sw = startEdges(spec, 'swedish');
  assert.equal(sw.length, 32, '20 outer edges and 12 around the hole');
  for (const e of [H(g, 1, 1), H(g, 3, 4), V(g, 1, 2), V(g, 4, 3)]) assert.ok(sw.includes(e), `hole rim ${e}`);
  const ic = startEdges(spec, 'icelandic'), want = [];
  for (let k = 0; k < 5; k++) want.push(V(g, 0, k), H(g, k, 5)); // the outer left and bottom
  for (let k = 1; k < 4; k++) want.push(V(g, 4, k), H(g, k, 1)); // the hole's right and top rims face a box on their right and above
  assert.deepEqual(ic, sorted(want));
});

test('starting lines are drawn by nobody, not moves, never legal, and count as drawn', () => {
  for (const s of ['swedish', 'icelandic']) {
    const g = newGame({ spec: { kind: 'square', mask: ['###', '###'] }, players: PLAYERS, first: 0, roll: ROLL, start: s });
    const pre = startEdges(g.spec, s);
    assert.equal(g.start, s);
    assert.deepEqual(g.edges.flatMap((o, e) => o === -2 ? [e] : []), pre);
    assert.deepEqual(g.moves, []);
    assert.ok(pre.every(e => !legalEdges(g).includes(e)));
    assert.equal(legalEdges(g).length, g.edges.length - pre.length);
    for (const e of pre) assert.equal(reduce(g, { type: 'draw', edge: e }), g, `pre-drawn ${e}`);
    checkState(g);
  }
  assert.equal(newGame({ spec: { kind: 'square', mask: ['##', '##'] }, players: PLAYERS, first: 0, roll: ROLL }).start, 'none');
});

test('a box with three starting sides is claimed by the first line, which keeps the turn', () => {
  const g = newGame({ spec: { kind: 'square', mask: ['####'] }, players: PLAYERS, first: 1, roll: ROLL, start: 'swedish' });
  const h = draw(g, V(g, 1, 0));
  assert.equal(h.faces[0], 1);
  assert.deepEqual(h.scores, [0, 1]);
  assert.deepEqual(h.pending, { by: 1, next: 1, claimed: 1, edge: V(g, 1, 0) });
  checkState(h);
});

test('every preset plays to the end with Swedish, and every square preset with Icelandic', () => {
  for (const p of PRESETS) for (const s of p.spec.kind === 'square' ? ['swedish', 'icelandic'] : ['swedish']) {
    let g = newGame({ spec: p.spec, players: PLAYERS, first: 0, roll: ROLL, start: s });
    const geo = buildGeometry(p.spec), pre = startEdges(p.spec, s);
    assert.ok(pre.length > 0, `${p.id} ${s}`);
    let steps = 0;
    while (g.status === 'playing') {
      assert.ok(steps++ < 4 * geo.edges.length, `${p.id} ${s} stuck`);
      if (g.pending) g = next(g);
      else { const legal = legalEdges(g); g = draw(g, legal[(g.moves.length * 7) % legal.length]); }
      if (geo.faces.length <= 49 || g.status === 'over') checkState(g); // shortcut: per step is cubic on the large boards; the last check replays every move
    }
    assert.equal(g.moves.length, geo.edges.length - pre.length, `${p.id} ${s}`);
    assert.equal(g.scores[0] + g.scores[1], geo.faces.length, `${p.id} ${s}: scores sum to the face count`);
  }
});

test('checkState guards starting lines; Icelandic needs a square board; old saves still load', () => {
  const g = newGame({ spec: { kind: 'square', mask: ['###', '###'] }, players: PLAYERS, first: 0, roll: ROLL, start: 'swedish' });
  const pre = startEdges(g.spec, 'swedish'), open = legalEdges(g)[0];
  const breaks = [
    x => { x.edges[pre[0]] = -1; },
    x => { x.edges[pre[0]] = 0; x.moves = []; },
    x => { x.edges[open] = -2; },
    x => { x.start = 'none'; },
    x => { x.start = 'icelandic'; },
    x => { x.start = 'danish'; },
  ];
  breaks.forEach((brk, i) => { const x = structuredClone(g); brk(x); assert.throws(() => checkState(x), Error, `break ${i}`); });
  const tri = { spec: preset('tri-small').spec, players: PLAYERS, first: 0, roll: ROLL };
  assert.throws(() => newGame({ ...tri, start: 'icelandic' }));
  assert.throws(() => newGame({ ...tri, start: 'danish' }));
  checkState(newGame({ ...tri, start: 'swedish' }));
  const old = play(start(['##', '##']), [0, 1]);
  delete old.start;
  checkState(old);
});
