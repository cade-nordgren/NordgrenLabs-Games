// Card styles and the colours Bomb draws with. Pure data plus the contrast maths, so tests/bomb/contrast.test.js can
// check every pairing; index.html carries the same theme values in CSS (the test compares them).

import { DECKS } from '../../decks/decks.js';

// A player's style: one of the picture decks (site/decks; its own back on that player's cards, listed first so new
// players get a deck), or one of twelve colours with its own pattern (.p-<pattern> in index.html). The colour is that
// player's colour everywhere; ink is the text colour on it (white or dark), whichever passes 4.5:1.
const DECK_STYLES = DECKS.map(d => ({ id: d.id, name: d.name, pattern: 'deck', hex: d.color, ink: '#ffffff', deck: d.id }));
export const COLOR_STYLES = [
  { id: 'cobalt', name: 'Cobalt', pattern: 'stripes', hex: '#1f6fd6', ink: '#ffffff' },
  { id: 'scarlet', name: 'Scarlet', pattern: 'dots', hex: '#d42f3a', ink: '#ffffff' },
  { id: 'forest', name: 'Forest', pattern: 'diamonds', hex: '#1c7f3e', ink: '#ffffff' },
  { id: 'tangerine', name: 'Tangerine', pattern: 'waves', hex: '#d96c00', ink: '#1d1d1f' },
  { id: 'violet', name: 'Violet', pattern: 'crosshatch', hex: '#9046d6', ink: '#ffffff' },
  { id: 'teal', name: 'Teal', pattern: 'checks', hex: '#0c7c78', ink: '#ffffff' },
  { id: 'rose', name: 'Rose', pattern: 'chevrons', hex: '#cc2f7c', ink: '#ffffff' },
  { id: 'gold', name: 'Gold', pattern: 'sunburst', hex: '#b58300', ink: '#1d1d1f' },
  { id: 'indigo', name: 'Indigo', pattern: 'scales', hex: '#575bdb', ink: '#ffffff' },
  { id: 'slate', name: 'Slate', pattern: 'pinstripes', hex: '#62738a', ink: '#ffffff' },
  { id: 'sky', name: 'Sky', pattern: 'rings', hex: '#1f93c9', ink: '#1d1d1f' },
  { id: 'lime', name: 'Lime', pattern: 'plaid', hex: '#62970f', ink: '#1d1d1f' },
];
export const STYLES = [...DECK_STYLES, ...COLOR_STYLES];
export const style = id => STYLES.find(s => s.id === id) || null;
export const styleLabel = s => s.deck ? s.name : `${s.name} ${s.pattern}`;
// The first style nobody holds; null when all are taken (never, with six players at most).
export const freeStyle = taken => STYLES.find(s => !taken.includes(s.id))?.id ?? null;

// Theme colours as solid values. Glass is translucent, so it is given here as the colour it settles to over the canvas
// (white 62% over cream; rgba(44,44,46,.55) over black), which is what text on a panel is read against.
export const THEME = {
  light: { canvas: '#f6f3ec', glass: '#fbfaf7', ink: '#1d1d1f', ink2: '#6e6e73', primary: '#0071e3', accent: '#0071e3',
    danger: '#d70015', card: '#ffffff', red: '#c8102e', black: '#1d1d1f', deck: '#3a3a3c', cell: '#ffffff' },
  dark: { canvas: '#000000', glass: '#18181a', ink: '#f5f5f7', ink2: '#a1a1a6', primary: '#0071e3', accent: '#2997ff',
    danger: '#d70015', card: '#f2f2f4', red: '#c8102e', black: '#1d1d1f', deck: '#737378', cell: '#2c2c2e' },
};

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = h => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
