// Headless play: random legal actions through whole games in 1, 2 and 4 player modes. At every state the UI's
// DOM-free helpers run over every seat's view and the public view, and nothing they produce may read
// "undefined", "NaN", "null" or "[object Object]". Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { view, canUndoTo } from '../../site/keep/engine/view.js';
import { entries, lines, undoLabel, cardText, monsterText, fightRowModel } from '../../site/keep/ui/words.js';
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
  // D37: nobody but the monster player sees the monster's card, HP or damage; in solo the computer holds the card.
  // Spec v4: the solo player sees the revealed monster's HP and wounds (unless the house rule hides them); the
  // multiplayer hero, bystanders and the public view never do, in the encounter or in the log.
  const enc = v.encounter;
  const controller = enc && viewer === enc.controller && viewer !== enc.seat;
  const soloHp = g.seats.length === 1 && viewer === 0 && g.rules.soloMonsterHp === 'visible';
  if (enc?.monster && soloHp) { soloHpSeen++; assert.deepEqual(enc.monster, { groupId: g.encounter.monster.groupId, hp: g.encounter.monster.hp, wounds: g.encounter.monster.wounds }, 'solo: HP after the reveal'); }
  else if (enc?.monster && !controller) assert.deepEqual(Object.keys(enc.monster), ['groupId'], 'monster data hidden');
  for (const e of v.log) if ('wounds' in e) assert.equal(g.log[e.seq - 1].private, viewer, `viewer ${viewer}: a damage tally only in its own monster player's log`);
  // The fight row (ui/app.js) shows monster HP exactly when the view carries it.
  if (enc) {
    const f = fightRowModel(v, enc.seat, enc, s => names[s], FX);
    ok(`${f.who} ${f.hero.label} ${f.monster?.label ?? ''}`, 'fight row');
    assert.equal(!!f.monster, Number.isInteger(enc.monster?.hp), 'monster HP in the fight row only when in the view');
    if (!soloHp && !controller) assert.equal(f.monster, null, 'never for a multiplayer hero, bystander or the table');
  }

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

let chamberMoves = 0, soloHpSeen = 0;
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
    const g = playGame(players, 1000 + i, players === 1 ? { ...(i % 2 ? { soloCombat: 'abc-digital-variant' } : {}), ...(i % 9 === 6 ? { soloMonsterHp: 'hidden-house-rule' } : {}) } : {});
    for (const e of g.log) seen.add(e.kind === 'commit' && e.item ? 'commit-item' : e.kind === 'item' ? `item-${e.action}` : e.kind);
  }
  for (const kind of ['item-obtain', 'encounter', 'exchange', 'throw', 'test', 'monster-wound', 'may-continue']) assert.ok(seen.has(kind), `random play reached ${kind}`);
  assert.ok(soloHpSeen > 0, 'random play showed a solo player the revealed monster HP');

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
    'P1 discards a treasure chamber card.',
    'P2 loses a treasure chamber card when the dragon wakes.',
    'The monster is dead.',
  ]);
  // Where the card went is deck bookkeeping: the debug log alone says it.
  const debug = entries([{ kind: 'item', action: 'discard', seat: 0, value: 'hidden', group: 'chamber', to: 'bottom of TREASURY' }, { kind: 'bottom', deck: 'MONSTER', value: 'hidden' }, { kind: 'shuffle', deck: 'CHEST' }], ctx, { debug: true });
  assert.deepEqual(debug.map(x => [x.text, x.mech]), [
    ['P1 discards a treasure chamber card.', 'It goes to the bottom of the treasure chamber pile.'],
    ['', 'A card goes to the bottom of the monster pile.'],
    ['', 'The chest pile is shuffled.'],
  ]);
  assert.equal(entries([{ kind: 'bottom', deck: 'MONSTER', value: 'hidden' }], ctx).length, 0, 'not in the plain log');
});

test('the chamber is called by its content name in log lines, prompts and card text; with no name it falls back', async () => {
  const { mixContent, chamberName } = await import('../../site/keep/content/schema.js');
  const { shownEffectText } = await import('../../site/keep/engine/describe.js');
  const { wellJumpModifiers } = await import('../../site/keep/engine/movement.js');
  const NAMED = { ...FX, chamber: { ...FX.chamber, name: "Dragon's Lair" } };
  const events = [
    { kind: 'place-chamber' }, { kind: 'stay', seat: 0 }, { kind: 'dragon-wakes', waker: 1, queue: [1] },
    { kind: 'item', action: 'discard', seat: 0, value: 'hidden', group: 'chamber', to: 'bottom of TREASURY' },
  ];
  const thief = FX.room.find(e => e.id === 'FX_ROOM_THIEF');
  const g = setup();
  putHero(g, 0, '4,5');
  const say = c => ({
    log: lines(events, { content: c, name: s => `P${s + 1}` }),
    search: view(g, c).searchUnavailable, cell: cellInfo(view(g, c), c, { x: 4, y: 5 }).what,
    card: shownEffectText(thief, chamberName(c)), jump: wellJumpModifiers({ treasury: [] }, c)[0].source,
  });
  assert.deepEqual(say(NAMED), {
    log: ["The Dragon's Lair is entered for the first time.", "P1 stays in the Dragon's Lair.", "The dragon wakes. Everyone in the Dragon's Lair, from P2 clockwise.", "P1 discards a Dragon's Lair card."],
    search: "not a room square (this is the Dragon's Lair). Only black or red dot rooms can be searched.",
    cell: "Dragon's Lair, not yet entered", card: "Made-up test card. You lose your Dragon's Lair cards.", jump: "Dragon's Lair cards carried",
  });
  assert.deepEqual(say(FX), {
    log: ['The treasure chamber is entered for the first time.', 'P1 stays in the treasure chamber.', 'The dragon wakes. Everyone in the treasure chamber, from P2 clockwise.', 'P1 discards a treasure chamber card.'],
    search: 'not a room square (this is the treasure chamber). Only black or red dot rooms can be searched.',
    cell: 'treasure chamber, not yet entered', card: 'Made-up test card. You lose your treasure chamber cards.', jump: 'treasure chamber cards carried',
  });
  assert.equal(chamberName({ chamber: { name: "  The Dragon's Lair " } }), "Dragon's Lair", 'a leading "The" is not doubled');
  // Play-test: fixture cards say their generated line with the owner's chamber name.
  const own = Object.fromEntries(Object.keys(FX).map(k => [k, Array.isArray(FX[k]) ? [] : null]));
  assert.equal(mixContent({ ...own, chamber: NAMED.chamber }, FX).room.find(e => e.id === 'FX_ROOM_THIEF').text, "Made-up test card. You lose your Dragon's Lair cards.");
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

test('why the hero may keep moving, the escape sun and a drawn card read by name', () => {
  const ctx = { content: FX, name: () => 'Cade' };
  const mc = (reason, extra = {}) => ({ kind: 'may-continue', seat: 0, reason, rule: 'x', ...extra });
  assert.deepEqual(lines([
    mc('yellow-corridor'), mc('door-stayed-closed', { edge: '4,4|S' }), mc('secret-passage', { card: null }), mc('card', { card: 'FX_ROOM_DRAFT#1' }), mc('tower-transit'), mc('rubble-forced'),
    { kind: 'escape', seat: 0, at: '0,0', sun: 12 },
    { kind: 'draw', deck: 'ROOM', value: 'FX_ROOM_DRAFT#1', cardName: 'Test draught (keep moving)', effectText: 'Made-up test card. You may keep moving this turn.' },
  ], ctx), [
    'Cade may keep moving: a corridor has no card.',
    'Cade may keep moving: the door stayed shut, so another way may be used.',
    'Cade may keep moving: a secret passage was found.',
    'Cade may keep moving: the card says so (Test draught (keep moving)).',
    'Cade may keep moving: passing through the tower.',
    'Cade may keep moving: the rubble forces a move.',
    'Cade escapes the keep on sun 12.',
    `Room card: Test draught (keep moving). ${FX.room.find(d => d.id === 'FX_ROOM_DRAFT').text || 'Made-up test card. You may keep moving this turn.'}`,
  ]);
});
