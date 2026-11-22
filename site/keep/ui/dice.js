// Dice on screen. A D12 is a CSS 3D regular dodecahedron (twelve pentagon faces, numbered 1 to 12 with opposite
// faces summing to 13, like a real D12); a D6 (the dark room) is Bank's cube (site/bank/index.html, "On-screen dice").
// They only present a roll the engine already made from its seeded generator; nothing here picks a number.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAND = 950; // ms, Bank's .9s turn plus a beat

// ---- Dodecahedron geometry, in CSS axes (x right, y down, z towards the viewer).
const PHI = (1 + Math.sqrt(5)) / 2;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const VERTS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) VERTS.push([x, y, z]);
for (const a of [-1, 1]) for (const b of [-1, 1]) VERTS.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
const NORMALS = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) NORMALS.push([0, a * PHI, b], [a, 0, b * PHI], [a * PHI, b, 0]);
// One face's frame: z its outward normal, y from its first corner towards its centre (so that corner is "up" on the
// face, as on screen), x = y cross z, so x, y, z keep the hand of the CSS axes and no face is drawn mirrored.
function frame(n) {
  const z = unit(n), top = Math.max(...VERTS.map(v => dot(v, z)));
  const ring = VERTS.filter(v => dot(v, z) > top - 1e-9); // the face's five corners
  const c = ring.reduce((s, v) => s.map((t, i) => t + v[i] / 5), [0, 0, 0]);
  const y = unit(sub(c, ring[0]));
  return { x: cross(y, z), y, z, c, ring };
}
// Turn the solid so face 0 looks at the viewer, upright: a die with no transform shows face 0.
const F0 = frame(NORMALS[0]);
const turn = v => [dot(v, F0.x), dot(v, F0.y), dot(v, F0.z)];
const EDGE = 2 / PHI; // the edge length of the coordinates above; D12 below is in units of one edge
export const D12 = {
  inradius: Math.hypot(...F0.c) / EDGE, // centre of the die to the middle of a face
  pentagon: 1 / (2 * Math.sin(Math.PI / 5)), // middle of a face to its corners
  faces: NORMALS.map(n => { const f = frame(n); return { x: turn(f.x), y: turn(f.y), z: turn(f.z), ring: f.ring.map(v => turn(v).map(t => t / EDGE)) }; }),
};
D12.opposite = D12.faces.map(f => D12.faces.findIndex(g => dot(f.z, g.z) < -0.999));
// The numbers on the faces when face 0 shows value: its opposite shows 13 - value, the other pairs the rest of 1 to 12.
export function d12Numbers(value) {
  const nums = Array(12), rest = [1, 2, 3, 4, 5, 6].filter(n => n !== value && n !== 13 - value);
  nums[0] = value;
  nums[D12.opposite[0]] = 13 - value;
  D12.faces.forEach((_, i) => {
    if (nums[i] !== undefined) return;
    const n = rest.shift();
    nums[i] = n;
    nums[D12.opposite[i]] = 13 - n;
  });
  return nums;
}
const r6 = v => +v.toFixed(6);
// Each face's transform: its frame as matrix3d (column-major), then out along its normal by the inradius (--a is
// the edge length, set in CSS).
const FACE_CSS = D12.faces.map(f => `matrix3d(${[...f.x, 0, ...f.y, 0, ...f.z, 0, 0, 0, 0, 1].map(r6).join(',')}) translateZ(calc(var(--a) * ${r6(D12.inradius)}))`);
// At rest the result face looks straight at the viewer (owner, 2026-11-19: with a lean, three faces read about
// equally). Its five neighbours still show round it, foreshortened, and CSS dims them and fades their numbers once
// the die has landed (.landed), so only the result reads.
export const REST = { d12: [0, 0, 0], cube: [0, 0, 0] };
const pose = ([x, y, z]) => `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;

function d12(value) {
  const d = document.createElement('div');
  d.className = 'd12';
  d.style.transform = pose(REST.d12);
  const nums = d12Numbers(Number.isInteger(value) ? value : 12);
  FACE_CSS.forEach((css, i) => {
    const f = document.createElement('div');
    f.className = 'face';
    f.style.transform = css;
    f.textContent = i === 0 && !Number.isInteger(value) ? value : nums[i];
    if (f.textContent === '6' || f.textContent === '9') f.classList.add('mark'); // underlined, as on a real D12
    d.append(f);
  });
  return d;
}

// One cube whose front face shows value (a number, or '?' before a roll). The other faces show other numbers of
// the die only so the tumble reads as a die; they are fixed, not drawn.
function cube(value, sides) {
  const d = document.createElement('div');
  d.className = 'cube';
  for (let k = 0; k < 6; k++) {
    const f = document.createElement('div');
    f.className = 'face';
    f.textContent = k === 0 || !Number.isInteger(value) ? value : ((value - 1 + 5 * k) % sides) + 1;
    d.append(f);
  }
  return d;
}

// Draws dice into host: items [{ value, label?, sides? }], each a D12 (a cube for a D6) with an optional caption.
// With animate, each tumbles from a spin and settles with its value towards the viewer (skipped under reduced
// motion), then the result face is picked out with a small pop. Resolves once they have landed.
export function rollDice(host, items, { sides = 12, animate = true } = {}) {
  const row = document.createElement('div');
  row.className = 'dice';
  row.setAttribute('aria-hidden', 'true'); // the result is said in words (#said and the card text)
  const dice = items.map(({ value, label, sides: n }) => {
    const fig = document.createElement('figure'), k = n || sides, d = k === 12 ? d12(value) : cube(value, k);
    fig.append(d);
    if (label) fig.append(Object.assign(document.createElement('figcaption'), { textContent: label }));
    row.append(fig);
    return d;
  });
  host.replaceChildren(row);
  const land = pop => { for (const d of dice) { d.classList.add('landed'); if (pop) d.parentElement.classList.add('pop'); } };
  if (!animate || still() || document.hidden) { land(false); return Promise.resolve(); }
  // The same transform functions at both ends, so the browser turns the angles, whole spins included, rather than
  // taking the short way between two matrices.
  const rest = d => REST[d.className];
  dice.forEach((d, i) => {
    const [x, y, z] = rest(d);
    d.style.transition = 'none';
    d.style.transform = pose([x - 720 - 50 * i, y + 540 + 70 * i, z + (d.className === 'd12' ? 144 + 72 * i : 0)]);
  });
  row.getBoundingClientRect(); // lay out the spin first, so the turn below is transitioned from it
  for (const d of dice) { d.style.transition = ''; d.style.transform = pose(rest(d)); }
  // A timer, not the transition's end event: the result shows and Continue works even when no frame is drawn (spec v12 fix 5).
  return new Promise(done => setTimeout(() => { land(true); done(); }, LAND));
}
