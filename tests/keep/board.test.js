// Placement, orientation, connectivity, occupancy, tile bag. T06, T07, T07b, T07c.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { edgeKind, exits } from '../../site/keep/engine/board.js';
import { rotationFor, sideOnBoard, SIDES } from '../../site/keep/engine/tiles.js';
import { FX, setup, move, run, slotsOf, withWalledTowers } from './helpers.js';

const def = id => FX.tiles.find(t => t.id === id);

test('T06 rotation puts the entry dot on the approach side, for every reference side (RB 5, SP 4, SP 12 #6)', () => {
  for (const entrySide of SIDES) for (const boardSide of SIDES) {
    const d = { sides: { N: 'wall', E: 'wall', S: 'wall', W: 'wall', [entrySide]: 'open' }, entrySide };
    const r = rotationFor(entrySide, boardSide);
    assert.ok([0, 90, 180, 270].includes(r));
    for (const s of SIDES) assert.equal(sideOnBoard(d, r, s), s === boardSide ? 'open' : 'wall', `${entrySide} -> ${boardSide}`);
  }
});

test('T06 revealing a tile orients it to all four approaches (RB 5 step 3, SP 4 step 4, SP 12 #6)', () => {
  // FX_CORNER reference: entry S, also open E. Hero moves dir from tower; the dot must face back toward the tower.
  const cases = [
    { cite: 'approach from W', tower: 0, dir: 'E', at: '1,0', entry: 'W', rotation: 90, open: ['W', 'S'] },
    { cite: 'approach from N', tower: 0, dir: 'S', at: '0,1', entry: 'N', rotation: 180, open: ['N', 'W'] },
    { cite: 'approach from S', tower: 3, dir: 'N', at: '5,3', entry: 'S', rotation: 0, open: ['S', 'E'] },
    { cite: 'approach from E', tower: 3, dir: 'W', at: '4,4', entry: 'E', rotation: 270, open: ['E', 'N'] },
  ];
  for (const c of cases) {
    let g = setup({ towers: [c.tower], tileOrder: slotsOf('FX_CORNER').slice(0, 1) });
    g = reduce(g, move(g, c.dir), FX);
    const inst = g.board.tiles[c.at];
    assert.equal(inst.defId, 'FX_CORNER', c.cite);
    assert.equal(inst.entrySide, c.entry, c.cite);
    assert.equal(inst.rotation, c.rotation, c.cite);
    assert.deepEqual(SIDES.filter(s => sideOnBoard(def('FX_CORNER'), inst.rotation, s) === 'open').sort(), [...c.open].sort(), c.cite);
    assert.equal(g.log.filter(e => e.kind === 'draw').length, 1);
  }
});

test('T06 a revealed tile keeps its instance and rotation on re-entry; no new draw (RB 5, RB 6.9, SP 4 step 5)', () => {
  const order = slotsOf('FX_CROSS').slice(0, 3);
  let g = setup({ tileOrder: order });
  g = run(g, [move(g, 'E')]);
  const first = structuredClone(g.board.tiles['1,0']);
  g = run(g, [move(g, 'E'), move(g, 'W')]); // (2,0), then back into (1,0)
  assert.deepEqual(g.board.tiles['1,0'], first);
  assert.equal(g.log.filter(e => e.kind === 'draw').length, 2);
  assert.deepEqual(g.board.tileBag, order.slice(2));
  assert.deepEqual(g.heroes[0].coord, { x: 1, y: 0 });
});

test('T07 diagonal moves rejected (RB 5, SP 5, SP 12 #7)', () => {
  const g = setup();
  for (const dir of ['NE', 'SE', 'SW', 'NW']) assert.throws(() => reduce(g, move(g, dir), FX), /Illegal/, dir);
  assert.ok(legalActions(g, FX).every(a => ['N', 'E', 'S', 'W'].includes(a.dir)));
});

test('T07 passage needs both sides open (RB 6.1, SP 5, SP 12 #7)', () => {
  const g = setup();
  // Hand-placed tiles around (1,1): CROSS there; DEADEND east of it with its only opening facing N; STRAIGHT south of it.
  g.board.tiles['1,1'] = { slotId: 'x1', defId: 'FX_CROSS', coord: { x: 1, y: 1 }, rotation: 0, entrySide: 'S', revealedRound: 1 };
  g.board.tiles['2,1'] = { slotId: 'x2', defId: 'FX_DEADEND', coord: { x: 2, y: 1 }, rotation: 180, entrySide: 'N', revealedRound: 1 };
  g.board.tiles['1,2'] = { slotId: 'x3', defId: 'FX_STRAIGHT', coord: { x: 1, y: 2 }, rotation: 0, entrySide: 'S', revealedRound: 1 };
  const cases = [
    { cite: 'RB 6.1: open vs wall is blocked', from: { x: 1, y: 1 }, dir: 'E', edge: 'wall' },
    { cite: 'RB 6.1: open both sides', from: { x: 1, y: 1 }, dir: 'S', edge: 'open' },
    { cite: 'RB 5 step 3: open into unexplored', from: { x: 1, y: 1 }, dir: 'N', edge: 'unexplored' },
    { cite: 'RB 6.1: wall on own side', from: { x: 2, y: 1 }, dir: 'W', edge: 'wall' },
    { cite: 'tower wall side', from: { x: 0, y: 0 }, dir: 'N', edge: 'wall' },
    { cite: 'RB 6.1: same passage seen from the other side', from: { x: 1, y: 2 }, dir: 'N', edge: 'open' },
  ];
  for (const c of cases) assert.equal(edgeKind(g, FX, c.from, c.dir), c.edge, c.cite);
  // Printed board walls (BoardDefinition.walls) block too.
  const walledBoard = { ...FX, board: { ...FX.board, walls: ['1,1|S'] } };
  assert.equal(edgeKind(g, walledBoard, { x: 1, y: 2 }, 'N'), 'wall');
});

test('T07 one hero per ordinary room; towers and chamber hold many (RB 5, SP 5, SP 12 #7)', () => {
  let g = setup({ players: 2, towers: [0, 0], tileOrder: slotsOf('FX_CROSS').slice(0, 4) });
  assert.deepEqual(g.heroes[0].coord, g.heroes[1].coord, 'shared tower');
  g = run(g, [move(g, 'E')]); // seat 0 into (1,0)
  const blocked = exits(g, FX, 1).find(e => e.dir === 'E');
  assert.equal(blocked.reason, 'occupied');
  assert.throws(() => reduce(g, { type: 'MOVE', seat: 1, dir: 'E' }, FX), /Illegal/);
  // Chamber: two heroes may stand in the center; entering it while occupied is legal.
  g.board.tiles['2,1'] = { slotId: 'x', defId: 'FX_CROSS', coord: { x: 2, y: 1 }, rotation: 0, entrySide: 'S', revealedRound: 1 };
  g.heroes[0].coord = { x: 2, y: 2 };
  g.heroes[1].coord = { x: 2, y: 1 };
  assert.equal(exits(g, FX, 1).find(e => e.dir === 'S').legal, true);
});

test('T07b an empty tile bag makes unexplored squares impassable (D27, house rule)', () => {
  let g = setup({ tileOrder: slotsOf('FX_CROSS').slice(0, 1) });
  g = run(g, [move(g, 'E')]);
  assert.equal(g.board.tileBag.length, 0);
  const ex = exits(g, FX, 0);
  for (const dir of ['E', 'S']) assert.equal(ex.find(e => e.dir === dir).reason, 'no-tiles-left', dir);
  assert.deepEqual(legalActions(g, FX).map(a => a.dir), ['W'], 'only back to the tower');
});

test('T07c no voluntary pass; forced skip only when no legal action exists (D20)', () => {
  const free = setup();
  assert.ok(legalActions(free, FX).every(a => a.type === 'MOVE'));
  assert.throws(() => reduce(free, { type: 'FORCED_SKIP', seat: 0 }, FX), /Illegal/);
  // Dead end: hero walled in a tower.
  const content = withWalledTowers([0]);
  const g = setup({ content });
  assert.deepEqual(legalActions(g, content), [{ type: 'FORCED_SKIP', seat: 0 }]);
  const after = reduce(g, { type: 'FORCED_SKIP', seat: 0 }, content);
  assert.equal(after.sun, 2);
  assert.equal(after.log.filter(e => e.kind === 'forced-skip').length, 1);
});

test('doors and gates are not crossable until M2 (RB 6.6, RB 6.7 hooks)', () => {
  const content = { ...FX, board: { ...FX.board, towers: FX.board.towers.map((t, i) => (i === 0 ? { ...t, sides: { ...t.sides, E: 'door', S: 'gate' } } : t)) } };
  const g = setup({ content });
  assert.deepEqual(exits(g, content, 0).map(e => [e.dir, e.edge, e.reason]), [['E', 'door', 'M2'], ['S', 'gate', 'M2']]);
});
