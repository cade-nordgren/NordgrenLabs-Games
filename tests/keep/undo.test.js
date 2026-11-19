// The UI's undo stack (ui/undo.js): several steps back to the last commit point, never past one (D21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushUndo, canUndo, undoBlocked, fitHist } from '../../site/keep/ui/undo.js';

const g = (commits, extra = {}) => ({ commits, status: 'playing', log: [], ...extra });

test('undo stack: steps pile up until a commit point clears them', () => {
  let hist = [];
  const s0 = g(3), s1 = g(3), s2 = g(3), s3 = g(4);
  hist = pushUndo(hist, s0, s1);
  hist = pushUndo(hist, s1, s2);
  assert.equal(hist.length, 2);
  assert.ok(canUndo(hist, s2));
  // Undo twice: each pop leaves a reachable top until the stack is empty.
  let cur = hist.pop();
  assert.equal(cur, s1);
  assert.ok(canUndo(hist, cur));
  cur = hist.pop();
  assert.equal(cur, s0);
  assert.equal(canUndo(hist, cur), false);
  // An action that revealed something (the commit count moved) empties the stack.
  assert.deepEqual(pushUndo([s0, s1], s2, s3), []);
  assert.equal(pushUndo([g(0), g(0), g(0)], g(0), g(0), 3).length, 3, 'capped');
});

test('undo is off once the game is over', () => {
  assert.equal(canUndo([g(1)], g(1, { status: 'over' })), false);
});

test('undo note names the last thing revealed', () => {
  assert.equal(undoBlocked([{ kind: 'reveal' }, { kind: 'move' }]), "Can't undo: a tile was revealed");
  assert.equal(undoBlocked([{ kind: 'reveal' }, { kind: 'draw' }, { kind: 'stop' }]), "Can't undo: a card was drawn");
  assert.equal(undoBlocked([{ kind: 'move' }]), null);
});

test('fitHist keeps the newest snapshots that fit', () => {
  const hist = [{ a: 'x'.repeat(100) }, { b: 'y'.repeat(100) }, { c: 1 }];
  assert.deepEqual(fitHist(hist, 0, 10000), hist);
  const kept = fitHist(hist, 0, 150);
  assert.deepEqual(kept, [hist[1], hist[2]]);
  assert.deepEqual(fitHist(hist, 1000, 150), []);
});
