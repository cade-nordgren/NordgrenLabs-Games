// Acceptance tests added by the owner's specification v2 and the tower and sunset ruling
// (docs/plans/spec-v2-owner-2026-11-19.md). Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareKind, edgeKind, exits } from '../../site/keep/engine/board.js';
import { view } from '../../site/keep/engine/view.js';
import { validateContent, contentStatus, syntheticCategories, APP_LABEL } from '../../site/keep/content/schema.js';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { FX, setup, act, acts, types, run, move, place, putHero, slotsOf, draws, EMPTY_ROOMS } from './helpers.js';

const choices = g => acts(g).filter(a => a.type === 'TOWER_CHOICE').map(a => a.choice);
const at = g => `${g.heroes[g.activeSeat].coord.x},${g.heroes[g.activeSeat].coord.y}`;

test('v2 board: 110 squares, four corner towers, chamber of two adjacent centre squares, either orientation', () => {
  const b = FX.board;
  assert.equal(b.width * b.height, 110);
  assert.deepEqual(b.towers.map(t => `${t.x},${t.y}`), ['0,0', '9,0', '0,10', '9,10']);
  assert.deepEqual(b.center, [{ x: 4, y: 5 }, { x: 5, y: 5 }]);
  let maze = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (squareKind(b, { x, y }) === 'maze') maze++;
  assert.equal(maze, 104);
  assert.equal(squareKind(b, { x: 10, y: 0 }), 'off');
  assert.equal(squareKind(b, { x: 0, y: 11 }), 'off');
  // 11 x 10 with the vertical pair is the other legal orientation.
  const t = (x, y) => ({ x, y, sides: b.towers[0].sides });
  const turned = { ...FX, board: { ...b, width: 11, height: 10, towers: [t(0, 0), t(10, 0), t(0, 9), t(10, 9)], center: [{ x: 5, y: 4 }, { x: 5, y: 5 }], walls: [], edges: {} } };
  assert.deepEqual(validateContent(turned).errors, []);
  const errs = c => validateContent(c).errors.map(e => e.message).join(' | ');
  assert.match(errs({ ...FX, board: { ...b, width: 10, height: 10 } }), /board must be 110 squares/);
  assert.match(errs({ ...FX, board: { ...b, edges: { '12,0|E': 'wall' } } }), /edge 12,0\|E/);
  assert.match(errs({ ...FX, board: { ...b, chamberSides: { a: { N: 'open' } } } }), /chamberSides a and b/);
});

test('v2 chamber reserve: the two centre squares never take a maze tile and draw no tile on entry', () => {
  let g = setup({ deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: [Array(7).fill('FX_DRAGON_SLEEPING')] } });
  place(g, '4,4', 'FX_CROSS');
  putHero(g, 0, '4,4');
  const bag = g.board.tileBag.length;
  g = act(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(g.heroes[0].coord, { x: 4, y: 5 });
  assert.equal(g.board.tileBag.length, bag, 'no tile drawn');
  assert.ok(!g.board.tiles['4,5'] && !g.board.tiles['5,5'], 'no tile placed in the reserve');
  assert.equal(g.board.chamberPlaced, true);
});

test('v2 bilateral wall: a printed wall, a fixed board edge or a wall on either tile side blocks both directions', () => {
  const g = setup();
  for (const at of ['7,2', '7,3', '7,8', '8,8', '1,1', '2,1']) place(g, at, 'FX_CROSS');
  assert.equal(edgeKind(g, FX, { x: 7, y: 2 }, 'S'), 'wall', 'printed wall 7,2|S');
  assert.equal(edgeKind(g, FX, { x: 7, y: 3 }, 'N'), 'wall', 'the same wall from below');
  assert.equal(edgeKind(g, FX, { x: 7, y: 8 }, 'E'), 'door', 'fixed door edge');
  assert.equal(edgeKind(g, FX, { x: 8, y: 8 }, 'W'), 'door', 'the same door from the other side');
  place(g, '2,1', 'FX_DEADEND', 0); // only S open: its W side is a wall
  assert.equal(edgeKind(g, FX, { x: 1, y: 1 }, 'E'), 'wall', 'open on one side, wall on the other');
  assert.equal(edgeKind(g, FX, { x: 2, y: 1 }, 'W'), 'wall');
  // The chamber's outer sides come from the board: b's N side is a wall.
  place(g, '5,4', 'FX_CROSS');
  assert.equal(edgeKind(g, FX, { x: 5, y: 4 }, 'S'), 'wall');
  const opened = { ...FX, board: { ...FX.board, chamberSides: { ...FX.board.chamberSides, b: { ...FX.board.chamberSides.b, N: 'open' } } } };
  assert.equal(edgeKind(g, opened, { x: 5, y: 4 }, 'S'), 'open', 'correcting the map is a data edit');
});

test('v2 setup hero is not escaped; no Escape before leaving the tower (owner ruling 2, D33)', () => {
  const g = setup({ players: 2, towers: [0, 0] });
  assert.ok(g.heroes.every(h => h.status === 'READY_IN_START_TOWER'));
  assert.deepEqual(types(g), ['MOVE'], 'first turn: moves only, no Escape');
  // Even walled in, the hero gets a forced skip, never an escape.
  const walled = { ...FX, board: { ...FX.board, towers: FX.board.towers.map((t, i) => (i ? t : { ...t, sides: { N: 'wall', E: 'wall', S: 'wall', W: 'wall' } })) } };
  assert.deepEqual(types(setup({ content: walled }), walled), ['FORCED_SKIP']);
  // escapeWithoutExploring is the explicit switch for it.
  const on = setup({ rules: { escapeWithoutExploring: true } });
  assert.ok(acts(on).some(a => a.type === 'TOWER_CHOICE' && a.choice === 'ESCAPE'));
});

test('v2 tower entry from every permitted direction offers Escape, Stay or Continue; it never forces escape', () => {
  const cases = [
    { tower: '0,0', from: '1,0', dir: 'W', onward: 'S' },
    { tower: '0,0', from: '0,1', dir: 'N', onward: 'E' },
    { tower: '9,0', from: '8,0', dir: 'E', onward: 'S' },
    { tower: '9,0', from: '9,1', dir: 'N', onward: 'W' },
    { tower: '0,10', from: '0,9', dir: 'S', onward: 'E' },
    { tower: '0,10', from: '1,10', dir: 'W', onward: 'N' },
    { tower: '9,10', from: '9,9', dir: 'S', onward: 'W' },
    { tower: '9,10', from: '8,10', dir: 'E', onward: 'N' },
  ];
  for (const c of cases) {
    let g = setup();
    place(g, c.from, 'FX_STRAIGHT', ['E', 'W'].includes(c.dir) ? 90 : 0);
    putHero(g, 0, c.from);
    g = act(g, 'MOVE', { dir: c.dir });
    assert.equal(at(g), c.tower, c.tower);
    assert.equal(g.phase, 'TOWER_CHOICE', `${c.tower} from ${c.from}`);
    assert.equal(g.heroes[0].status, 'IN_TOWER_NOT_ESCAPED', 'in a tower is not escaped');
    assert.deepEqual(choices(g), ['ESCAPE', 'STAY', 'CONTINUE'], `${c.tower} from ${c.from}`);
    const cont = act(g, 'TOWER_CHOICE', { choice: 'CONTINUE' });
    assert.deepEqual(exits(cont, FX, 0).filter(e => e.legal).map(e => e.dir), [c.onward], 'transit: through the other passage only');
  }
});

test('v2 B can enter A\'s tower, and towers hold any number of heroes', () => {
  let g = setup({ players: 3, towers: [0, 0, 1] });
  assert.deepEqual(g.heroes[0].coord, g.heroes[1].coord, 'two heroes share a start tower');
  place(g, '8,0', 'FX_STRAIGHT', 90);
  putHero(g, 0, '8,0');
  g = act(g, 'MOVE', { dir: 'E' }); // seat 0 into seat 2's start tower
  assert.deepEqual(g.heroes[0].coord, { x: 9, y: 0 });
  assert.deepEqual(choices(g), ['ESCAPE', 'STAY', 'CONTINUE'], 'nobody owns a tower');
  g = act(g, 'TOWER_CHOICE', { choice: 'STAY' });
  assert.deepEqual([g.heroes[0].status, g.heroes[2].status], ['IN_TOWER_NOT_ESCAPED', 'READY_IN_START_TOWER']);
  assert.deepEqual(g.heroes[0].coord, g.heroes[2].coord, 'a shared tower');
});

test('v2 returning to any connected tower, re-entering without escaping, and the tower as the only legal destination', () => {
  // D27: one tile, so from (1,0) the only legal move is back west into the start tower.
  let g = setup({ tileOrder: slotsOf('FX_CROSS').slice(0, 1) });
  g = run(g, [move(g, 'E')]);
  assert.deepEqual(acts(g).filter(a => a.type === 'MOVE').map(a => a.dir), ['W'], 'the tower is the only legal destination');
  g = act(g, 'MOVE', { dir: 'W' });
  assert.deepEqual(choices(g), ['ESCAPE', 'STAY'], 'no other passage: no Continue, and Escape is not forced');
  g = act(g, 'TOWER_CHOICE', { choice: 'STAY' });
  assert.equal(g.heroes[0].status, 'IN_TOWER_NOT_ESCAPED');
  assert.equal(g.status, 'playing');
  assert.equal(g.sun, 3, 'Stay ends the turn; the hero keeps playing');
  g = act(g, 'MOVE', { dir: 'E' });
  assert.equal(g.heroes[0].status, 'EXPLORING', 'out again');
  g = act(g, 'MOVE', { dir: 'W' });
  g = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' });
  assert.equal(g.heroes[0].status, 'ESCAPED', 'only choosing Escape sets ESCAPED');
  assert.deepEqual(g.result.winners, [0]);
});

test('v2 tower transit: Continue moves on through another passage the same turn; Stop leaves the hero in the tower', () => {
  let g = setup({ tileOrder: slotsOf('FX_CROSS').slice(0, 1) });
  place(g, '1,0', 'FX_STRAIGHT', 90);
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'W' });
  g = act(g, 'TOWER_CHOICE', { choice: 'CONTINUE' });
  assert.equal(g.phase, 'CHOOSE_EXIT');
  assert.equal(exits(g, FX, 0).find(e => e.dir === 'E').reason, 'tower-entry', 'not back the way in');
  assert.ok(types(g).includes('STOP'));
  const through = act(g, 'MOVE', { dir: 'S' });
  assert.deepEqual(through.heroes[0].coord, { x: 0, y: 1 });
  assert.equal(through.heroes[0].status, 'EXPLORING');
  assert.equal(through.log.filter(e => e.kind === 'turn').length, 2, 'the transit and the next room were one turn');
  const stopped = act(g, 'STOP');
  assert.equal(stopped.heroes[0].status, 'IN_TOWER_NOT_ESCAPED');
});

test('v2 final-turn tower entry: the choice is offered at sun 26 and Escape counts', () => {
  let g = setup();
  g.sun = 26; g.round = 26;
  place(g, '1,0', 'FX_STRAIGHT', 90);
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'W' });
  assert.deepEqual([g.phase, g.status, g.sun], ['TOWER_CHOICE', 'playing', 26], 'sunset waits for the choice');
  const esc = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' });
  assert.equal(esc.heroes[0].status, 'ESCAPED');
  assert.deepEqual(esc.result.winners, [0]);
  const stay = act(g, 'TOWER_CHOICE', { choice: 'STAY' });
  assert.equal(stay.phase, 'SUNSET_GAME_OVER');
  assert.deepEqual([stay.heroes[0].status, stay.heroes[0].endResult], ['IN_TOWER_NOT_ESCAPED', 'INSIDE_AT_SUNSET']);
});

test('v2 sunset: in a tower without choosing Escape is neither escaped nor dead; towerAtSunsetCountsAsEscape flips it', () => {
  for (const flag of [false, true]) {
    let g = setup({ players: 2, towers: [0, 1], rules: { towerAtSunsetCountsAsEscape: flag }, tileOrder: slotsOf('FX_CROSS').slice(0, 1) });
    g.sun = 26; g.round = 26;
    place(g, '1,0', 'FX_STRAIGHT', 90);
    putHero(g, 0, '1,0');
    g = act(g, 'MOVE', { dir: 'W' });
    g = act(g, 'TOWER_CHOICE', { choice: 'STAY' });
    g = act(g, 'MOVE', { dir: 'S' }); // seat 1 walks out of its start tower; sunset follows
    assert.equal(g.phase, 'SUNSET_GAME_OVER');
    const [a, b] = g.heroes;
    if (!flag) {
      assert.deepEqual([a.status, a.endResult], ['IN_TOWER_NOT_ESCAPED', 'INSIDE_AT_SUNSET']);
      assert.notEqual(a.status, 'DEAD');
      assert.equal(g.result.castleWins, true);
      assert.deepEqual(g.result.others.map(e => e.endResult), ['INSIDE_AT_SUNSET', 'INSIDE_AT_SUNSET'], 'kept apart from DEAD in the results');
    } else {
      assert.equal(a.status, 'ESCAPED');
      assert.deepEqual(g.result.winners, [0]);
    }
    assert.equal(b.endResult, 'INSIDE_AT_SUNSET', 'the explorer is caught either way');
  }
});

test('v2 doors: a closed door lets another exit be used the same turn; on a compulsory move it ends the turn (plan 13 #14)', () => {
  let g = setup({ deckOrders: { ROOM: EMPTY_ROOMS, DOOR: ['FX_DOOR_STUCK', 'FX_DOOR_STUCK'] } });
  place(g, '1,1', 'FX_CROSS');
  place(g, '1,0', 'FX_DOORWAY', 180);
  putHero(g, 0, '1,1');
  g = act(g, 'MOVE', { dir: 'N' });
  assert.deepEqual([at(g), g.phase, g.sun], ['1,1', 'CHOOSE_EXIT', 1]);
  g = act(g, 'MOVE', { dir: 'E' });
  assert.equal(at(g), '2,1', 'another free passage, same turn');
  // Compulsory: the rubble return back through a door that stays shut ends the turn (D07 extended, plan 13 #14).
  let r = setup({ deckOrders: { ROOM: EMPTY_ROOMS, DOOR: ['FX_DOOR_OPENS', 'FX_DOOR_STUCK'] } });
  place(r, '1,2', 'FX_DOORWAY');  // its door faces N, toward the rubble
  place(r, '1,1', 'FX_RUBBLE');   // open N and S
  putHero(r, 0, '1,2');
  r = act(r, 'MOVE', { dir: 'N' }); // the door opens; into the rubble, the turn ends
  assert.deepEqual([at(r), r.sun], ['1,1', 2]);
  r = act(r, 'RUBBLE_RETURN');      // back through the relocked door: it stays shut
  assert.deepEqual([r.heroes[0].coord, r.sun], [{ x: 1, y: 1 }, 3], 'no detour on a compulsory move: the turn ends');
  assert.deepEqual(types(r), ['RUBBLE_RETURN', 'RUBBLE_FORCE']);
});

test('v2 dark room: initial reveal triggers it; ordinary re-entry only under EVERY_ENTRY (D06)', () => {
  for (const policy of ['ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY', 'EVERY_ENTRY']) {
    let g = setup({ rules: { darkRoomPolicy: policy }, tileOrder: [...slotsOf('FX_DARK').slice(0, 1), ...slotsOf('FX_CROSS').slice(0, 1)], script: [5] });
    g = run(g, [move(g, 'S')]);
    assert.deepEqual(types(g), ['ROLL_DARK_EXIT'], `${policy}: initial reveal`);
    g = act(g, 'ROLL_DARK_EXIT'); // to (0,2)
    g = act(g, 'MOVE', { dir: 'N' }); // ordinary re-entry
    assert.equal(g.heroes[0].conditions.some(c => c.id === 'dark'), policy === 'EVERY_ENTRY', policy);
  }
});

test('v2 well and rubble record their entry edge; the well its phase AT_NEAR_EDGE then CROSSED; rubble its arrival direction', () => {
  let w = setup({ tileOrder: slotsOf('FX_WELL').slice(0, 1), script: [4, 1] });
  place(w, '1,0', 'FX_CROSS');
  putHero(w, 0, '1,0');
  w = act(w, 'MOVE', { dir: 'S' });
  assert.deepEqual(w.heroes[0].roomState, { special: 'well', entryEdge: 'N', phase: 'AT_NEAR_EDGE' });
  w = act(w, 'WELL_JUMP');
  assert.deepEqual(w.heroes[0].roomState, { special: 'well', entryEdge: 'N', phase: 'CROSSED' });
  let r = setup({ tileOrder: slotsOf('FX_RUBBLE').slice(0, 1) });
  place(r, '1,1', 'FX_CROSS');
  putHero(r, 0, '1,1');
  r = act(r, 'MOVE', { dir: 'E' });
  assert.deepEqual(r.heroes[0].roomState, { special: 'rubble', entryEdge: 'W', arrivalDir: 'E' });
  r = act(r, 'RUBBLE_RETURN');
  assert.equal(r.heroes[0].roomState, null, 'cleared on leaving');
});

test('v2 event log: semantic entries; normal view hides private data, debug view shows it', () => {
  let g = setup({ players: 2, towers: [0, 1], tileOrder: slotsOf('FX_CORNER').slice(0, 1), deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  g = act(g, 'MOVE', { dir: 'E' }); // red room: gate falls, room card, monster
  const mv = g.log.find(e => e.kind === 'move');
  assert.deepEqual([mv.round, mv.seat, mv.from, mv.to, mv.mark], [1, 0, '0,0', '1,0', 'red']);
  assert.equal(g.log.find(e => e.kind === 'gate-falls').edge, '0,0|E');
  assert.ok(g.log.some(e => e.kind === 'resolve-card' && e.value === 'FX_ROOM_MONSTER#1'));
  g = act(g, 'RESPOND', { choice: 'attack' });
  const commit = g.log.find(e => e.kind === 'commit');
  assert.deepEqual([commit.round, commit.seat, commit.choice], [1, 0, 'attack'], 'the commitment');
  const monsterDraw = g.log.find(e => e.kind === 'draw' && e.deck === 'MONSTER');
  assert.equal(monsterDraw.private, 1, 'private to the controller');
  const hero = view(g, FX, 0);
  assert.equal(hero.log.find(e => e.seq === monsterDraw.seq).value, 'hidden');
  assert.ok(!hero.log.some(e => e.kind === 'shuffle'), 'no RNG calls in the normal view');
  assert.equal(hero.rng, undefined);
  assert.equal(typeof hero.decks.ROOM.count, 'number');
  const dbg = view(g, FX, 0, { debug: true });
  assert.equal(dbg.debug, true);
  assert.equal(dbg.log.find(e => e.seq === monsterDraw.seq).value, 'FX_MON_BRUTE#1');
  assert.ok(dbg.log.some(e => e.kind === 'shuffle'));
  assert.ok(Array.isArray(dbg.decks.ROOM.order) && dbg.rng.seed !== undefined);
  // Dice with their arithmetic: a test and a damage formula.
  let t = setup({ script: [7, 6] });
  place(t, '1,1', 'FX_CROSS');
  place(t, '1,0', 'FX_GATEWAY', 180);
  putHero(t, 0, '1,1');
  t = act(t, 'MOVE', { dir: 'N' });
  assert.equal(t.log.find(e => e.kind === 'test').arithmetic, 'D12 7 = 7 > STR 6: fail');
  const gate = t.log.find(e => e.kind === 'gate');
  assert.deepEqual([gate.edge, gate.pass], ['1,0|S', false], 'the gate edge');
  let f = setup({ script: [1], deckOrders: { ROOM: ['FX_ROOM_TRAP', ...EMPTY_ROOMS] }, tileOrder: slotsOf('FX_CROSS').slice(0, 1) });
  f = act(f, 'MOVE', { dir: 'E' });
  assert.equal(f.log.find(e => e.kind === 'formula').arithmetic, 'D6 1 - 2 = -1');
  assert.equal(f.log.find(e => e.kind === 'damage').arithmetic, 'max(0, -1) = 0; HP 17 - 0 = 17', 'D03 floor (legacySupported)');
  assert.ok(draws(f, 'ROOM').length === 1);
});

test('v2 synthetic-data banner and app label', () => {
  assert.equal(APP_LABEL, 'Mechanics engine under verification');
  const fx = syntheticCategories(FX);
  assert.equal(fx.length, 15, 'every fixture category is synthetic');
  assert.ok(fx.includes('Maze tiles: synthetic') && fx.includes('Room cards: synthetic'));
  assert.deepEqual(syntheticCategories(ORIGINAL), []);
  assert.deepEqual(contentStatus(ORIGINAL, FX, 'fixture').synthetic, fx);
  assert.deepEqual(contentStatus(ORIGINAL, FX, 'original').synthetic, []);
});
