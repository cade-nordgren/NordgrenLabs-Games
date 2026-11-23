import { DECKS, deckOf, backUrl } from '../../decks/decks.js';

// Table themes (the room's shared default, overridable per device) and card face themes. Unknown ids fall back to felt.
export const TABLES = [
  { id: 'felt', name: 'Classic Green Felt', a: '#27704a', b: '#1d5a39' },
  { id: 'charcoal', name: 'Dark Charcoal', a: '#35383d', b: '#26282c' },
  { id: 'navy', name: 'Navy Blue', a: '#22395f', b: '#182a4a' },
  { id: 'wood', name: 'Warm Wood', a: '#70452a', b: '#5e3920' },
  { id: 'light', name: 'Minimal Light', a: '#f2f0ea', b: '#e9e6df' },
  { id: 'dark', name: 'Minimal Dark', a: '#1f1f22', b: '#141416' },
  { id: 'sig', name: 'NordgrenLabs Signature', a: '#262c55', b: '#1b2040' },
];
export const tableOf = id => TABLES.find(t => t.id === id) || TABLES[0];
export const FACES = [
  { id: 'classic', name: 'Classic' }, { id: 'minimal', name: 'Minimal Modern' }, { id: 'lux', name: 'Dark Luxury' },
  { id: 'vintage', name: 'Vintage' }, { id: 'nordic', name: 'Nordic' }, { id: 'sig', name: 'NordgrenLabs Signature' },
  ...DECKS, // the shared picture decks (site/decks): their own faces and back
];
export const BACK_COLORS = [
  ['felt', 'Felt', '#1d5a39'], ['cobalt', 'Cobalt', '#1f6fd6'], ['tangerine', 'Tangerine', '#cf6900'], ['forest', 'Forest', '#1c7f3e'],
  ['violet', 'Violet', '#9850dc'], ['teal', 'Teal', '#0c7c78'], ['rose', 'Rose', '#cc2f7c'], ['gold', 'Gold', '#b07f00'],
  ['scarlet', 'Scarlet', '#d42f3a'], ['slate', 'Slate', '#62738a'], ['sky', 'Sky', '#1f93c9'], ['ink', 'Ink', '#1d1d1f'],
];
export const PATTERNS = [['diamonds', 'Diamonds'], ['stripes', 'Stripes'], ['waves', 'Waves'], ['crosshatch', 'Crosshatch'], ['dots', 'Dots'], ['plain', 'Plain']];

// Per-device preferences (cosmetic and comfort only; never game state). localStorage nl-salad-prefs, checked on read.
const KEY = 'nl-salad-prefs';
const CHOICES = {
  face: FACES.map(f => f.id),
  backColor: ['felt', 'cobalt', 'tangerine', 'forest', 'violet', 'teal', 'rose', 'gold', 'scarlet', 'slate', 'sky', 'ink'],
  backPattern: ['diamonds', 'stripes', 'waves', 'crosshatch', 'dots', 'plain'],
  backImage: ['off', 'on'],
  deckBack: ['on', 'off'], // a picture deck's own back; picking a colour, pattern or picture turns it off
  table: ['room', 'felt', 'charcoal', 'navy', 'wood', 'light', 'dark', 'sig'],
  size: ['m', 's', 'l'],
  contrast: ['off', 'on'],
  sort: ['suit', 'rank', 'manual'],
  confirm: ['button', 'double', 'direct'],
  speed: ['normal', 'slow', 'fast'],
  next: ['auto', 'tap'],
  scores: ['room', 'end'],
  sound: ['off', 'on'],
  motion: ['system', 'reduced'],
};
export const prefs = Object.fromEntries(Object.entries(CHOICES).map(([k, v]) => [k, v[0]]));
try {
  const p = JSON.parse(localStorage.getItem(KEY));
  for (const k in CHOICES) if (CHOICES[k].includes(p?.[k])) prefs[k] = p[k];
} catch {}
export function setPref(k, v) {
  if (!CHOICES[k]?.includes(v)) return;
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  apply();
}

// The custom card-back image lives on its own (a JPEG data URL, made in ui/cards.js), only on this device.
const IMG = 'nl-salad-back-image';
export function backImage() {
  try {
    const v = localStorage.getItem(IMG);
    return v && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
  } catch { return null; }
}
export function setBackImage(url) {
  try { url ? localStorage.setItem(IMG, url) : localStorage.removeItem(IMG); } catch { return false; }
  apply();
  return true;
}

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
export const still = () => prefs.motion === 'reduced' || reduceMq.matches;
// Animation length scaled by the speed setting; 0 when motion is reduced.
export const dur = ms => still() ? 0 : Math.round(ms * { normal: 1, slow: 1.6, fast: 0.55 }[prefs.speed]);

// The back picture of the chosen picture deck, while its back is on; else null.
export const deckBack = () => prefs.deckBack === 'on' ? backUrl(prefs.face) : null;

// Cosmetic classes on <html>, read by the page's CSS.
export function apply() {
  const d = document.documentElement;
  d.dataset.face = prefs.face;
  d.dataset.size = prefs.size;
  d.classList.toggle('hc', prefs.contrast === 'on');
  d.classList.toggle('still', still());
  // Your own picture wins, then a picture deck's back, then the colour and pattern.
  const own = prefs.backImage === 'on' && backImage(), deck = !own && deckBack();
  const img = own || deck;
  d.style.setProperty('--back-img', img ? `url("${img}")` : 'none');
  d.dataset.back = own ? 'image' : deck ? 'deck' : prefs.backPattern;
  d.dataset.backColor = prefs.backColor;
}
reduceMq.addEventListener('change', apply);
apply();
