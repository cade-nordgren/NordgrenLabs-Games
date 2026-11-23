import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUITS, RANKS, fullDeck, allowedDecks, defaultDecks, required, canPlay, legalRanks, streak } from '../../site/bomb/engine/cards.js';
import { createGame, pickFirst, FIRST_ORDER, layout, reduce, checkState, playable, mustPickUp } from '../../site/bomb/engine/reducer.js';
import { viewFor } from '../../site/bomb/engine/view.js';

const act = (g, a) => { const n = reduce(g, a); assert.notEqual(n, g, `rejected: ${JSON.stringify(a)}`); checkState(n); return n; };
const no = (g, a) => assert.equal(reduce(g, a), g, `should reject: ${JSON.stringify(a)}`);
const play = (g, ...ids) => act(g, { type: 'play', seat: g.turn, ids: ids.map(id => /^(10|[2-9JQKA])[SHDC]$/.test(id) ? id + '0' : id) });
const next = g => act(g, { type: 'next' });
const pick = g => act(g, { type: 'pickUp', seat: g.turn });
const down = (g, slot) => act(g, { type: 'playDown', seat: g.turn, slot });
const ranks = cards => cards.map(c => c.rank);
const roundTrip = g => { const r = JSON.parse(JSON.stringify(g)); checkState(r); assert.deepEqual(r, g); return r; };
// Two players with deck empty unless given; filler hands keep the "hand >= 5 while deck has cards" invariant out of the way.
const two = (a, b = { hand: ['3C', '3D'], up: ['4C', '4D'], down: ['5C', '5D', '5H', '4H'] }, rest = {}) =>
  layout({ players: [a, b], ...rest });

// Picks every face-up card and confirms, for every seat (in the given order).
const startPlay = (g, order = g.players.map((_, i) => i)) => {
  for (const seat of order) {
    g = act(g, { type: 'arrange', seat, ids: g.players[seat].hand.slice(0, 4).map(c => c.id) });
    g = act(g, { type: 'confirm', seat });
  }
  return g;
};

// Dealing

test('one deck: 52 unique real cards, no jokers, 4 down + 9 to choose from, 26 left in the deck', () => {
  const g = createGame({ players: 2, seed: 7 });
  checkState(g);
  const all = [...g.deck, ...g.players.flatMap(p => [...p.hand, ...p.down])];
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map(c => c.id)).size, 52);
  assert.ok(all.every(c => RANKS.includes(c.rank) && SUITS.includes(c.suit) && c.deck === 0));
  assert.deepEqual([...new Set(all.map(c => c.rank))].sort((a, b) => a - b), RANKS);
  for (const p of g.players) assert.deepEqual([p.down.length, p.hand.length, p.up.length, p.ready], [4, 9, 0, false]);
  assert.equal(g.deck.length, 26);
  assert.equal(g.phase, 'choose');
});

test('choosing four face-up cards leaves a five-card hand; order of confirmation and rearranging do not matter', () => {
  const g = createGame({ players: 3, seed: 1 });
  const ids = g.players[1].hand.slice(2, 6).map(c => c.id);
  let h = act(g, { type: 'arrange', seat: 1, ids });
  assert.deepEqual([h.players[1].up.map(c => c.id), h.players[1].hand.length], [ids, 5]);
  const swapped = [ids[3], ids[1], ids[2], ids[0]];
  h = act(h, { type: 'arrange', seat: 1, ids: swapped });
  assert.deepEqual(h.players[1].up.map(c => c.id), swapped, 'rearranged positions');
  const other = g.players[1].hand.slice(0, 4).map(c => c.id);
  h = act(h, { type: 'arrange', seat: 1, ids: other });
  assert.deepEqual([h.players[1].up.map(c => c.id), h.players[1].hand.length], [other, 5], 'changed the choice');
  no(h, { type: 'arrange', seat: 1, ids: other.slice(0, 3) });
  no(h, { type: 'arrange', seat: 1, ids: [other[0], other[0], other[1], other[2]] });
  no(h, { type: 'arrange', seat: 1, ids: [...other.slice(0, 3), g.players[0].hand[0].id] });
  no(h, { type: 'confirm', seat: 0 });
  no(h, { type: 'play', seat: g.first, ids: [h.players[g.first].hand[0].id] });
  h = act(h, { type: 'confirm', seat: 1 });
  no(h, { type: 'confirm', seat: 1 });
  no(h, { type: 'arrange', seat: 1, ids });
  // Any confirmation order gives the same game.
  const a = startPlay(g, [2, 0, 1]), b = startPlay(g, [0, 1, 2]);
  assert.deepEqual(a, b);
  assert.deepEqual([a.phase, a.turn], ['play', a.first]);
  assert.deepEqual({ first: a.first, firstWhy: a.firstWhy }, pickFirst(a.players, { rng: 0 }), 'decided from the five-card hands');
  for (const p of a.players) assert.deepEqual([p.hand.length, p.up.length, p.down.length], [5, 4, 4]);
  assert.equal(a.deck.length, 52 - 39);
});

test('player and deck limits: 2 to 6 players, 1 to 4 decks, enough cards for 13 each', () => {
  assert.deepEqual([2, 3, 4, 5, 6].map(allowedDecks), [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [2, 3, 4], [2, 3, 4]]);
  assert.deepEqual([1, 7, 2.5].map(allowedDecks), [[], [], []]);
  assert.deepEqual([2, 3, 4, 5, 6].map(defaultDecks), [1, 1, 2, 2, 2]);
  assert.throws(() => createGame({ players: 1, seed: 1 }));
  assert.throws(() => createGame({ players: 7, seed: 1 }));
  assert.throws(() => createGame({ players: 5, decks: 1, seed: 1 }));
  assert.throws(() => createGame({ players: 2, decks: 5, seed: 1 }));
  for (let players = 2; players <= 6; players++) for (const decks of allowedDecks(players)) {
    const g = createGame({ players, decks, seed: players * 10 + decks });
    checkState(g);
    assert.equal(g.deck.length, decks * 52 - players * 13);
    assert.equal(new Set([...g.deck, ...g.players.flatMap(p => [...p.hand, ...p.down])].map(c => c.id)).size, decks * 52);
  }
});

test('several decks: duplicate cards are distinct objects with the deck in the id', () => {
  const ids = fullDeck(3).filter(c => c.rank === 12 && c.suit === 'H').map(c => c.id);
  assert.deepEqual(ids, ['QH0', 'QH1', 'QH2']);
  const g = two({ hand: ['QH0', 'QH1', 'QH2', '6S', '7S'] }, undefined, { decks: 3 });
  checkState(g);
  assert.deepEqual(ranks(play(g, 'QH0', 'QH1', 'QH2').pile), [12, 12, 12]);
});

test('same seed, same game; different seed, different game', () => {
  const a = createGame({ players: 4, seed: 99 }), b = createGame({ players: 4, seed: 99 }), c = createGame({ players: 4, seed: 100 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.deck, c.deck);
});

// Who goes first

const hands = (...hs) => layout({ decks: 2, players: hs.map(hand => ({ hand })) }).players;
test('first player: most 3s; ties go to 4s, then 5s and up, 2 last', () => {
  assert.deepEqual(FIRST_ORDER, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 2]);
  const pf = (...hs) => pickFirst(hands(...hs), { rng: 1 });
  assert.deepEqual(pf(['3S', 'KS'], ['3H', '3D', 'AS'], ['4S']), { first: 1, firstWhy: { rank: 3, count: 2, tied: false } }, 'most 3s');
  assert.deepEqual(pf(['5S', 'KS'], ['3H', 'AS'], ['4S']), { first: 1, firstWhy: { rank: 3, count: 1, tied: false } }, 'the only 3');
  assert.deepEqual(pf(['3S', '4S', '9S'], ['3H', '4H', '4D'], ['3D', 'JS']), { first: 1, firstWhy: { rank: 4, count: 2, tied: true } }, 'tied on 3s, more 4s');
  assert.deepEqual(pf(['3S', '5S'], ['3H', '6H'], ['7D', '4S', '4H']), { first: 0, firstWhy: { rank: 5, count: 1, tied: true } },
    'only the tied players go on: seat 2 has 4s but no 3');
  assert.deepEqual(pf(['6S', 'KS'], ['7H', 'AS'], ['9D', 'QS']), { first: 0, firstWhy: { rank: 6, count: 1, tied: false } }, 'nobody holds a 3, 4 or 5');
  assert.deepEqual(pf(['2S', 'KS'], ['2H', 'KH', '2D']), { first: 1, firstWhy: { rank: 2, count: 2, tied: true } }, '2 counts last');
});

test('first player: identical hands are settled by the seeded rng, the same way every time', () => {
  const same = hands(['3S0', '9S0', 'KS0'], ['3S1', '9S1', 'KS1'], ['4H0']);
  const picks = new Set();
  for (let rng = 0; rng < 40; rng++) {
    const r = pickFirst(same, { rng });
    assert.deepEqual(r, pickFirst(same, { rng }), 'deterministic');
    assert.deepEqual(r.firstWhy, { rank: null, count: 0, tied: true });
    picks.add(r.first);
  }
  assert.deepEqual([...picks].sort(), [0, 1], 'only the tied seats, and either can win');
});

test('first player is decided when the last player confirms, and play starts there', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const players = 2 + seed % 5, g = createGame({ players, decks: defaultDecks(players), seed });
    assert.deepEqual([g.first, g.turn, g.firstWhy], [0, 0, null], 'nothing decided while choosing');
    const h = startPlay(g);
    const want = pickFirst(h.players, { rng: g.rng });
    assert.deepEqual([h.turn, h.first, h.firstWhy], [want.first, want.first, want.firstWhy]);
    assert.deepEqual(viewFor(h, 0).firstWhy, h.firstWhy);
  }
});

// Normal play

test('equal and higher ranks are legal, lower are not; 2 and 10 always; ace high', () => {
  const pile6 = layout({ players: [{}, {}], pile: ['6H'] }).pile;
  assert.deepEqual(legalRanks(pile6), [2, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(legalRanks([]), RANKS);
  const ace = layout({ players: [{}, {}], pile: ['AH'] }).pile;
  assert.deepEqual(legalRanks(ace), [2, 10, 14]);
  assert.equal(required(ace), 14);

  const g = two({ hand: ['6S', '9S', '9H', 'KS', '3S', '7D', '8D'] }, undefined, { pile: ['6H'] });
  assert.deepEqual(playable(g, 0).sort(), ['6S0', '7D0', '8D0', '9H0', '9S0', 'KS0']);
  assert.equal(play(g, '6S').pile.at(-1).id, '6S0', 'equal rank');
  assert.equal(play(g, 'KS').pile.at(-1).id, 'KS0', 'higher rank');
  no(g, { type: 'play', seat: 0, ids: ['3S0'] });
  assert.deepEqual(ranks(play(g, '9S', '9H').pile), [6, 9, 9], 'multiples');
  no(g, { type: 'play', seat: 0, ids: ['9S0', 'KS0'] });
  no(g, { type: 'play', seat: 0, ids: ['9S0', '9S0'] });
  no(g, { type: 'play', seat: 0, ids: [] });
  no(g, { type: 'play', seat: 1, ids: ['3C0'] });
  no(g, { type: 'play', seat: 0, ids: ['3C0'] });
  // 7 and 8 are ordinary: an 8 sets the bar at 8, a 7 is too low after it.
  const h = next(play(g, '8D'));
  assert.equal(h.pending, null);
  assert.equal(required(h.pile), 8);
  assert.equal(canPlay(7, h.pile), false);
});

test('a normal play passes the turn only after Next Turn; nothing else is legal while pending', () => {
  const g = two({ hand: ['6S', '9S', '9H', 'KS', '3S'] }, { hand: ['JC', '3D'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] });
  const h = play(g, '9S');
  assert.deepEqual([h.turn, h.pending, h.turns], [0, { next: 1 }, 1]);
  assert.deepEqual(h.last, { seat: 0, type: 'play', from: 'hand', cards: [h.pile[0]], bomb: false, drew: 0 });
  no(h, { type: 'play', seat: 0, ids: ['9H0'] });
  no(h, { type: 'play', seat: 1, ids: ['JC0'] });
  no(h, { type: 'pickUp', seat: 0 });
  no(h, { type: 'pickUp', seat: 1 });
  const i = next(h);
  assert.deepEqual([i.turn, i.pending], [1, null]);
  no(i, { type: 'next' });
  no(i, { type: 'play', seat: 0, ids: ['9H0'] });
  assert.equal(play(i, 'JC').pending.next, 0);
});

test('turn order walks the seats with 3 to 6 players and wraps', () => {
  for (let n = 3; n <= 6; n++) {
    const players = Array.from({ length: n }, (_, i) => ({ hand: [`${[3, 4, 5, 6, 7, 8][i]}S`, `${[3, 4, 5, 6, 7, 8][i]}H`] }));
    let g = layout({ decks: 2, players, turn: n - 2 });
    const seen = [];
    for (let k = 0; k < n; k++) {
      seen.push(g.turn);
      // A fresh pile each step keeps every play legal.
      g = layout({ decks: 2, players, turn: next(play(g, g.players[g.turn].hand[0].id)).turn });
    }
    assert.deepEqual(seen, Array.from({ length: n }, (_, k) => (n - 2 + k) % n));
  }
});

// Special cards

test('2 resets on any rank, stays on the pile, and the same player goes again at once with no Next Turn', () => {
  const g = two({ hand: ['2S', '4S', '9H'] }, undefined, { pile: ['AH'] });
  const h = play(g, '2S');
  assert.deepEqual([ranks(h.pile), h.pending, h.turn, h.last.bomb, required(h.pile)], [[14, 2], null, 0, false, null]);
  assert.deepEqual(legalRanks(h.pile), RANKS);
  no(h, { type: 'next' });
  assert.equal(play(h, '4S').pending.next, 1, 'the next ordinary play passes on');
  // The refill comes before the extra turn, so a card just drawn can be played at once.
  const t = { up: ['QC', 'QD', 'QS', 'QH'], down: ['JC', 'JD', 'JH', 'AC'] };
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4H', '8C'], down: ['5C', '5D', '5H', '8D'] };
  const r = play(two({ hand: ['2S', '4S', '5S', '6S', '7S'], ...t }, b, { deck: ['9H', 'KS'] }), '2S');
  assert.deepEqual([r.players[0].hand.map(c => c.id), r.last.drew, viewFor(r, 0).you.playable.includes('9H0')], [['4S0', '5S0', '6S0', '7S0', '9H0'], 1, true]);
});

test('10 bombs on any rank: pile removed, same player again for exactly one turn', () => {
  const g = two({ hand: ['10S', '4S', '9H'] }, undefined, { pile: ['8H', 'AH'] });
  const h = play(g, '10S');
  assert.deepEqual([h.pile, h.pending, h.turn, h.last.bomb, h.players[0].bombs], [[], null, 0, true, 1], 'no Next Turn: the turn stays');
  assert.ok(['8H0', 'AH0', '10S0'].every(id => h.removed.some(c => c.id === id)));
  assert.equal(play(h, '4S').pending.next, 1, 'the next ordinary play passes on: no queue of extra turns');
});

test('four of a kind across turns bombs and the completer plays again; an interruption resets the streak', () => {
  const b = { hand: ['8C', 'KD', 'KC'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  let g = two({ hand: ['8S', '8H', '8D', '3S'] }, b);
  g = next(play(g, '8S'));
  assert.equal(streak(g.pile), 1);
  g = next(play(g, '8C'));
  assert.equal(streak(g.pile), 2);
  g = play(g, '8H', '8D');
  assert.deepEqual([g.pile, g.pending, g.turn, g.players[0].bombs, g.last.bomb], [[], null, 0, 1, true]);

  let s = two({ hand: ['8S', '8H', '8D', '9S'] }, { ...b, hand: ['KD', 'KC'] }, { pile: ['8C'] });
  s = next(play(s, '8S', '8H'));
  s = next(play(s, 'KD'));
  assert.equal(streak(s.pile), 1, 'K interrupts');
  assert.equal(s.pending, null);
});

test('four of a rank at once bombs, and so do five or more with several decks; four 2s bomb too', () => {
  const g = two({ hand: ['QS', 'QH', 'QD', 'QC', '3S'] });
  assert.equal(play(g, 'QS', 'QH', 'QD', 'QC').last.bomb, true);
  const five = two({ hand: ['QS0', 'QH0', 'QS1', 'QH1', 'QD1'] }, undefined, { decks: 2, pile: ['QD0', 'QC0'] });
  checkState(five);
  const h = play(five, 'QS0', 'QH0', 'QS1');
  assert.deepEqual([h.last.bomb, h.pile], [true, []], 'two on the pile plus three makes five');
  const twos = two({ hand: ['2S', '2H', '3S'] }, undefined, { pile: ['2D', '2C'] });
  assert.equal(play(twos, '2S', '2H').last.bomb, true);
});

// Drawing

test('refill to five after playing, partial refill near the end, none after the deck is gone', () => {
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  const t = { up: ['QC', 'QD', 'QS', 'QH'], down: ['JC', 'JD', 'JH', 'AC'] };
  const g = two({ hand: ['KS', 'KH', 'KD', '7S', '8S'], ...t }, b, { deck: ['9S', '9H', '9D', 'JS'] });
  const h = play(g, 'KS', 'KH', 'KD');
  assert.deepEqual([h.players[0].hand.map(c => c.id), h.deck.map(c => c.id), h.last.drew], [['7S0', '8S0', '9S0', '9H0', '9D0'], ['JS0'], 3]);
  const p = two({ hand: ['KS', 'KH', 'KD', '7S', '8S'], ...t }, b, { deck: ['9S'] });
  const i = play(p, 'KS', 'KH', 'KD');
  assert.deepEqual([i.players[0].hand.length, i.deck.length, i.last.drew], [3, 0, 1]);
  const j = play(two({ hand: ['KS', 'KH', '7S'] }, b), 'KS', 'KH');
  assert.deepEqual([j.players[0].hand.length, j.last.drew], [1, 0]);
  // A bomb still refills.
  const k = play(two({ hand: ['10S', '7S', '8S', '9C', '9D'], ...t }, b, { deck: ['AS', 'AH'] }), '10S');
  assert.deepEqual([k.players[0].hand.length, k.deck.length], [5, 1]);
});

// Picking up

test('voluntary pickup moves the whole pile to the hand, no refill, and passes the turn', () => {
  const g = two({ hand: ['KS', '7S', '3S', '4S', '5S'], up: ['QC', 'QD', 'QS', 'QH'], down: ['JC', 'JD', 'JH', 'JS'] },
    { hand: ['3C', '3D', '3H', '4C', '4D'], up: ['5C', '5D', '5H', '7C'], down: ['8C', '8D', '8H', '7D'] }, { pile: ['6H', '6D', '9C'], deck: ['AS'] });
  assert.equal(mustPickUp(g, 0), false);
  const h = pick(g);
  assert.deepEqual([h.players[0].hand.length, h.pile, h.deck.length, h.pending, h.players[0].pickups], [8, [], 1, { next: 1 }, 1]);
  assert.deepEqual(h.last, { seat: 0, type: 'pickUp', count: 3 });
  assert.deepEqual(h.players[0].hand.slice(5).map(c => c.id), ['6H0', '6D0', '9C0']);
  const i = next(h);
  assert.equal(required(i.pile), null, 'the next player leads on an empty pile');
});

test('mandatory pickup when nothing is playable; never on an empty pile', () => {
  const g = two({ hand: ['3S', '4S', '5S'] }, undefined, { pile: ['KH'] });
  assert.deepEqual([playable(g, 0), mustPickUp(g, 0), viewFor(g, 0).you.mustPickUp], [[], true, true]);
  no(g, { type: 'play', seat: 0, ids: ['3S0'] });
  pick(g);
  const e = two({ hand: ['3S'] });
  no(e, { type: 'pickUp', seat: 0 });
  assert.equal(mustPickUp(e, 0), false);
});

// Face-up phase

test('face-up cards only once the hand is empty and the deck is gone; multiples; stuck means pickup and back to the hand', () => {
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  const g = two({ hand: ['3S'], up: ['9S', '9H', 'KS', '3H'], down: ['7C', '7D', '7S', '7H'] }, b, { pile: ['8D'] });
  no(g, { type: 'play', seat: 0, ids: ['9S0'] }); // hand first
  const f = two({ up: ['9S', '9H', 'KS', '3H'], down: ['7C', '7D', '7S', '7H'] }, b, { pile: ['8D'] });
  assert.deepEqual(viewFor(f, 0).you.source, 'up');
  assert.deepEqual(playable(f, 0).sort(), ['9H0', '9S0', 'KS0']);
  no(f, { type: 'play', seat: 0, ids: ['3H0'] });
  no(f, { type: 'playDown', seat: 0, slot: 0 });
  const h = play(f, '9S', '9H');
  assert.deepEqual(h.players[0].up.map(c => c?.id ?? null), [null, null, 'KS0', '3H0'], 'slots stay in place');
  // Stuck on face-up: pick up, face-up cards untouched, play from the hand again.
  const s = two({ up: [null, '3H', null, null], down: ['7C', '7D', '7S', '7H'] }, b, { pile: ['8D'] });
  assert.equal(mustPickUp(s, 0), true);
  const t = pick(s);
  assert.deepEqual([t.players[0].hand.map(c => c.id), t.players[0].up[1].id], [['8D0'], '3H0']);
  const back = next(play(next(t), '6C', '6D', '6H'));
  assert.deepEqual([back.turn, viewFor(back, 0).you.source], [0, 'hand']);
});

test('a face-up card can be blocked only by the deck: never played while the deck has cards', () => {
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  assert.throws(() => checkState(two({ hand: ['KS', 'KH', 'KD', '7S', '8S'], up: [null, 'QS'], down: ['7C'] }, b, { deck: ['9S'] })));
});

// Face-down phase

test('face-down: one blind card at a time; legal cards play, a failed card goes up with the pile', () => {
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  const g = two({ down: ['KS', '3S', '2S', '10S'] }, b, { pile: ['9H', 'JD'] });
  assert.deepEqual([viewFor(g, 0).you.blind, viewFor(g, 0).you.playable, mustPickUp(g, 0)], [[0, 1, 2, 3], [], false]);
  no(g, { type: 'playDown', seat: 0, slot: 4 });
  no(g, { type: 'playDown', seat: 0, slot: '0' });
  no(g, { type: 'play', seat: 0, ids: ['KS0'] });
  const ok = down(g, 0);
  assert.deepEqual([ok.pile.at(-1).id, ok.players[0].down.map(Boolean), ok.pending, ok.last.from], ['KS0', [false, true, true, true], { next: 1 }, 'down']);
  const bad = down(g, 1);
  assert.deepEqual([bad.pile, bad.players[0].hand.map(c => c.id).sort(), bad.players[0].down[1], bad.pending, bad.players[0].pickups],
    [[], ['3S0', '9H0', 'JD0'], null, { next: 1 }, 1]);
  assert.deepEqual(bad.last, { seat: 0, type: 'failed', card: { rank: 3, suit: 'S' }, count: 3 });
  assert.equal(viewFor(next(bad), 0).you.source, 'hand', 'back to the hand phase');
  const reset = down(g, 2);
  assert.deepEqual([required(reset.pile), reset.pending, reset.turn], [null, null, 0], 'a blind 2 resets and goes again');
  const boom = down(g, 3);
  assert.deepEqual([boom.pile, boom.pending, boom.players[0].bombs], [[], null, 1], 'a blind 10 bombs');
  const third = down(two({ down: ['9S'] }, b, { pile: ['9H', '9D', '9C'] }), 0);
  assert.equal(third.phase, 'over', 'a blind fourth 9 bombs and, being the last card, wins');
  assert.equal(third.players[0].bombs, 1);
  const quad = down(two({ down: ['9S', 'AS'] }, b, { pile: ['9H', '9D', '9C'] }), 0);
  assert.deepEqual([quad.last.bomb, quad.pending, quad.turn], [true, null, 0], 'four-of-a-kind completed blind');
});

test('winning: immediate on the last card with no Next Turn; an empty hand alone does not win', () => {
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  const w = down(two({ down: [null, 'KS'] }, b, { pile: ['9H'] }), 1);
  assert.deepEqual([w.phase, w.winner, w.pending, w.turns], ['over', 0, null, 1]);
  no(w, { type: 'next' });
  no(w, { type: 'pickUp', seat: 1 });
  no(w, { type: 'play', seat: 1, ids: ['3C0'] });
  assert.deepEqual(viewFor(w, 1).players.map(p => p.left), [0, 13]);
  const wb = play(two({ hand: ['10S'] }, b), '10S');
  assert.deepEqual([wb.phase, wb.winner], ['over', 0], 'winning with a bomb ends the game');
  const notYet = play(two({ hand: ['KS'], up: ['QS'], down: ['JS', 'JH', 'JD', 'JC'] }, b), 'KS');
  assert.equal(notYet.phase, 'play');
});

// Persistence

test('serialise and restore at every stage: same state, every card once', () => {
  let g = roundTrip(createGame({ players: 2, seed: 5 }));
  g = roundTrip(act(g, { type: 'arrange', seat: 0, ids: g.players[0].hand.slice(0, 4).map(c => c.id) }));
  g = roundTrip(startPlay(g, [1, 0]));
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  roundTrip(play(two({ hand: ['9S', '9H', 'KS', '3S', '7S'] }, b), '9S'));
  roundTrip(play(two({ hand: ['10S', '9H', 'KS', '3S', '7S'] }, b), '10S'));
  roundTrip(pick(two({ hand: ['3S'] }, b, { pile: ['KH'] })));
  roundTrip(two({ down: ['KS', '3S'] }, b, { pile: ['9H'] }));
  roundTrip(down(two({ down: ['KS', '3S'] }, b, { pile: ['9H'] }), 1));
});

test('checkState rejects broken states', () => {
  const g = createGame({ players: 2, seed: 3 });
  const bad = f => { const s = structuredClone(g); f(s); assert.throws(() => checkState(s)); };
  bad(s => s.deck.pop());
  bad(s => s.deck.push(s.deck[0]));
  bad(s => { s.deck[0] = { ...s.deck[0], rank: 2 }; });
  bad(s => { s.v = 2; });
  bad(s => { s.phase = 'lobby'; });
  bad(s => { s.decks = 1; s.players.push(...structuredClone(s.players.slice(0, 1)), {}, {}, {}); });
  bad(s => s.players[0].down.pop());
  assert.throws(() => checkState(null));
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  assert.throws(() => checkState(two({ hand: ['3S'] }, b, { pile: ['KH', '5D'] })), 'pile out of order');
  assert.throws(() => checkState(two({ hand: ['3S'] }, b, { pile: ['10H'] })), 'a 10 left on the pile');
  assert.throws(() => checkState(two({ hand: ['3S'] }, b, { pile: ['7H', '7D', '7S', '7C'] })), 'four of a kind left on the pile');
  assert.throws(() => checkState(two({ hand: ['3S'], up: ['QS'], down: [null, '7H'] }, b)), 'face-down before face-up');
  assert.throws(() => checkState(two({ hand: ['3S'] }, b, { deck: ['AS'] })), 'short hand with cards in the deck');
  assert.throws(() => checkState(two({}, b)), 'a player with no cards should have won');
  bad(s => { s.firstWhy = { rank: 3, count: 1, tied: false }; });
  assert.throws(() => checkState({ ...two({ hand: ['3S'] }, b), firstWhy: { rank: 1, count: 1, tied: false } }), 'bad first reason');
});

test('games saved by the earlier version still load and play: a draws list, no firstWhy, a same-seat pending', () => {
  const b = { hand: ['3C', '3D', '6C', '6D', '6H'], up: ['4C', '4D', '4S', '4H'], down: ['5C', '5D', '5S', '5H'] };
  const old = two({ hand: ['7S', '9H'] }, b);
  delete old.firstWhy;
  old.draws = [[{ seat: 0, rank: 14, suit: 'S' }, { seat: 1, rank: 9, suit: 'H' }]];
  old.pending = { next: 0 }; // the old engine after a bomb: the turn kept, waiting for Next Turn
  checkState(old);
  assert.equal(viewFor(old, 0).firstWhy, null);
  no(old, { type: 'play', seat: 0, ids: ['7S0'] });
  const n = next(old);
  assert.deepEqual([n.turn, n.pending], [0, null]);
  assert.equal(play(n, '7S').pending.next, 1);
  // An old game still choosing (first from the draw) picks its first player afresh at the last confirm.
  const c = createGame({ players: 2, seed: 9 });
  delete c.firstWhy;
  Object.assign(c, { first: 1, turn: 1, draws: [[{ seat: 0, rank: 5, suit: 'S' }, { seat: 1, rank: 9, suit: 'H' }]] });
  checkState(c);
  const p = startPlay(c, [1, 0]);
  assert.ok(p.firstWhy && p.turn === p.first);
});

// Views

const hiddenIds = (g, seat) => [
  ...g.deck, ...g.players.flatMap((p, i) => [...p.down.filter(Boolean), ...(i === seat ? [] : p.hand),
    ...(g.phase === 'choose' && i !== seat ? p.up : [])]),
].map(c => `"${c.id}"`);

const assertNoLeak = (g, seat) => {
  const v = viewFor(g, seat), json = JSON.stringify(v);
  assert.deepEqual(JSON.parse(json), v, 'JSON-serialisable');
  for (const id of hiddenIds(g, seat)) assert.ok(!json.includes(id), `${id} leaked to seat ${seat}`);
  assert.ok(!/rng|seed/.test(json), 'no PRNG state');
  return v;
};

test('viewFor shows the viewer their own cards, counts for others, face-down as present only', () => {
  const g = startPlay(createGame({ players: 3, seed: 11 }));
  const v = assertNoLeak(g, 1);
  assert.deepEqual(v.you.hand, g.players[1].hand);
  assert.deepEqual(v.players.map(p => p.hand), [5, 5, 5]);
  assert.deepEqual(v.players[0].up, g.players[0].up);
  assert.deepEqual(v.players[2].down, [true, true, true, true]);
  assert.equal(v.deck, 52 - 39);
  assert.deepEqual([v.phase, v.turn, v.first, v.firstWhy, v.pending, v.removed, v.required, v.streak], ['play', g.first, g.first, g.firstWhy, null, 0, null, 0]);
  assert.equal(v.you.playable.length, g.turn === 1 ? 5 : 0);
  // Mutating the view must not touch the state.
  v.you.hand.pop();
  assert.equal(g.players[1].hand.length, 5);
});

test('during the face-up choice nobody sees anyone else\'s choice; the handoff view shows no hand at all', () => {
  let g = createGame({ players: 2, seed: 4 });
  g = act(g, { type: 'arrange', seat: 0, ids: g.players[0].hand.slice(0, 4).map(c => c.id) });
  g = act(g, { type: 'confirm', seat: 0 });
  const v1 = assertNoLeak(g, 1);
  assert.deepEqual([v1.players[0].up, v1.players[0].ready, v1.you.canArrange], [null, true, true]);
  assert.equal(assertNoLeak(g, 0).players[0].up.length, 4);
  const h = assertNoLeak(g, null);
  assert.equal(h.you, null);
  for (const p of g.players) for (const c of [...p.hand, ...p.up]) assert.ok(!JSON.stringify(h).includes(`"${c.id}"`));
  assert.equal(viewFor(g, 5).you, null, 'a bad seat is a spectator');
});

// Randomised playthroughs

const pickOne = (xs, r) => xs[Math.floor(r() * xs.length)];
function randomAction(g, r) {
  if (g.phase === 'choose') {
    const seat = pickOne(g.players.map((p, i) => p.ready ? -1 : i).filter(i => i >= 0), r);
    const p = g.players[seat];
    if (p.up.length && r() < 0.6) return { type: 'confirm', seat };
    const pool = [...p.hand, ...p.up].sort(() => r() - 0.5);
    return { type: 'arrange', seat, ids: pool.slice(0, 4).map(c => c.id) };
  }
  if (g.pending) return { type: 'next' };
  const v = viewFor(g, g.turn).you, seat = g.turn;
  if (v.mustPickUp || (v.canPickUp && r() < 0.03)) return { type: 'pickUp', seat };
  if (v.blind.length) return { type: 'playDown', seat, slot: pickOne(v.blind, r) };
  const cards = [...v.hand, ...g.players[seat].up.filter(Boolean)].filter(c => v.playable.includes(c.id));
  // Mostly the lowest legal rank, as people play; pure random play makes games several times longer.
  const rank = r() < 0.7 ? Math.min(...cards.map(c => c.rank)) : pickOne(cards, r).rank, same = cards.filter(c => c.rank === rank);
  return { type: 'play', seat, ids: same.slice(0, 1 + Math.floor(r() * same.length)).map(c => c.id) };
}

test('hundreds of random full games stay valid after every action and end with one winner', () => {
  let seedR = 12345;
  const r = () => ((seedR = (seedR * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let game = 0; game < 200; game++) {
    const players = 2 + game % 5, decks = pickOne(allowedDecks(players), r);
    let g = createGame({ players, decks, seed: game });
    checkState(g);
    let steps = 0;
    while (g.phase !== 'over') {
      const a = randomAction(g, r), n = reduce(g, a);
      assert.notEqual(n, g, `game ${game}: random legal action rejected ${JSON.stringify(a)}`);
      checkState(n);
      if (game % 25 === 0) for (let s = 0; s < players; s++) assertNoLeak(n, s);
      g = n;
      assert.ok(++steps < 20000, `game ${game} did not finish`);
    }
    const left = g.players.map(p => p.hand.length + p.up.filter(Boolean).length + p.down.filter(Boolean).length);
    assert.deepEqual([left[g.winner], left.filter(x => x === 0).length, g.deck.length], [0, 1, 0]);
    assert.ok(g.turns > 0);
    assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
  }
});

test('the whole game replays identically from the seed and the actions', () => {
  let seedR = 7;
  const r = () => ((seedR = (seedR * 1103515245 + 12345) % 2147483648) / 2147483648);
  let g = createGame({ players: 4, seed: 42 });
  const actions = [];
  while (g.phase !== 'over') { const a = randomAction(g, r); actions.push(a); g = reduce(g, a); }
  const again = actions.reduce(reduce, createGame({ players: 4, seed: 42 }));
  assert.deepEqual(again, g);
});
