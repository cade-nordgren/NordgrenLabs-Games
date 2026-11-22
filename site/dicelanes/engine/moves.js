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

// A player's tentative picks for this roll: { white: lane or null, colour: { lane, die } or null }. Only the active
// player may pick a colour. Picks apply white first, then colour, each against the sheet as it stands after the one
// before; closures from this roll wait for the resolve, so every pick checks the colours closed before the roll.
// penalty: the active player's tentative penalty this roll (they may take one any time, and must end with a pick or one).
// A pick and a penalty never stand together: picking unticks the penalty, ticking it clears the picks.
export const noPicks = () => ({ white: null, colour: null, penalty: false });
export const hasPicks = pick => pick.white != null || pick.colour != null;
export const canEnd = (g, p) => p !== g.turn.active || hasPicks(g.turn.picks[p]) || !!g.turn.picks[p].penalty;

export function applyPicks(sheet, closed, dice, pick) {
  const s = { marks: sheet.marks.map(m => [...m]), locks: [...sheet.locks] }, locked = [];
  const put = (l, value) => {
    const i = indexOf(l, value);
    if (!canMark(s, closed, l, i)) return false;
    s.marks[l].push(i);
    if (i === LAST) { s.locks[l] = true; locked.push(l); }
    return true;
  };
  if (pick.white != null && !put(pick.white, whiteSum(dice))) return null;
  if (pick.colour) {
    const c = dice.c[pick.colour.lane], w = dice.w[pick.colour.die];
    if (c == null || w == null || !put(pick.colour.lane, w + c)) return null;
  }
  return { marks: s.marks, locks: s.locks, locked };
}

// Every pick player p could make now, as the whole pick it would leave: [{ lane, index, kind, pick }].
// A cell already picked is not listed (tapping it again takes the pick back).
export function pickOptions(g, p) {
  const t = g.turn;
  if (t?.phase !== 'choose' || t.done[p]) return [];
  const cur = t.picks[p], out = [];
  const tryPick = (kind, lane, value, pick) => {
    const index = indexOf(lane, value);
    if (index < 0 || out.some(o => o.lane === lane && o.index === index && o.kind === kind)) return;
    if (applyPicks(g.players[p], g.closed, t.dice, pick)) out.push({ lane, index, kind, pick });
  };
  LANES.forEach((_, l) => {
    if (cur.white !== l) tryPick('white', l, whiteSum(t.dice), { ...cur, white: l });
    if (p !== t.active || t.dice.c[l] == null) return;
    t.dice.w.forEach((w, die) => {
      if (cur.colour?.lane === l && cur.colour.die === die) return;
      if (cur.colour?.lane === l && indexOf(l, w + t.dice.c[l]) === indexOf(l, t.dice.w[cur.colour.die] + t.dice.c[l])) return;
      tryPick('colour', l, w + t.dice.c[l], { ...cur, colour: { lane: l, die } });
    });
  });
  return out;
}

// Where a pick sits on the sheet: [{ kind, lane, index }].
export function pickedCells(dice, pick) {
  const out = [];
  if (pick.white != null) out.push({ kind: 'white', lane: pick.white, index: indexOf(pick.white, whiteSum(dice)) });
  if (pick.colour) out.push({ kind: 'colour', lane: pick.colour.lane, index: indexOf(pick.colour.lane, dice.w[pick.colour.die] + dice.c[pick.colour.lane]) });
  return out;
}

const countPicks = pick => (pick.white != null ? 1 : 0) + (pick.colour ? 1 : 0);

// What a tap on one cell means for player p while choosing, and the whole pick it leaves:
//   pick  the cell is one of their picks; a tap takes it back
//   legal it can be added beside their picks (a non-active player, with one pick only, may also move it here)
//   swap  legal on its own but not together with their picks; a tap puts it in and drops what conflicts,
//         keeping as many picks as possible (white first on a tie)
//   none  not legal even alone
export function cellChoice(g, p, lane, index) {
  const t = g.turn, none = { state: 'none', pick: null };
  if (t?.phase !== 'choose' || t.done[p] || !g.players[p]) return none;
  const cur = t.picks[p], sheet = g.players[p], ok = k => !!applyPicks(sheet, g.closed, t.dice, k);
  const mine = pickedCells(t.dice, cur).find(c => c.lane === lane && c.index === index);
  if (mine) return { state: 'pick', kind: mine.kind, pick: { ...cur, [mine.kind]: null } };
  const cands = [];
  if (indexOf(lane, whiteSum(t.dice)) === index) cands.push(['white', lane]);
  if (p === t.active && t.dice.c[lane] != null) {
    t.dice.w.forEach((w, die) => { if (indexOf(lane, w + t.dice.c[lane]) === index) cands.push(['colour', { lane, die }]); });
  }
  let add = null, swap = null;
  for (const [kind, value] of cands) {
    const full = { ...cur, penalty: false, [kind]: value }, alone = { ...noPicks(), [kind]: value }; // a pick unticks the penalty
    const free = cur[kind] == null || p !== t.active; // a non-active player's single pick simply moves
    if (free && ok(full)) { add ??= full; continue; }
    const best = ok(full) ? full : ok(alone) ? alone : null;
    if (best && (!swap || countPicks(best) > countPicks(swap))) swap = best;
  }
  return add ? { state: 'legal', pick: add } : swap ? { state: 'swap', pick: swap } : none;
}
