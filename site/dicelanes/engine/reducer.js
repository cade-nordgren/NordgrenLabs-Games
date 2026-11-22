// The whole game as a serialisable reducer: reduce(state, action) returns a new state, or the same state object when
// the action is not legal now. State is plain JSON, so it can be autosaved, undone by snapshot, or sent over a wire.
import { LANES, LAST, MAX_PENALTIES, LOCKS_TO_END, MAX_PLAYERS, MARKS_BEFORE_LAST, emptySheet } from './lanes.js';
import { canMark, applyPicks, noPicks, canEnd, cellChoice } from './moves.js';

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
    // Digital only. phase: roll, choose (everyone picks at once, each taps Done), over. picks and done are per player
    // during choose and empty otherwise.
    turn: mode === 'digital' ? { n: 1, active: 0, phase: 'roll', dice: null, picks: [], done: [] } : null,
  };
}

export const endReason = g =>
  g.players.some(p => p.penalties >= MAX_PENALTIES) ? 'penalties'
  : g.closed.filter(Boolean).length >= LOCKS_TO_END ? 'locks' : null;

function checkEnd(g) {
  if (!endReason(g)) return;
  g.status = 'over';
  if (g.turn) g.turn.phase = 'over';
}

// Physical: marks a cell already known to be legal. The last number also takes the lock and closes the colour.
function mark(g, p, l, i) {
  const sheet = g.players[p];
  sheet.marks[l].push(i);
  if (i !== LAST) return;
  sheet.locks[l] = true;
  g.closed[l] = true;
}

const isLane = l => Number.isInteger(l) && l >= 0 && l < 4;

function step(g, a) {
  const t = g.turn, n = g.players.length;
  switch (a?.type) {
    case 'mark': { // physical: any player, any legal cell
      if (g.mode !== 'physical' || !g.players[a.player] || !canMark(g.players[a.player], g.closed, a.lane, a.index)) return false;
      mark(g, a.player, a.lane, a.index);
      break;
    }
    case 'penalty': { // physical: add one or take one back; digital: the active player ticks or unticks this roll's penalty
      const p = g.players[a.player];
      if (g.mode === 'digital') {
        if (!p || t.phase !== 'choose' || a.player !== t.active || t.done[a.player] || !!t.picks[a.player].penalty === !!a.add) return false;
        t.picks[a.player] = a.add ? { ...noPicks(), penalty: true } : { ...t.picks[a.player], penalty: false }; // ticking clears the picks
        return true;
      }
      if (!p) return false;
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
      Object.assign(t, { phase: 'choose', picks: g.players.map(noPicks), done: g.players.map(() => false) });
      return true; // nothing to check: a roll ends nothing
    }
    case 'pick': // one player's tentative pick: kind white (anyone) or colour (active player, with die 0 or 1)
    case 'unpick': {
      if (g.mode !== 'digital' || t.phase !== 'choose' || !g.players[a.player] || t.done[a.player]) return false;
      const cur = t.picks[a.player];
      let next;
      if (a.type === 'unpick') {
        if (a.kind !== 'white' && a.kind !== 'colour') return false;
        next = { ...cur, [a.kind]: null };
      } else if (a.kind === 'white') {
        if (!isLane(a.lane)) return false;
        next = { ...cur, white: a.lane, penalty: false };
      } else if (a.kind === 'colour') {
        if (a.player !== t.active || !isLane(a.lane) || (a.die !== 0 && a.die !== 1)) return false;
        next = { ...cur, colour: { lane: a.lane, die: a.die }, penalty: false };
      } else return false;
      if (JSON.stringify(next) === JSON.stringify(cur) || !applyPicks(g.players[a.player], g.closed, t.dice, next)) return false;
      t.picks[a.player] = next;
      return true;
    }
    case 'choose': { // a tap on a cell while choosing: add, move, swap or take back a pick (see cellChoice)
      if (g.mode !== 'digital' || t.phase !== 'choose' || !g.players[a.player]) return false;
      const c = cellChoice(g, a.player, a.lane, a.index);
      if (c.state === 'none') return false;
      t.picks[a.player] = c.pick;
      return true;
    }
    case 'done': { // a player is finished choosing (value false reopens); once everyone is, the roll resolves
      const value = a.value !== false;
      if (g.mode !== 'digital' || t.phase !== 'choose' || !g.players[a.player] || t.done[a.player] === value) return false;
      if (value && !canEnd(g, a.player)) return false; // the active player ends with a pick or a penalty
      t.done[a.player] = value;
      if (t.done.every(Boolean)) resolve(g);
      return true;
    }
    default: return false;
  }
  checkEnd(g); // physical mode ends the moment a condition holds
  return true;
}

// Everyone is done: picks become marks, every colour locked this roll closes (several players may lock the same one),
// the active player's ticked penalty counts, then the end check, then the next player's roll.
export function resolve(g) {
  const t = g.turn, locked = new Set();
  g.players.forEach((p, i) => {
    const r = applyPicks(p, g.closed, t.dice, t.picks[i]);
    if (!r) return; // cannot happen for a validated state; never mark anything illegal
    p.marks = r.marks;
    p.locks = r.locks;
    r.locked.forEach(l => locked.add(l));
  });
  for (const l of locked) g.closed[l] = true;
  if (t.picks[t.active].penalty) g.players[t.active].penalties = Math.min(MAX_PENALTIES, g.players[t.active].penalties + 1);
  Object.assign(t, { phase: 'roll', picks: [], done: [] });
  checkEnd(g);
  if (g.status === 'over') return;
  t.active = (t.active + 1) % g.players.length;
  t.n++;
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
        if (p.locks[l] && !g.closed[l]) return false;
      }
    }
    if (g.mode === 'physical') return t === null;
    const n = g.players.length;
    if (!t || !isInt(t.n, 1, 1e6) || !isInt(t.active, 0, n - 1)) return false;
    if (!['roll', 'choose', 'over'].includes(t.phase) || (t.phase === 'over') !== (g.status === 'over')) return false;
    if (t.dice !== null) {
      const d = t.dice;
      if (!d || !Array.isArray(d.w) || d.w.length !== 2 || !d.w.every(x => isInt(x, 1, 6))) return false;
      if (!Array.isArray(d.c) || d.c.length !== 4 || !d.c.every(x => x === null || isInt(x, 1, 6))) return false;
    } else if (t.phase === 'choose') return false;
    if (t.phase !== 'choose') return Array.isArray(t.picks) && !t.picks.length && Array.isArray(t.done) && !t.done.length;
    if (!isBools(t.done, n) || t.done.every(Boolean) || !Array.isArray(t.picks) || t.picks.length !== n) return false;
    for (let p = 0; p < n; p++) {
      const k = t.picks[p];
      // penalty may be missing in saves from before it existed; it reads as false
      if (!k || !(k.white === null || isLane(k.white)) || !(k.penalty === undefined || typeof k.penalty === 'boolean')) return false;
      if (Object.keys(k).some(x => !['white', 'colour', 'penalty'].includes(x)) || (k.penalty && (p !== t.active || k.white !== null || k.colour !== null))) return false;
      if (t.done[p] && !canEnd(g, p)) return false;
      if (k.colour !== null && (p !== t.active || !k.colour || !isLane(k.colour.lane) || ![0, 1].includes(k.colour.die))) return false;
      if (!applyPicks(g.players[p], g.closed, t.dice, k)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
