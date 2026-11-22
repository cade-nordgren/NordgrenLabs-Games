// The whole game as a serialisable reducer: reduce(state, action) returns a new state, or the same state object when
// the action is not legal now. State is plain JSON, so it can be autosaved, undone by snapshot, or sent over a wire.
import { LANES, LAST, MAX_PENALTIES, LOCKS_TO_END, MAX_PLAYERS, MARKS_BEFORE_LAST, emptySheet } from './lanes.js';
import { canMark, indexOf, whiteSum } from './moves.js';

// Seeded PRNG (mulberry32) kept in state, so undo then roll again gives the same dice: no fishing for a better roll.
export function rand(g) {
  let t = g.rng = (g.rng + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const d6 = g => 1 + Math.floor(rand(g) * 6);

export function newGame({ mode, names, seed }) {
  return {
    v: 1, mode, seed: seed | 0, rng: seed | 0,
    players: names.map(emptySheet),
    closed: [false, false, false, false],
    status: 'playing',
    // Digital only. phase: roll, white (everyone, from the active player on), colour (active player), over.
    turn: mode === 'digital' ? { n: 1, active: 0, phase: 'roll', dice: null, chooser: null, marked: false, pending: [] } : null,
  };
}

export const endReason = g =>
  g.players.some(p => p.penalties >= MAX_PENALTIES) ? 'penalties'
  : g.closed.filter(Boolean).length >= LOCKS_TO_END ? 'locks' : null;

function checkEnd(g) {
  if (!endReason(g)) return;
  g.status = 'over';
  if (g.turn) { g.turn.phase = 'over'; g.turn.chooser = null; }
}

// Marks a cell already known to be legal. The last number also takes the lock; closeNow false defers the closure
// (phase 1, where several players may lock the same colour at once).
function mark(g, p, l, i, closeNow) {
  const sheet = g.players[p];
  sheet.marks[l].push(i);
  if (i !== LAST) return;
  sheet.locks[l] = true;
  if (closeNow) g.closed[l] = true;
  else if (!g.turn.pending.includes(l)) g.turn.pending.push(l);
}

const isLane = l => Number.isInteger(l) && l >= 0 && l < 4;

function step(g, a) {
  const t = g.turn, n = g.players.length;
  switch (a?.type) {
    case 'mark': { // physical: any player, any legal cell
      if (g.mode !== 'physical' || !g.players[a.player] || !canMark(g.players[a.player], g.closed, a.lane, a.index)) return false;
      mark(g, a.player, a.lane, a.index, true);
      break;
    }
    case 'penalty': { // physical: add one or take one back
      const p = g.players[a.player];
      if (g.mode !== 'physical' || !p) return false;
      if (a.add ? p.penalties >= MAX_PENALTIES : p.penalties <= 0) return false;
      p.penalties += a.add ? 1 : -1;
      break;
    }
    case 'close': { // physical: a colour locked by someone not on this device; toggles while nobody here holds its lock
      if (g.mode !== 'physical' || !isLane(a.lane) || g.players.some(p => p.locks[a.lane])) return false;
      g.closed[a.lane] = !g.closed[a.lane];
      break;
    }
    case 'roll': {
      if (g.mode !== 'digital' || t.phase !== 'roll') return false;
      const w = [d6(g), d6(g)];
      t.dice = { w, c: LANES.map((_, l) => g.closed[l] ? null : d6(g)) }; // closed colours roll no die
      Object.assign(t, { phase: 'white', chooser: t.active, marked: false, pending: [] });
      return true; // nothing to check: a roll ends nothing
    }
    case 'white': { // phase 1, for the player whose choice it is; lane null passes
      if (g.mode !== 'digital' || t.phase !== 'white') return false;
      if (a.lane != null) {
        const i = isLane(a.lane) ? indexOf(a.lane, whiteSum(t.dice)) : -1;
        if (!canMark(g.players[t.chooser], g.closed, a.lane, i)) return false;
        mark(g, t.chooser, a.lane, i, false);
        if (t.chooser === t.active) t.marked = true;
      }
      t.chooser = (t.chooser + 1) % n;
      if (t.chooser === t.active) resolveWhite(g);
      return true; // the end is checked once the turn resolves
    }
    case 'colour': { // phase 2, active player: one white die plus one coloured die; lane null passes
      if (g.mode !== 'digital' || t.phase !== 'colour') return false;
      let marked = false;
      if (a.lane != null) {
        const c = isLane(a.lane) ? t.dice.c[a.lane] : null, w = t.dice.w[a.die];
        if (c == null || w == null) return false;
        const i = indexOf(a.lane, w + c);
        if (!canMark(g.players[t.active], g.closed, a.lane, i)) return false;
        mark(g, t.active, a.lane, i, true);
        marked = true;
      }
      endTurn(g, marked);
      return true;
    }
    default: return false;
  }
  checkEnd(g); // physical mode ends the moment a condition holds
  return true;
}

// After everyone has chosen in phase 1, colours locked during it close for everyone, before the active player's phase 2.
export function resolveWhite(g) {
  for (const l of g.turn.pending) g.closed[l] = true;
  Object.assign(g.turn, { pending: [], chooser: null, phase: 'colour' });
}

function endTurn(g, markedNow) {
  const t = g.turn;
  if (!t.marked && !markedNow) g.players[t.active].penalties++; // only the active player, only with no mark at all
  t.chooser = null;
  t.phase = 'roll';
  checkEnd(g);
  if (g.status === 'over') return;
  t.active = (t.active + 1) % g.players.length;
  t.n++;
  t.marked = false;
}

export function reduce(g, a) {
  if (!g || g.status !== 'playing') return g;
  const next = structuredClone(g);
  return step(next, a) ? next : g;
}

// Stored state is a trust boundary: check every field before playing it.
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const isBools = (a, len) => Array.isArray(a) && a.length === len && a.every(b => typeof b === 'boolean');

export function validState(g) {
  try {
    if (!g || typeof g !== 'object' || g.v !== 1 || (g.mode !== 'physical' && g.mode !== 'digital')) return false;
    if (!Number.isInteger(g.seed) || !Number.isInteger(g.rng) || !['playing', 'over'].includes(g.status)) return false;
    if (!Array.isArray(g.players) || g.players.length < 1 || g.players.length > MAX_PLAYERS || !isBools(g.closed, 4)) return false;
    const t = g.turn;
    for (const p of g.players) {
      if (!p || typeof p.name !== 'string' || p.name.length > 40 || !isInt(p.penalties, 0, MAX_PENALTIES)) return false;
      if (!Array.isArray(p.marks) || p.marks.length !== 4 || !isBools(p.locks, 4)) return false;
      for (let l = 0; l < 4; l++) {
        const m = p.marks[l];
        if (!Array.isArray(m) || !m.every((i, k) => isInt(i, 0, LAST) && (k === 0 || i > m[k - 1]))) return false;
        if (p.locks[l] !== m.includes(LAST) || (p.locks[l] && m.length < MARKS_BEFORE_LAST + 1)) return false;
        if (p.locks[l] && !g.closed[l] && !t?.pending?.includes(l)) return false;
      }
    }
    if (g.mode === 'physical') return t === null;
    if (!t || !isInt(t.n, 1, 1e6) || !isInt(t.active, 0, g.players.length - 1) || typeof t.marked !== 'boolean') return false;
    if (!['roll', 'white', 'colour', 'over'].includes(t.phase) || (t.phase === 'over') !== (g.status === 'over')) return false;
    if (!Array.isArray(t.pending) || !t.pending.every(isLane) || (t.pending.length && t.phase !== 'white')) return false;
    if (t.phase === 'white' ? !isInt(t.chooser, 0, g.players.length - 1) : t.chooser !== null) return false;
    if (t.dice !== null) {
      const d = t.dice;
      if (!d || !Array.isArray(d.w) || d.w.length !== 2 || !d.w.every(x => isInt(x, 1, 6))) return false;
      if (!Array.isArray(d.c) || d.c.length !== 4 || !d.c.every(x => x === null || isInt(x, 1, 6))) return false;
    } else if (t.phase === 'white' || t.phase === 'colour') return false;
    return true;
  } catch {
    return false;
  }
}
