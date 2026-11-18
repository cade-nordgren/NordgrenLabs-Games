// NON-AUTHENTIC TEST DATA. Synthetic board, tiles, heroes and rings for tests and the
// developer "Test with fixtures" mode only. Not the original game's content; never shipped as such.
// The first two heroes reuse the rulebook's example stat lines (RB 3, SP 3) purely to check
// test arithmetic; everything else here is made up.

const F = { status: 'FIXTURE', source: 'fixture-non-authentic' };
const w = 'wall', o = 'open';
const tile = (id, copies, N, E, S, W, mark, special = 'none') => ({ ...F, id, name: `Fixture ${id}`, copies, sides: { N, E, S, W }, entrySide: 'S', mark, special, effects: [], art: null });
const hero = (n, cls, STR, AGI, ARM, LCK, hp) => ({ ...F, id: `FX_HERO_${n}`, name: `Test hero ${n}`, class: cls, stats: { STR, AGI, ARM, LCK }, hp, equipment: [], combatSetId: null, specialWeaponId: null, art: null });

export default {
  mode: 'fixture',
  label: 'NON-AUTHENTIC TEST DATA',
  // 6 x 5: corner towers, center (2,2)-(3,2), 24 maze squares.
  board: {
    ...F, id: 'FX_BOARD', width: 6, height: 5,
    towers: [
      { x: 0, y: 0, sides: { N: w, E: o, S: o, W: w } },
      { x: 5, y: 0, sides: { N: w, E: w, S: o, W: o } },
      { x: 0, y: 4, sides: { N: o, E: o, S: w, W: w } },
      { x: 5, y: 4, sides: { N: o, E: w, S: w, W: o } },
    ],
    center: [{ x: 2, y: 2 }, { x: 3, y: 2 }],
    walls: [],
  },
  chamber: { ...F, id: 'FX_CHAMBER', sides: { a: { N: o, E: o, S: o, W: w }, b: { N: w, E: o, S: o, W: o } } },
  // Reference orientation: entry dot on S. Copies total 88.
  tiles: [
    tile('FX_CROSS', 20, o, o, o, o, 'black'),
    tile('FX_STRAIGHT', 20, o, w, o, w, 'yellow'),
    tile('FX_CORNER', 16, w, o, o, w, 'red'),
    tile('FX_TEE', 16, w, o, o, o, 'black'),
    tile('FX_DEADEND', 8, w, w, o, w, 'black'),
    tile('FX_DARK', 4, o, w, o, w, 'blue'),
    tile('FX_WELL', 2, o, w, o, w, 'none', 'well'),
    tile('FX_ROTATE', 2, w, o, o, w, 'none', 'rotating'),
  ],
  heroes: [
    hero(1, 'knight', 6, 4, 9, 4, 17),
    hero(2, 'hunter', 2, 9, 5, 8, 10),
    hero(3, 'test', 5, 5, 5, 5, 12),
    hero(4, 'test', 7, 3, 6, 4, 14),
    hero(5, 'test', 3, 7, 4, 6, 11),
    hero(6, 'test', 4, 6, 7, 5, 13),
    hero(7, 'test', 8, 4, 5, 3, 15),
    hero(8, 'test', 5, 8, 3, 6, 10),
  ],
  rings: [1, 2, 3, 4].map(n => ({ ...F, id: `FX_RING_${n}`, name: `Test ring ${n}`, power: `Test power ${n}`, effects: [], trigger: 'passive' })),
  // Card decks are M2 fixtures.
  specialWeapons: [], combat: [], treasury: [], dragon: [], room: [], search: [], roomSearch: [], chest: [], door: [], monster: [],
};
