import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, POINTS, LAST, triangular, score, standings, emptySheet } from '../../site/dicelanes/engine/lanes.js';
import { canMark, isSkipped, whiteMoves, colourMoves, indexOf } from '../../site/dicelanes/engine/moves.js';
import { newGame, reduce, validState, endReason } from '../../site/dicelanes/engine/reducer.js';
import { record, undo, cleanHist } from '../../site/dicelanes/engine/history.js';

const R = 0, Y = 1, G = 2, B = 3;
const phys = (names = ['Ana']) => newGame({ mode: 'physical', names, seed: 1 });
const dig = (names = ['Ana', 'Ben']) => newGame({ mode: 'digital', names, seed: 7 });
// Rolls, then replaces the dice with known values (the reducer treats state as data).
const rolled = (g, w, c) => {
  const n = reduce(g, { type: 'roll' });
  assert.notEqual(n, g);
  n.turn.dice = { w, c };
  return n;
};
const act = (g, a) => { const n = reduce(g, a); assert.notEqual(n, g, `rejected: ${JSON.stringify(a)}`); return n; };
const marks = (g, p, l, idxs) => idxs.reduce((s, index) => act(s, { type: 'mark', player: p, lane: l, index }), g);

test('lane sequences are exact', () => {
  assert.deepEqual(LANES.map(l => l.id), ['red', 'yellow', 'green', 'blue']);
  assert.deepEqual(LANES[R].nums, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(LANES[Y].nums, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(LANES[G].nums, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.deepEqual(LANES[B].nums, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
});

test('every cross count 0..12 scores the points table', () => {
  assert.deepEqual(POINTS, [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78]);
  for (let n = 0; n <= 12; n++) {
    const s = emptySheet('x');
    s.marks[R] = Array.from({ length: Math.min(n, 11) }, (_, i) => i);
    s.locks[R] = n === 12;
    assert.equal(score(s).lanes[R], triangular(n), `${n} crosses`);
  }
});

test('a single mark registers exactly once', () => {
  const g = marks(phys(), 0, R, [3]);
  assert.deepEqual(g.players[0].marks[R], [3]);
  assert.equal(reduce(g, { type: 'mark', player: 0, lane: R, index: 3 }), g, 'repeat rejected');
  assert.equal(score(g.players[0]).total, 1);
});

test('skipping leaves cells behind for good', () => {
  const g = marks(phys(), 0, G, [4]);
  assert.ok(isSkipped(g.players[0], G, 2));
  assert.equal(reduce(g, { type: 'mark', player: 0, lane: G, index: 2 }), g, 'no backward mark');
  assert.ok(!canMark(g.players[0], g.closed, G, 4));
  assert.ok(canMark(g.players[0], g.closed, G, 5));
});

test('lock needs five marks first, then adds a cross and closes the colour', () => {
  let g = marks(phys(['Ana', 'Ben']), 0, R, [0, 1, 2, 3]);
  assert.equal(reduce(g, { type: 'mark', player: 0, lane: R, index: LAST }), g, 'four marks: no lock');
  g = marks(g, 0, R, [4]);
  g = act(g, { type: 'mark', player: 0, lane: R, index: LAST });
  assert.ok(g.players[0].locks[R] && g.closed[R]);
  assert.equal(score(g.players[0]).lanes[R], POINTS[7], 'six numbers plus the lock');
  assert.equal(reduce(g, { type: 'mark', player: 1, lane: R, index: 0 }), g, 'closed for everyone');
  assert.equal(reduce(g, { type: 'close', lane: R }), g, 'cannot reopen a lock someone holds');
});

test('penalties are -5 each and the fourth ends the game', () => {
  let g = phys();
  for (let k = 1; k <= 3; k++) {
    g = act(g, { type: 'penalty', player: 0, add: true });
    assert.equal(score(g.players[0]).total, -5 * k);
  }
  g = act(g, { type: 'penalty', player: 0, add: false });
  assert.equal(g.players[0].penalties, 2);
  g = act(g, { type: 'penalty', player: 0, add: true });
  g = act(g, { type: 'penalty', player: 0, add: true });
  assert.equal(g.status, 'over');
  assert.equal(endReason(g), 'penalties');
});

test('physical: two closed colours end the game at once', () => {
  let g = act(phys(), { type: 'close', lane: Y });
  assert.equal(g.status, 'playing');
  g = act(g, { type: 'close', lane: Y });
  assert.ok(!g.closed[Y], 'a colour closed elsewhere can be reopened');
  g = act(act(g, { type: 'close', lane: Y }), { type: 'close', lane: B });
  assert.equal(g.status, 'over');
  assert.equal(endReason(g), 'locks');
  assert.equal(reduce(g, { type: 'mark', player: 0, lane: R, index: 0 }), g, 'nothing after the end');
});

test('dice are always 1..6 over many seeded rolls; closed colours roll no die', () => {
  let g = newGame({ mode: 'digital', names: ['Solo'], seed: 12345 });
  g.closed[Y] = true;
  for (let k = 0; k < 2000; k++) {
    g = reduce(g, { type: 'roll' });
    const d = g.turn.dice;
    assert.ok([...d.w, d.c[R], d.c[G], d.c[B]].every(x => Number.isInteger(x) && x >= 1 && x <= 6));
    assert.equal(d.c[Y], null);
    g = reduce(reduce(g, { type: 'white', lane: null }), { type: 'colour', lane: null });
    g.players[0].penalties = 0; // keep rolling
  }
  const a = reduce(dig(), { type: 'roll' }), b = reduce(dig(), { type: 'roll' });
  assert.deepEqual(a.turn.dice, b.turn.dice, 'same seed, same dice');
});

test('phase 1 then phase 2, turn order rotates', () => {
  let g = rolled(dig(['Ana', 'Ben', 'Cy']), [3, 4], [1, 2, 6, 5]);
  assert.equal(g.turn.chooser, 0);
  assert.deepEqual(whiteMoves(g, 0).map(m => m.lane), [R, Y, G, B]);
  assert.deepEqual(whiteMoves(g, 1), [], 'not your choice yet');
  g = act(g, { type: 'white', lane: R }); // Ana: red 7
  assert.deepEqual(g.players[0].marks[R], [indexOf(R, 7)]);
  g = act(g, { type: 'white', lane: null }); // Ben passes
  g = act(g, { type: 'white', lane: G }); // Cy: green 7
  assert.equal(g.turn.phase, 'colour');
  // Ana: white 4 + green 6 = 10 on green, white 3 + yellow 2 = 5, red 7 already marked so red 4/5 are behind
  const opts = colourMoves(g);
  assert.ok(opts.some(m => m.lane === G && m.index === indexOf(G, 10)));
  assert.ok(!opts.some(m => m.lane === R), 'red 4 and 5 are left of the 7');
  g = act(g, { type: 'colour', die: 1, lane: G });
  assert.equal(g.turn.phase, 'roll');
  assert.equal(g.turn.active, 1);
  assert.equal(g.turn.n, 2);
  assert.equal(g.players.reduce((s, p) => s + p.penalties, 0), 0);
  assert.equal(reduce(g, { type: 'white', lane: R }), g, 'must roll first');
});

test('penalty only for the active player when neither action marked', () => {
  let g = rolled(dig(), [1, 1], [1, 1, 1, 1]);
  g = act(g, { type: 'white', lane: null });
  g = act(g, { type: 'white', lane: R }); // Ben marks red 2 in phase 1
  g = act(g, { type: 'colour', lane: null });
  assert.deepEqual(g.players.map(p => p.penalties), [1, 0]);
  // Active marks only in phase 1: no penalty.
  g = rolled(g, [2, 2], [1, 1, 1, 1]);
  g = act(g, { type: 'white', lane: Y }); // Ben (active) yellow 4
  g = act(g, { type: 'white', lane: null });
  g = act(g, { type: 'colour', lane: null });
  assert.deepEqual(g.players.map(p => p.penalties), [1, 0]);
});

// Ana and Ben both have five red marks, ready to lock red with a 12.
function bothReady() {
  let g = dig();
  for (const p of g.players) p.marks[R] = [0, 1, 2, 3, 4];
  return rolled(g, [6, 6], [6, 1, 1, 1]);
}

test('two players may lock the same colour in phase 1; it then closes before phase 2', () => {
  let g = act(bothReady(), { type: 'white', lane: R });
  assert.ok(!g.closed[R], 'closure waits until everyone has chosen');
  assert.ok(whiteMoves(g, 1).some(m => m.lane === R), 'Ben may still lock red');
  g = act(g, { type: 'white', lane: R });
  assert.ok(g.closed[R] && g.players[0].locks[R] && g.players[1].locks[R]);
  assert.equal(g.turn.phase, 'colour');
  assert.ok(!colourMoves(g).some(m => m.lane === R), 'closed colour unusable in phase 2');
  assert.equal(reduce(g, { type: 'colour', die: 0, lane: R }), g);
  g = act(g, { type: 'colour', lane: null });
  g = rolled(g, [3, 3], [null, 3, 3, 3]);
  assert.ok(!whiteMoves(g, 1).some(m => m.lane === R), 'and in later turns');
});

test('digital: two locked colours end the game after the turn resolves', () => {
  let g = dig();
  for (const p of g.players) { p.marks[R] = [0, 1, 2, 3, 4]; p.marks[Y] = [0, 1, 2, 3, 4]; }
  g = rolled(g, [6, 6], [6, 6, 1, 1]);
  g = act(g, { type: 'white', lane: R }); // Ana locks red
  g = act(g, { type: 'white', lane: Y }); // Ben locks yellow
  assert.equal(g.status, 'playing', 'phase 2 still happens');
  assert.equal(g.turn.phase, 'colour');
  g = act(g, { type: 'colour', lane: null });
  assert.equal(g.status, 'over');
  assert.equal(g.turn.phase, 'over');
  assert.equal(endReason(g), 'locks');
  assert.equal(g.players[0].penalties, 0, 'Ana marked in phase 1');
});

test('digital: a fourth penalty ends the game', () => {
  let g = newGame({ mode: 'digital', names: ['Solo'], seed: 3 });
  g.players[0].penalties = 3;
  g = rolled(g, [1, 1], [1, 1, 1, 1]);
  g = act(act(g, { type: 'white', lane: null }), { type: 'colour', lane: null });
  assert.equal(g.status, 'over');
  assert.equal(endReason(g), 'penalties');
});

test('undo restores locks, closed colours and dice', () => {
  let g = bothReady(), hist = [];
  const before = g;
  for (const a of [{ type: 'white', lane: R }, { type: 'white', lane: R }, { type: 'colour', lane: null }]) {
    hist = record(hist, g);
    g = act(g, a);
  }
  const rolledAgain = reduce(g, { type: 'roll' });
  assert.deepEqual(rolledAgain.turn.dice.c[R], null, 'red die gone after the lock');
  let u = undo(hist); u = undo(u.hist); u = undo(u.hist);
  assert.deepEqual(u.g, before);
  assert.ok(!u.g.closed[R] && !u.g.players[0].locks[R]);
  // Undoing a roll and rolling again gives the same dice.
  let s = dig(), h = record([], s);
  const first = reduce(s, { type: 'roll' }).turn.dice;
  s = undo(h).g;
  assert.deepEqual(reduce(s, { type: 'roll' }).turn.dice, first);
});

test('serialise, validate and restore round trip', () => {
  let g = rolled(dig(['Ana', 'Ben']), [2, 5], [3, 3, 3, 3]);
  g = act(g, { type: 'white', lane: B });
  const back = JSON.parse(JSON.stringify(g));
  assert.ok(validState(back));
  assert.deepEqual(reduce(back, { type: 'white', lane: null }), reduce(g, { type: 'white', lane: null }));
  assert.ok(validState(marks(phys(), 0, R, [0, 2])));
  assert.equal(cleanHist([JSON.stringify(g), '{"v":2}', 'nope', 5]).length, 1);
  const bad = [
    null, {}, { ...back, v: 2 }, { ...back, mode: 'x' }, { ...back, players: [] },
    { ...back, closed: [1, 0, 0, 0] }, { ...back, turn: { ...back.turn, active: 9 } },
    { ...back, turn: { ...back.turn, dice: { w: [7, 1], c: [1, 1, 1, 1] } } },
    { ...back, players: [{ ...back.players[0], marks: [[3, 1], [], [], []] }, back.players[1]] },
    { ...back, players: [{ ...back.players[0], locks: [true, false, false, false] }, back.players[1]] },
    { ...phys(), turn: back.turn },
  ];
  for (const b of bad) assert.equal(validState(b), false, JSON.stringify(b)?.slice(0, 80));
});

test('standings rank by total, ties share a rank', () => {
  let g = marks(phys(['Ana', 'Ben', 'Cy']), 1, R, [0, 1]);
  g = marks(g, 2, B, [0, 1]);
  const s = standings(g.players);
  assert.deepEqual(s.map(r => [r.i, r.rank, r.total]), [[1, 1, 3], [2, 1, 3], [0, 3, 0]]);
});
