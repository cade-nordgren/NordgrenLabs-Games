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

// key: field in the content object; ids: the placeholder slot ids (positional).
export const CATEGORIES = [
  { key: 'tiles', label: 'Maze tiles', ids: seq('TILE_', 88, 3) },
  { key: 'board', label: 'Board', ids: ['BOARD_01'] },
  { key: 'chamber', label: 'Central chamber tile', ids: ['CHAMBER_01'] },
  { key: 'heroes', label: 'Heroes', ids: seq('HERO_', 8), card: true },
  { key: 'specialWeapons', label: 'Special weapon cards', ids: seq('XBOW_', 2), card: true },
  { key: 'combat', label: 'Combat cards', ids: combatIds(), card: true },
  { key: 'treasury', label: 'Treasury cards', ids: seq('TREASURY_', 33, 3), card: true },
  { key: 'dragon', label: 'Dragon cards', ids: seq('DRAGON_', 8), card: true },
  { key: 'room', label: 'Room cards', ids: seq('ROOM_', 60, 3), card: true },
  { key: 'search', label: 'Search cards', ids: seq('SEARCH_', 15, 3), card: true },
  { key: 'roomSearch', label: 'Room search cards', ids: seq('RSEARCH_', 14, 3), card: true },
  { key: 'chest', label: 'Chest cards', ids: seq('CHEST_', 14, 3), card: true },
  { key: 'door', label: 'Door cards', ids: seq('DOOR_', 15, 3), card: true },
  { key: 'monster', label: 'Monster cards', ids: seq('MONSTER_', 15, 3), card: true },
  { key: 'rings', label: 'Ring cards', ids: seq('RING_', 4), card: true },
];
export const TILE_TOTAL = 88;
export const CARD_TOTAL = 224;
const M1_CATEGORIES = ['board', 'chamber', 'tiles', 'heroes', 'rings']; // what a fixture game needs to start in M1
const CARD_KEYS = ['treasury', 'room', 'search', 'roomSearch', 'chest', 'door']; // cards that can carry gold

const entriesOf = (content, key) => (key === 'board' || key === 'chamber' ? (content[key] ? [content[key]] : []) : content[key] || []);
const copiesOf = e => (e.copies === undefined ? 1 : e.copies);
const sidesValid = s => s && ['N', 'E', 'S', 'W'].every(k => SIDE_VALUES.includes(s[k]));

function fieldErrors(key, e, content) {
  const err = [];
  if (typeof e.id !== 'string' || !e.id) return ['missing id'];
  if (!STATUS.includes(e.status)) err.push(`status ${e.status} not one of ${STATUS.join('/')}`);
  if (!SOURCES.includes(e.source)) err.push(`source ${e.source} not allowed`);
  if (!Number.isInteger(copiesOf(e)) || copiesOf(e) < 1) err.push('copies must be an integer >= 1');
  if (content.mode === 'original' && e.status === 'FIXTURE') err.push('fixture data in original content');
  if (content.mode === 'fixture' && e.status !== 'FIXTURE') err.push('fixture content must have status FIXTURE');
  if (key === 'tiles') {
    if (!sidesValid(e.sides)) err.push('sides must give N/E/S/W as wall/open/door/gate');
    else if (!['N', 'E', 'S', 'W'].includes(e.entrySide) || e.sides[e.entrySide] === 'wall') err.push('entrySide must be a non-wall side');
    if (!MARKS.includes(e.mark)) err.push(`mark ${e.mark} not allowed`);
    if (!SPECIALS.includes(e.special)) err.push(`special ${e.special} not allowed`);
    // RB 6.2: a dark room has exactly two or three exits. D29: no ban on special plus mark.
    if (e.mark === 'blue' && sidesValid(e.sides)) {
      const open = Object.values(e.sides).filter(v => v !== 'wall').length;
      if (open < 2 || open > 3) err.push('blue (dark) tile needs 2 or 3 non-wall sides');
    }
  }
  if (key === 'board') err.push(...boardErrors(e));
  if (key === 'chamber' && !(sidesValid(e.sides?.a) && sidesValid(e.sides?.b))) err.push('chamber sides a and b must give N/E/S/W');
  if (key === 'heroes') {
    if (!e.stats || STATS.some(s => !Number.isInteger(e.stats[s]) || e.stats[s] < 1 || e.stats[s] > 12)) err.push('stats STR/AGI/ARM/LCK must be integers 1..12');
    if (!Number.isInteger(e.hp) || e.hp < 1) err.push('hp must be an integer >= 1');
    // shortcut: combat set and special weapon cross-references are checked from M2, when those decks have schemas.
  }
  if (key === 'dragon' && !['sleeping', 'awake'].includes(e.kind)) err.push('dragon kind must be sleeping or awake');
  if (CARD_KEYS.includes(key) && e.gold !== undefined && (!Number.isInteger(e.gold) || e.gold < 0)) err.push('gold must be an integer >= 0');
  // shortcut: card effect, reaction and combat-letter fields are validated in M2 with the effect interpreter.
  return err;
}

// RB 4, SP 3: four corner towers, a two-square center in the middle. Size comes from data.
function boardErrors(b) {
  const err = [];
  if (!Number.isInteger(b.width) || !Number.isInteger(b.height) || b.width < 3 || b.height < 3) return ['width and height must be integers >= 3'];
  const corners = [[0, 0], [b.width - 1, 0], [0, b.height - 1], [b.width - 1, b.height - 1]];
  if (!Array.isArray(b.towers) || b.towers.length !== 4 || !corners.every(([x, y]) => b.towers.some(t => t.x === x && t.y === y))) err.push('towers must be the four corners');
  else if (!b.towers.every(t => sidesValid(t.sides))) err.push('every tower needs N/E/S/W sides');
  const c = b.center;
  if (!Array.isArray(c) || c.length !== 2 || Math.abs(c[0].x - c[1].x) + Math.abs(c[0].y - c[1].y) !== 1) err.push('center must be two orthogonally adjacent squares');
  else if ((c[0].x + c[1].x) / 2 !== (b.width - 1) / 2 || (c[0].y + c[1].y) / 2 !== (b.height - 1) / 2) err.push('center must sit in the middle of the board');
  return err;
}

// Ordinary squares on the board versus the 88-tile bag (D27: an empty bag makes the rest impassable).
export const mazeSquares = b => b.width * b.height - 4 - 2;

export function validateContent(content) {
  const errors = [];
  const categories = CATEGORIES.map(cat => {
    const entries = entriesOf(content, cat.key);
    let defined = 0, verified = 0;
    for (const e of entries) {
      const errs = fieldErrors(cat.key, e, content);
      errs.forEach(m => errors.push({ category: cat.key, id: e.id, message: `${e.id || '(no id)'}: ${m}` }));
      defined += copiesOf(e);
      if (!errs.length && e.status === 'OWNER_APPROVED') verified += copiesOf(e);
    }
    const seen = new Set();
    for (const e of entries) {
      if (seen.has(e.id)) errors.push({ category: cat.key, id: e.id, message: `${e.id}: duplicate id` });
      seen.add(e.id);
    }
    const required = cat.ids.length;
    if (defined > required) errors.push({ category: cat.key, id: null, message: `${cat.label}: ${defined} defined, only ${required} exist` });
    return { key: cat.key, label: cat.label, required, defined, verified, missing: cat.ids.slice(defined) };
  });
  // RB 9, SP 8: seven sleeping and one awake.
  const dragon = entriesOf(content, 'dragon');
  if (dragon.length && dragon.reduce((s, e) => s + copiesOf(e), 0) === 8) {
    const awake = dragon.filter(e => e.kind === 'awake').reduce((s, e) => s + copiesOf(e), 0);
    if (awake !== 1) errors.push({ category: 'dragon', id: null, message: 'Dragon cards: need exactly 7 sleeping and 1 awake' });
  }
  if (content.board) {
    const squares = mazeSquares(content.board);
    if (squares > TILE_TOTAL) errors.push({ category: 'board', id: content.board.id, message: `${content.board.id}: ${squares} maze squares but only ${TILE_TOTAL} tiles` });
  }
  const lines = categories.map(c => `${c.label} ${c.verified}/${c.required} verified`);
  const fullStartAllowed = content.mode === 'original' && !errors.length && categories.every(c => c.verified === c.required);
  const fixturePlayable = content.mode === 'fixture' && M1_CATEGORIES.every(k => categories.find(c => c.key === k).defined > 0 && !errors.some(e => e.category === k));
  return { categories, errors, lines, fullStartAllowed, fixturePlayable };
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
    cards: byId(CARD_KEYS.flatMap(k => content[k] || [])),
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
