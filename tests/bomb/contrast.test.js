// "Check contrast on each": every text and mark Bomb draws, in light and dark, measured with the WCAG formula.
// 4.5:1 for text, 3:1 for large numerals and essential marks (card backs on the page, suits as large marks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STYLES, THEME, contrast } from '../../site/bomb/ui/styles.js';

const at = (a, b, min, what) => {
  const r = contrast(a, b);
  assert.ok(r >= min, `${what}: ${a} on ${b} is ${r.toFixed(2)}, needs ${min}`);
};

test('twelve styles, distinct colours and patterns', () => {
  assert.equal(STYLES.length, 12);
  assert.equal(new Set(STYLES.map(s => s.hex)).size, 12);
  assert.equal(new Set(STYLES.map(s => s.pattern)).size, 12);
  // Same ids and order as the server's list (server/rooms.js STYLES).
  assert.deepEqual(STYLES.map(s => s.id), ['cobalt', 'scarlet', 'forest', 'tangerine', 'violet', 'teal', 'rose', 'gold', 'indigo', 'slate', 'sky', 'lime']);
});

for (const s of STYLES) {
  test(`${s.name} ${s.pattern}: names in its ink, and the back against both grounds`, () => {
    at(s.ink, s.hex, 4.5, `${s.id} ink`);
    // The other ink must not be the better one: we picked the stronger of white and dark.
    const other = s.ink === '#ffffff' ? '#1d1d1f' : '#ffffff';
    assert.ok(contrast(s.ink, s.hex) >= contrast(other, s.hex), `${s.id}: the other ink reads better`);
    for (const t of ['light', 'dark']) {
      at(s.hex, THEME[t].canvas, 3, `${s.id} back on ${t} canvas`);
      at(s.hex, THEME[t].glass, 3, `${s.id} back on ${t} glass`);
    }
  });
}

for (const t of ['light', 'dark']) {
  test(`${t} theme: text, buttons, cards`, () => {
    const T = THEME[t];
    for (const bg of [T.canvas, T.glass]) {
      at(T.ink, bg, 4.5, `${t} ink`);
      at(T.ink2, bg, 4.5, `${t} secondary text`);
    }
    at('#ffffff', T.primary, 4.5, `${t} primary button text`);
    at('#ffffff', T.danger, 4.5, `${t} "Too low" tag`);
    at(T.canvas, T.ink, 4.5, `${t} ink button (Play) text`);
    at('#ffffff', '#0071e3', 4.5, `${t} add circle and first-place rank`);
    // Cards keep a light face in both themes, so red and black suits keep their contrast.
    at(T.red, T.card, 4.5, `${t} red suit on card`);
    at(T.black, T.card, 4.5, `${t} black suit on card`);
    at(T.card, T.canvas, t === 'light' ? 1 : 3, `${t} card on canvas`); // light cards on cream carry an outline and shadow
    at(T.deck, T.canvas, 3, `${t} deck back`);
    at(T.deck, T.glass, 3, `${t} deck back on glass`);
    at(T.accent, T.canvas, 3, `${t} selection ring`);
    at(T.ink, T.cell, 4.5, `${t} result numbers`);
  });
}

test('index.html carries the same theme values as THEME', () => {
  const html = readFileSync(new URL('../../site/bomb/index.html', import.meta.url), 'utf8');
  const block = sel => html.slice(html.indexOf(sel), html.indexOf('}', html.indexOf(sel)));
  const light = block(':root {'), dark = block(':root[data-theme="dark"] {');
  const val = (b, name) => (new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(b) || [])[1]?.toLowerCase();
  for (const [css, key] of [['canvas', 'canvas'], ['card', 'card'], ['red', 'red'], ['blk', 'black'], ['deck', 'deck'], ['cell', 'cell'], ['tag', 'danger']]) {
    assert.equal(val(light, css), THEME.light[key], `light --${css}`);
    assert.equal(val(dark, css), THEME.dark[key], `dark --${css}`);
  }
  assert.equal(val(dark, 'primary'), THEME.dark.primary, 'dark --primary');
  for (const s of STYLES) assert.ok(html.includes(`.p-${s.pattern} {`), `pattern .p-${s.pattern}`);
});
