// The undo stack (D21): full game snapshots back to the most recent commit point. Pure, so tests/keep/undo.test.js
// can check it. The engine's canUndoTo says whether a snapshot is still reachable (same commit count).
import { canUndoTo } from '../engine/view.js';

export const HIST_CAP = 20; // shortcut: full snapshots, at most 20; store diffs if long uncommitted runs ever matter

// After an action from prev to next: one more step back, or an empty stack when the action revealed something.
export const pushUndo = (hist, prev, next, cap = HIST_CAP) => (canUndoTo(prev, next) ? [...hist, prev].slice(-cap) : []);

// A press works only when the top snapshot is reachable and the game is not over (a finished game is saved).
export const canUndo = (hist, game) => !!game && game.status !== 'over' && hist.length > 0 && canUndoTo(hist.at(-1), game);

// Why there is nothing to undo: the latest log entry that was a commit point, in words (null if none).
const BLOCK = { reveal: 'a tile was revealed', draw: 'a card was drawn', shuffle: 'a deck was shuffled', roll: 'dice were rolled', test: 'dice were rolled', exchange: 'the combat cards were shown', throw: 'the combat die was thrown', reaction: "the monster's card was read", 'dragon-wakes': 'the dragon woke' };
export function undoBlocked(log) {
  const e = log.findLast(x => BLOCK[x.kind]);
  return e ? `Can't undo: ${BLOCK[e.kind]}` : null;
}

// The newest snapshots that fit in limit characters of JSON beside base (the rest of the record): undo reaches
// the newest first, so the oldest go when a save or the browser's storage is too small for all of them.
export function fitHist(hist, base, limit) {
  const sizes = hist.map(h => JSON.stringify(h).length + 1);
  let total = base + sizes.reduce((a, b) => a + b, 0), i = 0;
  while (i < hist.length && total > limit) total -= sizes[i++];
  return hist.slice(i);
}
