// Board drawing and the map viewport: a pure projection of a view() onto SVG. No rules here; geometry
// comes from the engine's own board helpers (BoardDefinition first) and the targets the caller passes
// are legal actions from the engine. Pointer events and CSS transforms; nothing depends on hover.
import { squareKind, sideAt, edgeKind, edgeKey, neighbour, key } from '../engine/board.js';
import { isActive, ESCAPED } from '../engine/heroes.js';
import { contentIndex } from '../content/schema.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 100; // one square
const M = 34; // the out-of-board band drawn around the rectangle
const SIDES = ['N', 'E', 'S', 'W'];
// Each side as a line along the square's inner edge (inset so neighbouring squares both show).
const EDGE = { N: [6, 6, 94, 6], E: [94, 6, 94, 94], S: [6, 94, 94, 94], W: [6, 6, 6, 94] };
const INNER = { N: [22, 17, 78, 17], E: [83, 22, 83, 78], S: [22, 83, 78, 83], W: [17, 22, 17, 78] };
const OPP = { N: 'S', E: 'W', S: 'N', W: 'E' };

export const DIR = { N: 'north', E: 'east', S: 'south', W: 'west' };

export function svg(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

export const MARK_WORD = { black: 'room', red: 'red room', yellow: 'corridor', blue: 'dark room', none: '' };
export const SPECIAL_WORD = { well: 'well', rotating: 'rotating room', rubble: 'rubble', none: '' };
export function tileWords(def) {
  if (!def) return 'unexplored';
  if (def.text) return def.text;
  const parts = [SPECIAL_WORD[def.special], def.special === 'none' || def.mark !== 'none' ? MARK_WORD[def.mark] : ''].filter(Boolean);
  return parts.join(', ') || 'passage';
}
export const place = c => `row ${c.y + 1}, column ${c.x + 1}`;
// Towers sit in the corners of whatever rectangle the BoardDefinition gives.
export const towerAt = c => `${c.y === 0 ? 'north' : 'south'}-${c.x === 0 ? 'west' : 'east'} tower`;
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
const list = words => new Intl.ListFormat('en', { type: 'conjunction' }).format(words);

// ---- What a square is, in words: shared by the cell label, the inspect sheet and the move reasons.
// One side: a wall, an opening, a door or portcullis, the board edge, or an opening shut from the other side.
export function sideWord(v, content, c, side) {
  const bd = content.board;
  const n = neighbour(c, side);
  const own = sideAt(v, content, c, side);
  if (squareKind(bd, n) === 'off') return 'board edge';
  if (own === 'wall') return 'wall';
  const edge = edgeKind(v, content, c, side);
  const walls = bd.walls || [];
  if (edge === 'wall') return walls.includes(`${key(c)}|${side}`) || walls.includes(`${key(n)}|${OPP[side]}`) ? 'printed wall' : 'wall on their side';
  if (edge === 'gate') return v.board.edges?.[edgeKey(c, side)] === 'gate' ? 'portcullis down' : 'portcullis';
  if (edge === 'door') return 'door';
  return own === 'unknown' ? 'unknown' : 'open';
}

export function cellInfo(v, content, c, names = []) {
  const bd = content.board, kind = squareKind(bd, c);
  const inst = v.board.tiles[key(c)];
  const def = inst && contentIndex(content).tiles.get(inst.defId);
  const left = typeof v.board.tileBag === 'number' ? v.board.tileBag : v.board.tileBag.length;
  let what;
  if (kind === 'tower') what = towerAt(c);
  else if (kind === 'center') what = v.board.chamberPlaced ? 'treasure chamber' : 'chamber reserve, not yet entered';
  else if (def) what = `revealed ${tileWords(def)}${def.mark !== 'none' ? `, ${def.mark} mark` : ''}, entry dot ${DIR[inst.entrySide]}`;
  else what = left ? 'unexplored, will reveal a tile' : 'unexplored, no tiles left';
  const sides = SIDES.map(side => ({ side, word: sideWord(v, content, c, side) }));
  const occupants = v.heroes.filter(h => h && h.coord && (isActive(h) || h.status === ESCAPED) && h.coord.x === c.x && h.coord.y === c.y)
    .map(h => `${names[h.seat] ?? `Seat ${h.seat + 1}`}${h.status === ESCAPED ? ' (escaped)' : ''}`);
  return { title: capital(place(c)), kind, what, sides, occupants };
}

// "open north and east, door south, wall west"; unknown sides of an unexplored square are left out.
export function topology(sides) {
  const groups = new Map();
  for (const { side, word } of sides) if (word !== 'unknown') groups.set(word, [...(groups.get(word) || []), DIR[side]]);
  return [...groups].map(([word, dirs]) => `${word} ${list(dirs)}`).join(', ');
}

export function cellLabel(v, content, c, names, extra) {
  const info = cellInfo(v, content, c, names);
  return [info.title, info.what, topology(info.sides), info.occupants.length ? list(info.occupants) : 'empty', extra].filter(Boolean).join(', ');
}

// ---- Glyphs
// The four dot types as shapes as well as colours, so colour is never the only cue.
export function markGlyph(g, mark, cx, cy) {
  const cls = `dot dot-${mark}`;
  if (mark === 'black') svg('circle', { cx, cy, r: 12, class: cls }, g);
  if (mark === 'red') svg('path', { d: `M${cx} ${cy - 15}l15 15-15 15-15-15z`, class: cls }, g);
  if (mark === 'yellow') svg('path', { d: `M${cx} ${cy - 15}l15 26h-30z`, class: cls }, g);
  if (mark === 'blue') svg('path', { d: `M${cx + 4} ${cy - 15}a15 15 0 1 0 11 24a12 12 0 1 1-11-24z`, class: cls }, g);
}

function specialGlyph(g, special, cx, cy) {
  if (special === 'well') {
    svg('circle', { cx, cy, r: 24, class: 'glyph' }, g);
    svg('circle', { cx, cy, r: 13, class: 'pit' }, g);
  }
  if (special === 'rotating') {
    svg('path', { d: `M${cx + 20} ${cy}a20 20 0 1 1-6-14`, class: 'glyph', fill: 'none' }, g);
    svg('path', { d: `M${cx + 16} ${cy - 24}l0 12-12 0`, class: 'glyph', fill: 'none' }, g);
  }
  if (special === 'rubble') {
    for (const [dx, dy, r] of [[-12, 8, 9], [9, 10, 8], [0, -8, 8], [16, -10, 5]]) svg('circle', { cx: cx + dx, cy: cy + dy, r, class: 'stone' }, g);
  }
}

// [x1, y1, x2, y2] in the group's units; kind wall, door or gate; extra: fixed (printed on the board) or fallen.
export function sideGlyph(g, kind, [x1, y1, x2, y2], extra = '') {
  if (kind === 'wall') return svg('line', { x1, y1, x2, y2, class: `wall ${extra}` }, g);
  if (kind !== 'door' && kind !== 'gate') return;
  // Short wall stubs at both corners, the door or portcullis across the middle.
  const horiz = y1 === y2;
  const lo = horiz ? x1 : y1, hi = horiz ? x2 : y2, a0 = lo + (hi - lo) * 0.3, a1 = lo + (hi - lo) * 0.7;
  const seg = (p, q) => (horiz ? { x1: p, y1, x2: q, y2 } : { x1, y1: p, x2, y2: q });
  svg('line', { ...seg(lo, a0), class: 'wall' }, g);
  svg('line', { ...seg(a1, hi), class: 'wall' }, g);
  if (kind === 'door') {
    svg('rect', horiz ? { x: a0, y: y1 - 6, width: a1 - a0, height: 12, rx: 3, class: `door ${extra}` } : { x: x1 - 6, y: a0, width: 12, height: a1 - a0, rx: 3, class: `door ${extra}` }, g);
  } else {
    for (let t = a0 + 4; t <= a1 - 3; t += 7) svg('line', horiz ? { x1: t, y1: y1 - 8, x2: t, y2: y1 + 8, class: `gate ${extra}` } : { x1: x1 - 8, y1: t, x2: x1 + 8, y2: t, class: `gate ${extra}` }, g);
    svg('line', { ...seg(a0, a1), class: `gate ${extra}` }, g);
  }
}

// A small original keep: walls with crenellations and a gate.
export function towerGlyph(g) {
  svg('path', { d: 'M28 72V38h8v-8h8v8h12v-8h8v8h8v34z', class: 'keep' }, g);
  svg('path', { d: 'M44 72V58a6 6 0 0 1 12 0v14z', class: 'keep-gate' }, g);
}

function chestGlyph(g, cx, cy) {
  svg('rect', { x: cx - 20, y: cy - 6, width: 40, height: 24, rx: 3, class: 'chest' }, g);
  svg('path', { d: `M${cx - 20} ${cy - 6}a20 12 0 0 1 40 0z`, class: 'chest' }, g);
  svg('rect', { x: cx - 4, y: cy - 2, width: 8, height: 9, rx: 1.5, class: 'chest-lock' }, g);
}

// The entry dot's side, as a notch on the inner edge: shows how the tile was turned.
const ENTRY = { N: [50, 6], E: [94, 50], S: [50, 94], W: [6, 50] };
export const entryGlyph = (g, side, cx, cy) => svg('circle', { cx: cx ?? ENTRY[side][0], cy: cy ?? ENTRY[side][1], r: 8, class: 'entry' }, g);
export const blockedGlyph = (g, side) => svg('line', { x1: INNER[side][0], y1: INNER[side][1], x2: INNER[side][2], y2: INNER[side][3], class: 'blocked' }, g);

// ---- The viewport. Kept across re-renders so a move does not reset the user's zoom and pan.
let vp = null; // { s, x, y, fit }
let focusKey = null;
let lastHome = null;
let lastTap = { at: '', t: 0 };
let ro = null;
let zoomKey = null; // the active hero and square the map last auto-zoomed for
export function resetView() { vp = null; focusKey = null; zoomKey = null; }

// ---- Viewport geometry, pure (tests/keep/viewport.test.js). view: { s, x, y } as in vp; size: [vw, vh] in px.
// room: { size, inset, avoid: [{ x, y, w, h }] (the floating map buttons, in viewport px), pad, board: [W, H], lo, hi }.
export const MIN_CELL = 48;
export const INSET = 8; // px at the viewport edge that count as not visible: a square there is hard to tap
const cellRect = (view, c) => ({ x: view.x + (M + c.x * C) * view.s, y: view.y + (M + c.y * C) * view.s, w: C * view.s, h: C * view.s });
const hits = (r, a) => r.x < a.x + a.w - 0.5 && a.x < r.x + r.w - 0.5 && r.y < a.y + a.h - 0.5 && a.y < r.y + r.h - 0.5;
// A square is clear when it is wholly inside the inset viewport and under no floating button.
export function cellClear(view, c, { size: [vw, vh], inset = 0, avoid = [] }) {
  const r = cellRect(view, c);
  return r.x >= inset - 0.5 && r.y >= inset - 0.5 && r.x + r.w <= vw - inset + 0.5 && r.y + r.h <= vh - inset + 0.5 && !avoid.some(a => hits(r, a));
}

// Auto-zoom: is the 3x3 around c (clipped to the board) fully on screen at MIN_CELL px a square or more, and is
// every square in opts.cells (the lit moves) clear? opts: { inset, avoid, cells } as in room.
export function nearInView(view, c, [vw, vh], bd, opts = {}) {
  if (C * view.s < MIN_CELL - 0.01) return false;
  const i = opts.inset || 0;
  const px = x => view.x + (M + x * C) * view.s, py = y => view.y + (M + y * C) * view.s;
  const x0 = Math.max(0, c.x - 1), x1 = Math.min(bd.width, c.x + 2), y0 = Math.max(0, c.y - 1), y1 = Math.min(bd.height, c.y + 2);
  return px(x0) >= i - 0.5 && py(y0) >= i - 0.5 && px(x1) <= vw - i + 0.5 && py(y1) <= vh - i + 0.5
    && (opts.cells || []).every(t => cellClear(view, t, { ...opts, size: [vw, vh] }));
}

// Pan limits. Without pad a board smaller than the viewport is centred and a larger one stops at its edges; pad
// lets it go that many px past them, so an edge or corner square can be brought out from under a button.
export function clampView(view, { size: [vw, vh], board: [W, H], pad = 0 }) {
  const axis = (p, b, v) => (!pad && b <= v ? (v - b) / 2 : Math.min(Math.max(0, v - b) + pad, Math.max(Math.min(0, v - b) - pad, p)));
  return { ...view, x: axis(view.x, W * view.s, vw), y: axis(view.y, H * view.s, vh) };
}

// Where to look so that c and every square in cells are clear: centred in the whole viewport, then in the space
// left of and below each floating button, at scale s0 and then a step (1.25x) smaller each time down to room.lo,
// where it falls back to centring on them.
export function frameView(s0, c, cells, room) {
  const [vw, vh] = room.size, want = [c, ...cells];
  const mx = (Math.min(...want.map(t => t.x)) + Math.max(...want.map(t => t.x)) + 1) / 2;
  const my = (Math.min(...want.map(t => t.y)) + Math.max(...want.map(t => t.y)) + 1) / 2;
  const areas = [[0, 0, vw, vh], ...(room.avoid || []).flatMap(a => [[0, 0, a.x, vh], [0, a.y + a.h, vw, vh]])];
  for (let s = Math.min(room.hi, Math.max(room.lo, s0)); ; s = Math.max(room.lo, s / 1.25)) {
    for (const [x0, y0, x1, y1] of areas) {
      const v = clampView({ s, x: (x0 + x1) / 2 - (M + mx * C) * s, y: (y0 + y1) / 2 - (M + my * C) * s }, room);
      if (want.every(t => cellClear(v, t, room))) return v;
    }
    if (s <= room.lo) return clampView({ s, x: vw / 2 - (M + mx * C) * s, y: vh / 2 - (M + my * C) * s }, room);
  }
}

// opts: { v, content, names[seat], targets: [{ x, y, label, pick }], home: {x, y} | null (the active hero),
//   onInspect(c), onNear(c) for a single tap on an unlit square (defaults to onInspect), tilesLeft,
//   onFocusTarget(target | undefined) when a square takes keyboard focus }
export function mountBoard(host, opts) {
  const { v, content, names, targets = [], home = null, onInspect } = opts;
  const bd = content.board;
  const W = bd.width * C + 2 * M, H = bd.height * C + 2 * M;
  const tmap = new Map(targets.map(t => [key(t), t]));

  const wrap = document.createElement('div');
  wrap.className = 'map';
  const tools = document.createElement('div');
  tools.className = 'map-tools';
  const view = document.createElement('div');
  view.className = 'viewport';
  view.style.setProperty('--board-ratio', `${W} / ${H}`);
  const root = svg('svg', { viewBox: `${-M} ${-M} ${W} ${H}`, width: W, height: H, class: 'board-svg', role: 'grid', 'aria-label': `Keep map, ${bd.height} rows by ${bd.width} columns. Arrow keys move between squares; Enter or Space chooses a lit square or describes another.` });
  view.append(root);
  wrap.append(tools, view);
  host.replaceChildren(wrap);

  // Patterns: unexplored fog and the out-of-board hatch.
  const defs = svg('defs', {}, root);
  const pat = (id, bg, line) => {
    const p = svg('pattern', { id, width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svg('rect', { width: 14, height: 14, class: bg }, p);
    svg('line', { x1: 0, y1: 0, x2: 0, y2: 14, class: line }, p);
  };
  pat('fog', 'fog-bg', 'fog-line');
  pat('off', 'off-bg', 'off-line');
  svg('rect', { x: -M, y: -M, width: W, height: H, class: 'offboard' }, root);

  const ix = contentIndex(content);
  const heroes = v.heroes.filter(h => h && h.coord && (isActive(h) || h.status === ESCAPED));
  for (let y = 0; y < bd.height; y++) {
    const row = svg('g', { role: 'row' }, root);
    for (let x = 0; x < bd.width; x++) {
      const c = { x, y };
      const kind = squareKind(bd, c);
      const t = tmap.get(key(c));
      const g = svg('g', { transform: `translate(${x * C} ${y * C})`, class: `cell sq-${kind}`, role: 'gridcell', tabindex: -1, 'data-cell': key(c) }, row);
      const inst = v.board.tiles[key(c)];
      const revealed = kind !== 'maze' || inst;
      if (kind === 'tower') {
        svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 10, class: 'tower' }, g);
        towerGlyph(g);
      } else if (kind === 'center') {
        svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 4, class: v.board.chamberPlaced ? 'chamber' : 'reserved' }, g);
      } else if (inst) {
        const def = ix.tiles.get(inst.defId);
        svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 4, class: 'floor' }, g);
        if (def.special !== 'none') specialGlyph(g, def.special, 50, 50);
        if (def.mark !== 'none') def.special !== 'none' ? markGlyph(g, def.mark, 26, 28) : markGlyph(g, def.mark, 50, 50);
        entryGlyph(g, inst.entrySide);
      } else {
        svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 4, class: 'fog' }, g);
      }
      for (const side of SIDES) {
        const own = sideAt(v, content, c, side);
        if (revealed && (own === 'wall' || own === 'door' || own === 'gate')) sideGlyph(g, own, EDGE[side]);
        // Open (or unknown) here but shut from the other side, by their wall or a printed wall: a dashed bar inside.
        const word = sideWord(v, content, c, side);
        if (word === 'wall on their side' || word === 'printed wall') blockedGlyph(g, side);
      }
      const here = heroes.filter(h => h.coord.x === x && h.coord.y === y);
      here.forEach((h, i) => {
        const off = here.length === 1 ? [72, 72] : [[30, 30], [70, 30], [30, 70], [70, 70]][i % 4];
        const tg = svg('g', { class: `token seat-${h.seat}${h.status === ESCAPED ? ' escaped' : ''}${h.seat === v.activeSeat ? ' active' : ''}`, transform: `translate(${off[0]} ${off[1]})`, 'aria-hidden': 'true' }, g);
        svg('circle', { r: here.length === 1 ? 19 : 16, class: 'token-disc' }, tg); // off centre, so the room mark still shows
        svg('text', { y: 7, 'text-anchor': 'middle', class: 'token-num' }, tg).textContent = h.seat + 1;
      });
      if (t) svg('rect', { x: 5, y: 5, width: C - 10, height: C - 10, rx: 9, class: 'target' }, g);
      svg('rect', { x: 3, y: 3, width: C - 6, height: C - 6, rx: 10, class: 'focusring' }, g);
      g.setAttribute('aria-label', t ? `${t.label}. ${cellLabel(v, content, c, names)}` : cellLabel(v, content, c, names)); // the move first
    }
  }

  // Board-level overlay on the shared edges: printed walls, fixed doors and gates, fallen portcullises.
  const over = svg('g', { class: 'overlay', 'aria-hidden': 'true' }, root);
  const shared = (at, side) => {
    const [x, y] = at.split(',').map(Number);
    const X = x * C, Y = y * C;
    return { N: [X, Y, X + C, Y], S: [X, Y + C, X + C, Y + C], W: [X, Y, X, Y + C], E: [X + C, Y, X + C, Y + C] }[side];
  };
  for (const w of bd.walls || []) { const [at, side] = w.split('|'); sideGlyph(over, 'wall', shared(at, side), 'fixed'); }
  for (const [e, kind] of Object.entries(bd.edges || {})) { const [at, side] = e.split('|'); sideGlyph(over, kind, shared(at, side), 'fixed'); }
  for (const [e, kind] of Object.entries(v.board.edges || {})) {
    if (kind !== 'gate') continue;
    const [at, side] = e.split('|');
    sideGlyph(over, 'gate', shared(at, side), 'fallen');
  }
  const [a, b = a] = bd.center; // one cell (spec v3) or the older two
  const mid = { x: ((a.x + b.x) / 2 + 0.5) * C, y: ((a.y + b.y) / 2 + 0.5) * C };
  if (v.board.chamberPlaced) chestGlyph(over, mid.x, mid.y);
  else svg('text', { x: mid.x, y: mid.y + 8, class: 'reserved-label', 'text-anchor': 'middle' }, over).textContent = 'Chamber';
  svg('rect', { x: 0, y: 0, width: bd.width * C, height: bd.height * C, class: 'board-edge' }, over);

  // ---- Viewport maths: board units to screen pixels, translate then scale.
  const size = () => [view.clientWidth, view.clientHeight];
  const fitScale = () => { const [vw, vh] = size(); return Math.min(vw / W, vh / H) || 0.3; };
  const limits = () => { const f = fitScale(); return [f, Math.max(f * 1.01, 1.4)]; };
  const apply = () => { root.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.s})`; };
  // The viewport as frameView sees it, measured now: the map buttons count only where they float over the map.
  const room = () => {
    const [vw, vh] = size(), [lo, hi] = limits();
    const vr = view.getBoundingClientRect(), tr = tools.getBoundingClientRect();
    const a = { x: tr.left - vr.left - INSET, y: tr.top - vr.top - INSET, w: tr.width + 2 * INSET, h: tr.height + 2 * INSET };
    const avoid = tr.width && hits(a, { x: 0, y: 0, w: vw, h: vh }) ? [a] : [];
    return { size: [vw, vh], inset: INSET, avoid, pad: avoid.length ? a.w + INSET : 0, board: [W, H], lo, hi };
  };
  const clamp = () => {
    const [lo, hi] = limits();
    vp.s = Math.min(hi, Math.max(lo, vp.s));
    Object.assign(vp, clampView(vp, room()));
    apply();
  };
  const glide = on => root.classList.toggle('glide', on); // a CSS transition; style.css turns it off under reduced motion
  const fit = () => { const [vw, vh] = size(), s = fitScale(); vp = { s, x: (vw - W * s) / 2, y: (vh - H * s) / 2, fit: true }; clamp(); };
  const zoomAt = (f, px, py) => {
    const s0 = vp.s, [lo, hi] = limits();
    const s = Math.min(hi, Math.max(lo, s0 * f));
    vp.x = px - (px - vp.x) * (s / s0);
    vp.y = py - (py - vp.y) * (s / s0);
    vp.s = s;
    vp.fit = false;
    clamp();
  };
  const centreOn = (c, minScale = 0) => {
    const [vw, vh] = size();
    vp.s = Math.max(vp.s, minScale);
    vp.x = vw / 2 - (M + (c.x + 0.5) * C) * vp.s;
    vp.y = vh / 2 - (M + (c.y + 0.5) * C) * vp.s;
    vp.fit = false;
    clamp();
  };
  // The hero and every lit square clear of the edges and the buttons, zoomed to at least minScale where that fits.
  const frame = (minScale = 0) => { Object.assign(vp, frameView(Math.max(vp.s, minScale), home, targets, room()), { fit: false }); apply(); };
  // Keep a square in view when keyboard focus moves off the visible part.
  const reveal = c => {
    const [vw, vh] = size();
    const x0 = vp.x + (M + c.x * C) * vp.s, y0 = vp.y + (M + c.y * C) * vp.s, d = C * vp.s;
    if (x0 < 0 || y0 < 0 || x0 + d > vw || y0 + d > vh) centreOn(c);
  };
  if (vp) apply();
  // When the active hero (or their square) changes, zoom in on them unless their neighbourhood is already
  // readable; on every render, reframe if a lit square is clipped or under a map button. After layout (the
  // ResizeObserver), and dropped if the user starts a gesture.
  const zk = home && `${v.activeSeat} ${key(home)}`;
  let wantZoom = !!zk && zk !== zoomKey, wantClear = !!home && targets.length > 0;
  zoomKey = zk;
  const autoZoom = () => {
    if (!vp || !(wantZoom || wantClear)) return;
    const r = room();
    const ok = wantZoom ? nearInView(vp, home, r.size, bd, { ...r, cells: targets }) : targets.every(t => cellClear(vp, t, r));
    if (!ok) { glide(true); frame(wantZoom ? MIN_CELL / C : 0); }
    wantZoom = wantClear = false;
  };
  ro?.disconnect();
  ro = new ResizeObserver(() => { if (!view.clientWidth) return; if (!vp || vp.fit) fit(); else clamp(); autoZoom(); });
  ro.observe(view);

  // ---- Tools: buttons, so they work by touch, mouse and keyboard alike.
  const middle = () => { const [vw, vh] = size(); return [vw / 2, vh / 2]; };
  // icon: an SVG path drawn in place of the text where the tools float over the map (phone portrait, CSS).
  const tool = (text, label, fn, icon) => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = text;
    if (icon) {
      btn.replaceChildren(svg('svg', { viewBox: '0 0 24 24', class: 'ico', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }), Object.assign(document.createElement('span'), { className: 'tool-text', textContent: text }));
      svg('path', { d: icon }, btn.firstChild);
    }
    btn.setAttribute('aria-label', label);
    btn.onclick = () => { if (!vp) return; glide(true); fn(); };
    tools.append(btn);
  };
  tool('−', 'Zoom out', () => zoomAt(1 / 1.4, ...middle()));
  tool('+', 'Zoom in', () => zoomAt(1.4, ...middle()));
  tool('Fit board', `Fit board: all ${bd.width * bd.height} squares`, fit, 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
  if (home) tool('Centre on hero', 'Centre on the active hero', () => frame(fitScale() * 2),'M12 2v4M12 18v4M2 12h4M18 12h4M17 12a5 5 0 1 1-10 0a5 5 0 1 1 10 0');
  if (opts.tilesLeft !== undefined) {
    const s = document.createElement('span');
    s.className = 'tiles';
    s.textContent = `${opts.tilesLeft} tiles left`;
    tools.append(s);
  }

  // ---- Focus: one roving tab stop in the grid.
  const cellAt = k => root.querySelector(`[data-cell="${k}"]`);
  const parse = k => { const [x, y] = k.split(',').map(Number); return { x, y }; };
  if ((home && key(home)) !== lastHome) { focusKey = null; lastHome = home && key(home); } // focus follows a new turn or move
  const start = (focusKey && cellAt(focusKey) && focusKey) || (home && key(home)) || (targets[0] && key(targets[0])) || '0,0';
  cellAt(start).setAttribute('tabindex', 0);
  const setFocus = (k, move = true) => {
    for (const e of root.querySelectorAll('[data-cell][tabindex="0"]')) e.setAttribute('tabindex', -1);
    const e = cellAt(k);
    e.setAttribute('tabindex', 0);
    focusKey = k;
    if (move) { e.focus({ preventScroll: true }); if (vp) { glide(true); reveal(parse(k)); } }
  };
  root.addEventListener('focusin', e => { const cell = e.target.closest?.('[data-cell]'); if (cell) { focusKey = cell.dataset.cell; opts.onFocusTarget?.(tmap.get(focusKey)); } });

  // A choice on a square: a lit square takes its move; a tap on the active hero recentres; a single tap on
  // anything else gives its one-line reason (onNear); a second tap within 350 ms, a long press or Enter on an
  // unlit square opens the description.
  const activate = (k, how) => {
    const now = performance.now();
    const second = how === 'tap' && lastTap.at === k && now - lastTap.t < 350;
    lastTap = { at: k, t: now };
    const t = tmap.get(k);
    setFocus(k, false);
    if (second) return onInspect(parse(k));
    if (t) { focusKey = null; return t.pick(); }
    if (how === 'tap' && home && key(home) === k) { if (vp) { glide(true); frame(fitScale() * 2); } return; }
    (how === 'tap' && opts.onNear ? opts.onNear : onInspect)(parse(k));
  };

  // ---- Pointer gestures: one finger or the mouse drags; two fingers pinch; a long press inspects.
  const pts = new Map();
  let drag = null, suppress = false, press = null;
  view.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { if (e.button !== 0) return; pts.clear(); }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    wantZoom = wantClear = false; // the user has the map now: never zoom under their fingers
    glide(false);
    clearTimeout(press);
    if (pts.size === 1) {
      drag = { x0: e.clientX, y0: e.clientY, moved: false };
      suppress = false;
      const cell = e.target.closest?.('[data-cell]');
      if (cell) press = setTimeout(() => { if (!drag.moved && pts.size === 1) { suppress = true; setFocus(cell.dataset.cell, false); onInspect(parse(cell.dataset.cell)); } }, 550);
    } else if (drag) drag.moved = true;
  });
  view.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId);
    if (!prev || !vp) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      if (!drag.moved && Math.hypot(cur.x - drag.x0, cur.y - drag.y0) < 8) return;
      if (!drag.moved) { drag.moved = true; clearTimeout(press); try { view.setPointerCapture(e.pointerId); } catch {} }
      vp.x += cur.x - prev.x;
      vp.y += cur.y - prev.y;
      vp.fit = false;
      clamp();
    } else if (pts.size === 2) {
      const other = [...pts].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      const r = view.getBoundingClientRect();
      vp.x += (cur.x - prev.x) / 2;
      vp.y += (cur.y - prev.y) / 2;
      if (d0 > 0) zoomAt(d1 / d0, (cur.x + other.x) / 2 - r.left, (cur.y + other.y) / 2 - r.top);
    }
    pts.set(e.pointerId, cur);
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    clearTimeout(press);
    if (drag?.moved) suppress = true;
  };
  for (const t of ['pointerup', 'pointercancel']) view.addEventListener(t, up);
  view.addEventListener('wheel', e => {
    if (!vp) return;
    e.preventDefault();
    glide(false);
    const r = view.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  root.addEventListener('click', e => {
    if (suppress) { suppress = false; return; }
    const cell = e.target.closest('[data-cell]');
    if (cell) activate(cell.dataset.cell, 'tap');
  });
  root.addEventListener('contextmenu', e => e.preventDefault()); // a long press must not open the menu

  // ---- Keyboard: arrows move focus orthogonally, Enter or Space chooses, + and - zoom.
  const STEP = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  root.addEventListener('keydown', e => {
    const cell = e.target.closest?.('[data-cell]');
    if (!cell) return;
    const c = parse(cell.dataset.cell);
    if (STEP[e.key]) {
      e.preventDefault();
      const n = { x: c.x + STEP[e.key][0], y: c.y + STEP[e.key][1] };
      if (squareKind(bd, n) !== 'off') setFocus(key(n));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(cell.dataset.cell, 'key');
    } else if ((e.key === '+' || e.key === '=' || e.key === '-') && vp) {
      e.preventDefault();
      glide(true);
      zoomAt(e.key === '-' ? 1 / 1.4 : 1.4, ...middle());
    }
  });

  return { focus: () => cellAt(focusKey && cellAt(focusKey) ? focusKey : start)?.focus({ preventScroll: true }) };
}
