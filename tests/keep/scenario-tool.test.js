// tools/keep-scenario.js: every scenario prints an autosave that app.js's load() accepts (its checks repeated here around the
// engine's restore(), which is the pure part), on the content "Play-test my content" uses, with no undo history; after the
// hinted actions the screen the scenario is for is showing. The tool is developer-only and not referenced by site/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ORIGINAL from '../../site/keep/content/original/index.js';
import FIXTURES from '../../site/keep/content/fixtures/fixtures.js';
import { contentStatus } from '../../site/keep/content/schema.js';
import { restore } from '../../site/keep/engine/reducer.js';
import { SCENARIOS, build, play, saveString } from '../../tools/keep-scenario.js';

const APP = readFileSync(new URL('../../site/keep/ui/app.js', import.meta.url), 'utf8');
const MIXED = contentStatus(ORIGINAL, FIXTURES).mixed; // app.js: CONTENT.mixed = STATUS.mixed

// app.js load(): v 1, no other person's owner, a known mode, then restore() on that mode's content; hist filtered the same way.
function load(text) {
  const s = JSON.parse(text);
  assert.equal(s.v, 1);
  assert.ok(!s.owner, 'no owner: read by whoever is on this browser');
  assert.equal(s.mode, 'mixed');
  const game = restore(JSON.stringify(s.game), MIXED);
  assert.deepEqual(s.hist, [], 'empty undo history');
  assert.ok(Number.isInteger(s.seen) && s.seen <= game.log.length);
  assert.equal(s.count, game.seats.length);
  return game;
}

test('scenario tool: app.js still loads nl-keep-v1 through restore() on the play-test content (the checks repeated here)', () => {
  assert.match(APP, /const KEY = 'nl-keep-v1';/);
  assert.match(APP, /mixed: STATUS\.mixed/);
  assert.match(APP, /if \(!s \|\| s\.v !== 1 \|\| \(s\.owner && s\.owner !== b\.owner\)\) return;/);
  assert.match(APP, /b\.game = restore\(JSON\.stringify\(s\.game\), c\);/);
  assert.ok(!/keep-scenario/.test(APP), 'the shipped game does not reference the tool');
});

test('scenario tool: list prints every scenario; a scenario prints exactly one line of JSON on stdout', () => {
  const tool = fileURLToPath(new URL('../../tools/keep-scenario.js', import.meta.url));
  const names = execFileSync(process.execPath, [tool, 'list'], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(names, Object.keys(SCENARIOS));
  const out = execFileSync(process.execPath, [tool, 'flask'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.equal(out.trim().split('\n').length, 1);
  load(out.trim());
});

for (const name of Object.keys(SCENARIOS)) {
  test(`scenario ${name}: accepted by the autosave checks; after the hinted actions the screen shows`, () => {
    const { game } = build(name);
    const g = load(saveString(game));
    assert.equal(g.rng.script, null, 'no scripted dice: the game rolls on normally');
    assert.equal(g.status, 'playing');
    const after = play(g, SCENARIOS[name].then);
    assert.ok(after, 'every hinted action is legal');
    assert.ok(SCENARIOS[name].expect(after, g), SCENARIOS[name].hint);
  });
}
