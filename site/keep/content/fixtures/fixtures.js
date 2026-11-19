// NON-AUTHENTIC TEST DATA. Synthetic board, tiles, heroes, rings and cards for tests and the
// developer "Test with fixtures" mode only. Not the original game's content; never shipped as such.
// The first two heroes reuse the rulebook's example stat lines (RB 3, SP 3), hero 1's A card hits B
// twice and one test monster has 4 HP, purely to replay the rulebook's examples (RB 8.5, RB 8.9).
// Every name, value and effect here is made up to exercise the engine.

const F = { status: 'FIXTURE', source: 'fixture-non-authentic' };
const w = 'wall', o = 'open', d = 'door', g = 'gate';
const tile = (id, copies, N, E, S, W, mark, special = 'none') => ({ ...F, id, name: `Fixture ${id}`, copies, sides: { N, E, S, W }, entrySide: 'S', mark, special, effects: [], art: null });
const hero = (n, cls, STR, AGI, ARM, LCK, hp, specialWeaponId = null) => ({ ...F, id: `FX_HERO_${n}`, name: `Test hero ${n}`, class: cls, stats: { STR, AGI, ARM, LCK }, hp, equipment: [], combatSetId: `FX_S0${n}`, specialWeaponId, art: null });
const card = (deck, id, kind, over = {}) => ({ ...F, id, name: `Fixture ${id}`, deck, kind, copies: 1, gold: 0, effects: [], followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false, ...over });
// A combat set: three cards A/B/C; doubles maps a letter to the letter it hits twice.
const combatSet = (setId, owner, doubles = {}) => ['A', 'B', 'C'].map(letter => ({ ...F, id: `FX_COMBAT_${setId}_${letter}`, name: `Fixture ${setId} ${letter}`, setId, owner, letter, doubleAgainst: doubles[letter] ? [doubles[letter]] : [], art: null }));
const reaction = (type, damage = null, effects = []) => ({ type, damage, effects });
const monster = (id, hp, groupId, attack, wait, flee) => ({ ...F, id, name: `Fixture ${id}`, deck: 'MONSTER', copies: 1, hp, groupId, reactions: { attack, wait, flee }, art: null });

export default {
  mode: 'fixture',
  label: 'NON-AUTHENTIC TEST DATA',
  // 10 x 11 (spec v2): corner towers, the chamber over (4,5) and (5,5) (one room, D39), 104 maze squares.
  board: {
    ...F, id: 'FX_BOARD', width: 10, height: 11,
    towers: [
      { x: 0, y: 0, sides: { N: w, E: o, S: o, W: w } },
      { x: 9, y: 0, sides: { N: w, E: w, S: o, W: o } },
      { x: 0, y: 10, sides: { N: o, E: o, S: w, W: w } },
      { x: 9, y: 10, sides: { N: o, E: w, S: w, W: o } },
    ],
    center: [{ x: 4, y: 5 }, { x: 5, y: 5 }],
    // D35, D39: the chamber is open on every outer side. No printed walls or fixed edges, so an empty
    // board is a clean grid (the engine still supports board.walls and board.edges; tests use local data).
  },
  chamber: { ...F, id: 'FX_CHAMBER' },
  // Reference orientation: entry dot on S. Copies total 104, one per maze square, so a whole board can be
  // revealed (owner content is 88; D27 leaves the rest impassable).
  tiles: [
    tile('FX_CROSS', 20, o, o, o, o, 'black'),
    tile('FX_STRAIGHT', 20, o, w, o, w, 'yellow'),
    tile('FX_CORNER', 16, w, o, o, w, 'red'),
    tile('FX_TEE', 24, w, o, o, o, 'black'),
    tile('FX_DEADEND', 8, w, w, o, w, 'black'),
    tile('FX_DARK', 4, o, w, o, w, 'blue'),
    tile('FX_WELL', 2, o, w, o, w, 'none', 'well'),
    tile('FX_ROTATE', 2, w, o, o, w, 'none', 'rotating'),
    tile('FX_RUBBLE', 2, o, w, o, w, 'none', 'rubble'),
    tile('FX_DOORWAY', 2, d, o, o, o, 'black'),
    tile('FX_GATEWAY', 2, g, w, o, w, 'yellow'),
    tile('FX_DARK3', 2, w, o, o, o, 'blue'),
  ],
  heroes: [
    hero(1, 'knight', 6, 4, 9, 4, 17),
    hero(2, 'hunter', 2, 9, 5, 8, 10, 'FX_XBOW_1'),
    hero(3, 'test', 5, 5, 5, 5, 12),
    hero(4, 'test', 7, 3, 6, 4, 14),
    hero(5, 'test', 3, 7, 4, 6, 11),
    hero(6, 'test', 4, 6, 7, 5, 13),
    hero(7, 'test', 8, 4, 5, 3, 15),
    hero(8, 'test', 5, 8, 3, 6, 10),
  ],
  rings: [1, 2, 3, 4].map(n => ({ ...F, id: `FX_RING_${n}`, name: `Test ring ${n}`, power: `Test power ${n}`, effects: [], trigger: 'passive' })),
  specialWeapons: [{ ...F, id: 'FX_XBOW_1', name: 'Fixture crossbow', heroIds: ['FX_HERO_2'], effects: [{ op: 'DEAL_DAMAGE', target: 'monster', amount: 1 }], uses: 1, art: null }],
  // Hero sets S01-S08, monster-group sets S09-S10 (D24 split, provisional). Hero 1's A hits B twice (RB 8.5 example).
  combat: [
    ...combatSet('FX_S01', 'hero', { A: 'B' }),
    ...[2, 3, 4, 5, 6, 7, 8].flatMap(n => combatSet(`FX_S0${n}`, 'hero')),
    ...combatSet('FX_S09', 'monster-group'),
    ...combatSet('FX_S10', 'monster-group', { C: 'A' }),
  ],
  treasury: [
    card('TREASURY', 'FX_TREASURY_A', 'treasure', { copies: 12, gold: 10, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder' }),
    card('TREASURY', 'FX_TREASURY_B', 'treasure', { copies: 10, gold: 20, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder' }),
    card('TREASURY', 'FX_TREASURY_C', 'treasure', { copies: 11, gold: 5, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder' }),
  ],
  // Dragon kinds follow the rulebook structure (7 sleeping, 1 awake, RB 9, SP 8); names are fixtures.
  dragon: [
    { ...F, id: 'FX_DRAGON_SLEEPING', name: 'Fixture sleeping dragon', copies: 7, kind: 'sleeping', art: null },
    { ...F, id: 'FX_DRAGON_AWAKE', name: 'Fixture awake dragon', copies: 1, kind: 'awake', art: null },
  ],
  room: [
    card('ROOM', 'FX_ROOM_EMPTY', 'empty', { copies: 10 }),
    card('ROOM', 'FX_ROOM_COINS', 'treasure', { copies: 2, gold: 7, cardDisposition: 'RETAIN_HELD' }),
    card('ROOM', 'FX_ROOM_MONSTER', 'monster', { copies: 3, effects: [{ op: 'MONSTER_ENCOUNTER', ambush: false }] }),
    card('ROOM', 'FX_ROOM_AMBUSH', 'monster', { effects: [{ op: 'MONSTER_ENCOUNTER', ambush: true }] }),
    card('ROOM', 'FX_ROOM_CHEST', 'branch', { followUpDeck: 'CHEST' }),
    card('ROOM', 'FX_ROOM_CAPTIVE', 'branch', { followUpDeck: 'SEARCH' }),
    card('ROOM', 'FX_ROOM_TRAP', 'trap', { effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -2 } }] }),
    card('ROOM', 'FX_ROOM_TEST', 'trap', { effects: [{ op: 'CHECK_STAT', stat: 'ARM', modifier: 0, onPass: [], onFail: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 2 }] }] }),
    card('ROOM', 'FX_ROOM_TONIC', 'item', { effects: [{ op: 'HEAL', amount: 3 }] }),
    card('ROOM', 'FX_ROOM_FORK', 'item', { gold: 4, effects: [{ op: 'REQUEST_CHOICE', options: [{ label: 'Take it', effects: [{ op: 'RETAIN_CARD', into: 'held' }] }, { label: 'Leave it', effects: [{ op: 'RETURN_CARD_TO_BOTTOM', card: 'self' }] }] }] }),
    card('ROOM', 'FX_ROOM_DRAFT', 'empty', { effects: [{ op: 'CONTINUE_MOVEMENT' }] }),
    card('ROOM', 'FX_ROOM_PASSAGE', 'empty', { turnDisposition: 'continue' }),
    card('ROOM', 'FX_ROOM_CURSE', 'trap', { effects: [{ op: 'SET_CONDITION', id: 'FX_CURSE', turns: 2, onTurnStart: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }] }] }),
    card('ROOM', 'FX_ROOM_BLESSING', 'item', { effects: [{ op: 'CLEAR_CONDITION', id: 'FX_CURSE' }] }),
    card('ROOM', 'FX_ROOM_PUSH', 'trap', { effects: [{ op: 'MOVE_HERO', to: 'prev', drawRoom: false, applyTile: true }] }),
    card('ROOM', 'FX_ROOM_SPIN', 'trap', { effects: [{ op: 'ROTATE_TILE', degrees: 90 }] }),
    card('ROOM', 'FX_ROOM_DICE', 'trap', { effects: [{ op: 'ROLL_D6', store: 'fx' }, { op: 'DEAL_DAMAGE', target: 'hero', amount: { reg: 'fx', plus: -3 } }] }),
    card('ROOM', 'FX_ROOM_SATCHEL', 'item', { effects: [{ op: 'DRAW_CARD', deck: 'CHEST', then: 'keep' }] }),
    card('ROOM', 'FX_ROOM_THIEF', 'trap', { effects: [{ op: 'REMOVE_TREASURY_CARDS', who: 'hero' }] }),
    card('ROOM', 'FX_ROOM_SHOVE', 'trap', { effects: [{ op: 'MOVE_HERO', to: 'adjacent-choice', drawRoom: true, applyTile: true }] }),
    card('ROOM', 'FX_ROOM_STOP', 'trap', { effects: [{ op: 'END_TURN' }, { op: 'HEAL', amount: 99 }] }),
    // Synthetic items for the spec v3 inventory mechanics (made up, NON-AUTHENTIC): a one-use turn-action
    // item that goes under its deck, a reusable special weapon card, and a special weapon whose effect is pending.
    card('ROOM', 'FX_ROOM_SALVE', 'item', { gold: 1, cardDisposition: 'RETAIN_HELD', use: { timing: 'turn-action', effects: [{ op: 'HEAL', amount: 2 }], afterUse: 'bottom', uses: 1 } }),
    card('ROOM', 'FX_ROOM_SPEAR', 'item', { cardDisposition: 'RETAIN_HELD', specialWeapon: true, use: { timing: 'encounter-special', effects: [{ op: 'DEAL_DAMAGE', target: 'monster', amount: 1 }], afterUse: 'keep', uses: null } }),
    card('ROOM', 'FX_ROOM_RELIC', 'item', { cardDisposition: 'RETAIN_HELD', specialWeapon: true }),
  ],
  search: [
    card('SEARCH', 'FX_SEARCH_CAPTIVE', 'item', { gold: 5, effects: [{ op: 'GRANT_TREASURE' }] }),
    card('SEARCH', 'FX_SEARCH_EMPTY', 'empty'),
  ],
  roomSearch: [
    card('ROOM_SEARCH', 'FX_RSEARCH_SECRET', 'secret-door', { copies: 2, effects: [{ op: 'OPEN_TEMPORARY_PASSAGE', side: 'any-orthogonal' }] }),
    card('ROOM_SEARCH', 'FX_RSEARCH_EMPTY', 'empty', { copies: 2 }),
    card('ROOM_SEARCH', 'FX_RSEARCH_TRINKET', 'treasure', { gold: 3, cardDisposition: 'RETAIN_HELD' }),
    card('ROOM_SEARCH', 'FX_RSEARCH_LURKER', 'branch', { followUpDeck: 'MONSTER' }),
  ],
  chest: [
    card('CHEST', 'FX_CHEST_GOLD', 'treasure', { copies: 2, gold: 11, effects: [{ op: 'GRANT_TREASURE' }] }),
    card('CHEST', 'FX_CHEST_EMPTY', 'empty'),
    card('CHEST', 'FX_CHEST_SHUFFLE', 'reshuffle', { cardDisposition: 'RESHUFFLE_DECK' }),
    card('CHEST', 'FX_CHEST_NEEDLE', 'trap', { effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }, { op: 'SHUFFLE_DECK', deck: 'ROOM_SEARCH' }] }),
  ],
  door: [
    card('DOOR', 'FX_DOOR_OPENS', 'opens', { copies: 3 }),
    card('DOOR', 'FX_DOOR_STUCK', 'closed', { copies: 2 }),
    card('DOOR', 'FX_DOOR_TRAP', 'trap', { effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 2 }] }),
  ],
  monster: [
    // RB 8.5 example: a 4-HP monster that answers Attack with combat (stand-in, fixture only).
    monster('FX_MON_BRUTE', 4, 'FX_S09', reaction('combat'), reaction('combat'), reaction('strike-then-combat', 2)),
    monster('FX_MON_SHY', 2, 'FX_S09', reaction('monster-flees'), reaction('monster-flees'), reaction('flight-succeeds')),
    monster('FX_MON_BITER', 3, 'FX_S10', reaction('combat'), reaction('strike-then-combat', { die: 'D6', plus: -2 }), reaction('strike-then-flight', 3)),
  ],
};
