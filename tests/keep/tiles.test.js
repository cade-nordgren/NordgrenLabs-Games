// Tile special effects, doors, gates and room search. T08-T17 with sub-cases (SP 12 #8-#17).
// Fixture tiles and cards are NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeKind, exits } from '../../site/keep/engine/board.js';
import { sideOnBoard, SIDES } from '../../site/keep/engine/tiles.js';
import { darkExitFor } from '../../site/keep/engine/movement.js';
import { FX, setup, move, stop, run, slotsOf, types, acts, act, place, putHero, give, draws, assertCensus, EMPTY_ROOMS, withWalledTowers } from './helpers.js';

const choices = g => acts(g).filter(a => a.type === 'RESPOND').map(a => a.choice);

const def = id => FX.tiles.find(t => t.id === id);
const openSides = (g, at) => SIDES.filter(s => sideOnBoard(def(g.board.tiles[at].defId), g.board.tiles[at].rotation, s) === 'open');
const at = g => `${g.heroes[g.activeSeat ?? 0].coord.x},${g.heroes[g.activeSeat ?? 0].coord.y}`;

test('T08 black room: exactly one room card on every entry, revisits included (RB 6.1, SP 5, SP 12 #8)', () => {
  let g = setup({ tileOrder: slotsOf('FX_CROSS').slice(0, 2) });
  const steps = [['E', '1,0'], ['E', '2,0'], ['W', '1,0']];
  steps.forEach(([dir, where], i) => {
    g = run(g, [move(g, dir)]);
    assert.equal(at(g), where);
    assert.equal(draws(g, 'ROOM').length, i + 1, `entry ${i + 1} draws one card`);
    assert.equal(g.sun, i + 2, 'a black room ends the turn after its card');
  });
  assert.equal(draws(g, 'TILE').length, 2, 'the revisit reused the tile');
  assertCensus(assert, g);
});

test('T09 red room: room card and a gate drops behind the entrant (RB 6.1, RB 6.7, SP 5, SP 12 #9)', () => {
  let g = setup({ tileOrder: slotsOf('FX_CORNER').slice(0, 1), script: [7, 6] });
  g = run(g, [move(g, 'E')]);
  assert.equal(draws(g, 'ROOM').length, 1);
  assert.deepEqual(openSides(g, '1,0').sort(), ['S', 'W']);
  assert.equal(g.board.edges['0,0|E'], 'gate');
  assert.equal(edgeKind(g, FX, { x: 1, y: 0 }, 'W'), 'gate', 'the way back is a portcullis now');
  // Going back means lifting it: STR 6, D12 7 fails and ends the turn; D12 6 lifts it.
  g = run(g, [move(g, 'W')]);
  assert.equal(at(g), '1,0');
  assert.equal(g.sun, 3);
  g = run(g, [move(g, 'W'), { type: 'TOWER_CHOICE', seat: 0, choice: 'ESCAPE' }]);
  assert.equal(g.heroes[0].status, 'ESCAPED');
  assert.deepEqual(g.log.filter(e => e.kind === 'test').map(e => [e.stat, e.roll, e.pass]), [['STR', 7, false], ['STR', 6, true]]);
});

test('T10 yellow corridor: no room card, movement continues the same turn, chains (RB 6.1, RB 6.9, SP 5, SP 12 #10)', () => {
  let g = setup({ tileOrder: slotsOf('FX_STRAIGHT').slice(0, 9) });
  for (let y = 1; y <= 9; y++) {
    const where = `0,${y}`;
    g = run(g, [move(g, 'S')]);
    assert.equal(at(g), where);
    assert.equal(g.phase, 'CHOOSE_EXIT');
    assert.equal(g.sun, 1, 'still the first turn');
    assert.ok(types(g).includes('STOP'), 'continuing is optional');
    assert.ok(!types(g).includes('SEARCH'), 'no search from a corridor');
  }
  assert.equal(draws(g, 'ROOM').length, 0);
  const stopped = run(g, [stop(g)]);
  assert.equal(stopped.sun, 2);
  const escaped = run(g, [move(g, 'S'), { type: 'TOWER_CHOICE', seat: 0, choice: 'ESCAPE' }]);
  assert.equal(escaped.heroes[0].status, 'ESCAPED', 'a ten-square chain into a tower in one turn');
  assert.equal(escaped.log.filter(e => e.kind === 'turn').length, 1);
});

test('T11 dark-room exit tables: two exits 1-3 / 4-6, three exits 1-2 / 3-4 clockwise / 5-6 counterclockwise (RB 6.2, SP 5)', () => {
  const cases = [
    { cite: 'RB 6.2 two exits', exits: ['N', 'S'], dot: 'N', want: ['N', 'N', 'N', 'S', 'S', 'S'] },
    { cite: 'RB 6.2 two exits, corner', exits: ['E', 'S'], dot: 'S', want: ['S', 'S', 'S', 'E', 'E', 'E'] },
    { cite: 'RB 6.2 three exits, dot S, wall N', exits: ['E', 'S', 'W'], dot: 'S', want: ['S', 'S', 'W', 'W', 'E', 'E'] },
    { cite: 'RB 6.2 three exits, dot W, wall E (skips the wall)', exits: ['N', 'S', 'W'], dot: 'W', want: ['W', 'W', 'N', 'N', 'S', 'S'] },
    { cite: 'RB 6.2 three exits, dot N, wall S', exits: ['N', 'E', 'W'], dot: 'N', want: ['N', 'N', 'E', 'E', 'W', 'W'] },
  ];
  for (const c of cases) assert.deepEqual([1, 2, 3, 4, 5, 6].map(d6 => darkExitFor(c.exits, c.dot, d6)), c.want, c.cite);
});

test('T11 blue room ends the turn on discovery; next turn the D6 sends the hero through the rolled exit (RB 6.2, SP 5, SP 12 #11)', () => {
  let g = setup({ tileOrder: [...slotsOf('FX_DARK').slice(0, 1), ...slotsOf('FX_CROSS').slice(0, 1)], script: [5] });
  g = run(g, [move(g, 'S')]);
  assert.equal(at(g), '0,1');
  assert.equal(g.sun, 2, 'entering ended the turn');
  assert.equal(g.phase, 'TURN_START');
  assert.deepEqual(types(g), ['ROLL_DARK_EXIT'], 'no free choice of exit');
  assert.equal(draws(g, 'ROOM').length, 0);
  g = act(g, 'ROLL_DARK_EXIT'); // D6 5 on a two-exit room: the exit without the dot (dot faces N, the way in)
  assert.equal(at(g), '0,2');
  assert.equal(draws(g, 'ROOM').length, 1, 'the move continues normally into a black room');
  assert.deepEqual(g.heroes[0].conditions, []);
});

test('T11 three-exit dark room: clockwise and counterclockwise from the dot; T11b a blocked exit keeps the hero there (RB 6.2, D07)', () => {
  // FX_DARK3 entered from the west: exits N, S and W, dot on W. N is off the board.
  let g = setup({ tileOrder: [...slotsOf('FX_DARK3').slice(0, 1), ...slotsOf('FX_CROSS').slice(0, 1)], script: [3, 6] });
  g = run(g, [move(g, 'E')]);
  assert.deepEqual(openSides(g, '1,0').sort(), ['N', 'S', 'W']);
  g = act(g, 'ROLL_DARK_EXIT'); // 3: clockwise from W is N, off the board: blocked
  assert.equal(at(g), '1,0');
  assert.ok(g.log.some(e => e.kind === 'dark-blocked' && e.dir === 'N'));
  assert.equal(g.sun, 3);
  assert.deepEqual(types(g), ['ROLL_DARK_EXIT'], 'D07: rolls again next turn');
  g = act(g, 'ROLL_DARK_EXIT'); // 6: counterclockwise from W is S
  assert.equal(at(g), '1,1');
});

test('T11b blocked rolled exit: wall beyond or an occupied room; the hero stays and rolls next turn (D07, provisional)', () => {
  const cases = [
    { cite: 'wall beyond', occupant: false },
    { cite: 'occupied room', occupant: true },
  ];
  for (const c of cases) {
    const content = withWalledTowers([0, 1]);
    let g = setup({ players: 2, towers: [0, 1], content, script: [4, 1], rules: { darkRoomPolicy: 'EVERY_ENTRY' } });
    place(g, '1,1', 'FX_DARK'); // exits N and S, dot S
    place(g, '1,2', 'FX_CROSS');
    if (c.occupant) {
      place(g, '1,0', 'FX_STRAIGHT'); // open N (off the board) and S: seat 1 has no action but a forced skip
      putHero(g, 1, '1,0');
    } else place(g, '1,0', 'FX_DEADEND', 180); // opens N only: a wall toward the dark room
    putHero(g, 0, '1,2');
    g = act(g, 'MOVE', { dir: 'N' }, content); // re-entry, darkRoomPolicy EVERY_ENTRY
    g = act(g, 'FORCED_SKIP', {}, content);
    assert.equal(g.activeSeat, 0, c.cite);
    g = act(g, 'ROLL_DARK_EXIT', {}, content); // 4: the non-dot exit, N
    assert.deepEqual(g.heroes[0].coord, { x: 1, y: 1 }, c.cite);
    assert.ok(g.log.some(e => e.kind === 'dark-blocked'), c.cite);
    assert.equal(g.heroes[0].conditions[0].id, 'dark', c.cite);
  }
});

test('T11c dark room on the initial reveal only by default; ordinary re-entry triggers it only under EVERY_ENTRY (D06, spec v2)', () => {
  for (const flag of [true, false]) {
    let g = setup({ rules: flag ? { darkRoomPolicy: 'EVERY_ENTRY' } : {} });
    place(g, '1,0', 'FX_CROSS');
    place(g, '1,1', 'FX_DARK'); // already revealed: not a discovery
    putHero(g, 0, '1,0');
    g = act(g, 'MOVE', { dir: 'S' });
    assert.equal(g.sun, 2, `flag ${flag}: the turn ends`);
    assert.equal(g.phase, flag ? 'TURN_START' : 'CHOOSE_ACTION', `flag ${flag}`);
    assert.equal(g.heroes[0].conditions.some(c => c.id === 'dark'), flag);
  }
});

test('T11 retreat into a dark room keeps the effect under the default policy (D06, RB 8.6)', () => {
  let g = setup({ tileOrder: [...slotsOf('FX_DARK').slice(0, 1), ...slotsOf('FX_CROSS').slice(0, 1)], script: [5], deckOrders: { ROOM: ['FX_ROOM_MONSTER'], MONSTER: ['FX_MON_SHY'] } });
  g = run(g, [move(g, 'S')]);
  g = act(g, 'ROLL_DARK_EXIT');
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  g = act(g, 'RESPOND', { choice: 'flee' }); // solo: the computer announces at once (D37); flight succeeds
  assert.equal(at(g), '0,1');
  assert.equal(g.phase, 'TURN_START');
  assert.deepEqual(types(g), ['ROLL_DARK_EXIT']);
});

function wellAt(script, prep = () => {}) {
  let g = setup({ tileOrder: slotsOf('FX_WELL').slice(0, 1), script });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  prep(g);
  return act(g, 'MOVE', { dir: 'S' });
}

test('T12 well entry: AGI test, failure kills, success strands the hero at the near edge (RB 6.3, SP 5, SP 12 #12)', () => {
  const dead = wellAt([5]); // knight AGI 4
  assert.equal(dead.heroes[0].status, 'DEAD');
  assert.equal(dead.status, 'over');
  const ok = wellAt([4]);
  assert.equal(ok.heroes[0].status, 'EXPLORING');
  assert.equal(ok.sun, 2, 'the turn stops at the edge');
  assert.equal(ok.phase, 'TURN_START');
  assert.deepEqual(types(ok), ['WELL_RETURN', 'WELL_JUMP']);
  const back = act(ok, 'WELL_RETURN');
  assert.equal(at(back), '1,0', 'turning back is a normal move');
  assert.equal(draws(back, 'ROOM').length, 1);
});

test('T12, T12b well jump: D12 + treasure-chamber cards vs AGI; discards lower it and go under the treasury deck; loot is ignored; failure is death (RB 6.3, D08, D09)', () => {
  const cases = [
    { cite: 'RB 6.3: 2 + 2 cards = 4 <= AGI 4', treasury: 2, discard: 0, d12: 2, pass: true },
    { cite: 'D08: 3 + 2 = 5 > 4, death', treasury: 2, discard: 0, d12: 3, pass: false },
    { cite: 'RB 6.3: discard one, 3 + 1 = 4', treasury: 2, discard: 1, d12: 3, pass: true },
    { cite: 'RB 6.3: room loot carries no penalty', treasury: 0, held: 2, discard: 0, d12: 4, pass: true },
  ];
  for (const c of cases) {
    let g = wellAt([4, c.d12], g0 => {
      for (let i = 0; i < c.treasury; i++) give(g0, 0, 'TREASURY', 'FX_TREASURY_A');
      for (let i = 0; i < (c.held || 0); i++) give(g0, 0, 'ROOM', 'FX_ROOM_COINS');
    });
    const discarded = g.heroes[0].treasury.slice(0, c.discard);
    for (const card of discarded) g = act(g, 'WELL_DISCARD', { card });
    if (c.discard) assert.equal(g.decks.TREASURY.order.at(-1), discarded.at(-1), 'D09: bottom of the treasury deck');
    g = act(g, 'WELL_JUMP');
    const t = g.log.filter(e => e.kind === 'test').at(-1);
    assert.equal(t.modifier, c.treasury - c.discard, c.cite);
    assert.equal(t.pass, c.pass, c.cite);
    assert.equal(g.heroes[0].status, c.pass ? 'EXPLORING' : 'DEAD', c.cite);
    if (c.pass) { assert.equal(g.sun, 3, c.cite); assert.equal(g.phase, 'CHOOSE_ACTION', 'free next turn'); }
    assertCensus(assert, g);
  }
});

test('T13 rotating room: +90 clockwise on every entry, also the first reveal; never on staying (RB 6.4, D10, SP 12 #13)', () => {
  let g = setup({ tileOrder: slotsOf('FX_ROTATE').slice(0, 1) });
  g = run(g, [move(g, 'E')]);
  assert.equal(g.board.tiles['1,0'].rotation, 180, 'D10: oriented by the dot (90), then rotated (+90)');
  assert.equal(g.board.tiles['1,0'].rotation, 180, 'the next turn starts without rotating');

  g = setup();
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_ROTATE', 180); // open N and W
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(g.board.tiles['1,1'].rotation, 270);
  assert.equal(g.phase, 'CHOOSE_ACTION');
  assert.equal(g.board.tiles['1,1'].rotation, 270, 'a whole turn passed in the room: no rotation');
  g = act(g, 'MOVE', { dir: 'N' });
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(g.board.tiles['1,1'].rotation, 0);
  assert.equal(edgeKind(g, FX, { x: 1, y: 0 }, 'S'), 'wall', 'connectivity changed for everyone');
});

test('T14 rubble: entry ends the turn; next turn return or AGI; failure retries later; success leaves by any exit (RB 6.5, SP 5, SP 12 #14)', () => {
  let g = setup({ tileOrder: [...slotsOf('FX_RUBBLE').slice(0, 1), ...slotsOf('FX_CROSS').slice(0, 1)], script: [9, 2] });
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(g.sun, 2);
  assert.deepEqual(types(g), ['RUBBLE_RETURN', 'RUBBLE_FORCE']);
  g = act(g, 'RUBBLE_FORCE'); // 9 > AGI 4
  assert.equal(at(g), '1,1');
  assert.equal(g.sun, 3, 'a failed attempt spends the turn');
  assert.deepEqual(types(g), ['RUBBLE_RETURN', 'RUBBLE_FORCE'], 'and may be retried');
  g = act(g, 'RUBBLE_FORCE'); // 2: through
  assert.equal(g.phase, 'CHOOSE_EXIT');
  assert.deepEqual(exits(g, FX, 0).filter(e => e.legal).map(e => e.dir).sort(), ['N', 'S']);
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(at(g), '1,2', 'left on the same turn the AGI test succeeded');
  assert.equal(g.sun, 4, 'the black room it entered ended that turn');
  const back = setup({ tileOrder: slotsOf('FX_RUBBLE').slice(0, 1) });
  place(back, '1,0', 'FX_CROSS');
  putHero(back, 0, '1,0');
  const r = act(act(back, 'MOVE', { dir: 'S' }), 'RUBBLE_RETURN');
  assert.equal(at(r), '1,0');
});

function doorAt(deckOrders, script = []) {
  const g = setup({ deckOrders: { ROOM: EMPTY_ROOMS, ...deckOrders }, script });
  place(g, '1,1', 'FX_CROSS');
  place(g, '1,0', 'FX_DOORWAY', 180); // its door faces S, toward (1,1)
  putHero(g, 0, '1,1');
  return g;
}

test('T15 door: a door card is required; opens / stays closed / trap (RB 6.6, SP 5, SP 12 #15)', () => {
  assert.equal(edgeKind(doorAt({}), FX, { x: 1, y: 1 }, 'N'), 'door');
  const opens = act(doorAt({ DOOR: ['FX_DOOR_OPENS'] }), 'MOVE', { dir: 'N' });
  assert.equal(at(opens), '1,0', 'opens: crosses this turn');
  assert.deepEqual(draws(opens, 'DOOR'), ['FX_DOOR_OPENS#1']);
  assert.equal(draws(opens, 'ROOM').length, 1);
  assert.equal(opens.decks.DOOR.order.at(-1), 'FX_DOOR_OPENS#1', 'door card under the door deck');

  const shut = act(doorAt({ DOOR: ['FX_DOOR_STUCK'] }), 'MOVE', { dir: 'N' });
  assert.equal(at(shut), '1,1', 'closed: not crossed');
  assert.equal(shut.phase, 'CHOOSE_EXIT');
  assert.ok(types(shut).includes('STOP'));
  assert.ok(!exits(shut, FX, 0).find(e => e.dir === 'N').legal, 'the same door is not tried again this turn');
  assert.equal(shut.sun, 1);
  const other = act(shut, 'MOVE', { dir: 'E' }); // another free passage this turn
  assert.equal(at(other), '2,1');

  const trap = act(doorAt({ DOOR: ['FX_DOOR_TRAP'] }), 'MOVE', { dir: 'N' });
  assert.equal(at(trap), '1,1');
  assert.equal(trap.heroes[0].hp, 15, 'trap effect resolved');
  assert.equal(trap.sun, 2, 'trap ends the turn');
});

test('T15 an opened door relocks after crossing; same-turn flight back is the only exception (RB 6.6, RB 6.8, SP 5)', () => {
  let g = act(doorAt({ DOOR: ['FX_DOOR_OPENS', 'FX_DOOR_OPENS'] }), 'MOVE', { dir: 'N' });
  assert.equal(edgeKind(g, FX, { x: 1, y: 0 }, 'S'), 'door', 'locked again');
  g = act(g, 'MOVE', { dir: 'S' });
  assert.equal(draws(g, 'DOOR').length, 2, 'crossing back needs a new door card');

  let f = act(doorAt({ DOOR: ['FX_DOOR_OPENS'], ROOM: ['FX_ROOM_MONSTER'], MONSTER: ['FX_MON_SHY'] }), 'MOVE', { dir: 'N' });
  assert.deepEqual(choices(f), ['attack', 'wait', 'flee']);
  f = act(f, 'RESPOND', { choice: 'flee' }); // solo: announced at once (D37)
  assert.equal(at(f), '1,1', 'fled back through the just-opened door');
  assert.equal(draws(f, 'DOOR').length, 1, 'no second door card for the same-turn retreat');

  // A later turn in that room: the door has relocked, so flight that way is gone.
  let later = act(doorAt({ DOOR: ['FX_DOOR_OPENS'], ROOM_SEARCH: ['FX_RSEARCH_LURKER'], MONSTER: ['FX_MON_SHY'] }), 'MOVE', { dir: 'N' });
  later = act(later, 'SEARCH');
  assert.equal(later.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.deepEqual(choices(later), ['attack', 'wait'], 'no flight through the relocked door');
});

test('T16 portcullis ahead: STR test; failure ends the turn; success crosses and it drops again (RB 6.7, SP 5, SP 12 #16)', () => {
  let g = setup({ script: [7, 6, 2] });
  place(g, '1,1', 'FX_CROSS');
  place(g, '1,0', 'FX_GATEWAY', 180); // its gate faces S
  putHero(g, 0, '1,1');
  g = act(g, 'MOVE', { dir: 'N' });
  assert.equal(at(g), '1,1');
  assert.equal(g.sun, 2);
  g = act(g, 'MOVE', { dir: 'N' });
  assert.equal(at(g), '1,0');
  assert.equal(edgeKind(g, FX, { x: 1, y: 0 }, 'S'), 'gate', 'the gate is not removed by success');
  assert.equal(g.phase, 'CHOOSE_EXIT', 'into a yellow corridor');
  g = act(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(g.log.filter(e => e.kind === 'test').map(e => [e.reason, e.roll, e.pass]), [['portcullis', 7, false], ['portcullis', 6, true], ['portcullis', 2, true]]);
});

test('T17 room search: black or red rooms only; room-search deck; repeatable (RB 7.1, SP 6, SP 12 #17)', () => {
  const g = setup();
  assert.ok(!types(g).includes('SEARCH'), 'not in a tower');
  const cases = [['FX_CROSS', true], ['FX_CORNER', true], ['FX_STRAIGHT', false], ['FX_DARK', false], ['FX_ROTATE', false]];
  for (const [id, ok] of cases) {
    const h = setup();
    place(h, '1,1', id);
    putHero(h, 0, '1,1');
    assert.equal(types(h).includes('SEARCH'), ok, id);
  }
  let s = setup({ deckOrders: { ROOM: EMPTY_ROOMS, ROOM_SEARCH: ['FX_RSEARCH_EMPTY', 'FX_RSEARCH_TRINKET'] } });
  place(s, '1,1', 'FX_CROSS');
  putHero(s, 0, '1,1');
  s = act(s, 'SEARCH');
  assert.equal(s.sun, 2, 'the search used the turn');
  s = act(s, 'SEARCH');
  assert.deepEqual(draws(s, 'ROOM_SEARCH'), ['FX_RSEARCH_EMPTY#1', 'FX_RSEARCH_TRINKET#1']);
  assert.deepEqual(s.heroes[0].held, ['FX_RSEARCH_TRINKET#1']);
  assert.equal(s.decks.ROOM_SEARCH.order.at(-1), 'FX_RSEARCH_EMPTY#1');
});

test('T17 secret door: an orthogonal move the same turn, through a printed wall, used once (RB 7.1, RB 6.8, D11)', () => {
  let g = setup({ tileOrder: slotsOf('FX_CROSS').slice(0, 1), deckOrders: { ROOM: EMPTY_ROOMS, ROOM_SEARCH: ['FX_RSEARCH_SECRET', 'FX_RSEARCH_SECRET'] } });
  place(g, '1,1', 'FX_DEADEND'); // only S open
  putHero(g, 0, '1,1');
  const before = exits(g, FX, 0).filter(e => e.legal).map(e => e.dir);
  assert.deepEqual(before, ['S']);
  g = act(g, 'SEARCH');
  assert.equal(g.phase, 'CHOOSE_EXIT');
  assert.deepEqual(exits(g, FX, 0).map(e => [e.dir, e.edge]), [['N', 'secret'], ['E', 'secret'], ['S', 'unexplored'], ['W', 'secret']]);
  const moved = act(g, 'MOVE', { dir: 'E' });
  assert.equal(at(moved), '2,1');
  assert.equal(moved.heroes[0].enteredVia, 'secret');
  assert.equal(moved.sun, 2, 'the black room behind it ended the turn');
  // Not used: it is gone after the turn.
  const unused = act(act(g, 'STOP'), 'SEARCH');
  assert.equal(unused.phase, 'CHOOSE_EXIT', 'found again with a new search');
  const expired = act(g, 'STOP');
  assert.deepEqual(exits(expired, FX, 0).filter(e => e.legal).map(e => e.dir), ['S'], 'walls are walls again');
});
