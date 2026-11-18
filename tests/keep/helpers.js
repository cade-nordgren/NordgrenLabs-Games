// Shared test helpers. Fixture content is NON-AUTHENTIC TEST DATA.
import FX from '../../site/keep/content/fixtures/fixtures.js';
import { createGame, reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';

export { FX };
export const walled = { N: 'wall', E: 'wall', S: 'wall', W: 'wall' };

// Fixture content with some towers fully walled in (index -> walled).
export function withWalledTowers(indexes) {
  return { ...FX, board: { ...FX.board, towers: FX.board.towers.map((t, i) => (indexes.includes(i) ? { ...t, sides: walled } : t)) } };
}

export const run = (game, actions, content = FX) => actions.reduce((g, a) => reduce(g, a, content), game);

// Create a game and finish setup. firstRolls are the first-player D12s (scripted);
// heroes and rings take the first legal option; towers[seat] picks each seat's tower.
// deckOrders: scripted deck tops; by default the room deck starts with its ten empty rooms, so
// tests that only walk the maze draw harmless room cards.
export const EMPTY_ROOMS = Array(10).fill('FX_ROOM_EMPTY');
// heroes[seat]: a hero id to draft for that seat (default: the first one left).
export function setup({ players = 1, content = FX, firstRolls, towers = [], heroes = [], script = [], tileOrder = null, rules = {}, seed = 7, deckOrders = { ROOM: EMPTY_ROOMS } } = {}) {
  const rolls = firstRolls || Array.from({ length: players }, (_, i) => 12 - i);
  let g = createGame({ players: Array.from({ length: players }, (_, i) => `P${i + 1}`), seed, content, rules, diceScript: [...rolls, ...script], tileOrder, deckOrders });
  g = reduce(g, { type: 'ROLL_FIRST_PLAYER' }, content);
  while (g.status === 'setup') {
    const acts = legalActions(g, content);
    const seat = acts[0].seat;
    const a = acts[0].type === 'PICK_TOWER' ? acts.find(x => x.tower === (towers[seat] ?? 0))
      : acts[0].type === 'PICK_HERO' && heroes[seat] ? acts.find(x => x.heroId === heroes[seat]) : acts[0];
    g = reduce(g, a, content);
  }
  return g;
}

export const move = (g, dir) => ({ type: 'MOVE', seat: g.activeSeat, dir });
export const stop = g => ({ type: 'STOP', seat: g.activeSeat });

// Slot ids of a fixture tile definition, in order.
export function slotsOf(defId, content = FX) {
  const out = [];
  let n = 0;
  for (const d of content.tiles) for (let i = 0; i < d.copies; i++) { n++; if (d.id === defId) out.push(`TILE_${String(n).padStart(3, '0')}`); }
  return out;
}

export const acts = (g, content = FX) => legalActions(g, content);
export const types = (g, content = FX) => [...new Set(legalActions(g, content).map(a => a.type))];
export const find = (g, pred, content = FX) => {
  const a = legalActions(g, content).find(pred);
  if (!a) throw new Error(`No legal action matches in ${g.phase}: ${JSON.stringify(legalActions(g, content))}`);
  return a;
};
// Take the legal action of a type (and matching fields), e.g. act(g, 'RESPOND', { choice: 'attack' }).
export const act = (g, type, fields = {}, content = FX) => reduce(g, find(g, a => a.type === type && Object.entries(fields).every(([k, v]) => a[k] === v), content), content);
export const xy = at => { const [x, y] = at.split(',').map(Number); return { x, y }; };

// Hand-placed revealed tile (a constructed position for a unit test).
export function place(g, at, defId, rotation = 0) {
  g.board.tiles[at] = { slotId: `MANUAL_${at}`, defId, coord: xy(at), rotation, entrySide: 'S', revealedRound: 1 };
}
export function putHero(g, seat, at, prev = null) {
  Object.assign(g.heroes[seat], { coord: xy(at), prevCoord: prev && xy(prev), enteredFrom: null, enteredVia: prev ? 'move' : null });
}
// Move the next copy of a card from its deck into a hero's held or treasury cards.
export function give(g, seat, cat, id, into = cat === 'TREASURY' ? 'treasury' : 'held') {
  const order = g.decks[cat].order;
  const i = order.findIndex(x => x.startsWith(id + '#'));
  if (i < 0) throw new Error(`${id} not in ${cat}`);
  g.heroes[seat][into].push(order.splice(i, 1)[0]);
}
export const dice = (g, ...values) => { g.rng.script.push(...values); return g; };
export const draws = (g, deck) => g.log.filter(e => e.kind === 'draw' && e.deck === deck).map(e => e.value);

// RB 7.4, SP 6: every card copy is somewhere exactly once: in its own deck, held, or in play.
const DECK_KEYS = { ROOM: 'room', SEARCH: 'search', ROOM_SEARCH: 'roomSearch', CHEST: 'chest', DOOR: 'door', MONSTER: 'monster', TREASURY: 'treasury' };
export function census(g, content = FX) {
  const out = {};
  for (const [cat, k] of Object.entries(DECK_KEYS)) {
    const expected = content[k].reduce((s, d) => s + (d.copies ?? 1), 0);
    const own = id => content[k].some(d => d.id === id.split('#')[0]);
    const places = [...g.decks[cat].order, ...g.heroes.flatMap(h => (h ? [...h.held, ...h.treasury] : [])).filter(own),
      ...g.stack.filter(f => f.card && !f.kept && f.deck === cat).map(f => f.card),
      ...(cat === 'MONSTER' && g.encounter?.monster ? [g.encounter.monster.inst] : [])];
    out[cat] = { expected, actual: places.length, unique: new Set(places).size };
  }
  out.DRAGON = { expected: 8, actual: g.dragon.remaining.length + g.dragon.aside.length, unique: new Set([...g.dragon.remaining, ...g.dragon.aside]).size };
  return out;
}
export function assertCensus(assert, g, content = FX) {
  for (const [cat, c] of Object.entries(census(g, content))) {
    assert.equal(c.actual, c.expected, `${cat}: ${c.actual} of ${c.expected} copies accounted for`);
    assert.equal(c.unique, c.actual, `${cat}: no copy in two places`);
  }
}
