// The M4 content kit: authoring files, the checker, play-test (mixed) mode, the owner's text field and the full Start gate.
// Sample content in content-samples/ is EXAMPLE ONLY, NOT REAL CONTENT, NOT AUTHENTIC.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATEGORIES, validateContent, ownerContent, mixContent, contentStatus, loadSlots, MIXED_BANNER } from '../../site/keep/content/schema.js';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { createGame } from '../../site/keep/engine/reducer.js';
import { cardText, monsterText } from '../../site/keep/ui/words.js';
import { tileWords } from '../../site/keep/ui/board.js';
import { FX } from './helpers.js';

const LIVE = 'site/keep/content/original';
const SAMPLES = 'tests/keep/content-samples';
const tool = (...args) => spawnSync(process.execPath, ['tools/keep-content.js', ...args], { encoding: 'utf8' });
// A temporary copy of the live templates with sample files laid over them.
const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));
function folder(sample) {
  const dir = mkdtempSync(join(tmpdir(), 'keep-kit-'));
  made.push(dir);
  cpSync(LIVE, dir, { recursive: true });
  if (sample) cpSync(join(SAMPLES, sample), dir, { recursive: true });
  return dir;
}
const load = async dir => ownerContent(await loadSlots(pathToFileURL(dir + '/')));

test('kit: the shipped files are templates with zero entries and a skeleton each', () => {
  for (const c of CATEGORIES) {
    const src = readFileSync(join(LIVE, c.file), 'utf8');
    assert.match(src, /^\/\/ SKELETON START[\s\S]*^\/\/ SKELETON END/m, c.file);
    assert.match(src, /^\/\/ {3}text: /m, `${c.file} skeleton shows the text field`);
    assert.deepEqual([ORIGINAL[c.key]].flat().filter(Boolean), [], `${c.file} has no entries`);
  }
  assert.equal(readdirSync(LIVE).length, CATEGORIES.length + 1, 'one file per slot type plus index.js');
});

test('kit: checker on the empty templates reports every slot at zero and exits 0', () => {
  const r = tool('check');
  assert.equal(r.status, 0, r.stderr);
  for (const c of CATEGORIES) assert.match(r.stdout, new RegExp(`^${c.label} 0/${c.ids.length} \\(0 approved, 0 draft\\)$`, 'm'));
  assert.match(r.stdout, /^No errors\.$/m);
  assert.match(r.stdout, /Play-test is off until you write some entries/);
});

test('kit: report prints the title screen status', () => {
  const r = tool('report');
  const s = contentStatus(ORIGINAL, FX);
  assert.equal(r.status, 0);
  for (const line of [s.note, ...s.lines, s.start, s.play]) assert.ok(r.stdout.includes(line), line);
});

test('kit: checker passes good sample content and counts approved and draft copies', () => {
  const r = tool('check', '--dir', folder('good'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Room cards 3\/60 \(2 approved, 1 draft\)$/m);
  assert.match(r.stdout, /^Maze tiles 4\/88 \(0 approved, 4 draft\)$/m);
  assert.match(r.stdout, /^Play-test is on/m);
});

test('kit: checker fails bad sample content with one precise message per problem', () => {
  const r = tool('check', '--dir', folder('bad'));
  assert.equal(r.status, 1);
  for (const m of [
    'TILE_034: entrySide is a door: PENDING owner ruling on door/gate entry sides (plan 13 #8)',
    'Maze tiles: copies total 91, expected 88',
    'ROOM_001: kind gold not allowed in ROOM',
    'ROOM_017: followUpDeck TREASURY not one of SEARCH/CHEST/DOOR/MONSTER',
    'ROOM_999: id ROOM_999 is not one of ROOM_001..ROOM_060',
    'ROOM_003: text must be words in quotes',
    'ROOM_004: status aproved must be "draft" or "approved"',
    'MONSTER_003: reaction flee missing',
    'MONSTER_003: groupId S10 is not a monster-group combat set',
  ]) assert.ok(r.stdout.includes(m), m);
  assert.match(r.stdout, /^10 errors\.$/m);
});

test('kit: a syntax slip names the file and line; new adds skeleton entries with the next free id', async () => {
  const dir = folder();
  for (let i = 0; i < 3; i++) assert.equal(tool('new', 'combat', '--dir', dir).status, 0);
  assert.equal(tool('new', 'room', '--dir', dir).status, 0);
  assert.match(tool('new', 'board', '--dir', dir).stdout, /Added BOARD_01/);
  assert.equal(tool('new', 'board', '--dir', dir).status, 1, 'only one board');
  const c = await load(dir);
  assert.deepEqual(c.combat.map(x => [x.id, x.setId, x.letter, x.owner, x.status]), [['COMBAT_S01_A', 'S01', 'A', 'hero', 'DRAFT'], ['COMBAT_S01_B', 'S01', 'B', 'hero', 'DRAFT'], ['COMBAT_S01_C', 'S01', 'C', 'hero', 'DRAFT']]);
  assert.equal(c.room[0].id, 'ROOM_001');
  assert.equal(c.board.id, 'BOARD_01');
  assert.equal(tool('check', '--dir', dir).status, 0, 'a fresh skeleton is a valid draft');
  const broken = join(dir, 'door.js');
  cpSync(join(SAMPLES, 'README.md'), broken); // prose is not a slot file
  const r = tool('check', '--dir', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not read the content: door\.js: .*\n.*door\.js:1/);
});

test('mixed: owner entries layered over the fixtures, fill-in only where a slot is incomplete', async () => {
  const own = await load(folder('good'));
  const m = mixContent(own, FX);
  assert.equal(m.mode, 'mixed');
  assert.deepEqual(m.room.slice(0, 2).map(e => e.id), ['ROOM_001', 'ROOM_002']);
  assert.equal(m.room.length, 2 + FX.room.length);
  assert.ok(m.monster.some(e => e.id === 'MONSTER_001') && m.monster.some(e => e.id === 'FX_MON_BRUTE'));
  assert.equal(m.board, FX.board, 'no owner board: the fixture board fills in');
  const r = validateContent(m);
  assert.deepEqual(r.errors, []);
  assert.equal(r.fixturePlayable, true);
  assert.equal(r.fullStartAllowed, false, 'a play-test never counts as the full game');
  const g = createGame({ players: ['A', 'B'], seed: 3, content: m });
  assert.equal(g.banner, MIXED_BANNER);
  assert.equal(MIXED_BANNER, 'Play-test: your content plus NON-AUTHENTIC fill-in');
  // A complete owner slot plays alone; fixture heroes still bring their own combat sets.
  const rings = [1, 2, 3, 4].map(n => ({ id: `RING_${n}`, copies: 1, status: 'draft', power: 'Example only', trigger: 'passive', effects: [] }));
  const combat = CATEGORIES.find(c => c.key === 'combat').ids.map(id => { const [, setId, letter] = id.split('_'); return { id, status: 'draft', setId, letter, owner: Number(setId.slice(1)) <= 8 ? 'hero' : 'monster-group', doubleAgainst: [] }; });
  const full = ownerContent({ ...Object.fromEntries(CATEGORIES.map(c => [c.key, own[c.key]])), rings, combat });
  const m2 = mixContent(full, FX);
  assert.deepEqual(m2.rings.map(e => e.id), ['RING_1', 'RING_2', 'RING_3', 'RING_4']);
  assert.ok(m2.combat.some(e => e.setId === 'FX_S01'), 'fixture heroes keep their fixture combat sets');
  assert.deepEqual(validateContent(m2).errors, []);
  // Owner errors switch the play-test off; an empty kit has nothing to play-test.
  assert.equal(contentStatus(own, FX).mixedAllowed, true);
  assert.equal(contentStatus(await load(folder('bad')), FX).mixedAllowed, false);
  assert.equal(contentStatus(ORIGINAL, FX).mixedAllowed, false);
});

test('text: the owner\'s wording replaces the generated summary (plan 13 #21)', async () => {
  const own = await load(folder('good'));
  assert.equal(cardText(own.room[0]), 'Example wording: dust, and nothing else.');
  assert.match(cardText(own.room[1]), /Agility test/, 'no text: the summary from the effect data');
  assert.equal(monsterText(own.monster[0]), 'Example wording: the moth circles the lamp.');
  assert.equal(tileWords({ ...own.tiles[0], text: 'Example wording: a crossing.' }), 'Example wording: a crossing.');
  assert.ok(validateContent({ ...FX, room: [{ ...FX.room[0], text: 7 }, ...FX.room.slice(1)] }).errors.some(e => /text must be words/.test(e.message)));
});

// Every slot written in the authoring format with neutral synthetic values (EXAMPLE ONLY, NOT REAL CONTENT).
function kitContent(status) {
  const all = { N: 'open', E: 'open', S: 'open', W: 'open' };
  const deck = { room: 'ROOM', search: 'SEARCH', roomSearch: 'ROOM_SEARCH', chest: 'CHEST', door: 'DOOR', treasury: 'TREASURY' };
  const p = {};
  for (const c of CATEGORIES) p[c.key] = c.ids.map(id => ({ id, copies: 1, status }));
  p.board = { id: 'BOARD_01', status, width: 10, height: 9, towers: [[0, 0], [9, 0], [0, 8], [9, 8]].map(([x, y]) => ({ x, y, sides: all })), center: [{ x: 4, y: 4 }, { x: 5, y: 4 }] };
  p.chamber = { id: 'CHAMBER_01', status, sides: { a: all, b: all } };
  p.tiles = [{ id: 'TILE_001', copies: 88, status, sides: all, entrySide: 'S', mark: 'black', special: 'none' }];
  p.heroes = p.heroes.map((h, i) => ({ ...h, class: 'x', stats: { STR: 5, AGI: 5, ARM: 5, LCK: 5 }, hp: 10, combatSetId: `S0${i + 1}`, specialWeaponId: null }));
  p.dragon = p.dragon.map((d, i) => ({ ...d, kind: i ? 'sleeping' : 'awake' }));
  p.combat = p.combat.map(x => { const [, setId, letter] = x.id.split('_'); return { ...x, setId, letter, owner: Number(setId.slice(1)) <= 8 ? 'hero' : 'monster-group', doubleAgainst: [] }; });
  p.specialWeapons = p.specialWeapons.map(x => ({ ...x, heroIds: ['HERO_1'], effects: [], uses: null }));
  p.rings = p.rings.map(x => ({ ...x, effects: [], trigger: 'passive' }));
  for (const [k, d] of Object.entries(deck)) p[k] = p[k].map(x => ({ ...x, deck: d, kind: d === 'DOOR' ? 'opens' : 'empty', effects: [] }));
  const r = { type: 'combat', damage: null, effects: [] };
  p.monster = p.monster.map(x => ({ ...x, deck: 'MONSTER', hp: 3, groupId: 'S09', reactions: { attack: r, wait: r, flee: r } }));
  return p;
}

test('T30 via the kit: the full Start stays blocked until every entry is approved', () => {
  const draft = ownerContent(kitContent('draft'));
  assert.equal(validateContent(draft).fullStartAllowed, false);
  assert.throws(() => createGame({ players: ['A'], seed: 1, content: draft }), /Full-fidelity start blocked/);
  const p = kitContent('approved');
  p.room[59] = { ...p.room[59], status: 'draft' };
  const oneDraft = ownerContent(p);
  assert.equal(validateContent(oneDraft).fullStartAllowed, false);
  assert.match(contentStatus(oneDraft, FX).start, /Room cards 60\/60 \(59 approved, 1 draft\)/);
  const done = ownerContent(kitContent('approved'));
  assert.deepEqual(validateContent(done).errors, []);
  assert.equal(validateContent(done).fullStartAllowed, true);
  assert.equal(createGame({ players: ['A'], seed: 1, content: done }).banner, null);
});

test('guide: every worked example in docs/content-kit/README.md passes the checker together', () => {
  const md = readFileSync('docs/content-kit/README.md', 'utf8');
  const dir = folder();
  const FILE = { Board: 'board', 'Central chamber tile': 'chamber', 'Maze tiles': 'tiles', Heroes: 'heroes', 'Combat cards': 'combat', 'Ring cards': 'rings', 'Special weapon cards': 'special-weapons', 'Room cards': 'room', 'Door cards': 'door', 'Monster cards': 'monster', 'Dragon cards': 'dragon' };
  let n = 0;
  for (const sec of md.split(/^### /m).slice(1)) {
    const code = sec.match(/\*\*Example only, not real content, not authentic:\*\*\s*```js\n([\s\S]*?)```/)?.[1];
    if (!code) continue;
    const title = sec.split('\n')[0].trim();
    // A block holding several files marks each with a `// name.js` line.
    const parts = FILE[title] ? [`${FILE[title]}.js`, code] : code.split(/^\/\/ (\S+\.js)\n/m).slice(1);
    for (let i = 0; i < parts.length; i += 2, n++) writeFileSync(join(dir, parts[i]), parts[i + 1]);
  }
  assert.equal(n, 13, 'one example per slot type, two in the shared section');
  const r = tool('check', '--dir', dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Play-test is on/m);
});
