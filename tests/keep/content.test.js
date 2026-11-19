// Slot manifest, validation and the start gate. T01, T30.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, TILE_TOTAL, CARD_TOTAL, validateContent } from '../../site/keep/content/schema.js';
import { createGame } from '../../site/keep/engine/reducer.js';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { FX } from './helpers.js';

const errorsFor = content => validateContent(content).errors.map(e => e.message);

test('T01 manifest: 88 tiles plus one chamber, 224 cards in 12 categories (RB 2, SP 2, SP 12 #1)', () => {
  const cards = CATEGORIES.filter(c => c.card);
  assert.equal(cards.length, 12);
  assert.equal(cards.reduce((s, c) => s + c.ids.length, 0), CARD_TOTAL);
  assert.equal(CARD_TOTAL, 224);
  const counts = Object.fromEntries(CATEGORIES.map(c => [c.key, c.ids.length]));
  assert.deepEqual(counts, { tiles: 88, board: 1, chamber: 1, heroes: 8, specialWeapons: 2, combat: 36, treasury: 33, dragon: 8, room: 60, search: 15, roomSearch: 14, chest: 14, door: 15, monster: 15, rings: 4 });
  assert.equal(TILE_TOTAL, 88);
  for (const c of CATEGORIES) assert.equal(new Set(c.ids).size, c.ids.length, `${c.key} ids unique`);
});

test('T01 empty original content reports every slot missing (SP 11, as "Maze tiles 0/88 (0 approved, 0 draft)")', () => {
  const r = validateContent(ORIGINAL);
  assert.ok(r.lines.includes('Maze tiles 0/88 (0 approved, 0 draft)'));
  assert.ok(r.lines.includes('Room cards 0/60 (0 approved, 0 draft)'));
  assert.ok(r.lines.includes('Heroes 0/8 (0 approved, 0 draft)'));
  assert.ok(r.lines.includes('Monster cards 0/15 (0 approved, 0 draft)'));
  const tiles = r.categories.find(c => c.key === 'tiles');
  assert.equal(tiles.missing.length, 88);
  assert.equal(tiles.missing[0], 'TILE_001');
  assert.equal(r.categories.find(c => c.key === 'combat').missing[0], 'COMBAT_S01_A');
  assert.deepEqual(r.errors, []);
  assert.equal(r.fullStartAllowed, false);
});

test('T01 fixture content: playable in fixture mode, never counts as verified (SP 11)', () => {
  const r = validateContent(FX);
  assert.deepEqual(r.errors, []);
  assert.equal(r.fixturePlayable, true);
  assert.equal(r.fullStartAllowed, false);
  const tiles = r.categories.find(c => c.key === 'tiles');
  assert.equal(tiles.defined, 104, 'fixture tiles fill 104 of the 105 maze squares (owner content is 88)');
  assert.equal(tiles.verified, 0);
});

test('T01 validation errors name the exact id (SP 11, plan 4.7)', () => {
  const tile = (over) => ({ ...FX, tiles: [{ ...FX.tiles[0], ...over }, ...FX.tiles.slice(1)] });
  const cases = [
    { cite: 'plan 4.7: entry side must not be a wall', content: tile({ id: 'BAD_T1', entrySide: 'N', sides: { N: 'wall', E: 'open', S: 'open', W: 'open' } }), match: /^BAD_T1: entrySide/ },
    { cite: 'RB 6.2: dark room has 2 or 3 exits', content: tile({ id: 'BAD_T2', mark: 'blue' }), match: /^BAD_T2: blue/ },
    { cite: 'plan 4.7: enum values only', content: tile({ id: 'BAD_T3', mark: 'green' }), match: /^BAD_T3: mark green/ },
    { cite: 'RB 2: 88 tiles exist', content: { ...ORIGINAL, tiles: [{ id: 'TILE_001', status: 'DRAFT', source: 'owner-original', copies: 89, sides: { N: 'open', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none' }] }, match: /Maze tiles: copies total 89, expected 88/ },
    { cite: 'NON-AUTHENTIC fixture tiles stop at one per maze square', content: tile({ copies: 22 }), match: /Maze tiles: copies total 106, expected 104/ },
    { cite: 'RB 3: stats 1..12', content: { ...FX, heroes: [{ ...FX.heroes[0], id: 'BAD_H', stats: { STR: 13, AGI: 4, ARM: 9, LCK: 4 } }, ...FX.heroes.slice(1)] }, match: /^BAD_H: stats/ },
    { cite: 'plan 4.7: duplicate ids', content: { ...FX, rings: [FX.rings[0], FX.rings[0]] }, match: /FX_RING_1: duplicate id/ },
    { cite: 'RB 4: towers on the corners', content: { ...FX, board: { ...FX.board, towers: [{ ...FX.board.towers[0], x: 1 }, ...FX.board.towers.slice(1)] } }, match: /FX_BOARD: towers must be the four corners/ },
    { cite: 'RB 4: center in the middle', content: { ...FX, board: { ...FX.board, center: [{ x: 1, y: 2 }, { x: 2, y: 2 }] } }, match: /FX_BOARD: center must sit in the middle/ },
    { cite: 'D39: the chamber is two squares', content: { ...FX, board: { ...FX.board, center: [{ x: 4, y: 5 }] } }, match: /FX_BOARD: center must be exactly two squares/ },
    { cite: 'D39: the two chamber squares are side by side', content: { ...FX, board: { ...FX.board, center: [{ x: 4, y: 5 }, { x: 4, y: 5 }] } }, match: /FX_BOARD: center squares must be side by side/ },
    { cite: 'spec v2: 110 squares', content: { ...FX, board: { ...FX.board, width: 6, height: 5 } }, match: /FX_BOARD: board must be 110 squares, 10 x 11 or 11 x 10 \(width 6, height 5\)/ },
    { cite: 'SP 11: fixture data never in original content', content: { ...ORIGINAL, heroes: [FX.heroes[0]] }, match: /FX_HERO_1: fixture data in original content/ },
    { cite: 'RB 9: 7 sleeping, 1 awake', content: { ...ORIGINAL, dragon: [{ id: 'D_S', status: 'DRAFT', source: 'rulebook-structure', kind: 'sleeping', copies: 6 }, { id: 'D_A', status: 'DRAFT', source: 'rulebook-structure', kind: 'awake', copies: 2 }] }, match: /need exactly 7 sleeping and 1 awake/ },
  ];
  for (const c of cases) assert.ok(errorsFor(c.content).some(m => c.match.test(m)), `${c.cite}: ${errorsFor(c.content).join(' | ')}`);
});

test('D29: a special room may also carry a mark; data decides (D29, application-only)', () => {
  const content = { ...FX, tiles: [{ ...FX.tiles[0], id: 'FX_MARKED_WELL', mark: 'black', special: 'well' }, ...FX.tiles.slice(1)] };
  assert.deepEqual(errorsFor(content), []);
});

// Complete, owner-approved synthetic content: the only way the full Start opens.
function approvedContent() {
  const A = { status: 'OWNER_APPROVED', source: 'owner-original' };
  const o = 'open';
  const all = { N: o, E: o, S: o, W: o };
  const c = { mode: 'original' };
  for (const cat of CATEGORIES) c[cat.key] = cat.ids.map(id => ({ ...A, id }));
  // 11 x 10 (spec v2 allows either orientation), but this chamber pair is off the middle column.
  c.board = { ...A, id: 'BOARD_01', width: 11, height: 10, towers: [[0, 0], [10, 0], [0, 9], [10, 9]].map(([x, y]) => ({ x, y, sides: all })), center: [{ x: 4, y: 4 }, { x: 5, y: 4 }] };
  c.chamber = { ...A, id: 'CHAMBER_01' };
  c.tiles = [{ ...A, id: 'TILE_001', copies: 88, sides: all, entrySide: 'S', mark: 'black', special: 'none' }];
  c.heroes = c.heroes.map((h, i) => ({ ...h, class: 'x', stats: { STR: 5, AGI: 5, ARM: 5, LCK: 5 }, hp: 10, combatSetId: `S0${i + 1}`, specialWeaponId: null }));
  c.dragon = c.dragon.map((d, i) => ({ ...d, kind: i === 0 ? 'awake' : 'sleeping' }));
  // Combat ids COMBAT_Snn_L: S01-S08 hero sets, S09-S12 monster groups (D24).
  c.combat = c.combat.map(x => { const [, set, letter] = x.id.split('_'); return { ...x, setId: set, letter, owner: Number(set.slice(1)) <= 8 ? 'hero' : 'monster-group', doubleAgainst: [] }; });
  c.specialWeapons = c.specialWeapons.map(x => ({ ...x, heroIds: ['HERO_1'], effects: [], uses: null }));
  c.rings = c.rings.map(x => ({ ...x, effects: [], trigger: 'passive' }));
  const deck = { room: 'ROOM', search: 'SEARCH', roomSearch: 'ROOM_SEARCH', chest: 'CHEST', door: 'DOOR', treasury: 'TREASURY' };
  for (const [k, d] of Object.entries(deck)) c[k] = c[k].map(x => ({ ...x, deck: d, kind: d === 'DOOR' ? 'opens' : 'empty', effects: [] }));
  const r = { type: 'combat', damage: null, effects: [] };
  c.monster = c.monster.map(x => ({ ...x, deck: 'MONSTER', hp: 3, groupId: 'S09', reactions: { attack: r, wait: r, flee: r } }));
  return c;
}

test('T30 full Start opens only when every slot is OWNER_APPROVED and valid (SP 11, SP 12 #30)', () => {
  const c = approvedContent();
  // A chamber off the middle is reported, and blocks the start.
  assert.ok(errorsFor(c).some(m => /BOARD_01: center/.test(m)));
  assert.equal(validateContent(c).fullStartAllowed, false);
  c.board = { ...c.board, center: [{ x: 5, y: 4 }, { x: 5, y: 5 }] }; // 11 x 10: the two middle squares (D39)
  const r = validateContent(c);
  assert.deepEqual(r.errors, []);
  assert.ok(r.lines.includes('Maze tiles 88/88 (88 approved, 0 draft)'));
  assert.equal(r.fullStartAllowed, true);
  assert.equal(createGame({ players: ['A'], seed: 1, content: c }).banner, null);
  // One slot back to DRAFT closes the gate again.
  const draft = { ...c, room: [{ ...c.room[0], status: 'DRAFT' }, ...c.room.slice(1)] };
  assert.equal(validateContent(draft).fullStartAllowed, false);
  assert.throws(() => createGame({ players: ['A'], seed: 1, content: draft }), /Full-fidelity start blocked/);
});
