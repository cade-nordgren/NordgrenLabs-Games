# Dots and Boxes: engine contract

The interface between `site/dots/engine/` (rules and geometry) and `site/dots/ui/` (screens). Both sides build against this. Plain ES modules, no DOM in the engine, everything JSON-serialisable.

## Board specs (stored in saves; geometry is always rebuilt from the spec)

```js
// square cells: rows of '#' (playable) and '.' (empty), all rows the same length
{ kind: 'square', mask: ['####', '#..#', '####'] }
// triangles: row r, column c; a cell at (r,c) points up when (r + c) % 2 === 0, else down
{ kind: 'tri', mask: ['#####', '#####'] }
// hexagons: flat- or pointy-top (engine's choice, fixed forever), offset rows; '#' playable
{ kind: 'hex', mask: ['###', '####', '###'] }
```

## `engine/boards.js`

```js
export const CATEGORIES = [ { id: 'classic', name: 'Classic' }, { id: 'rect', name: 'Rectangles' },
  { id: 'shapes', name: 'Shapes' }, { id: 'tri', name: 'Triangles' }, { id: 'hex', name: 'Hexagons' } ];
// Custom is the UI's own category (layouts from localStorage `nl-dots-layouts`).

export const PRESETS = [ { id: 'sq-4x4', name: '4 × 4', category: 'classic', spec: {...}, size: 'small'|'medium'|'large'|'huge' }, ... ];
export function preset(id) // -> preset or undefined

export function buildGeometry(spec) // -> geo (memoised by JSON of spec); throws on an invalid spec
// geo = {
//   kind,
//   vertices: [{ x, y }],              // layout units; square cells are 1 x 1; only vertices used by faces
//   edges:    [{ a, b }],              // vertex indices, unique, each belongs to >= 1 face
//   faces:    [{ edges: [edgeIds], verts: [vertexIds in drawing order], cx, cy }],
//   edgeFaces: [[faceIds]],            // per edge, 1 or 2 faces
//   rows:     [[faceIds]],             // scoring rows: top to bottom, left to right within a row, every face exactly once
//   width, height                      // bounding box in layout units (min x/y is 0)
// }

export function validateSpec(spec) // -> { ok: true, faces: n } | { ok: false, reason: 'plain sentence' }
// rules for custom square masks: 1..12 rows and cols, at least 4 playable cells, all playable cells edge-connected (one piece).
```

## `engine/reducer.js`

```js
export const STARTS = ['none', 'swedish', 'icelandic'];
export function startEdges(spec, start) // -> sorted edge ids drawn before the first move; throws on a bad spec or start
// 'none': []. 'swedish': every boundary edge (exactly one face in edgeFaces), hole rims included; any kind.
// 'icelandic' (square only, else throws): boundary edges that are vertical with their face to the right ("left"),
// or horizontal with their face above ("bottom", y grows down). Throws if any face would start closed.

export function newGame({ spec, players, first, roll, start })
// players: [{ name, marker, color }, { name, marker, color }]  (color is a palette id string; engine does not interpret it)
// start: 'none' | 'swedish' | 'icelandic' (missing or null means 'none'; Icelandic on tri or hex throws)
// first: 0 | 1;  roll: { mode: 'digital'|'physical', rounds: [[a, b], ...] } (kept for the record; last round decides)
// -> state = {
//   v: 1, spec, players, first, roll, start,
//   edges: Array(nEdges).fill(-1),   // -1 undrawn, -2 a starting line (drawn, owned by nobody), else 0 | 1 who drew it
//                                    // starting lines are never legal and never in moves, but count as drawn for boxes and the end
//   faces: Array(nFaces).fill(-1),   // -1 unclaimed, else 0 | 1 owner
//   scores: [0, 0],
//   active: first,                    // whose turn it is (or was, while pending)
//   pending: null | { by, next, claimed, edge },   // set after a line until Next Turn; claimed = faces that line took
//   last: null | { edge, faces: [ids], by },        // the most recent line, for highlighting
//   status: 'playing' | 'over',
//   moves: [edgeIds in order]
// }

export function reduce(state, action) // returns a NEW state, or the SAME object when the action is illegal
// { type: 'draw', edge }   legal only when status 'playing', edge undrawn and in range. While pending (Next Turn not pressed),
//                          it moves this turn's line: the pending line, the faces it took and their score are taken back first.
//                          Claims every adjacent face now fully drawn. If no undrawn edge remains: status 'over', pending null.
//                          Otherwise pending = { by: active, next: claimed > 0 ? active : 1 - active, claimed, edge }.
// { type: 'next' }         legal only when pending set; active = pending.next, pending = null.

export function legalEdges(state)   // undrawn edge ids while playing (also while pending: drawing one moves the line); [] when over
export function result(state)       // { scores: [a, b], winner: 0 | 1 | null (tie) }
export function countSteps(state)   // [[{ face, owner }...] per geo.rows row] for the results animation
export function checkState(state)   // throws if the shape or invariants are broken (stored data is a trust boundary): use when resuming
                                    // a state without start (older saves) is 'none'; the -2 edges must be exactly startEdges(spec, start)
```

The UI owns undo (whole-state snapshots, like Crossix), dice, players, settings and saves. The engine has no randomness.
