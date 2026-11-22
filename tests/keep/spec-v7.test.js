// Owner specification v7 (docs/plans/spec-v7-owner-2026-11-19.md): every "shuffle again" card (room, search, room
// search, chest, door) goes back into its own deck, that deck is shuffled without the cards heroes hold, and a replacement
// is drawn at once and resolved as part of the original action, again on another shuffle card (R62, D62). Owner cards
// (draft) on the NON-AUTHENTIC fixture board and tiles, with scripted deck orders: the first order is the setup shuffle,
// each later one the next reshuffle of that deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import ORIGINAL from '../../site/keep/content/original/index.js';
import { mixContent, validateContent } from '../../site/keep/content/schema.js';
import { view } from '../../site/keep/engine/view.js';
import { entries } from '../../site/keep/ui/words.js';
import { FX, setup, act, place, putHero, give, draws, assertCensus } from './helpers.js';

const C = ORIGINAL;
const M = mixContent(ORIGINAL, FX);
const T = { ...M, board: FX.board, tiles: FX.tiles, chamber: FX.chamber };
const EMPTY = Array(10).fill('ROOM_013');
const go = (g, type, fields = {}) => act(g, type, fields, T);
const logged = (g, kind) => g.log.filter(e => e.kind === kind);
const RING = x => { x.seats[0].ringId = 'RING_4'; };
const SIZE = { ROOM: 60, SEARCH: 15, ROOM_SEARCH: 14, CHEST: 14, DOOR: 15 };
const heldAll = g => g.heroes.flatMap(h => [...h.held, ...h.treasury]);
// Where the turn stands: no extra turn, the same seat, the same sun.
const clock = g => [g.sun, g.round, g.activeSeat, logged(g, 'turn').length, g.phase];

// Seat 0 steps from (1,0) south into (1,1); `room` is the room deck's setup order (top first).
function enter(room, { decks = {}, prep, script = [], toTile = 'FX_CROSS' } = {}) {
  const heroes = ['HERO_1', ...C.heroes.map(h => h.id).filter(id => id !== 'HERO_1')];
  const g = setup({ players: 1, content: T, heroes, script, deckOrders: { ROOM: Array.isArray(room[0]) ? room : [[...room, ...EMPTY]], ...decks } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', toTile, 0);
  putHero(g, 0, '1,0');
  prep?.(g);
  return go(g, 'MOVE', { dir: 'S' });
}
const roomSearch = (orders, prep) => {
  const g = setup({ players: 1, content: T, deckOrders: { ROOM: EMPTY, ROOM_SEARCH: orders } });
  place(g, '1,0', 'FX_CROSS'); place(g, '1,1', 'FX_TEE', 0);
  putHero(g, 0, '1,1');
  prep?.(g);
  return go(g, 'SEARCH');
};
// Every card where it belongs once: deck + held + in play = the deck's size, and no id twice.
function conserved(g, deck) {
  assertCensus(assert, g, T);
  const own = heldAll(g).filter(i => C[{ ROOM: 'room', SEARCH: 'search', ROOM_SEARCH: 'roomSearch', CHEST: 'chest', DOOR: 'door' }[deck]].some(d => i.startsWith(`${d.id}#`)));
  const inPlay = g.stack.filter(f => f.card && !f.kept && f.deck === deck).length; // a card still resolving (a monster room card)
  assert.equal(g.decks[deck].order.length + own.length + inPlay, SIZE[deck], `${deck}: ${g.decks[deck].order.length} in the deck + ${own.length} held + ${inPlay} in play`);
  assert.equal(new Set(g.decks[deck].order).size, g.decks[deck].order.length, `${deck}: no id twice`);
  assert.ok(own.every(i => !g.decks[deck].order.includes(i)), `${deck}: held cards are not in the deck`);
}

test('spec v7 room deck: the shuffle card is replaced at once by another room card, with all its consequences', () => {
  let g = enter([['ROOM_014', ...EMPTY], ['ROOM_010']]);
  assert.deepEqual(draws(g, 'ROOM'), ['ROOM_014#1', 'ROOM_010#1']);
  assert.deepEqual(g.heroes[0].held, ['ROOM_010#1'], 'the replacement treasure is kept; no extra card');
  assert.equal(g.decks.ROOM.shuffles, 2);
  conserved(g, 'ROOM');
  assert.deepEqual(clock(g), clock(enter(['ROOM_010'])), 'no extra turn: as if the treasure had been the first card');
  // Twice in a row: the shuffle card is in the shuffled deck and comes up again; the procedure repeats.
  g = enter([['ROOM_014', ...EMPTY], ['ROOM_014'], ['ROOM_013']]);
  assert.deepEqual(draws(g, 'ROOM'), ['ROOM_014#1', 'ROOM_014#1', 'ROOM_013#1']);
  assert.equal(g.decks.ROOM.shuffles, 3);
  conserved(g, 'ROOM');
  assert.deepEqual(clock(g), clock(enter(['ROOM_013'])));
  // A monster: commitment before reveal still holds (no monster card drawn yet, nothing about it shown).
  g = enter([['ROOM_014', ...EMPTY], ['ROOM_017']], { decks: { MONSTER: ['MONSTER_006'] } });
  assert.equal(g.phase, 'CHOOSE_MONSTER_RESPONSE');
  assert.deepEqual(draws(g, 'MONSTER'), []);
  assert.equal(JSON.stringify(view(g, T, 0)).includes('MONSTER_006'), false);
  conserved(g, 'ROOM');
  // A trap: the Protection Ring is offered first, as for a first card.
  g = enter([['ROOM_014', ...EMPTY], ['ROOM_006']], { prep: RING });
  assert.equal(g.pending?.kind, 'trap-ring');
  assert.equal(g.pending.card, 'ROOM_006#1');
  // A chest: the optional prompt follows.
  g = enter([['ROOM_014', ...EMPTY], ['ROOM_009']]);
  assert.deepEqual(g.pending.options, ['Open the chest', 'Leave it']);
  // The log says plainly what happened; the card text carries no deck bookkeeping.
  const said = entries(g.log, { content: T, name: s => `P${s + 1}` }).map(x => x.text);
  assert.ok(said.some(t => /^Room card: Shuffle again\. The room cards are shuffled and another is drawn\.$/.test(t)), said.join('\n'));
});

test('spec v7 room deck: cards heroes hold stay out of the shuffle; the shuffle card goes in', () => {
  const g = enter([['ROOM_014', ...EMPTY], ['ROOM_013']], { prep: x => { give(x, 0, 'ROOM', 'ROOM_011'); give(x, 0, 'ROOM', 'ROOM_004'); } });
  const last = logged(g, 'shuffle').filter(e => e.deck === 'ROOM').at(-1);
  assert.equal(last.count, 58, '60 cards, 2 held: the shuffle card itself is among the 58 shuffled');
  assert.deepEqual(g.heroes[0].held, ['ROOM_011#1', 'ROOM_004#1']);
  assert.ok(g.decks.ROOM.order.includes('ROOM_014#1'));
  conserved(g, 'ROOM');
});

test('spec v7 search deck: "Search the body" draws a replacement for the shuffle card as its result', () => {
  let g = go(enter(['ROOM_022'], { decks: { SEARCH: [['SEARCH_001'], ['SEARCH_003']] } }), 'CHOOSE', { option: 0 });
  assert.deepEqual(draws(g, 'SEARCH'), ['SEARCH_001#1', 'SEARCH_003#1']);
  assert.deepEqual(g.heroes[0].held, ['SEARCH_003#1']);
  assert.equal(g.decks.SEARCH.shuffles, 2);
  conserved(g, 'SEARCH');
  assert.deepEqual(clock(g), clock(go(enter(['ROOM_022'], { decks: { SEARCH: ['SEARCH_003'] } }), 'CHOOSE', { option: 0 })));
  g = go(enter(['ROOM_022'], { decks: { SEARCH: [['SEARCH_001'], ['SEARCH_001'], ['SEARCH_004']] } }), 'CHOOSE', { option: 0 });
  assert.deepEqual(draws(g, 'SEARCH'), ['SEARCH_001#1', 'SEARCH_001#1', 'SEARCH_004#1']);
  assert.equal(g.decks.SEARCH.shuffles, 3);
  conserved(g, 'SEARCH');
  assert.deepEqual(clock(g), clock(go(enter(['ROOM_022'], { decks: { SEARCH: ['SEARCH_004'] } }), 'CHOOSE', { option: 0 })));
  // A held search card stays out of the shuffle.
  g = go(enter(['ROOM_022'], { decks: { SEARCH: [['SEARCH_001'], ['SEARCH_004']] }, prep: x => give(x, 0, 'SEARCH', 'SEARCH_005') }), 'CHOOSE', { option: 0 });
  assert.equal(logged(g, 'shuffle').filter(e => e.deck === 'SEARCH').at(-1).count, 14);
  conserved(g, 'SEARCH');
});

test('spec v7 room search deck: the search result is the replacement card', () => {
  let g = roomSearch([['RSEARCH_008'], ['RSEARCH_005']]);
  assert.deepEqual(draws(g, 'ROOM_SEARCH'), ['RSEARCH_008#1', 'RSEARCH_005#1']);
  assert.deepEqual(g.heroes[0].held, ['RSEARCH_005#1']);
  conserved(g, 'ROOM_SEARCH');
  assert.deepEqual(clock(g), clock(roomSearch(['RSEARCH_005'])));
  // A secret door as the replacement opens a way this turn, as the search's own result.
  g = roomSearch([['RSEARCH_008'], ['RSEARCH_008'], ['RSEARCH_003']]);
  assert.deepEqual(draws(g, 'ROOM_SEARCH'), ['RSEARCH_008#1', 'RSEARCH_008#1', 'RSEARCH_003#1']);
  assert.equal(g.decks.ROOM_SEARCH.shuffles, 3);
  assert.equal(g.phase, 'CHOOSE_EXIT');
  assert.deepEqual(clock(g), clock(roomSearch(['RSEARCH_003'])));
  conserved(g, 'ROOM_SEARCH');
  g = roomSearch([['RSEARCH_008'], ['RSEARCH_007']], x => give(x, 0, 'ROOM_SEARCH', 'RSEARCH_004'));
  assert.equal(logged(g, 'shuffle').filter(e => e.deck === 'ROOM_SEARCH').at(-1).count, 13);
  conserved(g, 'ROOM_SEARCH');
});

test('spec v7 chest deck: "Open the chest" draws a replacement for the shuffle card as its result', () => {
  const open = (orders, opts = {}) => go(enter(['ROOM_009'], { decks: { CHEST: orders }, ...opts }), 'CHOOSE', { option: 0 });
  let g = open([['CHEST_009'], ['CHEST_005']]);
  assert.deepEqual(draws(g, 'CHEST'), ['CHEST_009#1', 'CHEST_005#1']);
  assert.deepEqual(g.heroes[0].held, ['CHEST_005#1']);
  conserved(g, 'CHEST');
  assert.deepEqual(clock(g), clock(open(['CHEST_005'])));
  g = open([['CHEST_009'], ['CHEST_009'], ['CHEST_001']]);
  assert.deepEqual(draws(g, 'CHEST'), ['CHEST_009#1', 'CHEST_009#1', 'CHEST_001#1']);
  assert.equal(g.decks.CHEST.shuffles, 3);
  conserved(g, 'CHEST');
  assert.deepEqual(clock(g), clock(open(['CHEST_001'])));
  // A trap as the replacement: the Protection Ring is offered first.
  g = open([['CHEST_009'], ['CHEST_008']], { prep: RING });
  assert.equal(g.pending?.kind, 'trap-ring');
  g = open([['CHEST_009'], ['CHEST_001']], { prep: x => { give(x, 0, 'CHEST', 'CHEST_002'); give(x, 0, 'CHEST', 'CHEST_006'); } });
  assert.equal(logged(g, 'shuffle').filter(e => e.deck === 'CHEST').at(-1).count, 12);
  conserved(g, 'CHEST');
});

test('spec v7 door deck: unchanged, byte for byte, over 200 seeded door draws', () => {
  // Recorded from the engine before spec v7 (commit 7f5e903) with the same scenarios: four door orders (two scripted
  // redraws, a double shuffle, a trap replacement, and a seeded reshuffle), seeds 1 to 25, with and without the ring.
  const out = [];
  for (const door of [[['DOOR_005'], ['DOOR_001']], [['DOOR_005'], ['DOOR_005'], ['DOOR_002']], [['DOOR_005'], ['DOOR_004']], ['DOOR_005']]) {
    for (let seed = 1; seed <= 25; seed++) for (const ring of [null, 'RING_4']) {
      const heroes = ['HERO_1', ...C.heroes.map(h => h.id).filter(id => id !== 'HERO_1')];
      const g = setup({ players: 1, seed, content: T, heroes, deckOrders: { ROOM: EMPTY, DOOR: door } });
      place(g, '1,0', 'FX_CROSS'); place(g, '1,1', 'FX_DOORWAY', 0);
      putHero(g, g.activeSeat, '1,0');
      g.rng.script = null; // seeded dice from here
      if (ring) g.seats[g.activeSeat].ringId = ring;
      const r = act(g, 'MOVE', { dir: 'S' }, T);
      out.push(JSON.stringify({ log: r.log, decks: r.decks, heroes: r.heroes, turn: r.turn, sun: r.sun, round: r.round, seat: r.activeSeat, phase: r.phase, pending: r.pending, stack: r.stack, rng: r.rng }));
    }
  }
  assert.equal(createHash('sha256').update(out.join('\n')).digest('hex'), 'a183e92bcbbe268c6de4d26aca81de60712a3f3ec72a8e01411cfa3df1d705ae');
  const g = enter(['ROOM_013'], { toTile: 'FX_DOORWAY', decks: { DOOR: [['DOOR_005'], ['DOOR_005'], ['DOOR_001']] } });
  assert.deepEqual(draws(g, 'DOOR'), ['DOOR_005#1', 'DOOR_005#1', 'DOOR_001#1']);
  conserved(g, 'DOOR');
});

test('spec v7 malformed content: a deck of nothing but shuffle cards is refused, and the engine never loops on one', () => {
  const only = validateContent({ ...C, chest: C.chest.filter(e => e.kind === 'reshuffle') });
  assert.ok(only.errors.some(e => /CHEST deck: a "shuffle again" card needs at least one other card/.test(e.message)));
  assert.equal(validateContent(C).errors.length, 0);
  // Every other chest card held: the shuffle card is all that is left, so the chest yields nothing.
  const g = go(enter(['ROOM_009'], { decks: { CHEST: ['CHEST_009'] }, prep: x => { for (const id of new Set(x.decks.CHEST.order.map(i => i.split('#')[0]))) if (id !== 'CHEST_009') while (x.decks.CHEST.order.some(i => i.startsWith(`${id}#`))) give(x, 0, 'CHEST', id); } }), 'CHOOSE', { option: 0 });
  assert.deepEqual(draws(g, 'CHEST'), ['CHEST_009#1']);
  assert.equal(logged(g, 'deck-empty').at(-1).deck, 'CHEST');
  assert.deepEqual(g.decks.CHEST.order, ['CHEST_009#1']);
  assertCensus(assert, g, T);
});
