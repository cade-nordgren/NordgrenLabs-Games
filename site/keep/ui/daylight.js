// Daylight on screen: the sun track, the board's light and the dusk notices. Pure arithmetic, no DOM; tested in
// tests/keep/daylight.test.js. The engine's clock steps the sun once per full round (engine/clock.js endTurn), so
// "left" counts rounds (one turn each), the current one included: at sun SUNSET - 1 one round is left, the last.

// sun 1..sunset-1 are playable. step: this sun; steps: how many; left: rounds of light left, this one included;
// f: 0 at the first sun, 1 at the last.
export function daylight(sun, sunset) {
  const steps = sunset - 1, step = Math.min(Math.max(sun, 1), steps);
  return { step, steps, left: sunset - step, f: steps > 1 ? (step - 1) / (steps - 1) : 1 };
}

// The words for "left", true to the clock: a round in a game of several, a turn alone.
export const unit = (n, solo) => (solo ? (n === 1 ? 'turn' : 'turns') : (n === 1 ? 'round' : 'rounds'));
export function trackLabel(sun, sunset, solo) {
  const { step, steps, left } = daylight(sun, sunset);
  return `Sun ${step} of ${steps}, ${left} ${unit(left, solo)} of light left`;
}

// ---- The board's light. Each theme has its own stops: a sky colour mixed into the board background and the
// unexplored squares (k of it, CSS color-mix in srgb), and a vignette alpha in the margin round the board. In light
// the unexplored squares sit between a light floor and dark walls and outlines at about 3.3:1 each way, so their
// sky colours are of the same luminance as the fog: the hue turns, the lightness does not. Dark keeps unexplored
// squares black (its explored floor is only 3.1:1 against them) and tints the board background and the fog's hatch.
export const SKY = {
  light: [{ f: 0, rgb: [175, 128, 80], k: 0.25 }, { f: 0.55, rgb: [190, 118, 65], k: 0.35 }, { f: 0.75, rgb: [212, 110, 60], k: 0.5 }, { f: 1, rgb: [110, 136, 212], k: 0.65 }],
  dark: [{ f: 0, rgb: [150, 105, 40], k: 0.18 }, { f: 0.55, rgb: [170, 95, 30], k: 0.28 }, { f: 0.75, rgb: [190, 75, 25], k: 0.38 }, { f: 1, rgb: [40, 60, 170], k: 0.55 }],
  vignette: { light: [{ f: 0, a: 0 }, { f: 0.55, a: 0.06 }, { f: 1, a: 0.16 }], dark: [{ f: 0, a: 0.04 }, { f: 0.55, a: 0.12 }, { f: 1, a: 0.36 }] },
  vignetteRgb: [16, 20, 56],
  lift: { light: 0.45, dark: 0 }, // the board background takes the sky mixed this much with white (light keeps its towers 3:1)
};
const lerp = (a, b, t) => a + (b - a) * t;
function along(stops, f, pick) {
  const i = Math.max(1, stops.findIndex(s => s.f >= f));
  const a = stops[i - 1], b = stops[i] || a, t = b.f === a.f ? 0 : Math.min(1, Math.max(0, (f - a.f) / (b.f - a.f)));
  return pick(a, b, t);
}
function tone(theme, f) {
  const { rgb, k } = along(SKY[theme], f, (a, b, t) => ({ rgb: a.rgb.map((v, i) => Math.round(lerp(v, b.rgb[i], t))), k: +lerp(a.k, b.k, t).toFixed(3) }));
  const off = rgb.map(v => Math.round(lerp(v, 255, SKY.lift[theme])));
  return { rgb, off, k, vig: +along(SKY.vignette[theme], f, (a, b, t) => lerp(a.a, b.a, t)).toFixed(3) };
}
// The CSS custom properties for #table (index.html picks the theme's set and mixes it into the board colours).
export function skyAt(f) {
  const l = tone('light', f), d = tone('dark', f), pc = k => `${Math.round(k * 1000) / 10}%`, css = rgb => `rgb(${rgb.join(' ')})`;
  return { light: l, dark: d, vars: {
    '--sky-l': css(l.rgb), '--sky-lo': css(l.off), '--sky-lk': pc(l.k), '--vig-l': String(l.vig),
    '--sky-d': css(d.rgb), '--sky-do': css(d.off), '--sky-dk': pc(d.k), '--vig-d': String(d.vig) } };
}

// ---- Contrast (WCAG 2), for the checks in the test. Colours are [r, g, b] 0..255.
export const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// CSS color-mix(in srgb, a k, b): straight interpolation of the encoded values; also alpha compositing of a over b.
export const mix = (a, b, k) => a.map((v, i) => v * k + b[i] * (1 - k));
const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---- Dusk notices: once each when 5, 3 and 1 rounds of light are left. shown: the thresholds already shown this
// game. Returns the one to show now (the most urgent reached), or null.
export const DUSK = [5, 3, 1];
export function duskDue(left, shown = []) {
  const due = DUSK.filter(t => left <= t && !shown.includes(t));
  return due.length ? Math.min(...due) : null;
}
// Showing t counts every threshold at or above it as shown, so a jump (a resume, a long undo) never queues two.
export const duskShown = (t, shown = []) => DUSK.filter(x => x >= t || shown.includes(x));
export function duskWords(t, solo) {
  if (t === 1) return { title: 'Last light.', line: solo ? 'This is the final turn.' : 'This is the final round: one more turn each.', card: true };
  return { title: t === 5 ? 'The light is failing.' : 'Dusk.', line: `${t} ${unit(t, solo)} left.`, card: false };
}
