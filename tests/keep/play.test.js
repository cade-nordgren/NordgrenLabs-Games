// Headless play: random legal actions through whole games in 1, 2 and 4 player modes. At every state the UI's
// DOM-free helpers run over every seat's view and the public view, and nothing they produce may read
// "undefined", "NaN", "null" or "[object Object]". Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { view, canUndoTo } from '../../site/keep/engine/view.js';
import { entries, lines, undoLabel, cardText, monsterText } from '../../site/keep/ui/words.js';
import { cellInfo, cellLabel, actionSquare } from '../../site/keep/ui/board.js';
import { squareKind, exits, exitFor, neighbour, key } from '../../site/keep/engine/board.js';
import { FX, setup, place, putHero, EMPTY_ROOMS } from './helpers.js';

const BAD = /undefined|NaN|\bnull\b|\[object Object\]/;
const ok = (text, where) => assert.ok(typeof text === 'string' && !BAD.test(text), `${where}: ${JSON.stringify(text)}`);

// mulberry32, for the action picks only (the game has its own seeded dice).
const picker = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function checkView(v, g, viewer, from) {
  const names = g.seats.map(s => s.name);
  const ctx = { content: FX, name: s => names[s] };
  for (const x of entries(v.log.slice(from), ctx)) { ok(x.text, `log ${x.e.kind} (viewer ${viewer})`); if (x.detail) ok(x.detail, `log detail ${x.e.kind}`); }
  if (g.status !== 'playing') return;
  // D37: nobody but the monster player sees the monster's card, HP or damage; in solo that is the computer.
  const enc = v.encounter;
  if (enc?.monster && !(viewer === enc.controller && viewer !== enc.seat)) assert.deepEqual(Object.keys(enc.monster), ['groupId'], 'monster data hidden');
  if (enc?.combat) ok(enc.combat.label, 'combat label');
  for (const t of v.pendingTests) { ok(t.success, 'test preview'); assert.ok(Number.isInteger(t.passingRolls) && Array.isArray(t.modifiers)); }
  v.heroes.forEach((h, seat) => {
    const inv = h.inventory;
    if (seat !== viewer) assert.equal(typeof inv.chamber, 'number', 'other seats see a chamber count');
    for (const item of [...inv.equipment, ...(inv.ring ? [inv.ring] : []), ...inv.items, ...inv.treasure, ...(Array.isArray(inv.chamber) ? inv.chamber : [])]) {
      ok(item.name, 'item name');
      if (item.usable) assert.ok(item.actions.some(a => a.type !== 'WELL_DISCARD'), `${item.name}: usable means an action`);
      else ok(item.reason, `${item.name}: reason`);
    }
    if (h.coord) { const c = cellInfo(v, FX, h.coord, names); ok(`${c.title} ${c.what}`, 'cell info'); ok(cellLabel(v, FX, h.coord, names), 'cell label'); }
  });
}

// The map's lit squares (ui/board.js actionSquare over the legal actions): each a board square next to the room
// the hero is in, no two MOVEs on one square, each MOVE's engine exit leading there, and for a hero in the
// chamber (two squares, one room, D39) exactly the legal ones of the squares around it. Returns 'chamber' when
// a hero in the chamber had moves.
function checkSquares(g, la) {
  let chamber = false;
  const bd = FX.board, moves = new Map();
  for (const a of la) {
    const sq = actionSquare(g, a);
    if (!sq) continue;
    const hero = g.heroes[a.seat];
    const room = squareKind(bd, hero.coord) === 'center' ? bd.center : [hero.coord];
    assert.notEqual(squareKind(bd, sq), 'off', `${a.type} lights a board square`);
    assert.ok(!room.some(c => key(c) === key(sq)) && room.some(c => Math.abs(c.x - sq.x) + Math.abs(c.y - sq.y) === 1), `${a.type} ${JSON.stringify(a)}: next to the room`);
    if (a.type !== 'MOVE') continue;
    assert.ok(!moves.has(key(sq)), `two moves on ${key(sq)}`);
    moves.set(key(sq), a);
    assert.equal(key(exitFor(g, FX, a.seat, a.dir, a.from).to), key(sq), 'the engine exit leads to the lit square');
  }
  const seat = g.activeSeat, hero = seat !== null && g.heroes[seat];
  if (moves.size && hero && squareKind(bd, hero.coord) === 'center') {
    chamber = true;
    const around = new Set(bd.center.flatMap(c => ['N', 'E', 'S', 'W'].map(d => key(neighbour(c, d)))).filter(k => !bd.center.some(c => key(c) === k)));
    const legal = exits(g, FX, seat).filter(e => e.legal).map(e => key(e.to));
    assert.ok(legal.every(k => around.has(k)), 'chamber exits are the squares around it');
    assert.deepEqual([...moves.keys()].sort(), legal.sort(), 'chamber: the lit squares are the legal ones around the room');
  }
  return chamber;
}

let chamberMoves = 0;
function playGame(players, seed, rules = {}) {
  const pick = picker(seed);
  let g = createGame({ players: Array.from({ length: players }, (_, i) => `P${i + 1}`), seed, content: FX, rules });
  for (let step = 0; g.status !== 'over'; step++) {
    assert.ok(step < 4000, 'the game ends');
    const la = legalActions(g, FX);
    assert.ok(la.length, `${g.status} ${g.phase}: a legal action exists`);
    if (g.status === 'playing' && checkSquares(g, la)) chamberMoves++;
    const prev = g;
    g = reduce(g, la[Math.floor(pick() * la.length)], FX);
    if (canUndoTo(prev, g)) ok(undoLabel(prev, g, FX, s => g.seats[s].name), 'undo label'); // the app shows it only then
    for (const viewer of [null, ...g.seats.keys()]) checkView(view(g, FX, viewer), g, viewer, prev.log.length);
  }
  return g;
}

test('random legal play: 1, 2 and 4 players, every view reads cleanly', () => {
  const seen = new Set();
  // KEEP_PLAY_GAMES=300 for a long run; the default keeps the suite to a few seconds.
  for (let i = 0; i < (+process.env.KEEP_PLAY_GAMES || 36); i++) {
    const players = [1, 2, 4][i % 3];
    const g = playGame(players, 1000 + i, players === 1 && i % 2 ? { soloCombat: 'abc-digital-variant' } : {});
    for (const e of g.log) seen.add(e.kind === 'commit' && e.item ? 'commit-item' : e.kind === 'item' ? `item-${e.action}` : e.kind);
  }
  for (const kind of ['item-obtain', 'encounter', 'exchange', 'throw', 'test', 'monster-wound', 'may-continue']) assert.ok(seen.has(kind), `random play reached ${kind}`);
  if (+process.env.KEEP_PLAY_GAMES >= 200) assert.ok(chamberMoves > 0, 'random play moved out of the chamber'); // rare in the short run; the next test scripts it
});

test('card summaries read cleanly for every fixture card', () => {
  for (const k of ['room', 'search', 'roomSearch', 'chest', 'door', 'treasury']) for (const def of FX[k]) ok(cardText(def), def.id);
  for (const def of FX.monster) ok(monsterText(def), def.id);
});

test('item and monster lines: a chamber card stays unnamed for others, a kill is told without a figure', () => {
  const ctx = { content: FX, name: s => `P${s + 1}` };
  assert.deepEqual(lines([
    { kind: 'well-discard', seat: 0 },
    { kind: 'item', action: 'discard', seat: 0, value: 'hidden', group: 'chamber', to: 'bottom of TREASURY' },
    { kind: 'item', action: 'lose', seat: 1, value: 'hidden', group: 'chamber', to: 'bottom of TREASURY', why: 'dragon' },
    { kind: 'monster-dead', seat: 0 }, { kind: 'bottom' }, { kind: 'encounter-end', outcome: 'monster-killed' },
  ], ctx), [
    'P1 discards a chamber card. It goes to the bottom of the treasure chamber pile.',
    'P2 loses a chamber card when the dragon wakes. It goes to the bottom of the treasure chamber pile.',
    'The monster is dead.',
  ]);
});

test('a hero in the chamber sees all six squares around the room lit, and each sends its own move (D39)', () => {
  for (const at of ['4,5', '5,5']) {
    const g = setup({ players: 2, towers: [0, 1], deckOrders: { ROOM: EMPTY_ROOMS } });
    for (const n of ['4,4', '5,4', '3,5', '6,5', '4,6', '5,6']) place(g, n, 'FX_CROSS');
    putHero(g, 0, at);
    g.board.chamberPlaced = true;
    const la = legalActions(g, FX);
    assert.ok(checkSquares(g, la), 'chamber moves checked');
    const lit = la.filter(a => a.type === 'MOVE').map(a => [key(actionSquare(g, a)), a]);
    assert.deepEqual(lit.map(([k]) => k).sort(), ['3,5', '4,4', '4,6', '5,4', '5,6', '6,5'], `recorded on ${at}`);
    for (const [k, a] of lit) {
      const out = reduce(g, a, FX);
      assert.equal(key(out.heroes[0].coord), k, `the move lit on ${k} goes there`);
    }
  }
});
