// Player colours. The ids are the server's (salad-server-contract.md, in its order); hex and ink are from the design
// canvas (docs/plans/salad-canvas/contrast.js). One hex in both themes: measured below against the light and dark table
// panels the colours sit on, and the ink (white or #1d1d1f) on the colour.
export const COLORS = [
  { id: 'cobalt', name: 'Cobalt', hex: '#1f6fd6', ink: '#fff' },
  { id: 'scarlet', name: 'Scarlet', hex: '#d42f3a', ink: '#fff' },
  { id: 'forest', name: 'Forest', hex: '#1c7f3e', ink: '#fff' },
  { id: 'tangerine', name: 'Tangerine', hex: '#cf6900', ink: '#1d1d1f' },
  { id: 'violet', name: 'Violet', hex: '#9850dc', ink: '#fff' },
  { id: 'teal', name: 'Teal', hex: '#0c7c78', ink: '#fff' },
  { id: 'rose', name: 'Rose', hex: '#cc2f7c', ink: '#fff' },
  { id: 'gold', name: 'Gold', hex: '#b07f00', ink: '#1d1d1f' },
  { id: 'slate', name: 'Slate', hex: '#62738a', ink: '#fff' },
  { id: 'sky', name: 'Sky', hex: '#1f93c9', ink: '#1d1d1f' },
];
export const color = id => COLORS.find(c => c.id === id) || COLORS[8];

const rgb = h => (h.length === 4 ? [1, 2, 3].map(i => parseInt(h[i] + h[i], 16)) : [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = h => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Panels: 90% white or 88% #1c1c1e over the felt centre (contrast.js), the cream page and the dark glass.
const SURFACES = ['#e9f1ed', '#1d2623', '#f6f3ec', '#ffffff', '#1c1c1e'];
for (const c of COLORS) {
  console.assert(contrast(c.hex, c.ink) >= 4.5, `${c.id}: ink on colour`);
  for (const s of SURFACES) console.assert(contrast(c.hex, s) >= 3, `${c.id}: mark on ${s}`);
}
console.assert(contrast('#000000', '#ffffff') > 20.9, 'contrast self-check');

// Avatar circle with the initial: the colour and the letter, so identity never rests on colour alone.
export function avatar(seat, cls = 'av') {
  const c = color(seat.color), a = document.createElement('span');
  a.className = cls;
  a.style.background = c.hex;
  a.style.color = c.ink;
  a.textContent = [...(seat.name || '?')][0].toUpperCase();
  a.setAttribute('aria-hidden', 'true');
  return a;
}
