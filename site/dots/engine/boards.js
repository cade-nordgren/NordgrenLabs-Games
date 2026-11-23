// Board geometry for Dots and Boxes: specs (masks) in, a face/edge/vertex graph out. Pure, no DOM.
//
// Mask cells are '#' (playable) or '.' (empty). Row r, column c.
// square: cell (r,c) is the unit square with top-left corner (c, r). All rows the same length.
// tri:    cell (r,c) points up when (r + c) % 2 === 0, else down. Edge length 1 (equilateral).
//         Lattice point (i, j) sits at x = i / 2, y = j * sqrt(3) / 2.
// hex:    pointy-top regular hexagons, side 1. Even rows (0, 2, ...) are shifted right by half a hexagon,
//         so ['###', '####', '###'] is symmetric. Lattice point (i, j) sits at x = i * sqrt(3) / 2, y = j / 2.
// Rows of tri and hex masks may differ in length (missing cells are empty).
// Vertex identity is always the integer lattice key, never a float.

export const CATEGORIES = [
  { id: 'classic', name: 'Classic' }, { id: 'rect', name: 'Rectangles' },
  { id: 'shapes', name: 'Shapes' }, { id: 'tri', name: 'Triangles' }, { id: 'hex', name: 'Hexagons' },
];

const MAX_SIDE = 12, MIN_FACES = 4;
const KINDS = ['square', 'tri', 'hex'];
const S3 = Math.sqrt(3);

// Per kind: a cell's corners in lattice coordinates (clockwise on screen, y down), its integer row/column keys
// for scoring order (ky groups by exact center y, kx orders within a row), and the lattice-to-layout scale.
const CELL = {
  square: {
    corners: (r, c) => [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]],
    key: (r, c) => [r, c],
    sx: 1, sy: 1,
  },
  tri: {
    corners: (r, c) => (r + c) % 2 === 0
      ? [[c + 1, r], [c + 2, r + 1], [c, r + 1]] // up: apex, bottom right, bottom left
      : [[c, r], [c + 2, r], [c + 1, r + 1]], // down: top left, top right, bottom
    key: (r, c) => [3 * r + ((r + c) % 2 === 0 ? 2 : 1), c], // center y is r + 2/3 (up) or r + 1/3 (down), in rows
    sx: 0.5, sy: S3 / 2,
  },
  hex: {
    corners: (r, c) => {
      const x = 2 * c + (r % 2 === 0 ? 1 : 0), y = 3 * r;
      return [[x, y - 2], [x + 1, y - 1], [x + 1, y + 1], [x, y + 2], [x - 1, y + 1], [x - 1, y - 1]];
    },
    key: (r, c) => [r, 2 * c + (r % 2 === 0 ? 1 : 0)],
    sx: S3 / 2, sy: 0.5,
  },
};

// Builds the graph without validation; faces in mask order. Used by validateSpec and buildGeometry.
function build(spec) {
  const cell = CELL[spec.kind];
  const lattice = [], vIndex = new Map(), edges = [], eIndex = new Map(), faces = [], keys = [];
  const vert = ([i, j]) => {
    const k = i + ',' + j;
    if (!vIndex.has(k)) { vIndex.set(k, lattice.length); lattice.push([i, j]); }
    return vIndex.get(k);
  };
  const edge = (a, b) => {
    const k = Math.min(a, b) + '-' + Math.max(a, b);
    if (!eIndex.has(k)) { eIndex.set(k, edges.length); edges.push({ a, b }); }
    return eIndex.get(k);
  };
  spec.mask.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '#') return;
    const verts = cell.corners(r, c).map(vert);
    faces.push({ verts, edges: verts.map((v, n) => edge(v, verts[(n + 1) % verts.length])) });
    keys.push(cell.key(r, c));
  }));
  const edgeFaces = edges.map(() => []);
  faces.forEach((f, id) => f.edges.forEach(e => edgeFaces[e].push(id)));
  return { cell, lattice, edges, faces, keys, edgeFaces };
}

// One piece: every face reachable from face 0 through shared edges.
function connected({ faces, edgeFaces }) {
  const seen = new Set([0]), todo = [0];
  while (todo.length) for (const e of faces[todo.pop()].edges) for (const f of edgeFaces[e]) {
    if (!seen.has(f)) { seen.add(f); todo.push(f); }
  }
  return seen.size === faces.length;
}

export function validateSpec(spec) {
  const no = reason => ({ ok: false, reason });
  if (!spec || typeof spec !== 'object' || !KINDS.includes(spec.kind)) return no('Unknown board type.');
  const m = spec.mask;
  if (!Array.isArray(m) || !m.every(row => typeof row === 'string' && /^[#.]*$/.test(row))) {
    return no('The layout must be rows of cells.');
  }
  if (m.length < 1 || m.length > MAX_SIDE) return no(`Use 1 to ${MAX_SIDE} rows.`);
  if (m.some(row => row.length < 1 || row.length > MAX_SIDE)) return no(`Use 1 to ${MAX_SIDE} columns.`);
  if (spec.kind === 'square' && m.some(row => row.length !== m[0].length)) return no('Every row must be the same length.');
  const g = build(spec);
  if (g.faces.length < MIN_FACES) return no(`Use at least ${MIN_FACES} boxes.`);
  if (!connected(g)) return no('All boxes must join into one piece.');
  return { ok: true, faces: g.faces.length };
}

const memo = new Map();

export function buildGeometry(spec) {
  const id = JSON.stringify(spec);
  if (memo.has(id)) return memo.get(id);
  const v = validateSpec(spec);
  if (!v.ok) throw new Error(v.reason);
  const { cell, lattice, edges, faces, keys, edgeFaces } = build(spec);
  const minI = Math.min(...lattice.map(p => p[0])), minJ = Math.min(...lattice.map(p => p[1]));
  const vertices = lattice.map(([i, j]) => ({ x: (i - minI) * cell.sx, y: (j - minJ) * cell.sy }));
  const mean = (vs, k) => vs.reduce((s, n) => s + vertices[n][k], 0) / vs.length;
  const order = faces.map((_, id) => id).sort((p, q) => keys[p][0] - keys[q][0] || keys[p][1] - keys[q][1]);
  const rows = [];
  order.forEach((id, n) => {
    if (n === 0 || keys[id][0] !== keys[order[n - 1]][0]) rows.push([]);
    rows[rows.length - 1].push(id);
  });
  const geo = {
    kind: spec.kind,
    vertices,
    edges,
    faces: faces.map(f => ({ edges: f.edges, verts: f.verts, cx: mean(f.verts, 'x'), cy: mean(f.verts, 'y') })),
    edgeFaces,
    rows,
    width: Math.max(...vertices.map(p => p.x)),
    height: Math.max(...vertices.map(p => p.y)),
  };
  memo.set(id, geo);
  return geo;
}

{
  const g = buildGeometry({ kind: 'square', mask: ['##', '##'] });
  console.assert(g.vertices.length === 9 && g.edges.length === 12 && g.width === 2 && g.height === 2, 'square 2x2 graph');
  console.assert(g.edgeFaces.filter(f => f.length === 2).length === 4, 'square 2x2 shares 4 edges');
  console.assert(JSON.stringify(g.rows) === '[[0,1],[2,3]]', 'square 2x2 rows');
  const t = buildGeometry({ kind: 'tri', mask: ['.###', '####'] });
  console.assert(t.faces.every(f => f.edges.length === 3), 'triangles have 3 edges');
  const h = buildGeometry({ kind: 'hex', mask: ['##', '###', '##'] });
  console.assert(h.faces.length === 7 && h.vertices.length === 24 && h.edges.length === 30, 'hex of 7');
  console.assert(!validateSpec({ kind: 'square', mask: ['##.##'] }).ok, 'disconnected rejected');
}

// Presets. Square dimensions are cols × rows and count boxes, not dots.
const rect = (cols, rows) => Array.from({ length: rows }, () => '#'.repeat(cols));
const sizeOf = n => n <= 9 ? 'small' : n <= 25 ? 'medium' : n <= 49 ? 'large' : 'huge';
const sq = (id, name, category, mask) => ({ id, name, category, spec: { kind: 'square', mask } });

const SHAPES = {
  diamond: ['Diamond', ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...']],
  pyramid: ['Pyramid', ['...#...', '..###..', '.#####.', '#######']],
  'inverted-pyramid': ['Inverted pyramid', ['#######', '.#####.', '..###..', '...#...']],
  staircase: ['Staircase', ['#....', '##...', '###..', '####.', '#####']],
  cross: ['Cross', ['..##..', '..##..', '######', '######', '..##..', '..##..']],
  x: ['X', ['##...##', '.##.##.', '..###..', '.##.##.', '##...##']],
  l: ['L', ['##..', '##..', '##..', '##..', '####', '####']],
  t: ['T', ['######', '######', '..##..', '..##..', '..##..']],
  u: ['U', ['##..##', '##..##', '##..##', '######', '######']],
  h: ['H', ['##..##', '##..##', '######', '##..##', '##..##']],
  hourglass: ['Hourglass', ['#####', '.###.', '..#..', '.###.', '#####']],
  ring: ['Ring', ['#####', '#...#', '#...#', '#...#', '#####']],
  heart: ['Heart', ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']],
  zigzag: ['Zigzag', ['#...#...#', '##.###.##', '.###.###.', '..#...#..']],
  snake: ['Snake', ['#######', '......#', '#######', '#......', '#######']],
  lightning: ['Lightning bolt', ['...###', '..###.', '.###..', '######', '..###.', '.###..', '###...']],
  // Grown once from seed 2026 (21 random edge-adjacent cells on a 7 × 7 grid) and frozen here so saves stay stable.
  random: ['Random', ['##.##..', '######.', '.####..', '..####.', '....###']],
};

export const PRESETS = [
  ...[2, 3, 4, 5, 6, 8, 10].map(n => sq(`sq-${n}x${n}`, `${n} × ${n}`, 'classic', rect(n, n))),
  ...[[5, 3], [7, 3], [6, 4], [8, 4], [8, 5], [10, 6], [8, 2], [2, 8], [3, 6]].map(([c, r]) =>
    sq(`rect-${c}x${r}`, `${c} × ${r} ${c > r ? 'wide' : 'tall'}`, 'rect', rect(c, r))),
  ...Object.entries(SHAPES).map(([id, [name, mask]]) => sq(`shape-${id}`, name, 'shapes', mask)),
  { id: 'tri-small', name: 'Small triangle', category: 'tri', spec: { kind: 'tri', mask: ['..#..', '.###.', '#####'] } },
  { id: 'tri-large', name: 'Large triangle', category: 'tri',
    spec: { kind: 'tri', mask: ['....#....', '...###...', '..#####..', '.#######.', '#########'] } },
  { id: 'tri-hexagon', name: 'Hexagon of triangles', category: 'tri',
    spec: { kind: 'tri', mask: ['..#####.', '.#######', '.#######', '..#####.'] } },
  { id: 'tri-parallelogram', name: 'Parallelogram', category: 'tri',
    spec: { kind: 'tri', mask: ['..##########', '.##########.', '##########..'] } },
  { id: 'hex-7', name: 'Small hexagon', category: 'hex', spec: { kind: 'hex', mask: ['##', '###', '##'] } },
  { id: 'hex-19', name: 'Medium hexagon', category: 'hex', spec: { kind: 'hex', mask: ['.###', '.####', '#####', '.####', '.###'] } },
  { id: 'hex-37', name: 'Large hexagon', category: 'hex',
    spec: { kind: 'hex', mask: ['.####', '.#####', '######', '#######', '######', '.#####', '.####'] } },
  { id: 'hex-6x4', name: '6 × 4 hexagons', category: 'hex', spec: { kind: 'hex', mask: rect(6, 4) } },
].map(p => ({ ...p, size: sizeOf(validateSpec(p.spec).faces) }));

export const preset = id => PRESETS.find(p => p.id === id);

console.assert(PRESETS.every(p => validateSpec(p.spec).ok), 'every preset is valid');
console.assert(new Set(PRESETS.map(p => p.id)).size === PRESETS.length, 'preset ids are unique');
