import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUITS, RANKS, shoe, cardOf, defaultDecks } from '../../site/salad/engine/cards.js';
import { trickPenalty, describeConfig, expectedTotal, expectedRound, standings, ROUNDS } from '../../site/salad/engine/score.js';
import { createGame, cutForDealer, layout, legalCards, trickWinner, reduce, checkState } from '../../site/salad/engine/reducer.js';
import { viewFor } from '../../site/salad/engine/view.js';

const id = code => code.startsWith('d') ? code : (m => `d${m[3] || 1}-${m[1]}${m[2]}`)(/^(10|[2-9JQKA])([SHDC])([1-3]?)$/.exec(code));
const ids = codes => codes.map(id);
const act = (g, a) => { const n = reduce(g, a); assert.notEqual(n, g, `rejected: ${JSON.stringify(a)}`); checkState(n); return n; };
const no = (g, a) => assert.equal(reduce(g, a), g, `should reject: ${JSON.stringify(a)}`);
const play = (g, code) => act(g, { type: 'PLAY_CARD', seat: g.turn, card: id(code) });
const P = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: `c${i}` }));
const suit = (s, deck = 1) => RANKS.map(r => `d${deck}-${r <= 10 ? r : 'JQKA'[r - 11]}${s}`);
// Small seeded LCG for choosing random legal cards in tests.
const lcg = seed => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
// Plays the round (or the rest of it) with a chooser; returns the state when the round is over.
const finishRound = (g, pick = (cards) => cards[0], each = () => {}) => {
  while (g.phase === 'play') { g = act(g, { type: 'PLAY_CARD', seat: g.turn, card: pick(legalCards(g, g.turn), g) }); each(g); }
  return g;
};
const playGame = (players, decks, seed, each = () => {}, scoreDisplay = 'live') => {
  const r = lcg(seed ^ 0x5eed);
  let g = createGame({ players: P(players), decks, seed, scoreDisplay });
  checkState(g); each(g);
  for (;;) {
    g = finishRound(g, cards => cards[Math.floor(r() * cards.length)], each);
    if (g.phase === 'over') return g;
    g = act(g, { type: 'NEXT_ROUND' }); each(g);
  }
};

// Cards

test('card ids: unique per deck instance, 52 per deck, no jokers', () => {
  assert.deepEqual(shoe(1).length, 52);
  for (const d of [1, 2, 3]) assert.equal(new Set(shoe(d)).size, 52 * d);
  assert.ok(shoe(2).includes('d1-AS') && shoe(2).includes('d2-AS'));
  assert.ok(shoe(3).includes('d3-10H'));
  assert.deepEqual(cardOf('d2-QH'), { id: 'd2-QH', deck: 2, rank: 12, suit: 'H' });
  assert.deepEqual(cardOf('d1-10C'), { id: 'd1-10C', deck: 1, rank: 10, suit: 'C' });
  assert.equal(cardOf('d4-QH'), null);
  assert.equal(cardOf('JOKER'), null);
  assert.ok(shoe(3).every(c => SUITS.includes(cardOf(c).suit) && RANKS.includes(cardOf(c).rank)));
});

test('rank order: ace high, 2 low, suits never matter except the lead', () => {
  const t = cards => trickWinner(ids(cards).map((card, seat) => ({ seat, card })));
  assert.equal(t(['KS', 'AS']), 1);
  assert.equal(t(['2S', 'AS', 'KS']), 1);
  assert.equal(t(['3D', '2D']), 0);
  assert.equal(t(['10H', 'JH', '9H']), 1);
  assert.equal(t(['QS', 'KS', 'AS', 'JS']), 2);
});

// Standard rules

// Dealer 0, so seat 1 leads. Seats 0 and 2 are void in hearts.
const spec = () => layout({ players: 4, hands: [suit('D'), ['9H'], suit('C'), ['JH']] });

test('the spec example: no trumps, the highest card of the lead suit wins, the winner leads next', () => {
  let g = spec();
  assert.equal(g.turn, 1);
  assert.deepEqual(legalCards(g, 1), g.hands[1], 'the leader may lead anything');
  g = play(g, '9H');
  assert.equal(viewFor(g, 2).trick.leadSuit, 'H');
  assert.deepEqual(legalCards(g, 2), g.hands[2], 'void in hearts: anything');
  g = play(g, 'KC');
  assert.deepEqual(legalCards(g, 3), g.hands[3].filter(c => c.endsWith('H')), 'must follow hearts');
  no(g, { type: 'PLAY_CARD', seat: 3, card: g.hands[3].find(c => !c.endsWith('H')) });
  g = play(g, 'JH');
  g = play(g, 'AD');
  assert.equal(g.tricks[0].winner, 3);
  assert.equal(g.turn, 3);
  assert.deepEqual(g.trick, { n: 2, leader: 3, plays: [] });
  assert.deepEqual(legalCards(g, 3), g.hands[3], 'the winner may lead any card');
});

test('hearts may be led at any time, also in round 2', () => {
  const g = layout({ players: 4, round: 2, dealer: 3, hands: [['2H', ...suit('S').slice(0, 12)]] });
  assert.equal(g.turn, 0);
  assert.ok(legalCards(g, 0).includes('d1-2H'));
  play(g, '2H');
});

test('illegal actions return the same object', () => {
  const g = spec();
  no(g, { type: 'PLAY_CARD', seat: 2, card: g.hands[2][0] });          // not their turn
  no(g, { type: 'PLAY_CARD', seat: 1, card: g.hands[2][0] });          // not their card
  no(g, { type: 'PLAY_CARD', seat: 1, card: 'd9-ZZ' });
  no(g, { type: 'PLAY_CARD', seat: 1 });
  no(g, { type: 'PLAY_CARD', card: 'd1-9H' });
  no(g, { type: 'PLAY_CARD', seat: '1', card: 'd1-9H' });
  no(g, { type: 'NEXT_ROUND' });
  no(g, { type: 'REMATCH', seed: 5 });
  no(g, { type: 'nope' });
  no(g, { type: 'toString' });
  no(g, null);
  assert.equal(reduce(null, { type: 'NEXT_ROUND' }), null);
  const done = finishRound(g);
  no(done, { type: 'PLAY_CARD', seat: 0, card: 'd1-2D' });
  no(done, { type: 'REMATCH' });
  const over = playGame(3, 1, 9);
  no(over, { type: 'NEXT_ROUND' });
  no(over, { type: 'REMATCH', seed: 1.5 });
});

test('reduce never mutates its input', () => {
  const g = spec(), before = JSON.stringify(g);
  play(g, '9H');
  finishRound(g);
  assert.equal(JSON.stringify(g), before);
});

test('last trick: the round ends after exactly cardsEach tricks; round 5 scores only the last one', () => {
  for (const [n, d] of [[4, 1], [3, 1], [7, 2], [8, 3]]) {
    const T = describeConfig(n, d).tricks;
    const g = finishRound(layout({ players: n, decks: d, round: 5 }));
    assert.equal(g.tricks.length, T);
    assert.equal(g.phase, 'roundEnd');
    assert.ok(g.hands.every(h => !h.length));
    g.tricks.forEach(t => assert.equal(t.penalty.points.total, t.n === T ? 100 : 0));
    const lastWinner = g.tricks.at(-1).winner;
    assert.deepEqual(g.history[4].breakdown.map(b => b.points.total), g.players.map((_, s) => s === lastWinner ? 100 : 0));
  }
});

// Six scoring rounds

test('each penalty type on its own', () => {
  const pen = (cards, round, last = false) => trickPenalty(ids(cards), round, last).points.total;
  assert.equal(pen(['2S', '3S', '4S', '5S'], 1), 10);
  assert.equal(pen(['QH', 'KS', 'AH', '5H'], 1), 10, 'round 1 ignores card values');
  assert.equal(pen(['2S', '3S', '4S', '5S'], 2), 0, 'zero-penalty trick');
  assert.equal(pen(['2H', '3H', '4H', '5S'], 2), 30, 'three hearts');
  assert.equal(pen(['QH', 'QS', '4H', '5S'], 3), 50, 'two queens, hearts ignored');
  assert.equal(pen(['QH', 'QS', 'QD', 'QC'], 3), 100);
  assert.equal(pen(['KS', '3S', '4H', 'QS'], 4), 100, 'King of Spades');
  assert.equal(pen(['KH', 'KD', 'KC'], 4), 0, 'other kings are free');
  assert.equal(pen(['KS', 'KS2', 'AS'], 4), 200, 'two Kings of Spades in one trick');
  assert.equal(pen(['2S', '3S'], 5, true), 100);
  assert.equal(pen(['QH', 'KS'], 5, false), 0);
});

test('round 6: penalties stack, the Queen of Hearts counts twice, the 255-point example', () => {
  const qh = trickPenalty(ids(['QH', '2S', '3S', '4S']), 6, false);
  assert.deepEqual(qh, { tricks: 1, hearts: 1, queens: 1, kings: 0, last: 0, points: { tricks: 10, hearts: 10, queens: 25, kings: 0, last: 0, total: 45 } });
  // Final trick with one queen, two hearts and one King of Spades.
  const p = trickPenalty(ids(['5H', '7H', 'QC', 'KS']), 6, true);
  assert.deepEqual(p.points, { tricks: 10, hearts: 20, queens: 25, kings: 100, last: 100, total: 255 });
  assert.deepEqual([p.tricks, p.hearts, p.queens, p.kings, p.last], [1, 2, 1, 1, 1]);
});

test('per-round totals and the classic 1,120', () => {
  const c = { players: 4, decks: 1 };
  assert.deepEqual(ROUNDS.map(r => expectedRound(c, r.n)), [130, 130, 100, 100, 100, 560]);
  assert.equal(expectedTotal(c), 1120);
  assert.equal(expectedTotal({ players: P(4), decks: 1 }), 1120);
  const g = playGame(4, 1, 42);
  assert.equal(g.totals.reduce((a, b) => a + b, 0), 1120);
  assert.deepEqual(g.history.map(h => h.breakdown.reduce((s, b) => s + b.points.total, 0)), [130, 130, 100, 100, 100, 560]);
});

test('standings: lowest wins, equal scores share a rank, tied lowest are joint winners', () => {
  assert.deepEqual(standings([30, 10, 10, 50]), {
    rows: [{ seat: 1, total: 10, rank: 1 }, { seat: 2, total: 10, rank: 1 }, { seat: 0, total: 30, rank: 3 }, { seat: 3, total: 50, rank: 4 }],
    winners: [1, 2],
  });
  assert.deepEqual(standings([5, 0, 9]).winners, [1]);
  const over = playGame(5, 1, 3);
  const v = viewFor(over, 0);
  assert.equal(v.phase, 'over');
  assert.deepEqual(v.standings, standings(over.totals));
  assert.ok(v.standings.winners.every(s => over.totals[s] === Math.min(...over.totals)));
});

// Multiple decks

test('deal: equal hands of floor(52*decks/players), the remainder is the kitty, for every table', () => {
  for (let n = 2; n <= 8; n++) for (const d of [1, 2, 3]) {
    const g = createGame({ players: P(n), decks: d, seed: n * 10 + d });
    const c = describeConfig(n, d);
    assert.equal(c.cardsEach, Math.floor(52 * d / n));
    assert.ok(g.hands.every(h => h.length === c.cardsEach));
    assert.equal(g.kitty.length, 52 * d - n * c.cardsEach);
    assert.equal(c.kitty, g.kitty.length);
    assert.equal(new Set([...g.hands.flat(), ...g.kitty]).size, 52 * d, 'nothing removed, nothing repeated');
  }
});

test('describeConfig for the lobby', () => {
  assert.deepEqual(describeConfig(4, 1), { cardsEach: 13, kitty: 0, tricks: 13, hearts: 13, queens: 4, kingsOfSpades: 1, long: false, short: false });
  assert.deepEqual(describeConfig(3, 1), { cardsEach: 17, kitty: 1, tricks: 17, hearts: 13, queens: 4, kingsOfSpades: 1, long: false, short: false });
  assert.deepEqual(describeConfig(7, 2), { cardsEach: 14, kitty: 6, tricks: 14, hearts: 26, queens: 8, kingsOfSpades: 2, long: false, short: false });
  assert.deepEqual(describeConfig(P(8), 3), { cardsEach: 19, kitty: 4, tricks: 19, hearts: 39, queens: 12, kingsOfSpades: 3, long: false, short: false });
  assert.equal(describeConfig(2, 1).long, true, 'the full deck to two players is a longer game');
  assert.equal(describeConfig(3, 1).long, false);
  assert.equal(describeConfig(8, 1).short, true);
  assert.equal(describeConfig(7, 1).short, true);
  assert.equal(describeConfig(6, 1).short, false);
  assert.equal(describeConfig(2, 2).long, true);
  assert.equal(describeConfig(3, 2).long, true);
  assert.throws(() => describeConfig(9, 1));
  assert.throws(() => describeConfig(4, 4));
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(defaultDecks), [1, 1, 1, 1, 2, 2, 2]);
});

test('identical highest cards: the last one played wins', () => {
  assert.equal(trickWinner([{ seat: 0, card: 'd1-AS' }, { seat: 1, card: 'd2-AS' }, { seat: 2, card: 'd1-KS' }]), 1);
  assert.equal(trickWinner([{ seat: 0, card: 'd2-AS' }, { seat: 1, card: 'd1-AS' }]), 1);
  assert.equal(trickWinner([{ seat: 0, card: 'd3-QD' }, { seat: 1, card: 'd1-QD' }, { seat: 2, card: 'd2-QD' }]), 2);
  assert.equal(trickWinner([{ seat: 0, card: 'd1-AS' }, { seat: 1, card: 'd2-AH' }, { seat: 2, card: 'd2-KS' }]), 0, 'off-suit duplicates of other ranks do not matter');
  // In play: 3 players, 2 decks, seat 1 leads the Ace of Spades from deck 1, seat 2 follows with deck 2's.
  let g = layout({ players: 3, decks: 2, hands: [[], ['AS'], ['AS2']] });
  g = play(g, 'AS');
  g = play(g, 'AS2');
  g = act(g, { type: 'PLAY_CARD', seat: 0, card: legalCards(g, 0)[0] });
  assert.equal(g.tricks[0].winner, 2);
  assert.equal(g.turn, 2);
});

test('three decks: card identities and three Kings of Spades', () => {
  const g = layout({ players: 3, decks: 3, round: 4, hands: [['KS3'], ['KS'], ['KS2', 'AS']] });
  assert.ok(g.hands[0].includes('d3-KS') && g.hands[1].includes('d1-KS') && g.hands[2].includes('d2-KS'));
  assert.equal(trickPenalty(['d1-KS', 'd2-KS', 'd3-KS'], 4, false).points.total, 300);
});

test('kitty: face down until the first trick, then taken by its winner, public, scored but not a trick', () => {
  // 3 players, 1 deck: 17 each, 1 card kitty. Seat 1 leads the ace of clubs and wins; the kitty is the Queen of Hearts.
  let g = layout({ players: 3, round: 6, hands: [suit('S').slice(0, 13).concat(['2D', '3D', '4D', '5D']), ['AC'], []], kitty: ['QH'] });
  assert.deepEqual(g.kitty, ['d1-QH']);
  for (const s of [0, 1, 2]) {
    const v = viewFor(g, s);
    assert.deepEqual(v.kitty, { count: 1, to: null, cards: null });
    assert.ok(!JSON.stringify(v).includes('"d1-QH"'));
  }
  g = play(g, 'AC');
  g = act(g, { type: 'PLAY_CARD', seat: 2, card: legalCards(g, 2)[0] });
  g = act(g, { type: 'PLAY_CARD', seat: 0, card: legalCards(g, 0)[0] });
  assert.equal(g.kittyTo, 1);
  assert.deepEqual(g.tricks[0].kitty, ['d1-QH']);
  assert.deepEqual([g.tricks[0].penalty.tricks, g.tricks[0].penalty.hearts, g.tricks[0].penalty.queens], [1, 1, 1]);
  const v = viewFor(g, 0);
  assert.deepEqual(v.kitty, { count: 1, to: 1, cards: ['d1-QH'] });
  assert.deepEqual(v.last.kitty, ['d1-QH']);
  assert.ok(v.seats[1].captured.includes('d1-QH'));
  assert.equal(v.seats[1].tricks, 1);
  g = finishRound(g);
  assert.ok(g.tricks.slice(1).every(t => !t.kitty.length));
  assert.equal(g.history[5].breakdown.reduce((s, b) => s + b.tricks, 0), 17, 'the kitty is not a trick');
});

test('multiple decks: totals scale with hearts, queens and Kings of Spades', () => {
  assert.deepEqual(ROUNDS.map(r => expectedRound({ players: 8, decks: 2 }, r.n)), [130, 260, 200, 200, 100, 890]);
  const g = playGame(8, 2, 7);
  assert.deepEqual(g.history.map(h => h.breakdown.reduce((s, b) => s + b.points.total, 0)), [130, 260, 200, 200, 100, 890]);
  const h = playGame(5, 3, 11);
  assert.equal(h.history[3].breakdown.reduce((s, b) => s + b.kings, 0), 3);
  assert.equal(h.history[1].breakdown.reduce((s, b) => s + b.hearts, 0), 39);
});

test('expectedTotal matches a fully played random game for every table, checkState after every action', () => {
  for (let n = 2; n <= 8; n++) for (const d of [1, 2, 3]) {
    const g = playGame(n, d, n * 100 + d);
    assert.equal(g.totals.reduce((a, b) => a + b, 0), expectedTotal({ players: n, decks: d }), `${n} players, ${d} decks`);
    assert.equal(g.history.length, 6);
  }
});

// Dealer, rounds, rematch

test('dealer cut: highest rank deals, only tied seats cut again', () => {
  const g = { rng: 1 };
  // Cut from the end: seat 0 KS, seat 1 AS, seat 2 AH (tie on aces), then seat 1 2C, seat 2 3C.
  const r = cutForDealer(3, ids(['3C', '2C', 'AH', 'AS', 'KS']), g);
  assert.equal(r.dealer, 2);
  assert.deepEqual(r.cut, [
    [{ seat: 0, rank: 13, suit: 'S' }, { seat: 1, rank: 14, suit: 'S' }, { seat: 2, rank: 14, suit: 'H' }],
    [{ seat: 1, rank: 2, suit: 'C' }, { seat: 2, rank: 3, suit: 'C' }],
  ]);
  // Running out of cards reshuffles them back in rather than failing.
  const tie = cutForDealer(2, ids(['2C', 'AS', 'AH']), { rng: 3 });
  assert.ok([0, 1].includes(tie.dealer) && tie.cut.length >= 2);
});

test('a new game: the cut is kept, the highest cut leads and the seat before it deals, round 1', () => {
  for (let seed = 0; seed < 20; seed++) {
    const g = createGame({ players: P(5), decks: 1, seed });
    checkState(g);
    assert.equal(g.dealer, g.firstDealer);
    assert.equal(g.turn, (g.dealer + 1) % 5);
    assert.equal(g.round, 1);
    const top = Math.max(...g.cut.at(-1).map(c => c.rank));
    assert.deepEqual(g.cut.at(-1).filter(c => c.rank === top).map(c => c.seat), [g.turn], 'the highest cut goes first');
    assert.deepEqual(viewFor(g, 0).cut, g.cut);
  }
  assert.throws(() => createGame({ players: P(1), decks: 1, seed: 1 }));
  assert.throws(() => createGame({ players: P(9), decks: 1, seed: 1 }));
  assert.throws(() => createGame({ players: P(4), decks: 4, seed: 1 }));
  assert.throws(() => createGame({ players: [{ name: 'a' }, { name: 'b' }], decks: 1, seed: 1 }));
  assert.throws(() => createGame({ players: P(4), decks: 1, seed: 1, scoreDisplay: 'never' }));
});

test('next round: dealer moves clockwise, the same shoe is rebuilt and reshuffled, the next seat leads', () => {
  let g = createGame({ players: P(4), decks: 1, seed: 5 });
  const d0 = g.dealer, hands0 = g.hands;
  g = finishRound(g);
  assert.equal(g.phase, 'roundEnd');
  assert.equal(g.turn, null);
  assert.ok(viewFor(g, 0).last, 'the last trick stays for the results screen');
  g = act(g, { type: 'NEXT_ROUND' });
  assert.equal(g.round, 2);
  assert.equal(g.dealer, (d0 + 1) % 4);
  assert.equal(g.turn, (d0 + 2) % 4);
  assert.notDeepEqual(g.hands, hands0);
  assert.equal(new Set(g.hands.flat()).size, 52);
  assert.equal(viewFor(g, 0).last, null);
});

test('game end after round 6, then a rematch: same players, fresh deal, scores reset', () => {
  const over = playGame(4, 1, 77);
  assert.equal(over.phase, 'over');
  assert.equal(over.round, 6);
  assert.equal(over.history.length, 6);
  const r = act(over, { type: 'REMATCH', seed: 1234 });
  assert.deepEqual(r.players, over.players);
  assert.deepEqual([r.round, r.phase, r.history.length, r.decks, r.scoreDisplay], [1, 'play', 0, 1, 'live']);
  assert.deepEqual(r.totals, [0, 0, 0, 0]);
  assert.deepEqual(r, createGame({ players: P(4), decks: 1, seed: 1234 }));
  act(over, { type: 'REMATCH' });   // without a seed, one is drawn from the game's PRNG
});

test('determinism: the same seed and choices give the same game; another seed differs', () => {
  const a = playGame(6, 2, 99), b = playGame(6, 2, 99), c = playGame(6, 2, 100);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.history, c.history);
  assert.deepEqual(createGame({ players: P(3), decks: 1, seed: 8 }), createGame({ players: P(3), decks: 1, seed: 8 }));
});

test('state is plain JSON and small, even with 3 decks', () => {
  let max = 0;
  playGame(8, 3, 1, g => {
    const s = JSON.stringify(g);
    max = Math.max(max, s.length);
    assert.deepEqual(JSON.parse(s), g);
  });
  assert.ok(max < 20000, `largest state ${max} bytes`);
});

// Views

test('viewFor never leaks another hand or the kitty, and gives legal cards only on your turn', () => {
  for (const [n, d, mode] of [[3, 1, 'live'], [7, 2, 'roundEnd'], [5, 3, 'live']]) {
    playGame(n, d, n + d, g => {
      for (let s = 0; s < n; s++) {
        const v = viewFor(g, s), json = JSON.stringify(v);
        for (let o = 0; o < n; o++) if (o !== s) for (const c of g.hands[o]) assert.ok(!json.includes(`"${c}"`), `seat ${s} sees ${c} of seat ${o}`);
        if (g.kittyTo === null) for (const c of g.kitty) assert.ok(!json.includes(`"${c}"`), 'kitty leaked');
        assert.ok(!/rng|seed/.test(json));
        assert.deepEqual(v.you.hand, g.hands[s]);
        assert.deepEqual(v.you.legal, g.turn === s ? legalCards(g, s) : []);
        assert.deepEqual(v.seats.map(x => x.hand), g.hands.map(h => h.length));
      }
      const spectator = JSON.stringify(viewFor(g, null));
      assert.equal(viewFor(g, null).you, null);
      for (const c of g.hands.flat()) assert.ok(!spectator.includes(`"${c}"`));
    }, mode);
  }
});

test("scoreDisplay 'roundEnd' hides this round's penalties until the round ends", () => {
  let g = layout({ players: 4, scoreDisplay: 'roundEnd', round: 2 });
  for (let i = 0; i < 4; i++) g = act(g, { type: 'PLAY_CARD', seat: g.turn, card: legalCards(g, g.turn)[0] });
  let v = viewFor(g, 0);
  assert.equal(v.last.penalty, null);
  assert.ok(v.seats.every(x => Array.isArray(x.captured) && x.roundScore === null), 'captured cards stay public');
  assert.equal(v.seats.reduce((s, x) => s + x.tricks, 0), 1, 'trick counts stay public');
  assert.deepEqual(v.totals, g.totals);
  g = finishRound(g);
  v = viewFor(g, 0);
  assert.ok(v.last.penalty);
  assert.deepEqual(v.seats.map(x => x.roundScore), g.history[1].breakdown);
  const live = viewFor(layout({ players: 4 }), 1);
  assert.ok(live.seats.every(x => Array.isArray(x.captured) && x.roundScore.points.total === 0));
});

// Validation

test('checkState rejects broken states', () => {
  const g = play(spec(), '9H');
  const bad = f => { const c = structuredClone(g); f(c); assert.throws(() => checkState(c), /Invalid Canadian Salad state/); };
  bad(c => { c.hands[0][0] = c.hands[2][0]; });                   // duplicated card
  bad(c => { c.hands[0].pop(); });                                // missing card
  bad(c => { c.hands[0].push(c.kitty.pop() ?? c.hands[3].pop()); }); // unequal hands
  bad(c => { c.turn = 3; });                                      // wrong turn
  bad(c => { c.totals[0] = 10; });
  bad(c => { c.round = 7; });
  bad(c => { c.dealer = 2; });
  bad(c => { c.cut = []; });
  bad(c => { c.v = 2; });
  bad(c => { c.trick.plays[0].seat = 0; });
  bad(c => { c.history.push({ round: 1, dealer: 0, breakdown: [] }); });
  // A wrong winner or a wrong penalty on a completed trick.
  const t = play(play(play(g, 'KC'), 'JH'), 'AD');
  const badT = f => { const c = structuredClone(t); f(c); assert.throws(() => checkState(c)); };
  badT(c => { c.tricks[0].winner = 1; });
  badT(c => { c.tricks[0].penalty.points.total = 0; });
  badT(c => { c.tricks[0].plays.reverse(); });
  // Playing off-suit while holding the lead suit is caught.
  badT(c => { const i = c.hands[3].findIndex(x => !x.endsWith('H')); [c.hands[3][i], c.tricks[0].plays[2].card] = [c.tricks[0].plays[2].card, c.hands[3][i]]; });
  assert.throws(() => checkState(null));
  assert.throws(() => checkState({}));
});
