// Content slot manifest, validation and the full-fidelity start gate (plan 4.7; SP 2, SP 11, RB 2).
// Errors name the exact id. Nothing falls back to a default.
import { tileSlots } from '../engine/tiles.js';

const SIDE_VALUES = ['wall', 'open', 'door', 'gate'];
const STATUS = ['EMPTY', 'DRAFT', 'OWNER_APPROVED', 'FIXTURE'];
const SOURCES = ['owner-original', 'fixture-non-authentic', 'rulebook-structure'];
const MARKS = ['black', 'red', 'yellow', 'blue', 'none'];
const SPECIALS = ['none', 'well', 'rotating', 'rubble'];
const STATS = ['STR', 'AGI', 'ARM', 'LCK'];

const pad = (n, w) => String(n).padStart(w, '0');
const seq = (prefix, count, w = 0) => Array.from({ length: count }, (_, i) => prefix + (w ? pad(i + 1, w) : i + 1));
const combatIds = () => seq('S', 12, 2).flatMap(s => ['A', 'B', 'C'].map(l => `COMBAT_${s}_${l}`));

// key: field in the content object; file: the owner's authoring file in content/original/ (the content kit);
// ids: the placeholder slot ids (positional).
export const CATEGORIES = [
  { key: 'tiles', file: 'tiles.js', label: 'Maze tiles', ids: seq('TILE_', 88, 3) },
  { key: 'board', file: 'board.js', label: 'Board', ids: ['BOARD_01'] },
  { key: 'chamber', file: 'chamber.js', label: 'Central chamber tile', ids: ['CHAMBER_01'] },
  { key: 'heroes', file: 'heroes.js', label: 'Heroes', ids: seq('HERO_', 8), card: true },
  { key: 'specialWeapons', file: 'special-weapons.js', label: 'Special weapon cards', ids: seq('XBOW_', 2), card: true },
  { key: 'combat', file: 'combat.js', label: 'Combat cards', ids: combatIds(), card: true },
  { key: 'treasury', file: 'treasury.js', label: 'Treasury cards', ids: seq('TREASURY_', 33, 3), card: true },
  { key: 'dragon', file: 'dragon.js', label: 'Dragon cards', ids: seq('DRAGON_', 8), card: true },
  { key: 'room', file: 'room.js', label: 'Room cards', ids: seq('ROOM_', 60, 3), card: true },
  { key: 'search', file: 'search.js', label: 'Search cards', ids: seq('SEARCH_', 15, 3), card: true },
  { key: 'roomSearch', file: 'room-search.js', label: 'Room search cards', ids: seq('RSEARCH_', 14, 3), card: true },
  { key: 'chest', file: 'chest.js', label: 'Chest cards', ids: seq('CHEST_', 14, 3), card: true },
  { key: 'door', file: 'door.js', label: 'Door cards', ids: seq('DOOR_', 15, 3), card: true },
  { key: 'monster', file: 'monster.js', label: 'Monster cards', ids: seq('MONSTER_', 15, 3), card: true },
  { key: 'rings', file: 'rings.js', label: 'Ring cards', ids: seq('RING_', 4), card: true },
];
export const TILE_TOTAL = 88;
export const CARD_TOTAL = 224;
const CARD_KEYS = ['treasury', 'room', 'search', 'roomSearch', 'chest', 'door']; // cards that can carry gold
const ALL_CARD_KEYS = [...CARD_KEYS, 'monster', 'dragon', 'combat', 'specialWeapons'];
// Content key -> deck category of its cards (plan 4.7).
const DECK_OF = { room: 'ROOM', search: 'SEARCH', roomSearch: 'ROOM_SEARCH', chest: 'CHEST', door: 'DOOR', treasury: 'TREASURY', monster: 'MONSTER' };
const DRAW_DECKS = Object.values(DECK_OF);
const KINDS = {
  ROOM: ['empty', 'treasure', 'item', 'monster', 'trap', 'branch'],
  DOOR: ['opens', 'closed', 'trap'],
  other: ['treasure', 'item', 'trap', 'secret-door', 'empty', 'branch', 'reshuffle'],
};
const FOLLOW_UP = ['SEARCH', 'CHEST', 'DOOR', 'MONSTER'];
const TURN_DISP = ['continue', 'end-turn', 'ongoing'];
const CARD_DISP = ['UNDER_SAME_DECK', 'RETAIN_HELD', 'RETAIN_TREASURY', 'REMOVE', 'RESHUFFLE_DECK'];
const PRIVACY = ['public', 'private-to-holder'];
// Spec v3 section 4: a kept card is usable only through its own `use` block (never a universal use action).
const USE_TIMINGS = ['turn-action', 'encounter-special'];
const AFTER_USE = ['keep', 'bottom', 'remove'];
const REACTIONS = ['monster-flees', 'combat', 'strike-then-flight', 'strike-then-combat', 'flight-succeeds', 'other'];
const RING_TRIGGERS = ['passive', 'once-per-game', 'on-test', 'on-encounter'];
const BEATS = { A: 'B', B: 'C', C: 'A' };
const SIDE_NAMES = ['N', 'E', 'S', 'W'];

// Expr (plan 4.6): an integer, or { die, plus, minusStat, plusCount, reg } with a die or a register.
export function exprErrors(x) {
  if (Number.isInteger(x)) return [];
  if (!x || typeof x !== 'object') return ['expression must be an integer or an object'];
  const err = [];
  if (!x.die && !x.reg) err.push('expression needs a die or a register');
  if (x.die !== undefined && !['D6', 'D12'].includes(x.die)) err.push(`die ${x.die} not D6/D12`);
  if (x.plus !== undefined && !Number.isInteger(x.plus)) err.push('plus must be an integer');
  if (x.minusStat !== undefined && x.minusStat !== null && !STATS.includes(x.minusStat)) err.push(`minusStat ${x.minusStat} not a stat`);
  if (x.plusCount !== undefined && x.plusCount !== null && x.plusCount !== 'treasuryCards') err.push(`plusCount ${x.plusCount} not allowed`);
  return err;
}

const bool = v => v === undefined || typeof v === 'boolean';
// Effect primitives (plan 4.6) and their argument checks. An unknown op is an error.
const OP_ARGS = {
  ROLL_D12: e => (typeof e.store === 'string' ? [] : ['store must be a name']),
  ROLL_D6: e => (typeof e.store === 'string' ? [] : ['store must be a name']),
  CHECK_STAT: e => [...(STATS.includes(e.stat) ? [] : [`stat ${e.stat} not a stat`]), ...exprErrors(e.modifier ?? 0), ...effectErrors(e.onPass || []), ...effectErrors(e.onFail || [])],
  DEAL_DAMAGE: e => [...(['hero', 'monster'].includes(e.target) ? [] : ['target must be hero or monster']), ...exprErrors(e.amount)],
  HEAL: e => [...exprErrors(e.amount), ...(bool(e.uncapped) ? [] : ['uncapped must be true/false'])],
  DRAW_CARD: e => [...(DRAW_DECKS.includes(e.deck) ? [] : [`deck ${e.deck} not a draw deck`]), ...(['resolve', 'keep'].includes(e.then) ? [] : ['then must be resolve or keep'])],
  RETAIN_CARD: e => (['held', 'treasury'].includes(e.into) ? [] : ['into must be held or treasury']),
  RETURN_CARD_TO_BOTTOM: e => (e.card === undefined || e.card === 'self' ? [] : ['card must be self']),
  SHUFFLE_DECK: e => (e.deck === undefined || DRAW_DECKS.includes(e.deck) ? [] : [`deck ${e.deck} not a draw deck`]),
  GRANT_TREASURE: () => [],
  REMOVE_TREASURY_CARDS: e => (e.who === 'hero' ? [] : ['who must be hero']),
  MOVE_HERO: e => [...(['prev', 'adjacent-choice', ...SIDE_NAMES].includes(e.to) ? [] : [`to ${e.to} not allowed`]), ...(bool(e.drawRoom) && bool(e.applyTile) ? [] : ['drawRoom/applyTile must be true/false'])],
  END_TURN: () => [],
  CONTINUE_MOVEMENT: () => [],
  SET_CONDITION: e => [...(typeof e.id === 'string' && e.id ? [] : ['condition id required']), ...(e.turns === undefined || e.turns === null || (Number.isInteger(e.turns) && e.turns > 0) ? [] : ['turns must be a positive integer or null']), ...effectErrors(e.onTurnStart || [])],
  CLEAR_CONDITION: e => (typeof e.id === 'string' && e.id ? [] : ['condition id required']),
  REQUEST_CHOICE: e => (Array.isArray(e.options) && e.options.length ? e.options.flatMap(o => [...(typeof o.label === 'string' ? [] : ['option label required']), ...effectErrors(o.effects || [])]) : ['options required']),
  REQUEST_COMBAT: e => (bool(e.ambush) ? [] : ['ambush must be true/false']),
  MONSTER_ENCOUNTER: e => (bool(e.ambush) ? [] : ['ambush must be true/false']),
  OPEN_TEMPORARY_PASSAGE: e => ([...SIDE_NAMES, 'any-orthogonal'].includes(e.side) ? [] : [`side ${e.side} not allowed`]),
  ROTATE_TILE: e => (e.degrees === 90 ? [] : ['degrees must be 90']),
};
export const EFFECT_OPS = Object.keys(OP_ARGS);
export function effectErrors(list) {
  if (!Array.isArray(list)) return ['effects must be a list'];
  return list.flatMap(e => (e && OP_ARGS[e.op] ? OP_ARGS[e.op](e).map(m => `${e.op}: ${m}`) : [`unknown effect op ${e && e.op}`]));
}

const entriesOf = (content, key) => (key === 'board' || key === 'chamber' ? (content[key] ? [content[key]] : []) : content[key] || []);
const copiesOf = e => (e.copies === undefined ? 1 : e.copies);
const sidesValid = s => s && ['N', 'E', 'S', 'W'].every(k => SIDE_VALUES.includes(s[k]));

function fieldErrors(key, e, content) {
  const err = [];
  if (typeof e.id !== 'string' || !e.id) return ['missing id'];
  if (!STATUS.includes(e.status)) err.push(content.mode === 'original' ? `status ${e.status} must be "draft" or "approved"` : `status ${e.status} not one of ${STATUS.join('/')}`);
  if (e.text !== undefined && typeof e.text !== 'string') err.push('text must be words in quotes');
  if (!SOURCES.includes(e.source)) err.push(`source ${e.source} not allowed`);
  if (!Number.isInteger(copiesOf(e)) || copiesOf(e) < 1) err.push('copies must be an integer >= 1');
  if (content.mode === 'original' && e.status === 'FIXTURE') err.push('fixture data in original content');
  if (content.mode === 'fixture' && e.status !== 'FIXTURE') err.push('fixture content must have status FIXTURE');
  if (key === 'tiles') {
    if (!sidesValid(e.sides)) err.push('sides must give N/E/S/W as wall/open/door/gate');
    else if (!['N', 'E', 'S', 'W'].includes(e.entrySide) || e.sides[e.entrySide] === 'wall') err.push('entrySide must be a non-wall side');
    // Pending gate, plan 13 #8: a door or gate on the entry-dot side is undocumented; such a tile
    // cannot be loaded until the owner rules on it with the real tile data (M4).
    else if (e.sides[e.entrySide] !== 'open') err.push(`entrySide is a ${e.sides[e.entrySide]}: PENDING owner ruling on door/gate entry sides (plan 13 #8)`);
    if (!MARKS.includes(e.mark)) err.push(`mark ${e.mark} not allowed`);
    if (!SPECIALS.includes(e.special)) err.push(`special ${e.special} not allowed`);
    // RB 6.2: a dark room has exactly two or three exits. D29: no ban on special plus mark.
    if (e.mark === 'blue' && sidesValid(e.sides)) {
      const open = Object.values(e.sides).filter(v => v !== 'wall').length;
      if (open < 2 || open > 3) err.push('blue (dark) tile needs 2 or 3 non-wall sides');
    }
  }
  if (key === 'board') err.push(...boardErrors(e));
  if (key === 'chamber' && e.sides !== undefined) err.push('sides are no longer used: the chamber is one cell, open on every side (spec v3, D36)');
  if (key === 'heroes') {
    if (!e.stats || STATS.some(s => !Number.isInteger(e.stats[s]) || e.stats[s] < 1 || e.stats[s] > 12)) err.push('stats STR/AGI/ARM/LCK must be integers 1..12');
    if (!Number.isInteger(e.hp) || e.hp < 1) err.push('hp must be an integer >= 1');
    if (!setOwnedBy(content, e.combatSetId, 'hero')) err.push(`combatSetId ${e.combatSetId} is not a hero combat set`);
    if (e.specialWeaponId !== null && e.specialWeaponId !== undefined && !(content.specialWeapons || []).some(w => w.id === e.specialWeaponId)) err.push(`specialWeaponId ${e.specialWeaponId} does not exist`);
  }
  if (DECK_OF[key]) {
    const deck = DECK_OF[key];
    if (e.deck !== deck) err.push(`deck must be ${deck}`);
    if (key !== 'monster') {
      if (!(KINDS[deck] || KINDS.other).includes(e.kind)) err.push(`kind ${e.kind} not allowed in ${deck}`);
      if (e.followUpDeck !== undefined && e.followUpDeck !== null && !FOLLOW_UP.includes(e.followUpDeck)) err.push(`followUpDeck ${e.followUpDeck} not one of ${FOLLOW_UP.join('/')}`);
      if (e.turnDisposition !== undefined && !TURN_DISP.includes(e.turnDisposition)) err.push(`turnDisposition ${e.turnDisposition} not allowed`);
      if (e.cardDisposition !== undefined && !CARD_DISP.includes(e.cardDisposition)) err.push(`cardDisposition ${e.cardDisposition} not allowed`);
      if (e.privacy !== undefined && !PRIVACY.includes(e.privacy)) err.push(`privacy ${e.privacy} not allowed`);
      if (!bool(e.specialWeapon)) err.push('specialWeapon must be true/false');
      err.push(...effectErrors(e.effects || []));
      if (e.use !== undefined) err.push(...useErrors(e));
    }
  }
  if (key === 'monster') err.push(...monsterErrors(e, content));
  if (key === 'combat') {
    if (typeof e.setId !== 'string' || !e.setId) err.push('setId required');
    if (!['hero', 'monster-group'].includes(e.owner)) err.push('owner must be hero or monster-group');
    if (!['A', 'B', 'C'].includes(e.letter)) err.push(`letter ${e.letter} not A/B/C`);
    // D13, plan 4.7: a card may only list the letter it beats; ties are always 1 each.
    else if (!Array.isArray(e.doubleAgainst || []) || (e.doubleAgainst || []).some(l => l !== BEATS[e.letter])) err.push(`doubleAgainst may only list ${BEATS[e.letter]} (the letter ${e.letter} beats)`);
  }
  if (key === 'specialWeapons') {
    if (!Array.isArray(e.heroIds) || !e.heroIds.length || e.heroIds.some(h => !(content.heroes || []).some(x => x.id === h))) err.push('heroIds must name existing heroes');
    if (!(e.uses === null || e.uses === undefined || (Number.isInteger(e.uses) && e.uses > 0))) err.push('uses must be a positive integer or null');
    err.push(...effectErrors(e.effects || []));
  }
  if (key === 'rings') {
    if (!RING_TRIGGERS.includes(e.trigger)) err.push(`trigger ${e.trigger} not allowed`);
    err.push(...effectErrors(e.effects || []));
  }
  if (key === 'dragon' && !['sleeping', 'awake'].includes(e.kind)) err.push('dragon kind must be sleeping or awake');
  if (CARD_KEYS.includes(key) && e.gold !== undefined && (!Number.isInteger(e.gold) || e.gold < 0)) err.push('gold must be an integer >= 0');
  return err;
}

// use: { timing, effects, afterUse, uses }. 'encounter-special' is a special weapon (RB 8.1: it reads the
// monster's Attack reaction), so the card must say specialWeapon: true.
function useErrors(e) {
  const u = e.use;
  if (!u || typeof u !== 'object' || Array.isArray(u)) return ['use must be { timing, effects, afterUse, uses }'];
  const err = [];
  if (!USE_TIMINGS.includes(u.timing)) err.push(`use timing ${u.timing} not one of ${USE_TIMINGS.join('/')}`);
  else if (u.timing === 'encounter-special' && e.specialWeapon !== true) err.push('use timing encounter-special needs specialWeapon: true');
  if (u.afterUse !== undefined && !AFTER_USE.includes(u.afterUse)) err.push(`use afterUse ${u.afterUse} not one of ${AFTER_USE.join('/')}`);
  if (!(u.uses === undefined || u.uses === null || (Number.isInteger(u.uses) && u.uses > 0))) err.push('use uses must be a positive integer or null');
  err.push(...effectErrors(u.effects || []).map(m => `use: ${m}`));
  return err;
}

const setOwnedBy = (content, setId, owner) => {
  const cards = (content.combat || []).filter(c => c.setId === setId);
  return !!setId && cards.length > 0 && cards.every(c => c.owner === owner);
};

// Plan 4.7 MonsterCardDefinition: HP, a monster-group combat set, three reactions.
// A special weapon reads the attack reaction (RB 8.1), so there is no special key.
function monsterErrors(e, content) {
  const err = [];
  if (!Number.isInteger(e.hp) || e.hp < 1) err.push('hp must be an integer >= 1');
  if (!setOwnedBy(content, e.groupId, 'monster-group')) err.push(`groupId ${e.groupId} is not a monster-group combat set`);
  for (const k of ['attack', 'wait', 'flee']) {
    const r = e.reactions?.[k];
    if (!r) { err.push(`reaction ${k} missing`); continue; }
    if (!REACTIONS.includes(r.type)) { err.push(`reaction ${k}: type ${r.type} not allowed`); continue; }
    if (r.type.startsWith('strike')) err.push(...exprErrors(r.damage).map(m => `reaction ${k}: damage ${m}`));
    if (['strike-then-flight', 'flight-succeeds'].includes(r.type) && k !== 'flee') err.push(`reaction ${k}: ${r.type} only under flee`);
    err.push(...effectErrors(r.effects || []).map(m => `reaction ${k}: ${m}`));
  }
  if (e.reactions && Object.keys(e.reactions).some(k => !['attack', 'wait', 'flee'].includes(k))) err.push('reactions may only be attack, wait, flee');
  return err;
}

// Spec v2 (owner, 2026-11-19), RB 4, SP 3: a 10 x 11 footprint (110 squares) in either orientation,
// four corner towers. D36 (spec v3): the chamber is one cell at a centre position (on an even side either
// of the two middle squares), open on every side. Orientation and the cell come from data.
export const BOARD_CELLS = 110;
function boardErrors(b) {
  const err = [];
  if (!Number.isInteger(b.width) || !Number.isInteger(b.height) || b.width * b.height !== BOARD_CELLS) return [`board must be ${BOARD_CELLS} squares, 10 x 11 or 11 x 10 (width ${b.width}, height ${b.height})`];
  const corners = [[0, 0], [b.width - 1, 0], [0, b.height - 1], [b.width - 1, b.height - 1]];
  if (!Array.isArray(b.towers) || b.towers.length !== 4 || !corners.every(([x, y]) => b.towers.some(t => t.x === x && t.y === y))) err.push('towers must be the four corners');
  else if (!b.towers.every(t => sidesValid(t.sides))) err.push('every tower needs N/E/S/W sides');
  const c = b.center;
  const mid = (v, n) => Math.abs(v - (n - 1) / 2) <= 0.5;
  if (!Array.isArray(c) || c.length !== 1 || !Number.isInteger(c[0]?.x) || !Number.isInteger(c[0]?.y)) err.push('center must be exactly one square, [{ x, y }]: the chamber is one cell (spec v3)');
  else if (!mid(c[0].x, b.width) || !mid(c[0].y, b.height)) err.push('center must sit in the middle of the board');
  // Movement geometry (owner ruling): printed walls, fixed edges and the chamber's outer sides.
  const edgeRef = /^(\d+),(\d+)\|[NESW]$/;
  const onBoard = k => { const m = edgeRef.exec(k); return m && +m[1] < b.width && +m[2] < b.height; };
  if (b.walls !== undefined && (!Array.isArray(b.walls) || b.walls.some(k => !onBoard(k)))) err.push("walls must be a list of 'x,y|SIDE' on the board");
  if (b.edges !== undefined) {
    if (!b.edges || typeof b.edges !== 'object' || Array.isArray(b.edges)) err.push("edges must be { 'x,y|SIDE': 'wall' | 'door' | 'gate' }");
    else for (const [k, v] of Object.entries(b.edges)) if (!onBoard(k) || !['wall', 'door', 'gate'].includes(v)) err.push(`edge ${k}: must be 'x,y|SIDE' on the board, set to 'wall', 'door' or 'gate'`);
  }
  if (b.chamberSides !== undefined) err.push('chamberSides is no longer used: the chamber is one cell, open on every side (spec v3, D36)');
  return err;
}

// Ordinary squares: 105 on a 110-square board, more than the 88 tiles; D27 makes the rest impassable.
export const mazeSquares = b => b.width * b.height - 4 - 1;

export function validateContent(content) {
  const errors = [];
  const categories = CATEGORIES.map(cat => {
    const entries = entriesOf(content, cat.key);
    let defined = 0, verified = 0, approved = 0, draft = 0;
    for (const e of entries) {
      // Owner content uses the slot's own placeholder ids, so every message names a real slot.
      const errs = content.mode === 'original' && !cat.ids.includes(e.id) ? [`id ${e.id} is not one of ${cat.ids[0]}..${cat.ids.at(-1)}`, ...fieldErrors(cat.key, e, content)] : fieldErrors(cat.key, e, content);
      errs.forEach(m => errors.push({ category: cat.key, id: e.id, message: `${e.id || '(no id)'}: ${m}` }));
      defined += copiesOf(e);
      if (!errs.length && e.status === 'OWNER_APPROVED') verified += copiesOf(e);
      if (e.status === 'OWNER_APPROVED') approved += copiesOf(e);
      if (e.status === 'DRAFT') draft += copiesOf(e);
    }
    const seen = new Set();
    for (const e of entries) {
      if (seen.has(e.id)) errors.push({ category: cat.key, id: e.id, message: `${e.id}: duplicate id` });
      seen.add(e.id);
    }
    const required = cat.ids.length;
    // A play-test layers whole fixture decks over the owner's, so only real content is held to the count.
    // Fixture tiles may fill every maze square (NON-AUTHENTIC; owner content is 88).
    const cap = content.mode === 'fixture' && cat.key === 'tiles' && content.board ? mazeSquares(content.board) : required;
    if (defined > cap && content.mode !== 'mixed') errors.push({ category: cat.key, id: null, message: `${cat.label}: copies total ${defined}, expected ${cap}` });
    return { key: cat.key, label: cat.label, required, defined, verified, approved, draft, missing: cat.ids.slice(defined) };
  });
  // Plan 4.7: every combat set has exactly one A, one B and one C.
  const sets = new Map();
  for (const c of entriesOf(content, 'combat')) if (typeof c.setId === 'string') sets.set(c.setId, [...(sets.get(c.setId) || []), c.letter]);
  for (const [setId, letters] of sets) if (letters.slice().sort().join('') !== 'ABC') errors.push({ category: 'combat', id: setId, message: `${setId}: a combat set needs exactly one A, one B and one C` });
  // RB 9, SP 8: seven sleeping and one awake.
  const dragon = entriesOf(content, 'dragon');
  if (dragon.length && dragon.reduce((s, e) => s + copiesOf(e), 0) === 8) {
    const awake = dragon.filter(e => e.kind === 'awake').reduce((s, e) => s + copiesOf(e), 0);
    if (awake !== 1) errors.push({ category: 'dragon', id: null, message: 'Dragon cards: need exactly 7 sleeping and 1 awake' });
  }
  const lines = categories.map(c => `${c.label} ${c.defined}/${c.required} (${c.approved} approved, ${c.draft} draft)`);
  const fullStartAllowed = content.mode === 'original' && !errors.length && categories.every(c => c.verified === c.required);
  // A fixture or play-test game needs every category represented and valid (M2 plays cards, combat and the dragon).
  const fixturePlayable = ['fixture', 'mixed'].includes(content.mode) && categories.every(c => c.defined > 0) && !errors.length;
  return { categories, errors, lines, fullStartAllowed, fixturePlayable };
}

// The content kit (docs/content-kit/README.md). Owner files say status "draft" or "approved" and leave out
// source; this turns them into the definitions above. Board and chamber files hold one object or null.
const SINGLE = ['board', 'chamber'];
const STATUS_WORDS = { draft: 'DRAFT', approved: 'OWNER_APPROVED' };
const owned = e => (e && typeof e === 'object' ? { source: 'owner-original', ...e, status: STATUS_WORDS[e.status] ?? e.status } : e);
export function ownerContent(parts) {
  const c = { mode: 'original' };
  for (const cat of CATEGORIES) {
    const v = parts[cat.key];
    if (SINGLE.includes(cat.key)) {
      if (v !== null && (typeof v !== 'object' || Array.isArray(v))) throw new Error(`${cat.file}: must hold one { ... } entry or null`);
      c[cat.key] = v && owned(v);
    } else {
      if (!Array.isArray(v)) throw new Error(`${cat.file}: must hold a list [ ... ]`);
      c[cat.key] = v.map(owned);
    }
  }
  return c;
}

// Reads every slot file from a folder URL (index.js uses its own folder; the checker can point elsewhere).
export async function loadSlots(base) {
  const parts = {};
  for (const cat of CATEGORIES) {
    try {
      parts[cat.key] = (await import(new URL(cat.file, base))).default;
    } catch (err) {
      throw new Error(`${cat.file}: ${err.message}`, { cause: err });
    }
  }
  return parts;
}

export const MIXED_BANNER = 'Play-test: your content plus NON-AUTHENTIC fill-in';
// Spec v2 #13: shown until the completion gate passes; the app never claims exactness.
export const APP_LABEL = 'Mechanics engine under verification';
// Spec v2 #12: exactly which categories of this content are synthetic (fixture data), for the developer banner.
export const syntheticCategories = content => CATEGORIES.filter(cat => entriesOf(content, cat.key).some(e => e?.status === 'FIXTURE')).map(cat => `${cat.label}: synthetic`);
// Play-test content: every owner entry, plus the whole fixture deck for each slot the owner has not filled.
// Fixture heroes and monsters keep their fixture combat sets; a fixture crossbow needs its fixture hero.
export function mixContent(own, fx) {
  const full = new Set(validateContent(own).categories.filter(c => c.defined >= c.required).map(c => c.key));
  const m = { mode: 'mixed', label: MIXED_BANNER };
  for (const { key } of CATEGORIES) m[key] = SINGLE.includes(key) ? own[key] || fx[key] : [...own[key], ...(full.has(key) ? [] : fx[key])];
  // The dragon deck is never layered: mixing could hold two awake cards and break the 7 sleeping / 1 awake odds (RB 9.3).
  m.dragon = full.has('dragon') ? own.dragon : fx.dragon;
  const fxUsed = list => list.some(e => e.status === 'FIXTURE');
  if (full.has('combat') && (fxUsed(m.heroes) || fxUsed(m.monster))) m.combat = [...m.combat, ...fx.combat];
  const heroIds = new Set(m.heroes.map(h => h.id));
  m.specialWeapons = m.specialWeapons.filter(w => w.status !== 'FIXTURE' || w.heroIds.every(id => heroIds.has(id)));
  const weaponIds = new Set(m.specialWeapons.map(w => w.id));
  m.heroes = m.heroes.map(h => (h.status === 'FIXTURE' && h.specialWeaponId && !weaponIds.has(h.specialWeaponId) ? { ...h, specialWeaponId: null } : h));
  return m;
}

// The content status the title screen and `node tools/keep-content.js report` both show.
// mode: the content the game would run on ('mixed' play-test, 'fixture', or 'original'), for `synthetic`.
export function contentStatus(own, fx, mode = 'mixed') {
  const report = validateContent(own);
  const mixed = mixContent(own, fx);
  const mixReport = validateContent(mixed);
  const done = report.categories.filter(c => c.verified === c.required).length;
  const gap = report.categories.findIndex(c => c.verified < c.required);
  const written = report.categories.some(c => c.defined > 0);
  const n = report.errors.length;
  const mixedAllowed = written && !n && mixReport.fixturePlayable;
  return {
    report, mixed, mixedAllowed,
    synthetic: syntheticCategories({ mixed, fixture: fx, original: own }[mode]),
    note: `${done} of ${report.categories.length} content categories verified. The full game unlocks when every slot holds approved original content.`,
    lines: report.lines,
    start: report.fullStartAllowed ? 'Start is on: every slot holds approved original content.'
      : `Start is off until the content is complete: ${n ? `${n} content ${n === 1 ? 'error' : 'errors'} to fix` : report.lines[gap]}.`,
    play: mixedAllowed ? `Play-test is on: your ${report.categories.reduce((s, c) => s + c.defined, 0)} written slots plus NON-AUTHENTIC fill-in.`
      : !written ? 'Play-test is off until you write some entries.'
      : n ? `Play-test is off until the ${n} content ${n === 1 ? 'error is' : 'errors are'} fixed.`
      : `Play-test is off: ${mixReport.errors[0]?.message || 'a slot has nothing in it'}.`,
  };
}

// Lookup maps, built once per content object.
const cache = new WeakMap();
export function contentIndex(content) {
  let ix = cache.get(content);
  if (ix) return ix;
  const byId = list => new Map((list || []).map(e => [e.id, e]));
  const tiles = byId(content.tiles);
  ix = {
    tiles,
    tileSlots: new Map(tileSlots(content.tiles || []).map(s => [s.slotId, tiles.get(s.defId)])),
    heroes: byId(content.heroes),
    rings: byId(content.rings),
    cards: byId(ALL_CARD_KEYS.flatMap(k => content[k] || [])),
  };
  cache.set(content, ix);
  return ix;
}

// FNV-1a over the content JSON: a save only resumes against the content it was made with.
export function contentHash(content) {
  let h = 0x811c9dc5;
  const s = JSON.stringify(content);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
