import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, POINTS, LAST, triangular, score, standings, emptySheet } from '../../site/crossix/engine/lanes.js';
import { canMark, isSkipped, pickOptions, cellChoice, indexOf } from '../../site/crossix/engine/moves.js';
import { newGame, reduce, validState, endReason, rollers, rollWinner, rollOff } from '../../site/crossix/engine/reducer.js';
import { record, undo, cleanHist } from '../../site/crossix/engine/history.js';

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
    g = reduce(reduce(g, { type: 'penalty', player: 0, add: true }), { type: 'done', player: 0 });
    assert.equal(g.turn.phase, 'roll');
    g.players[0].penalties = 0; // keep rolling
  }
  const a = reduce(dig(), { type: 'roll' }), b = reduce(dig(), { type: 'roll' });
  assert.deepEqual(a.turn.dice, b.turn.dice, 'same seed, same dice');
});

const W = (player, lane) => ({ type: 'pick', player, kind: 'white', lane });
const C = (player, lane, die) => ({ type: 'pick', player, kind: 'colour', lane, die });
const done = player => ({ type: 'done', player });

test('everyone picks at once, in any order, and changes picks until Done', () => {
  let g = rolled(dig(['Ana', 'Ben', 'Cy']), [3, 4], [1, 2, 6, 5]);
  assert.equal(g.turn.phase, 'choose');
  g = act(g, W(2, G)); // Cy first: green 7
  g = act(g, W(0, R)); // Ana: red 7
  g = act(g, W(0, Y)); // Ana changes her mind: yellow 7
  assert.deepEqual(g.turn.picks[0], { white: Y, colour: null, penalty: false });
  assert.equal(reduce(g, C(1, G, 0)), g, 'only the active player picks a colour');
  assert.equal(reduce(g, W(0, Y)), g, 'the same pick twice changes nothing');
  g = act(g, { type: 'unpick', player: 2, kind: 'white' });
  g = act(g, W(2, B));
  g = act(g, done(2));
  assert.equal(reduce(g, W(2, R)), g, 'no changes after Done');
  g = act(g, { type: 'done', player: 2, value: false });
  g = act(g, done(2));
  assert.deepEqual(g.players.map(p => p.marks), [[[], [], [], []], [[], [], [], []], [[], [], [], []]], 'nothing marked before everyone is done');
  assert.equal(reduce(g, { type: 'roll' }), g, 'no roll while anyone is choosing');
  g = act(g, C(0, G, 1)); // Ana: white 4 + green 6 = 10
  g = act(act(g, done(0)), done(1));
  assert.equal(g.turn.phase, 'roll');
  assert.deepEqual(g.players[0].marks[Y], [indexOf(Y, 7)]);
  assert.deepEqual(g.players[0].marks[G], [indexOf(G, 10)]);
  assert.deepEqual(g.players[2].marks[B], [indexOf(B, 7)]);
  assert.equal(g.turn.active, 1);
  assert.equal(g.turn.n, 2);
  assert.deepEqual(g.players.map(p => p.penalties), [0, 0, 0]);
});

test('the colour pick of the active player is checked after their white pick', () => {
  let g = rolled(dig(), [3, 4], [5, 1, 1, 1]); // white 7; red 3+5=8 or 4+5=9
  g = act(g, W(0, R)); // white 7 on red
  assert.ok(pickOptions(g, 0).some(o => o.kind === 'colour' && o.lane === R && o.index === indexOf(R, 9)));
  g = act(g, C(0, R, 1)); // red 9 after red 7
  g = act(act(g, done(0)), done(1));
  assert.deepEqual(g.players[0].marks[R], [indexOf(R, 7), indexOf(R, 9)]);
  g = rolled(g, [1, 1], [1, 1, 1, 1]);
  // Ben, now active: white 2 and red 1+1=2 on the same lane cannot both be the 2.
  g = act(g, W(1, R));
  assert.equal(reduce(g, C(1, R, 0)), g, 'colour must land right of the white pick');
  g = act(g, { type: 'unpick', player: 1, kind: 'white' });
  g = act(g, C(1, R, 0));
  assert.equal(reduce(g, W(1, R)), g, 'and the white pick may not land on or right of the colour pick');
});

test('picks out of order: colour first, then a white pick that keeps the pair legal', () => {
  let g = rolled(dig(), [3, 4], [5, 1, 1, 1]);
  g = act(g, C(0, R, 1)); // red 9
  g = act(g, W(0, R)); // red 7 sits left of 9 and applies first
  g = act(act(g, done(0)), done(1));
  assert.deepEqual(g.players[0].marks[R], [indexOf(R, 7), indexOf(R, 9)]);
});

const tap = (g, player, lane, value) => ({ type: 'choose', player, lane, index: indexOf(lane, value) });
const state = (g, p, lane, value) => cellChoice(g, p, lane, indexOf(lane, value)).state;

test("owner's example: a pick greys out what it rules out, and tapping the grey cell swaps", () => {
  let g = rolled(dig(), [1, 2], [1, 1, 1, 1]); // white sum 3; red 1+1=2, 2+1=3
  assert.equal(state(g, 0, R, 2), 'legal');
  assert.equal(state(g, 0, R, 3), 'legal');
  g = act(g, tap(g, 0, R, 2)); // red 2: only a colour pick
  assert.deepEqual(g.turn.picks[0], { white: null, colour: { lane: R, die: 0 }, penalty: false });
  assert.equal(state(g, 0, R, 2), 'pick');
  assert.equal(state(g, 0, R, 3), 'swap', 'the white 3 would have to come first, and a second colour pick is not allowed');
  assert.equal(state(g, 0, Y, 3), 'legal', 'a white 3 on yellow goes beside it');
  assert.equal(state(g, 0, R, 5), 'none');
  g = act(g, tap(g, 0, R, 3)); // tap the grey red 3
  assert.deepEqual(g.turn.picks[0], { white: R, colour: null, penalty: false }, 'red 3 is the pick, red 2 is dropped');
  assert.equal(state(g, 0, R, 2), 'swap', 'red 2 is grey now');
  g = act(g, tap(g, 0, R, 3));
  assert.deepEqual(g.turn.picks[0], { white: null, colour: null, penalty: false }, 'tapping a pick takes it back');
});

test('a swap keeps as many picks as it can', () => {
  let g = rolled(dig(), [1, 2], [1, 4, 1, 1]); // white 3; yellow 1+4=5, 2+4=6
  g = act(g, tap(g, 0, Y, 3)); // white on yellow 3
  g = act(g, tap(g, 0, Y, 5)); // colour yellow 5, after it: legal
  assert.deepEqual(g.turn.picks[0], { white: Y, colour: { lane: Y, die: 0 }, penalty: false });
  assert.equal(state(g, 0, Y, 6), 'swap', 'second colour pick');
  g = act(g, tap(g, 0, Y, 6));
  assert.deepEqual(g.turn.picks[0], { white: Y, colour: { lane: Y, die: 1 }, penalty: false }, 'colour replaced, white kept');
  assert.equal(state(g, 0, R, 3), 'swap', 'a second white pick');
  g = act(g, tap(g, 0, R, 3));
  assert.deepEqual(g.turn.picks[0], { white: R, colour: { lane: Y, die: 1 }, penalty: false }, 'white moved, colour kept');
});

test("a non-active player's single pick moves with a tap", () => {
  let g = rolled(dig(), [1, 2], [1, 1, 1, 1]);
  g = act(g, tap(g, 1, R, 3));
  assert.equal(state(g, 1, G, 3), 'legal');
  g = act(g, tap(g, 1, G, 3));
  assert.deepEqual(g.turn.picks[1], { white: G, colour: null, penalty: false });
  assert.equal(reduce(g, tap(g, 1, R, 2)), g, 'no colour picks for a non-active player');
});

const pen = (player, add = true) => ({ type: 'penalty', player, add });

test('the roller cannot end the turn with nothing, but can with only a penalty', () => {
  let g = rolled(dig(), [1, 1], [1, 1, 1, 1]);
  assert.equal(reduce(g, done(0)), g, 'no pick and no penalty: End turn is off');
  g = act(g, pen(0));
  assert.deepEqual(g.turn.picks[0], { white: null, colour: null, penalty: true });
  assert.equal(reduce(g, pen(0)), g, 'already ticked');
  g = act(g, pen(0, false));
  assert.equal(reduce(g, done(0)), g, 'untick takes the way out away again');
  g = act(act(g, pen(0)), done(0));
  assert.equal(g.players[0].penalties, 0, 'tentative until the roll resolves');
  g = act(g, done(1)); // Ben ends with nothing: allowed
  assert.deepEqual(g.players.map(p => p.penalties), [1, 0], 'resolve applies the penalty');
});

test('a pick and a penalty never stand together, and only the roller may take one', () => {
  let g = rolled(dig(), [1, 2], [1, 1, 1, 1]);
  assert.equal(reduce(g, pen(1)), g, 'Ben is not rolling');
  g = act(g, tap(g, 0, R, 3)); // white red 3
  g = act(g, tap(g, 0, Y, 2)); // colour yellow 1+1
  g = act(g, pen(0)); // voluntary, even with legal picks: clears the picks
  assert.deepEqual(g.turn.picks[0], { white: null, colour: null, penalty: true });
  g = act(g, tap(g, 0, Y, 3)); // a pick unticks the penalty
  assert.deepEqual(g.turn.picks[0], { white: Y, colour: null, penalty: false });
  g = act(g, pen(0));
  g = act(g, { type: 'pick', player: 0, kind: 'colour', lane: G, die: 1 }); // the old pick action too
  assert.deepEqual(g.turn.picks[0], { white: null, colour: { lane: G, die: 1 }, penalty: false });
  g = act(g, pen(0));
  g = act(act(g, done(0)), done(1));
  assert.deepEqual(g.players[0].marks, [[], [], [], []], 'resolve never sees both');
  assert.equal(g.players[0].penalties, 1);
  assert.equal(reduce(g, pen(0)), g, 'not between rolls');
});

test('no automatic penalty any more: picks without a ticked box cost nothing', () => {
  let g = rolled(dig(), [2, 2], [1, 1, 1, 1]);
  g = act(g, W(0, Y));
  g = act(act(g, done(1)), done(0));
  assert.deepEqual(g.players.map(p => p.penalties), [0, 0]);
});

// Ana and Ben both have five red marks, ready to lock red with a 12.
function bothReady() {
  let g = dig();
  for (const p of g.players) p.marks[R] = [0, 1, 2, 3, 4];
  return rolled(g, [6, 6], [6, 1, 1, 1]);
}

test('several players may lock the same colour on one roll, from either action', () => {
  let g = act(bothReady(), C(0, R, 0)); // Ana locks red with white 6 + red 6
  g = act(g, W(1, R)); // Ben locks red with the white sum
  assert.ok(!g.closed[R], 'closure waits until everyone is done');
  g = act(act(g, done(1)), done(0));
  assert.ok(g.closed[R] && g.players[0].locks[R] && g.players[1].locks[R]);
  assert.equal(score(g.players[1]).lanes[R], POINTS[7]);
  g = rolled(g, [3, 3], [null, 3, 3, 3]);
  assert.ok(!pickOptions(g, 1).some(o => o.lane === R), 'closed colour unusable later');
  assert.ok(!pickOptions(g, 0).some(o => o.lane === R));
});

test('digital: two locked colours end the game once the roll resolves', () => {
  let g = dig();
  for (const p of g.players) { p.marks[R] = [0, 1, 2, 3, 4]; p.marks[Y] = [0, 1, 2, 3, 4]; }
  g = rolled(g, [6, 6], [6, 6, 1, 1]);
  g = act(g, W(0, R)); // Ana locks red
  g = act(g, W(1, Y)); // Ben locks yellow
  g = act(g, done(0));
  assert.equal(g.status, 'playing');
  g = act(g, done(1));
  assert.equal(g.status, 'over');
  assert.equal(g.turn.phase, 'over');
  assert.equal(endReason(g), 'locks');
  assert.equal(g.players[0].penalties, 0);
});

test('digital: a fourth penalty ends the game', () => {
  let g = newGame({ mode: 'digital', names: ['Solo'], seed: 3 });
  g.players[0].penalties = 3;
  g = act(act(rolled(g, [1, 1], [1, 1, 1, 1]), { type: 'penalty', player: 0, add: true }), done(0));
  assert.equal(g.status, 'over');
  assert.equal(endReason(g), 'penalties');
});

test('undo restores picks, Done, locks, closed colours and dice', () => {
  let g = bothReady(), hist = [];
  const before = g;
  for (const a of [W(0, R), W(1, R), done(0), done(1)]) { // Ana rolls and picks, Ben picks
    hist = record(hist, g);
    g = act(g, a);
  }
  assert.ok(g.closed[R]);
  assert.equal(reduce(g, { type: 'roll' }).turn.dice.c[R], null, 'red die gone after the lock');
  let u = undo(hist);
  assert.ok(!u.g.closed[R] && !u.g.players[0].locks[R], 'un-resolve');
  assert.deepEqual(u.g.turn.done, [true, false]);
  u = undo(u.hist);
  assert.deepEqual(u.g.turn.done, [false, false], 'un-Done');
  u = undo(undo(u.hist).hist);
  assert.deepEqual(u.g, before);
  let s = dig(), h = record([], s);
  const first = reduce(s, { type: 'roll' }).turn.dice;
  s = undo(h).g;
  assert.deepEqual(reduce(s, { type: 'roll' }).turn.dice, first, 'undo then roll gives the same dice');
});

test('serialise, validate and restore round trip', () => {
  let g = rolled(dig(['Ana', 'Ben']), [2, 5], [3, 3, 3, 3]);
  g = act(act(g, W(1, B)), done(1));
  const back = JSON.parse(JSON.stringify(g));
  assert.ok(validState(back));
  const end = s => reduce(reduce(s, { type: 'penalty', player: 0, add: true }), done(0));
  assert.notEqual(end(g), g);
  assert.deepEqual(end(back), end(g));
  assert.ok(validState(marks(phys(), 0, R, [0, 2])));
  assert.equal(cleanHist([JSON.stringify(g), '{"v":2}', 'nope', 5]).length, 1);
  const bad = [
    null, {}, { ...back, v: 2 }, { ...back, mode: 'x' }, { ...back, players: [] },
    { ...back, closed: [1, 0, 0, 0] }, { ...back, turn: { ...back.turn, active: 9 } },
    { ...back, turn: { ...back.turn, dice: { w: [7, 1], c: [1, 1, 1, 1] } } },
    { ...back, players: [{ ...back.players[0], marks: [[3, 1], [], [], []] }, back.players[1]] },
    { ...back, players: [{ ...back.players[0], locks: [true, false, false, false] }, back.players[1]] },
    { ...phys(), turn: back.turn },
    { ...back, turn: { ...back.turn, picks: [{ white: null, colour: null }, { white: null, colour: { lane: R, die: 0 } }] } },
    { ...back, turn: { ...back.turn, picks: [{ white: 7, colour: null }, { white: R, colour: null }] } },
    { ...back, turn: { ...back.turn, done: [true, true] } },
    { ...back, turn: { ...back.turn, picks: [back.turn.picks[0], { ...back.turn.picks[1], penalty: true }] } },
    { ...back, turn: { ...back.turn, picks: [{ ...back.turn.picks[0], penalty: 'yes' }, back.turn.picks[1]] } },
    { ...back, turn: { ...back.turn, picks: [{ white: R, colour: null, penalty: true }, back.turn.picks[1]] } },
    { ...back, turn: { ...back.turn, done: [true, true].map((d, i) => i === 0) } },
  ];
  for (const b of bad) assert.equal(validState(b), false, JSON.stringify(b)?.slice(0, 80));
});

test('who goes first: the highest D6, only those tied for it roll again, and the turn starts there', () => {
  assert.deepEqual(rollers([], 3), [0, 1, 2]);
  assert.equal(rollWinner([], 1), 0, 'one player: no roll');
  const rounds = [[6, 2, 6], [4, null, 4], [3, null, 5]];
  assert.deepEqual(rollers(rounds.slice(0, 1), 3), [0, 2]);
  assert.equal(rollWinner(rounds.slice(0, 2), 3), null);
  assert.equal(rollWinner(rounds, 3), 2);
  const dice = [6, 2, 6, 4, 4, 3, 5];
  assert.deepEqual(rollOff(3, () => dice.shift()), rounds);
  const g = newGame({ mode: 'digital', names: ['Ana', 'Ben', 'Cy'], seed: 1, first: 2, rolls: rounds });
  assert.equal(g.turn.active, 2);
  assert.ok(validState(g));
  let s = rolled(g, [1, 1], [1, 1, 1, 1]);
  for (const p of [0, 1]) s = act(s, done(p));
  s = act(act(s, { type: 'penalty', player: 2, add: true }), done(2));
  assert.equal(s.turn.active, 0, 'then round in seating order');
  assert.ok(validState(newGame({ mode: 'physical', names: ['Ana', 'Ben'], seed: 1, first: 1, rolls: [[2, 5]] })));
  // A save from before the roll has neither field: player 1 goes first.
  const { first: _f, ...old } = dig();
  assert.ok(validState(old));
  for (const bad of [{ first: 3 }, { first: 0 }, { rolls: [] }, { rolls: [[6, 2, 6]] }, { rolls: [[6, 2, 6], [4, 1, 3]] },
    { rolls: [[6, 2, 6], [3, null, 5], [1, null, 1]] }, { rolls: [[7, 2, 6], [3, null, 5]] }]) {
    assert.equal(validState({ ...g, ...bad }), false, JSON.stringify(bad));
  }
});

test('standings rank by total, ties share a rank', () => {
  let g = marks(phys(['Ana', 'Ben', 'Cy']), 1, R, [0, 1]);
  g = marks(g, 2, B, [0, 1]);
  const s = standings(g.players);
  assert.deepEqual(s.map(r => [r.i, r.rank, r.total]), [[1, 1, 3], [2, 1, 3], [0, 3, 0]]);
});
