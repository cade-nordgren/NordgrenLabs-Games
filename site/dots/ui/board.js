// The board as SVG, drawn from the engine's geometry. Lines and dots keep a fixed screen width at any board size
// (non-scaling strokes; a dot is a zero-length line with a round cap); boxes and their letters scale with the board.
// Taps go to the nearest available line within reach, so thin lines still get generous targets.
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
// Layout units are scaled by K so letters get ordinary font sizes (some browsers round tiny ones).
const K = 100, PAD = 0.32 * K;
// How far from a line a tap still picks it, in edge lengths: under the distance to a face's centre, so a tap in the
// middle of a box picks nothing rather than a random side.
const REACH = { square: 0.45 * K, tri: 0.25 * K, hex: 0.5 * K };
const LETTER = { square: 0.56 * K, tri: 0.3 * K, hex: 0.86 * K };

const pt = (geo, v) => ({ x: geo.vertices[v].x * K, y: geo.vertices[v].y * K });
const mid = (geo, e) => { const a = pt(geo, geo.edges[e].a), b = pt(geo, geo.edges[e].b); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
function distTo(geo, e, p) {
  const a = pt(geo, geo.edges[e].a), b = pt(geo, geo.edges[e].b);
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const polygon = (geo, f) => geo.faces[f].verts.map(v => { const p = pt(geo, v); return `${p.x},${p.y}`; }).join(' ');

// A small outline of a board for pickers and rules: boxes in a soft fill, edges thin. pre: edge ids of starting
// lines (Swedish or Icelandic), drawn bold on top so the preview shows how the game will begin.
export function thumb(geo, pre = []) {
  const svg = svgEl('svg', { viewBox: `${-0.2 * K} ${-0.2 * K} ${(geo.width + 0.4) * K} ${(geo.height + 0.4) * K}`, class: 'thumb', 'aria-hidden': 'true' });
  const g = svgEl('g');
  geo.faces.forEach((_, f) => g.append(svgEl('polygon', { points: polygon(geo, f) })));
  svg.append(g);
  if (pre.length) svg.append(svgEl('path', { class: 'pre', d: pre.map(e => { const a = pt(geo, geo.edges[e].a), b = pt(geo, geo.edges[e].b); return `M${a.x} ${a.y}L${b.x} ${b.y}`; }).join('') }));
  return svg;
}

// opts.onDraw(edge) makes it playable. paint(view) updates it; view = { edges, faces, players, legal (Set or null),
// fresh (edge just drawn, animates), now (face being counted), counted (Set of faces counted so far, or null) }.
export function makeBoard(geo, opts = {}) {
  const svg = svgEl('svg', { viewBox: `${-PAD} ${-PAD} ${geo.width * K + 2 * PAD} ${geo.height * K + 2 * PAD}`, class: `board ${geo.kind}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.style.setProperty('--letter', LETTER[geo.kind]);
  const faces = svgEl('g', { class: 'faces' }), lines = svgEl('g', { class: 'lines' }), dots = svgEl('g', { class: 'dots' }), marks = svgEl('g', { class: 'marks' });
  const faceEls = geo.faces.map((_, f) => faces.appendChild(svgEl('polygon', { points: polygon(geo, f) })));
  const edgeEls = geo.edges.map(({ a, b }) => {
    const p = pt(geo, a), q = pt(geo, b);
    return lines.appendChild(svgEl('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: 'edge' }));
  });
  const preview = svgEl('line', { class: 'preview', visibility: 'hidden' }), ring = svgEl('line', { class: 'cursor', visibility: 'hidden' });
  geo.vertices.forEach((_, v) => { const p = pt(geo, v); dots.append(svgEl('path', { d: `M${p.x} ${p.y}h0` })); });
  const markEls = geo.faces.map(f => marks.appendChild(svgEl('text', { x: f.cx * K, y: f.cy * K })));
  svg.append(faces, lines, preview, ring, dots, marks);

  let view = null, cursor = -1, shown = -1, keyed = false, lastMover = null; // keyed: the cursor shows only for keyboard focus
  const legal = e => !!view?.legal?.has(e);
  const place = (el, e) => {
    if (e < 0) return el.setAttribute('visibility', 'hidden');
    const p = pt(geo, geo.edges[e].a), q = pt(geo, geo.edges[e].b);
    for (const [k, v] of Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y })) el.setAttribute(k, v);
    el.setAttribute('visibility', 'visible');
  };
  const showPreview = e => {
    shown = legal(e) ? e : -1;
    place(preview, shown);
    if (shown >= 0) preview.style.stroke = `var(--c-${view.players[view.mover].color}-line)`;
  };

  function paint(v) {
    view = v;
    const pl = i => v.players[i].color;
    edgeEls.forEach((el, e) => {
      const by = v.edges[e];
      el.classList.toggle('drawn', by !== -1);
      el.classList.toggle('pre', by === -2); // a starting line: drawn by nobody, never legal
      el.classList.toggle('open', by === -1 && legal(e));
      el.classList.toggle('fresh', e === v.fresh);
      el.style.stroke = by >= 0 ? `var(--c-${pl(by)}-line)` : '';
    });
    faceEls.forEach((el, f) => {
      const own = v.faces[f], hide = v.counted && !v.counted.has(f) && v.now !== f;
      el.style.fill = own >= 0 ? `var(--c-${pl(own)}-fill)` : '';
      el.classList.toggle('claimed', own >= 0);
      el.classList.toggle('now', v.now === f);
      el.classList.toggle('wait', !!hide);
      el.classList.toggle('fresh', own >= 0 && !!v.freshFaces?.includes(f));
      const m = markEls[f];
      m.textContent = own >= 0 ? v.players[own].marker : '';
      m.style.fill = own >= 0 ? `var(--c-${pl(own)}-ink)` : '';
      m.classList.toggle('wait', !!hide);
    });
    svg.classList.toggle('locked', !v.legal || !v.legal.size);
    // A hover preview belongs to the player who was moving: drop it when the mover changes (a new turn, or a rematch
    // on the same board, which reuses this drawing), and repaint its colour otherwise.
    showPreview(v.mover === lastMover ? shown : -1);
    lastMover = v.mover;
    if (cursor >= 0 && !legal(cursor) && v.legal?.size) cursor = nearest(mid(geo, cursor), [...v.legal]);
    place(ring, keyed && document.activeElement === svg && legal(cursor) ? cursor : -1);
    if (opts.onDraw) describe();
  }

  // Board units from a pointer event.
  const unit = ev => { const m = svg.getScreenCTM(); if (!m) return null; const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
  const pick = ev => {
    const p = unit(ev);
    if (!p || !view?.legal) return -1;
    let best = -1, bd = REACH[geo.kind];
    for (const e of view.legal) { const d = distTo(geo, e, p); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  const nearest = (p, list) => list.reduce((b, e) => { const m = mid(geo, e), d = Math.hypot(m.x - p.x, m.y - p.y); return d < b.d ? { e, d } : b; }, { e: -1, d: Infinity }).e;

  if (opts.onDraw) {
    svg.tabIndex = 0;
    svg.setAttribute('role', 'application');
    svg.setAttribute('aria-roledescription', 'board');
    const live = opts.live; // a status element the cursor's line is described in
    var describe = () => {
      if (!live || document.activeElement !== svg) return;
      if (!view.legal?.size) { live.textContent = view.lockedText || 'No line to draw now.'; return; }
      if (!legal(cursor)) cursor = nearest({ x: 0, y: 0 }, [...view.legal]); // focused without a cursor yet (focus() from script)
      const e = cursor, m = mid(geo, e), a = pt(geo, geo.edges[e].a), b = pt(geo, geo.edges[e].b);
      const dir = Math.abs(a.y - b.y) < 1e-6 ? 'Horizontal' : Math.abs(a.x - b.x) < 1e-6 ? 'Vertical' : 'Slanted';
      const col = Math.round(m.x / K * 2) / 2 + 1, row = Math.round(m.y / K * 2) / 2 + 1;
      live.textContent = `${dir} line near column ${geo.kind === 'square' ? Math.ceil(col - 0.5) : Math.round(col)}, row ${geo.kind === 'square' ? Math.ceil(row - 0.5) : Math.round(row)}. Enter to draw.`;
    };
    // Touch: the line under the finger previews while it is down and is drawn on lift; a mouse previews on hover.
    let down = null;
    svg.addEventListener('pointerdown', ev => {
      if (!ev.isPrimary) return;
      down = ev.pointerId;
      svg.setPointerCapture?.(ev.pointerId);
      showPreview(pick(ev));
    });
    svg.addEventListener('pointermove', ev => { if (down === ev.pointerId || ev.pointerType === 'mouse') showPreview(pick(ev)); });
    svg.addEventListener('pointerup', ev => {
      if (down !== ev.pointerId) return;
      down = null;
      const e = pick(ev);
      if (ev.pointerType !== 'mouse') showPreview(-1);
      if (e >= 0) { cursor = e; opts.onDraw(e); }
    });
    svg.addEventListener('pointercancel', () => { down = null; showPreview(-1); });
    svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') showPreview(-1); });
    // Keyboard: arrows move a cursor between the lines that can be drawn now, Enter or Space draws it.
    const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    svg.addEventListener('keydown', ev => {
      const list = [...(view?.legal || [])];
      if ((ev.key === 'Enter' || ev.key === ' ') && legal(cursor)) { ev.preventDefault(); opts.onDraw(cursor); return; }
      const d = DIRS[ev.key];
      if (!d || !list.length) return;
      ev.preventDefault();
      keyed = true;
      if (!legal(cursor)) { cursor = nearest({ x: 0, y: 0 }, list); }
      else {
        const m = mid(geo, cursor);
        let best = -1, bs = Infinity;
        for (const e of list) {
          const q = mid(geo, e), dx = q.x - m.x, dy = q.y - m.y, along = dx * d[0] + dy * d[1], across = Math.abs(dx * d[1] - dy * d[0]);
          if (along < 0.05 * K) continue;
          const s = along + 2.5 * across;
          if (s < bs) { bs = s; best = e; }
        }
        if (best >= 0) cursor = best;
      }
      place(ring, cursor);
      describe();
    });
    svg.addEventListener('focus', () => {
      keyed = svg.matches(':focus-visible');
      if (!keyed) return;
      if (!legal(cursor) && view?.legal?.size) cursor = nearest({ x: 0, y: 0 }, [...view.legal]);
      place(ring, cursor); describe();
    });
    svg.addEventListener('blur', () => { keyed = false; place(ring, -1); });
  }
  return { svg, paint, faceEls };
}
