// Player colours. One source: each colour has a line, a soft box fill and a marker ink per theme, written into CSS
// tokens (--c-<id>-line, -fill, -ink) at load. The contrasts are measured below, not eyeballed.
export const BOARD = { light: '#ffffff', dark: '#1c1c1e' }; // the board card the pieces sit on (--board)

export const COLORS = [
  { id: 'blue', name: 'Blue', light: ['#1f6fd6', '#c0d7f4', '#164e96'], dark: ['#317bd9', '#254772', '#9cc0ed'] },
  { id: 'red', name: 'Red', light: ['#d42f3a', '#f3c5c8', '#942129'], dark: ['#d94852', '#713035', '#eeabaf'] },
  { id: 'green', name: 'Green', light: ['#1f8a43', '#c0deca', '#16612f'], dark: ['#288f4b', '#215032', '#9ccbac'] },
  { id: 'orange', name: 'Orange', light: ['#c65800', '#efd0b8', '#8b3e00'], dark: ['#c85f0a', '#693a15', '#e6b58e'] },
  { id: 'purple', name: 'Purple', light: ['#8a3fd1', '#dec9f2', '#612c92'], dark: ['#9d5ed8', '#563a72', '#d0b2ec'] },
  { id: 'teal', name: 'Teal', light: ['#0e8580', '#bcdddb', '#0a5d5a'], dark: ['#188a85', '#1a4e4c', '#95c9c7'] },
  { id: 'pink', name: 'Pink', light: ['#cc2f7c', '#f1c5da', '#8f2157'], dark: ['#d2488c', '#6e3050', '#eaabca'] },
  { id: 'gold', name: 'Gold', light: ['#9a6c00', '#e3d6b8', '#6c4c00'], dark: ['#a0750f', '#574417', '#d1bd8c'] },
  { id: 'cyan', name: 'Cyan', light: ['#0a7fa6', '#badbe6', '#075974'], dark: ['#1987ab', '#1b4c5d', '#95c8d8'] },
  { id: 'indigo', name: 'Indigo', light: ['#4b4fd0', '#cdcef2', '#353792'], dark: ['#6f72d9', '#414372', '#babbed'] },
  { id: 'brown', name: 'Brown', light: ['#8a5530', '#decfc5', '#613b22'], dark: ['#9f7455', '#574437', '#d1bcad'] },
  { id: 'slate', name: 'Slate', light: ['#5a6b7d', '#d1d6db', '#3f4b58'], dark: ['#6e7d8d', '#414850', '#b9c1c8'] },
];
export const color = id => COLORS.find(c => c.id === id);

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = h => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// CIE76 colour difference in Lab: how far apart two colours look.
const lab = h => {
  const [r, g, b] = rgb(h).map(lin), f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883].map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
// Two colours clash when they are the same or their lines look alike in either theme (measured: blue and indigo are 16).
export const SIMILAR = 30;
export const clash = (a, b) => a === b || ['light', 'dark'].some(t => deltaE(color(a)[t][0], color(b)[t][0]) < SIMILAR);

// Measured once at load: lines at least 3:1 on the board (they are the pieces), marker letters at least 4.5:1 on their
// fill. Fills are soft on purpose (the owner asked for soft fills); the letter carries ownership, never the colour alone.
for (const c of COLORS) for (const t of ['light', 'dark']) {
  const [line, fill, ink] = c[t];
  console.assert(contrast(line, BOARD[t]) >= 3, `${c.id} ${t}: line contrast`);
  console.assert(contrast(ink, fill) >= 4.5, `${c.id} ${t}: marker contrast`);
}
console.assert(clash('blue', 'indigo') && !clash('blue', 'red') && clash('red', 'red'), 'clash');

// The tokens, per theme, for the page's CSS.
const tokens = t => COLORS.map(c => `--c-${c.id}-line:${c[t][0]};--c-${c.id}-fill:${c[t][1]};--c-${c.id}-ink:${c[t][2]};`).join('');
const style = document.createElement('style');
style.textContent = `:root{--board:${BOARD.light};${tokens('light')}}:root[data-theme="dark"]{--board:${BOARD.dark};${tokens('dark')}}`;
document.head.append(style);
