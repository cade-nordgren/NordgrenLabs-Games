// The on-screen D12 (ui/dice.js): the face transforms build a closed regular dodecahedron, and the numbers are a
// real D12's. Pure arithmetic; dice.js touches the page only when it draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D12, d12Numbers, REST } from '../../site/keep/ui/dice.js';

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} against ${b}`);

test('twelve faces, each an upright unmirrored frame with its own outward normal; face 0 looks at the viewer', () => {
  assert.equal(D12.faces.length, 12);
  for (const [i, f] of D12.faces.entries()) {
    for (const [a, b] of [['x', 'x'], ['y', 'y'], ['z', 'z']]) near(dot(f[a], f[b]), 1, `face ${i} ${a} is a unit vector`);
    for (const [a, b] of [['x', 'y'], ['y', 'z'], ['x', 'z']]) near(dot(f[a], f[b]), 0, `face ${i} ${a} and ${b} are square`);
    const det = dot(f.x, [f.y[1] * f.z[2] - f.y[2] * f.z[1], f.y[2] * f.z[0] - f.y[0] * f.z[2], f.y[0] * f.z[1] - f.y[1] * f.z[0]]);
    near(det, 1, `face ${i} keeps the hand of the axes, so its number is not mirrored`);
  }
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) assert.ok(dot(D12.faces[i].z, D12.faces[j].z) < 0.999, `faces ${i} and ${j} point different ways`);
  assert.deepEqual(D12.faces[0].z.map(Math.round), [0, 0, 1]);
  assert.deepEqual(D12.faces[0].y.map(Math.round), [0, 1, 0], 'upright: its top corner is up the screen');
  assert.deepEqual([...D12.opposite].sort((a, b) => a - b), [...Array(12).keys()], 'every face has one opposite');
});

test('each pentagon, placed by its transform, lands on the corners of the solid, so the faces meet edge to edge', () => {
  const corners = D12.faces.flatMap(f => f.ring);
  for (const [i, f] of D12.faces.entries()) {
    near(Math.hypot(...f.ring.map(v => dot(v, f.z)).map(d => d - D12.inradius)), 0, `face ${i} corners lie in its plane at the inradius`);
    for (let k = 0; k < 5; k++) {
      // The clip-path corner k: -90 degrees plus 72k from the face's middle, in the face's own x and y.
      const t = -Math.PI / 2 + k * 2 * Math.PI / 5, px = D12.pentagon * Math.cos(t), py = D12.pentagon * Math.sin(t);
      const p = [0, 1, 2].map(a => f.x[a] * px + f.y[a] * py + f.z[a] * D12.inradius);
      assert.ok(f.ring.some(v => Math.hypot(...v.map((c, a) => c - p[a])) < 1e-9), `face ${i} corner ${k} is a corner of the solid`);
    }
  }
  const distinct = corners.filter((v, i) => corners.findIndex(w => Math.hypot(...w.map((c, a) => c - v[a])) < 1e-9) === i);
  assert.equal(distinct.length, 20, 'twelve pentagons share twenty corners: a closed dodecahedron');
});

test('the faces carry a real D12: 1 to 12 once each, opposite faces summing to 13, the rolled value on face 0', () => {
  for (let v = 1; v <= 12; v++) {
    const nums = d12Numbers(v);
    assert.equal(nums[0], v);
    assert.deepEqual([...nums].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    nums.forEach((n, i) => assert.equal(n + nums[D12.opposite[i]], 13));
  }
});

test('at rest the result face looks straight at the viewer and every other face is well turned away', () => {
  // CSS rotateX(a) rotateY(b) rotateZ(c), applied to a face normal (the rightmost turn first), in CSS axes.
  const rad = d => d * Math.PI / 180, [ax, ay, az] = REST.d12.map(rad);
  const rx = ([x, y, z]) => [x, y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
  const ry = ([x, y, z]) => [x * Math.cos(ay) + z * Math.sin(ay), y, -x * Math.sin(ay) + z * Math.cos(ay)];
  const rz = ([x, y, z]) => [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az), z];
  const toward = D12.faces.map(f => rx(ry(rz(f.z)))[2]);
  assert.ok(toward[0] > 0.99, `face 0 is square on (${toward[0]})`);
  for (let i = 1; i < 12; i++) assert.ok(toward[i] < 0.5, `face ${i} is turned away (${toward[i]})`);
  assert.deepEqual(REST.cube, [0, 0, 0]);
});
