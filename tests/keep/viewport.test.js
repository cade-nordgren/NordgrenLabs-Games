// Map viewport geometry (board.js): lit squares must end up clear of the edges and the floating map buttons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellClear, clampView, frameView, nearInView, INSET } from '../../site/keep/ui/board.js';

const C = 100, M = 34, bd = { width: 10, height: 11 };
const board = [bd.width * C + 2 * M, bd.height * C + 2 * M];
// A phone in portrait: 343 x 420 px of map, the round buttons in a 44px column top right (as measured, plus INSET).
const size = [343, 420];
const tools = { x: 343 - 6 - 44 - INSET, y: 6 - INSET, w: 44 + 2 * INSET, h: 4 * 44 + 3 * 6 + 2 * INSET };
const lo = Math.min(size[0] / board[0], size[1] / board[1]);
const room = { size, inset: INSET, avoid: [tools], pad: tools.w + INSET, board, lo, hi: 1.4 };

test('cellClear: inside the inset viewport and under no button', () => {
  const v = { s: 0.5, x: 0, y: 0 }; // square (0,0) at 17..67 px
  assert.equal(cellClear(v, { x: 0, y: 0 }, room), true);
  assert.equal(cellClear({ s: 0.5, x: -12, y: 0 }, { x: 0, y: 0 }, room), false, 'within INSET of the left edge');
  const under = { s: 0.5, x: 343 - (M + 6.5 * C) * 0.5, y: 0 }; // square (6,0) centred on the right edge
  assert.equal(cellClear(under, { x: 6, y: 0 }, { ...room, avoid: [] }), false, 'half off screen');
  const right = { s: 0.5, x: 343 - 8 - (M + 7 * C) * 0.5, y: 0 }; // square (6,0) flush with the inset right edge
  assert.equal(cellClear(right, { x: 6, y: 0 }, { ...room, avoid: [] }), true);
  assert.equal(cellClear(right, { x: 6, y: 0 }, room), false, 'under the buttons');
});

test('clampView: no pad keeps the old limits; a pad allows panning past the board edge', () => {
  const s = 0.6, bw = board[0] * s;
  assert.equal(clampView({ s, x: 50, y: 0 }, { ...room, pad: 0 }).x, 0, 'stops at the left edge');
  assert.equal(clampView({ s, x: -9999, y: 0 }, { ...room, pad: 0 }).x, 343 - bw, 'stops at the right edge');
  assert.equal(clampView({ s, x: 50, y: 0 }, room).x, 50);
  assert.equal(clampView({ s, x: -9999, y: 0 }, room).x, 343 - bw - room.pad);
  assert.equal(clampView({ s: lo, x: 0, y: 0 }, { ...room, pad: 0 }).x, 0, 'a fitted board is centred without a pad');
});

test('frameView: every lit square ends clear, corners and edges included', () => {
  const cases = [
    [{ x: 9, y: 0 }, [{ x: 8, y: 0 }, { x: 9, y: 1 }]], // the top-right tower, under the buttons when centred
    [{ x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 0, y: 1 }]],
    [{ x: 9, y: 10 }, [{ x: 8, y: 10 }, { x: 9, y: 9 }]],
    [{ x: 8, y: 1 }, [{ x: 9, y: 1 }, { x: 8, y: 0 }, { x: 7, y: 1 }, { x: 8, y: 2 }]],
    [{ x: 5, y: 5 }, [{ x: 4, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 6 }]],
  ];
  for (const [hero, lit] of cases) {
    const v = frameView(0.48, hero, lit, room);
    for (const t of [hero, ...lit]) assert.ok(cellClear(v, t, room), `${JSON.stringify(t)} clear around ${JSON.stringify(hero)}`);
    assert.ok(v.s <= 0.48 + 1e-9 && v.s >= lo - 1e-9, 'within the zoom limits');
    assert.deepEqual(clampView(v, room), v, 'a view the pan limits allow');
  }
  // The middle of the board fits at the asked scale: no zooming out.
  assert.equal(frameView(0.48, { x: 5, y: 5 }, [{ x: 4, y: 5 }], room).s, 0.48);
  const v = frameView(0.48, { x: 5, y: 5 }, [{ x: 4, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 6 }], room);
  assert.equal(nearInView(v, { x: 5, y: 5 }, size, bd, { ...room, cells: [{ x: 6, y: 5 }] }), true);
});

test('nearInView: a lit square under a button fails the check', () => {
  const v = { s: 0.5, x: 343 - 8 - (M + 10 * C) * 0.5, y: 0 }; // the right board edge at the inset right edge
  assert.equal(nearInView(v, { x: 8, y: 1 }, size, bd, { ...room, cells: [{ x: 7, y: 1 }] }), true);
  assert.equal(nearInView(v, { x: 8, y: 1 }, size, bd, { ...room, cells: [{ x: 9, y: 1 }] }), false);
});
