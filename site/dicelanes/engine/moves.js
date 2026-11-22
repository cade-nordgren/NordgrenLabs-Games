// Which cells may be marked. Lanes are marked left to right only; anything left of the newest mark is gone for good.
import { LANES, LAST, MARKS_BEFORE_LAST } from './lanes.js';

export const indexOf = (l, value) => LANES[l].nums.indexOf(value);
const newest = (sheet, l) => sheet.marks[l].length ? sheet.marks[l][sheet.marks[l].length - 1] : -1;

export function canMark(sheet, closed, l, i) {
  if (!(l >= 0 && l < 4) || closed[l] || !Number.isInteger(i) || i < 0 || i > LAST) return false;
  if (i <= newest(sheet, l)) return false;
  return i !== LAST || sheet.marks[l].length >= MARKS_BEFORE_LAST;
}

// Left of the newest mark and not marked: skipped, never usable again.
export const isSkipped = (sheet, l, i) => i < newest(sheet, l) && !sheet.marks[l].includes(i);

export const whiteSum = dice => dice.w[0] + dice.w[1];

// Phase 1: cells player p may mark with the white sum. Closures from this same phase are not applied yet.
export function whiteMoves(g, p) {
  if (g.turn?.phase !== 'white' || g.turn.chooser !== p) return [];
  const v = whiteSum(g.turn.dice);
  return LANES.map((_, l) => ({ lane: l, index: indexOf(l, v) })).filter(m => canMark(g.players[p], g.closed, m.lane, m.index));
}

// Phase 2: cells the active player may mark with one white die plus that lane's coloured die.
export function colourMoves(g) {
  if (g.turn?.phase !== 'colour') return [];
  const sheet = g.players[g.turn.active], out = [];
  LANES.forEach((_, l) => {
    const c = g.turn.dice.c[l];
    if (c == null) return;
    g.turn.dice.w.forEach((w, die) => {
      const index = indexOf(l, w + c);
      if (canMark(sheet, g.closed, l, index) && !out.some(m => m.lane === l && m.index === index)) out.push({ lane: l, index, die });
    });
  });
  return out;
}
