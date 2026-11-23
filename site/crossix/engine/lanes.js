// Crossix constants and scoring. Pure: no DOM, no state beyond what is passed in.

const UP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DOWN = [...UP].reverse();

// Order and colours are fixed: two lanes counting up, two counting down.
export const LANES = [
  { id: 'red', name: 'Red', nums: UP },
  { id: 'yellow', name: 'Yellow', nums: UP },
  { id: 'green', name: 'Green', nums: DOWN },
  { id: 'blue', name: 'Blue', nums: DOWN },
];
export const LAST = 10; // index of the last number in a lane (12 or 2)
export const MARKS_BEFORE_LAST = 5; // marks a lane needs before its last number
export const MAX_PENALTIES = 4;
export const PENALTY = 5;
export const LOCKS_TO_END = 2;
export const MAX_PLAYERS = 5;

export const triangular = n => n * (n + 1) / 2;
// Points for 0..12 crosses: 0, 1, 3, 6, ... 78.
export const POINTS = Array.from({ length: 13 }, (_, n) => triangular(n));

export const emptySheet = name => ({ name, marks: [[], [], [], []], locks: [false, false, false, false], penalties: 0 });

// A lock counts as one more cross in its lane.
export const crosses = (sheet, l) => sheet.marks[l].length + (sheet.locks[l] ? 1 : 0);

export function score(sheet) {
  const lanes = LANES.map((_, l) => POINTS[crosses(sheet, l)]);
  const penalty = sheet.penalties * PENALTY;
  return { lanes, penalty, total: lanes.reduce((a, b) => a + b, 0) - penalty };
}

// Players by total, highest first; ties keep seating order. Returns [{ i, rank, ...score }].
export function standings(players) {
  const rows = players.map((p, i) => ({ i, ...score(p) })).sort((a, b) => b.total - a.total || a.i - b.i);
  return rows.map(r => ({ ...r, rank: 1 + rows.filter(o => o.total > r.total).length }));
}
