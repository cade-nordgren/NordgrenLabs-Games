// The M4 content kit: authoring files, the checker, play-test (mixed) mode, the owner's text field and the full Start gate.
// Sample content in content-samples/ is EXAMPLE ONLY, NOT REAL CONTENT, NOT AUTHENTIC.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATEGORIES, validateContent, ownerContent, mixContent, contentStatus, loadSlots, syntheticCategories, MIXED_BANNER } from '../../site/keep/content/schema.js';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { createGame } from '../../site/keep/engine/reducer.js';
import { cardText, monsterText } from '../../site/keep/ui/words.js';
import { tileWords } from '../../site/keep/ui/board.js';
import { FX, setup, acts, act, place, putHero, EMPTY_ROOMS } from './helpers.js';

const LIVE = 'site/keep/content/original';
const SAMPLES = 'tests/keep/content-samples';
const tool = (...args) => spawnSync(process.execPath, ['tools/keep-content.js', ...args], { encoding: 'utf8' });
// A temporary copy of the live slot files reset to empty templates (every list emptied, every single-entry file back to null),
// so the shipped owner entries never matter; sample files laid over them.
const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));
function folder(sample) {
  const dir = mkdtempSync(join(tmpdir(), 'keep-kit-'));
  made.push(dir);
  cpSync(LIVE, dir, { recursive: true });
  for (const c of CATEGORIES) {
    const file = join(dir, c.file), src = readFileSync(file, 'utf8');
    writeFileSync(file, src.replace(/^export default [\s\S]*$/m, c.ids.length === 1 ? 'export default null;\n' : 'export default [\n];\n'));
  }
  if (sample) cpSync(join(SAMPLES, sample), dir, { recursive: true });
  return dir;
}
const load = async dir => ownerContent(await loadSlots(pathToFileURL(dir + '/')));

test('kit: every shipped file keeps its skeleton, parses, and whatever entries exist validate', () => {
  for (const c of CATEGORIES) {
    const src = readFileSync(join(LIVE, c.file), 'utf8');
    assert.match(src, /^\/\/ SKELETON START[\s\S]*^\/\/ SKELETON END/m, c.file);
    assert.match(src, /^\/\/ {3}text: /m, `${c.file} skeleton shows the text field`);
  }
  const r = tool('check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^No errors\.$/m);
  assert.deepEqual(validateContent(ORIGINAL).errors, []);
  assert.equal(readdirSync(LIVE).length, CATEGORIES.length + 1, 'one file per slot type plus index.js');
});

test('kit: checker on the empty templates reports every slot at zero and exits 0', () => {
  const r = tool('check', '--dir', folder());
  assert.equal(r.status, 0, r.stderr);
  for (const c of CATEGORIES) assert.match(r.stdout, new RegExp(`^${c.label} 0/${c.ids.length}${c.key === 'combat' ? ': hero sets 0/24, monster sets 0/12' : ''} \\(0 approved, 0 draft\\)$`, 'm'));
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
  // RB 9.3: a part-written dragon deck is never layered, so there is always exactly one awake card in 8.
  const partDragon = mixContent({ ...own, dragon: [{ id: 'DRAGON_1', copies: 1, status: 'DRAFT', awake: true }] }, FX).dragon;
  assert.equal(partDragon, FX.dragon, 'incomplete owner dragon deck: the fixture deck plays alone');
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
  assert.equal(contentStatus(await load(folder()), FX).mixedAllowed, false);
});

// Derived from whatever the owner has filled in so far, so it holds as each slot is written.
test('mixed: the shipped content as it is loads in play-test mode; complete owner slots play alone, incomplete ones are synthetic', () => {
  const s = contentStatus(ORIGINAL, FX);
  assert.deepEqual(s.report.errors, []);
  const written = s.report.categories.some(c => c.defined > 0);
  if (!written) return assert.equal(s.mixedAllowed, false, 'nothing written: nothing to play-test');
  assert.equal(s.mixedAllowed, true, s.play);
  assert.equal(s.mixed.mode, 'mixed');
  const fxHeroes = s.mixed.heroes.some(h => h.status === 'FIXTURE');
  const bare = list => list.map(({ combatSetId, specialWeaponId, ...h }) => h);
  for (const c of s.report.categories) {
    const synthetic = s.synthetic.some(x => x.startsWith(`${c.label}: `)); // synthetic, or partly synthetic (spec v5)
    // The fixture crossbow belongs to a fixture hero, so it is dropped when the owner's heroes play alone.
    if (c.defined < c.required) { assert.ok(synthetic || (c.key === 'specialWeapons' && !fxHeroes), `${c.label} is incomplete: fill-in is layered in`); continue; }
    if (c.key === 'combat') { assert.deepEqual(s.mixed.combat.slice(0, ORIGINAL.combat.length), ORIGINAL.combat); continue; } // fixture heroes may bring their sets
    // Owner heroes play alone; a combat set or weapon card not written yet is filled in or left empty.
    if (c.key === 'heroes') { assert.deepEqual(bare(s.mixed.heroes), bare(ORIGINAL.heroes)); assert.ok(!synthetic, c.label); continue; }
    assert.deepEqual(s.mixed[c.key], ORIGINAL[c.key], `${c.label} is complete: the owner's entries play alone`);
    assert.ok(!synthetic, c.label);
  }
  assert.deepEqual(validateContent(s.mixed).errors, []);
  assert.equal(validateContent(s.mixed).fixturePlayable, true);
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
  p.board = { id: 'BOARD_01', status, width: 10, height: 11, towers: [[0, 0], [9, 0], [0, 10], [9, 10]].map(([x, y]) => ({ x, y, sides: all })), center: [{ x: 4, y: 5 }, { x: 5, y: 5 }] };
  p.chamber = { id: 'CHAMBER_01', status };
  p.tiles = [{ id: 'TILE_001', copies: 88, status, sides: all, entrySide: 'S', mark: 'black', special: 'none' }];
  p.heroes = p.heroes.map((h, i) => ({ ...h, class: 'x', stats: { STR: 5, AGI: 5, ARM: 5, LCK: 5 }, hp: 10, combatSetId: `S0${i + 1}`, specialWeaponId: null }));
  p.dragon = p.dragon.map((d, i) => ({ ...d, kind: i ? 'sleeping' : 'awake' }));
  p.combat = p.combat.map(x => { const [, setId, letter] = x.id.split('_'); return { ...x, setId, letter, owner: Number(setId.slice(1)) <= 8 ? 'hero' : 'monster-group', doubleAgainst: [] }; });
  p.specialWeapons = p.specialWeapons.map(x => ({ ...x, heroIds: ['HERO_1'], effects: [], uses: null }));
  p.rings = p.rings.map(x => ({ ...x, effects: [], trigger: 'passive' }));
  for (const [k, d] of Object.entries(deck)) p[k] = p[k].map(x => ({ ...x, deck: d, kind: d === 'DOOR' ? 'opens' : 'empty', effects: [] }));
  p.treasury = p.treasury.map(x => ({ ...x, kind: 'treasure', gold: 1, cardDisposition: 'RETAIN_TREASURY' })); // a chamber card is a kept treasure
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

test('mixed: owner monster cards in rows play-test over fixture room cards, which meet a type every row card covers (class 4 fill-in; EXAMPLE ONLY data)', () => {
  const combat = CATEGORIES.find(c => c.key === 'combat').ids.map(id => { const [, setId, letter] = id.split('_'); return { id, status: 'draft', setId, letter, owner: Number(setId.slice(1)) <= 8 ? 'hero' : 'monster-group', doubleAgainst: [] }; });
  const r = { type: 'monster-flees', damage: null, effects: [] };
  const row = { attack: { type: 'combat', hp: 2, damage: null, effects: [] }, wait: r, flee: r };
  const monster = [
    { id: 'MONSTER_001', copies: 1, status: 'draft', deck: 'MONSTER', rows: { S10: row, S09: row } },
    { id: 'MONSTER_002', copies: 1, status: 'draft', deck: 'MONSTER', rows: { S09: row, S11: row } },
  ];
  const own = ownerContent({ ...Object.fromEntries(CATEGORIES.map(c => [c.key, ['board', 'chamber'].includes(c.key) ? null : []])), combat, monster });
  assert.deepEqual(validateContent(own).errors, []);
  assert.equal(monsterText(own.monster[0]), 'Monster type S10: Attack: it fights, HP 2. Wait: it flees. Flee: it flees. Monster type S09: Attack: it fights, HP 2. Wait: it flees. Flee: it flees.');
  const m = mixContent(own, FX);
  assert.deepEqual(m.room.find(e => e.id === 'FX_ROOM_MONSTER').effects, [{ op: 'MONSTER_ENCOUNTER', ambush: false, monster: 'S09' }]);
  assert.equal(m.roomSearch.find(e => e.id === 'FX_RSEARCH_LURKER').followUpDeck, null);
  assert.deepEqual(validateContent(m).errors, []);
  assert.equal(contentStatus(own, FX).mixedAllowed, true);
});

// Heroes before combat cards (EXAMPLE ONLY, NOT REAL CONTENT): eight heroes, the second naming a weapon card not written yet.
const blank = () => Object.fromEntries(CATEGORIES.map(c => [c.key, ['board', 'chamber'].includes(c.key) ? null : []]));
const heroes8 = (status = 'draft') => Array.from({ length: 8 }, (_, i) => ({ id: `HERO_${i + 1}`, copies: 1, status, name: `Example hero ${i + 1}`, class: 'x', stats: { STR: 5, AGI: 5, ARM: 5, LCK: 5 }, hp: 12, equipment: [], combatSetId: `S0${i + 1}`, specialWeaponId: i === 1 ? 'XBOW_1' : null, art: null }));
const fullCombat = () => CATEGORIES.find(c => c.key === 'combat').ids.map(id => { const [, setId, letter] = id.split('_'); return { id, status: 'draft', setId, letter, owner: Number(setId.slice(1)) <= 8 ? 'hero' : 'monster-group', doubleAgainst: [] }; });

test('kit: heroes written before any combat or weapon card wait on them: no error, play-test on', () => {
  const dir = folder();
  writeFileSync(join(dir, 'heroes.js'), `export default ${JSON.stringify(heroes8())};\n`);
  const r = tool('check', '--dir', dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Heroes 8\/8 \(0 approved, 8 draft\)\n {2}Heroes: waiting on combat sets S01-S08 \(Combat cards 0\/36\)\n {2}Heroes: waiting on special weapon XBOW_1 \(Special weapon cards 0\/2\)$/m);
  assert.match(r.stdout, /^No errors\.$/m);
  assert.match(r.stdout, /^Play-test is on/m);
  // Approved heroes still waiting are not verified, so the full Start stays off.
  const approved = validateContent(ownerContent({ ...blank(), heroes: heroes8('approved') }));
  assert.equal(approved.categories.find(c => c.key === 'heroes').verified, 0);
  assert.equal(approved.fullStartAllowed, false);
});

test('mixed: the owner\'s eight heroes play with the fixture hero combat sets; a fight resolves with an owner hero', () => {
  const own = ownerContent({ ...blank(), heroes: heroes8() });
  assert.deepEqual(validateContent(own).errors, []);
  const m = mixContent(own, FX);
  assert.deepEqual(m.heroes.map(h => [h.id, h.combatSetId, h.hp]), heroes8().map((h, i) => [h.id, `FX_S0${i + 1}`, 12]), 'owner heroes only, each on the fixture set of its number');
  for (const h of m.heroes) assert.deepEqual(m.combat.filter(c => c.setId === h.combatSetId).map(c => [c.letter, c.owner]).sort(), [['A', 'hero'], ['B', 'hero'], ['C', 'hero']]);
  assert.deepEqual(m.specialWeapons, [], 'the fixture crossbow left with its fixture hero');
  assert.equal(m.heroes[1].specialWeaponId, null, 'XBOW_1 is not written yet: no weapon');
  const r = validateContent(m);
  assert.deepEqual(r.errors, []);
  assert.equal(r.fixturePlayable, true);
  assert.ok(!syntheticCategories(m).includes('Heroes: synthetic') && syntheticCategories(m).includes('Combat cards: synthetic'));
  assert.equal(contentStatus(own, FX).mixedAllowed, true);
  assert.equal(createGame({ players: ['A', 'B'], seed: 5, content: m }).banner, MIXED_BANNER);
  // Seeded game: the picker offers only the owner's heroes; HERO_1 (fixture set FX_S01: A hits B twice) kills a 4-HP brute.
  let g = createGame({ players: ['A', 'B'], seed: 5, content: m, diceScript: [12, 11] });
  g = act(g, 'ROLL_FIRST_PLAYER', {}, m);
  while (acts(g, m)[0].type !== 'PICK_HERO') g = act(g, acts(g, m)[0].type, {}, m);
  assert.deepEqual(acts(g, m).map(a => a.heroId).sort(), heroes8().map(h => h.id).sort());
  g = setup({ players: 2, content: m, towers: [0, 1], heroes: ['HERO_1', 'HERO_2'], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  assert.equal(g.seats[0].heroId, 'HERO_1');
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'S' }, m);
  assert.ok(!acts(g, m).some(a => a.choice === 'special'), 'no hero has a weapon');
  g = act(act(g, 'RESPOND', { choice: 'attack' }, m), 'ANNOUNCE', {}, m);
  for (let i = 0; i < 2; i++) g = act(act(g, 'COMBAT_PICK', { side: 'monster', letter: 'B' }, m), 'COMBAT_PICK', { side: 'hero', letter: 'A' }, m);
  assert.ok(g.log.some(e => e.kind === 'monster-dead'));
  assert.equal(g.heroes[0].hp, 12, "the owner's HP, untouched");
});

test('kit: a hero on a monster-group set, on a set missing once combat is complete, or on a non-slot weapon is still an error', () => {
  const errs = parts => validateContent(ownerContent({ ...blank(), heroes: heroes8(), ...parts })).errors.map(e => e.message);
  const group = fullCombat().filter(c => c.setId === 'S01').map(c => ({ ...c, owner: 'monster-group' }));
  assert.ok(errs({ combat: group }).includes('HERO_1: combatSetId S01 is not a hero combat set'), 'S01 exists as a monster-group set');
  const s09 = fullCombat().filter(c => c.setId === 'S09');
  assert.ok(errs({ heroes: heroes8().map((h, i) => (i ? h : { ...h, combatSetId: 'S09' })), combat: s09 }).includes('HERO_1: combatSetId S09 is not a hero combat set'));
  // 36 combat copies without S08: complete, so HERO_8 no longer waits.
  const noS08 = fullCombat().filter(c => c.setId !== 'S08').map(c => (c.id === 'COMBAT_S01_A' ? { ...c, copies: 4 } : c));
  assert.deepEqual(errs({ combat: noS08, heroes: heroes8().map(h => ({ ...h, specialWeaponId: null })) }), ['HERO_8: combatSetId S08 is not a hero combat set']);
  assert.ok(errs({ heroes: heroes8().map((h, i) => (i ? h : { ...h, specialWeaponId: 'XBOW_9' })) }).includes('HERO_1: specialWeaponId XBOW_9 does not exist'));
});
