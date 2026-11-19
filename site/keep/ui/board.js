// Board drawing: a pure projection of a view() onto SVG. No rules here; geometry comes from the
// engine's own board helpers and the targets the caller passes are legal actions from the engine.
import { squareKind, sideAt, key } from '../engine/board.js';
import { contentIndex } from '../content/schema.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 100; // one square
const SIDES = ['N', 'E', 'S', 'W'];
// Each side as a line along the square's inner edge (inset so neighbouring squares both show).
const EDGE = { N: [6, 6, 94, 6], E: [94, 6, 94, 94], S: [6, 94, 94, 94], W: [6, 6, 6, 94] };

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
export const place = c => `column ${c.x + 1}, row ${c.y + 1}`;

// The four dot types as shapes as well as colours, so colour is never the only cue.
function markGlyph(g, mark, cx, cy) {
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

function sideGlyph(g, kind, side) {
  const [x1, y1, x2, y2] = EDGE[side];
  if (kind === 'wall') return svg('line', { x1, y1, x2, y2, class: 'wall' }, g);
  if (kind !== 'door' && kind !== 'gate') return;
  // Short wall stubs at both corners, the door or portcullis across the middle third.
  const horiz = y1 === y2;
  const a = horiz ? [x1, y1, 32, y2] : [x1, y1, x2, 32];
  const b = horiz ? [68, y1, x2, y2] : [x1, 68, x2, y2];
  for (const [p, q, r, s] of [a, b]) svg('line', { x1: p, y1: q, x2: r, y2: s, class: 'wall' }, g);
  if (kind === 'door') {
    svg('rect', horiz ? { x: 32, y: y1 - 6, width: 36, height: 12, rx: 3, class: 'door' } : { x: x1 - 6, y: 32, width: 12, height: 36, rx: 3, class: 'door' }, g);
  } else {
    for (let t = 36; t <= 64; t += 7) svg('line', horiz ? { x1: t, y1: y1 - 8, x2: t, y2: y1 + 8, class: 'gate' } : { x1: x1 - 8, y1: t, x2: x1 + 8, y2: t, class: 'gate' }, g);
    svg('line', horiz ? { x1: 32, y1, x2: 68, y2: y1, class: 'gate' } : { x1, y1: 32, x2: x1, y2: 68, class: 'gate' }, g);
  }
}

// A small original keep: walls with crenellations and a gate.
function towerGlyph(g) {
  svg('path', { d: 'M28 72V38h8v-8h8v8h12v-8h8v8h8v34z', class: 'keep' }, g);
  svg('path', { d: 'M44 72V58a6 6 0 0 1 12 0v14z', class: 'keep-gate' }, g);
}

function chestGlyph(g, cx, cy) {
  svg('rect', { x: cx - 20, y: cy - 6, width: 40, height: 24, rx: 3, class: 'chest' }, g);
  svg('path', { d: `M${cx - 20} ${cy - 6}a20 12 0 0 1 40 0z`, class: 'chest' }, g);
  svg('rect', { x: cx - 4, y: cy - 2, width: 8, height: 9, rx: 1.5, class: 'chest-lock' }, g);
}

// opts: { v (a view), content, names[seat], targets: [{ x, y, label, pick }], highlight: [{x, y}] }
export function drawBoard(host, { v, content, names, targets = [] }) {
  const bd = content.board;
  const root = svg('svg', { viewBox: `-4 -4 ${bd.width * C + 8} ${bd.height * C + 8}`, class: 'board-svg', role: 'group', 'aria-label': 'Keep map' });
  const defs = svg('defs', {}, root);
  const pat = svg('pattern', { id: 'fog', width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  svg('rect', { width: 14, height: 14, class: 'fog-bg' }, pat);
  svg('line', { x1: 0, y1: 0, x2: 0, y2: 14, class: 'fog-line' }, pat);
  const ix = contentIndex(content);
  const placed = v.board.chamberPlaced;
  for (let y = 0; y < bd.height; y++) for (let x = 0; x < bd.width; x++) {
    const c = { x, y };
    const kind = squareKind(bd, c);
    const g = svg('g', { transform: `translate(${x * C} ${y * C})`, class: `sq sq-${kind}` }, root);
    const inst = v.board.tiles[key(c)];
    let label;
    if (kind === 'tower') {
      svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 10, class: 'tower' }, g);
      towerGlyph(g);
      label = 'tower';
    } else if (kind === 'center') {
      svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 4, class: placed ? 'chamber' : 'reserved' }, g);
      label = placed ? 'treasure chamber' : 'treasure chamber, not yet entered';
    } else if (inst) {
      const def = ix.tiles.get(inst.defId);
      svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 4, class: 'floor' }, g);
      if (def.special !== 'none') specialGlyph(g, def.special, 50, 50);
      if (def.mark !== 'none') def.special !== 'none' ? markGlyph(g, def.mark, 24, 26) : markGlyph(g, def.mark, 50, 50);
      label = tileWords(def);
    } else {
      svg('rect', { x: 2, y: 2, width: 96, height: 96, rx: 4, class: 'fog' }, g);
      label = 'unexplored';
    }
    if (kind === 'tower' || inst || (kind === 'center' && placed)) for (const side of SIDES) sideGlyph(g, sideAt(v, content, c, side), side);
    g.dataset.label = `${label}, ${place(c)}`;
  }
  if (placed) {
    const [a, b] = bd.center;
    chestGlyph(svg('g', {}, root), ((a.x + b.x) / 2 + 0.5) * C, ((a.y + b.y) / 2 + 0.5) * C);
  } else {
    const [a, b] = bd.center;
    const t = svg('text', { x: ((a.x + b.x) / 2 + 0.5) * C, y: ((a.y + b.y) / 2 + 0.5) * C + 8, class: 'reserved-label', 'text-anchor': 'middle' }, root);
    t.textContent = 'Chamber';
  }
  // Portcullises that fell behind a red-room entrant (RB 6.7) sit on the shared edge.
  for (const [edge, kind] of Object.entries(v.board.edges || {})) {
    if (kind !== 'gate') continue;
    const [at, side] = edge.split('|');
    const [x, y] = at.split(',').map(Number);
    sideGlyph(svg('g', { transform: `translate(${x * C} ${y * C})`, class: 'fallen' }, root), 'gate', side === 'E' ? 'E' : 'S');
  }
  // Heroes: tokens with the seat number; several share a tower or the chamber.
  const bySquare = {};
  for (const h of v.heroes) if (h && h.coord && (h.status === 'inside' || h.status === 'escaped')) (bySquare[key(h.coord)] ||= []).push(h);
  for (const [at, hs] of Object.entries(bySquare)) {
    const [x, y] = at.split(',').map(Number);
    hs.forEach((h, i) => {
      const off = hs.length === 1 ? [72, 72] : [[30, 30], [70, 30], [30, 70], [70, 70]][i];
      const tg = svg('g', { class: `token seat-${h.seat}${h.status === 'escaped' ? ' escaped' : ''}${h.seat === v.activeSeat ? ' active' : ''}`, transform: `translate(${x * C + off[0]} ${y * C + off[1]})` }, root);
      svg('circle', { r: hs.length === 1 ? 19 : 17, class: 'token-disc' }, tg); // off centre, so the room mark still shows
      const t = svg('text', { y: 7, 'text-anchor': 'middle', class: 'token-num' }, tg);
      t.textContent = h.seat + 1;
      const title = svg('title', {}, tg);
      title.textContent = `${names[h.seat]}${h.status === 'escaped' ? ', escaped' : ''}`;
    });
  }
  // Legal targets from the engine: focusable, tappable, labelled.
  for (const t of targets) {
    const r = svg('rect', { x: t.x * C + 4, y: t.y * C + 4, width: C - 8, height: C - 8, rx: 8, class: 'target', tabindex: 0, role: 'button', 'aria-label': t.label }, root);
    const go = e => { e.preventDefault(); t.pick(); };
    r.addEventListener('click', go);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  }
  host.replaceChildren(root);
  return root;
}
