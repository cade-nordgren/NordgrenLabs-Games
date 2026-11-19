// Daylight (ui/daylight.js): the sun track's numbers, the board's light by sun, its contrast at every step, and which
// dusk notice is due.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daylight, trackLabel, skyAt, SKY, hex, mix, contrast, duskDue, duskShown, duskWords } from '../../site/keep/ui/daylight.js';
import { SUNSET } from '../../site/keep/engine/clock.js';

test('the track: sun 1 to SUNSET - 1, rounds left counting the current one', () => {
  assert.deepEqual(daylight(1, SUNSET), { step: 1, steps: SUNSET - 1, left: SUNSET - 1, f: 0 });
  assert.equal(daylight(SUNSET - 1, SUNSET).left, 1);
  assert.equal(daylight(SUNSET - 1, SUNSET).f, 1);
  assert.equal(daylight(SUNSET, SUNSET).step, SUNSET - 1, 'clamped at the last step');
  assert.equal(trackLabel(5, 27, false), 'Sun 5 of 26, 22 rounds of light left');
  assert.equal(trackLabel(26, 27, true), 'Sun 26 of 26, 1 turn of light left');
});

// What the eye sees: the tinted board background and unexplored squares of a theme, in RGB.
const grounds = (theme, f) => { const s = skyAt(f)[theme], t = THEMES[theme]; return [mix(s.off, hex(t.off), s.k), t.tintFog ? mix(s.rgb, hex(t.fog), s.k) : hex(t.fog)]; };
const apart = (a, b) => Math.max(...a.map((g, j) => Math.hypot(...g.map((v, i) => v - b[j][i]))));
test('the light moves every step, a little each time, and a lot from first to last', () => {
  for (const theme of ['light', 'dark']) {
    for (let s = 2; s < SUNSET; s++) {
      const d = apart(grounds(theme, daylight(s, SUNSET).f), grounds(theme, daylight(s - 1, SUNSET).f));
      assert.ok(d > 0 && d < 24, `${theme}, sun ${s}: a subtle step (${d.toFixed(1)})`);
    }
    const a = grounds(theme, 0), b = grounds(theme, 1);
    assert.ok(apart(a, b) > 60, `${theme}: sun 1 and the last sun are plainly different (${apart(a, b).toFixed(1)})`);
    assert.ok(b[0][2] > a[0][2] && a[0][0] > b[0][0], `${theme}: warm at first, blue at the end`);
    assert.ok(skyAt(1)[theme].vig > skyAt(0)[theme].vig);
  }
  assert.match(skyAt(1).vars['--sky-lk'], /^\d+(\.\d+)?%$/);
});

// The board colours of index.html (.board-wrap) and what the tint touches: the board background (off-board, with
// the vignette at its edge) in both themes, unexplored squares in light only. Tiles, tokens, walls and highlights
// keep their own colours, and no text sits on a tinted surface.
const THEMES = {
  light: { off: '#d9d3c9', fog: '#8c7f70', floor: '#f4ead9', wall: '#3a2d26', target: '#0062cc', focus: '#b0007a', tower: '#5b4a3f', tintFog: true },
  dark: { off: '#2a2420', fog: '#000000', floor: '#6b5848', wall: '#f3e6cf', target: '#8fd0ff', focus: '#ffb3f0', tower: '#d8c6b0', tintFog: false },
};
function boardContrast(theme, f, sky = skyAt(f)[theme]) {
  const t = THEMES[theme], c = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'string' ? hex(v) : v]));
  const off = mix(sky.off, c.off, sky.k), edge = mix(SKY.vignetteRgb, off, sky.vig), fog = t.tintFog ? mix(sky.rgb, c.fog, sky.k) : c.fog;
  return {
    'wall on the board background': Math.min(contrast(c.wall, off), contrast(c.wall, edge)),
    'tower on the board background': Math.min(contrast(c.tower, off), contrast(c.tower, edge)),
    'wall by an unexplored square': contrast(c.wall, fog),
    'lit square outline on unexplored': contrast(c.target, fog),
    'focus ring on unexplored': contrast(c.focus, fog),
    'explored floor against unexplored': contrast(c.floor, fog),
  };
}

test('contrast: nothing on the board gets harder to see as the sun goes down, and 3:1 holds wherever it held', () => {
  const worst = {};
  for (const theme of Object.keys(THEMES)) {
    const base = boardContrast(theme, 0, { rgb: [0, 0, 0], off: [0, 0, 0], k: 0, vig: 0 }); // the board before this change
    for (let s = 1; s < SUNSET; s++) {
      const now = boardContrast(theme, daylight(s, SUNSET).f);
      for (const [pair, r] of Object.entries(now)) {
        const floor = Math.min(3, base[pair]);
        assert.ok(r >= floor - 0.05, `${theme}, sun ${s}, ${pair}: ${r.toFixed(2)} under ${floor.toFixed(2)}`);
        const k = `${theme}: ${pair}`;
        if (!worst[k] || r < worst[k].r) worst[k] = { r, s };
      }
    }
  }
  // The worst case per pair, for the record (run with --test-reporter=spec to read it).
  for (const [k, { r, s }] of Object.entries(worst)) console.log(`${k}: ${r.toFixed(2)}:1 worst, at sun ${s}`);
});

test('dusk notices: once each at 5, 3 and 1 left, the most urgent first, none twice', () => {
  assert.equal(duskDue(6, []), null);
  assert.equal(duskDue(5, []), 5);
  assert.equal(duskDue(4, [5]), null);
  assert.equal(duskDue(3, [5]), 3);
  assert.equal(duskDue(1, []), 1, 'a jump to the last round shows only the last notice');
  assert.deepEqual(duskShown(1, []), [5, 3, 1]);
  assert.deepEqual(duskShown(3, [5]), [5, 3]);
  assert.equal(duskDue(1, duskShown(1, [])), null);
  assert.deepEqual(duskWords(5, false), { title: 'The light is failing.', line: '5 rounds left.', card: false });
  assert.deepEqual(duskWords(3, true), { title: 'Dusk.', line: '3 turns left.', card: false });
  assert.equal(duskWords(1, true).line, 'This is the final turn.');
  assert.equal(duskWords(1, false).card, true);
});
