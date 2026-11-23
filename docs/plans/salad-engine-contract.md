# Canadian Salad: engine contract

The interface between `site/salad/engine/` (rules) and everything built on it: the online rooms in the Worker (`server/salad.js`) and the UI (`site/salad/ui/`). Rules and decisions are in `salad-plan.md` (wins) and `salad-spec-owner-2026-11-23.md`; this file says exactly what the code accepts and returns. Build only from this file; if it and the code disagree, the code's tests (`tests/salad/engine.test.js`) are the truth and this file has a bug.

Plain ES modules, no DOM, no dependencies, no Node-only APIs, no top-level side effects. The same files load in the browser (`<script type="module">`), in `node --test`, and bundled into the Worker (they use only `structuredClone`, `Math`, `JSON`, arrays). Every state and view is plain JSON.

Tests: `node --test "tests/salad/*.test.js"` from the repo root.

## Files and exports

```js
import { SUITS, RANKS, MIN_PLAYERS, MAX_PLAYERS, MAX_DECKS, label, cardId, cardOf, rankOf, suitOf, shoe,
         isHeart, isQueen, isKingOfSpades, isPenaltyCard, validPlayers, validDecks, defaultDecks,
         rand, shuffle } from './engine/cards.js';
import { ROUNDS, CATEGORIES, POINTS, scores, breakdown, trickPenalty, sumBreakdowns,
         describeConfig, expectedRound, expectedTotal, standings } from './engine/score.js';
import { SCORE_DISPLAYS, PHASES, createGame, cutForDealer, trickWinner, legalCards,
         reduce, layout, checkState } from './engine/reducer.js';
import { viewFor } from './engine/view.js';
```

## Cards

A card is its **id string**, everywhere in state and views: `'d<deck>-<rank><suit>'`.

- `deck`: 1 to `decks` (1-based). `'d1-QH'` and `'d2-QH'` are two different physical Queens of Hearts.
- rank part: `2`..`10`, `J`, `Q`, `K`, `A`. Suit: `S`, `H`, `D`, `C`. Examples: `'d1-10S'`, `'d3-AH'`.
- `cardOf(id)` -> `{ id, deck, rank, suit }` (rank 2..14: 11 J, 12 Q, 13 K, 14 A) or `null` for anything that is not a valid id. `rankOf(id)`, `suitOf(id)` for valid ids. `label(rank)` -> `'2'`..`'10'`, `'J'`, `'Q'`, `'K'`, `'A'`. `cardId(rank, suit, deck)` builds an id.
- Ace is high, 2 is low. No jokers, no trumps. Hearts and diamonds are the red suits.
- `shoe(decks)`: every id of `decks` whole decks in a fixed order. Whole decks only: nothing is ever removed.
- `isPenaltyCard(id)`: a heart, a queen (any suit) or the King of Spades.

## Table configuration

Players 2 to 8 (`validPlayers`), decks 1, 2 or 3 (`validDecks`), every combination allowed. `defaultDecks(players)` is 1 for 2-5 players, 2 for 6-8 (the lobby's default; any 1-3 is legal).

`describeConfig(players, decks)` (players: a count or the players array; throws on an invalid table):

```js
{ cardsEach, kitty, tricks, hearts, queens, kingsOfSpades, long }
// cardsEach = floor(52*decks/players), kitty = 52*decks - players*cardsEach, tricks = cardsEach,
// hearts = 13*decks, queens = 4*decks, kingsOfSpades = decks, long = cardsEach > 26
```

Examples: 4 players 1 deck `{13, 0, 13, 13, 4, 1, false}`; 3/1 `{17, 1, ...}`; 7/2 `{14, 6, ...}`; 8/3 `{19, 4, ...}`; 2/2 is `long`.

`expectedTotal({ players, decks })`: total penalty points one whole game hands out across all players = `2 * (10*tricks + 10*hearts + 25*queens + 100*kingsOfSpades + 100)`. 4 players, 1 deck: 1,120. `expectedRound({ players, decks }, round)`: the same for one round (4/1: 130, 130, 100, 100, 100, 560).

## Scoring

`ROUNDS` (fixed order, index = round - 1):

| n | key | name | scores |
|---|---|---|---|
| 1 | `tricks` | No Tricks | 10 per trick won |
| 2 | `hearts` | No Hearts | 10 per heart captured |
| 3 | `queens` | No Queens | 25 per queen captured |
| 4 | `kings` | No King of Spades | 100 per King of Spades captured |
| 5 | `last` | No Last Trick | 100 for winning the last trick |
| 6 | `salad` | Canadian Salad | all five, stacked (the Queen of Hearts is a heart and a queen) |

`POINTS = { tricks: 10, hearts: 10, queens: 25, kings: 100, last: 100 }`, `CATEGORIES = ['tricks','hearts','queens','kings','last']`, `scores(round, cat)` -> whether that category scores in that round.

A **Breakdown** is used for one trick, for one player's round, and in the history:

```js
{ tricks, hearts, queens, kings, last,          // counts, ALWAYS counted whatever the round
  points: { tricks, hearts, queens, kings, last, total } }  // points; 0 for categories this round does not score
```

So in round 2 a player's breakdown still says how many tricks and queens they took; only `points.hearts` is non-zero. For the round results screen show the count of the round's own category (`ROUNDS[r-1].key`, or all five in round 6) and `points.total`.

- `trickPenalty(cards, round, isLast)`: breakdown of one captured trick (`tricks: 1`). `cards` is every card the winner takes with it.
- `sumBreakdowns(list, round)`: adds counts, recomputes points.
- `breakdown(counts, round)`: counts -> breakdown.

**The kitty** (`plan`: leftover cards): when `52*decks` does not divide by the player count, the `kitty` cards lie face down. The winner of the **first trick** of the round takes them: they become public and score against that player like captured cards (hearts, queens, Kings of Spades in the rounds where those score). The kitty is not a trick (no 10 for it, never the last trick). In the state it is folded into the first trick's `kitty` and `penalty`.

`standings(totals)` -> `{ rows: [{ seat, total, rank }], winners: [seat] }`: lowest total first; equal totals share a rank (1, 1, 3); rows with equal totals keep seat order; `winners` are every seat with rank 1 (joint winners, no tiebreaker).

## Creating a game

```js
createGame({ players: [{ name, color }], decks: 1 | 2 | 3, seed, scoreDisplay: 'live' | 'roundEnd' = 'live' })  // -> state
```

- `players`: 2 to 8 objects with string `name` and `color` (copied as `{ name, color }`, nothing else kept). Seat = index. Seats are clockwise in index order: the next seat clockwise of `s` is `(s + 1) % n`.
- Throws `Error` on bad players, decks or scoreDisplay. The engine does not check names or colours for content or uniqueness; the server does.
- `seed`: a 32-bit integer (`seed | 0`). The server draws it from `crypto.getRandomValues`. Same seed and same actions always give the same game.
- It does the **dealer cut** and the **first deal** at once; the returned state is already in phase `play`, round 1, waiting for the first lead. The cut is kept in `cut` for the UI to show before the table.
- Dealer cut: every seat cuts one card from a shuffled shoe of all the game's decks; the highest rank deals; suits never break ties; only the seats tied for highest cut again, as often as needed. Then every card goes back and the shoe is reshuffled for the deal.
- Deal: the whole shoe (`52*decks` cards) is shuffled; each seat gets `cardsEach`; the rest is the kitty. The seat clockwise of the dealer leads trick 1. Hands are **not** sorted; the UI sorts for display.

## State

Stored by the server as JSON. Never sent to phones. At most about 15 KB of JSON with 8 players and 3 decks (a test asserts under 20,000 bytes); most of it is the completed tricks of the current round.

```js
{
  v: 1,
  rng: int,                       // PRNG state (mulberry32). Secret.
  decks: 1 | 2 | 3,
  scoreDisplay: 'live' | 'roundEnd',
  players: [{ name, color }],     // index = seat
  phase: 'play' | 'roundEnd' | 'over',
  cut: [[{ seat, rank, suit }]],  // rows of the dealer cut in order: row 0 every seat, each later row only the seats
                                  // tied for highest in the row before; the last row has one highest = firstDealer.
                                  // Rank and suit only, no ids (those cards were shuffled back for the deal).
  firstDealer: seat,              // winner of the cut, dealer of round 1
  round: 1..6,
  dealer: seat,                   // (firstDealer + round - 1) % players
  turn: seat | null,              // whose turn it is; null in 'roundEnd' and 'over'
  hands: [[id]],                  // per seat; empty arrays once the round is over. SECRET.
  kitty: [id],                    // describeConfig(...).kitty cards (often 0). SECRET until kittyTo is set
  kittyTo: seat | null,           // who took the kitty (winner of trick 1); null before trick 1 completes or when the kitty is empty
  trick: null | {                 // the trick being played; null in 'roundEnd' and 'over'
    n: int,                       // 1-based trick number in this round
    leader: seat,
    plays: [{ seat, card }],      // in play order; plays[0].card sets the lead suit; never all seats (a full trick resolves at once)
  },
  tricks: [Trick],                // completed tricks of the CURRENT round, in order; reset at NEXT_ROUND
  history: [{                     // one entry per finished round, in order
    round: 1..6,
    dealer: seat,
    breakdown: [Breakdown],       // per seat, that round's counts and points
  }],
  totals: [int],                  // per seat, cumulative points of finished rounds (sum of history). The current round
                                  // is added only when it ends.
}
```

`Trick` (completed):

```js
{ n, leader, plays: [{ seat, card }],   // exactly one play per seat, clockwise from leader
  winner: seat,                          // highest card of the lead suit; among identical highest cards the LAST played wins
  kitty: [id],                           // the kitty cards the winner took with this trick: trick 1 only, else []
  penalty: Breakdown }                   // what this trick (plus its kitty) cost the winner in this round
```

The last completed trick is always `tricks.at(-1)`: it stays through `roundEnd` and `over` and is cleared by `NEXT_ROUND`.

## Phases

1. **`play`**: `turn` plays a card. After the last seat of a trick plays, the trick resolves in the same action: it is appended to `tricks`, the kitty goes to its winner if it is trick 1, and the winner gets `turn` and leads trick `n + 1`. No Next Turn, no confirmations.
2. **`roundEnd`**: set by the action that completes the round's last trick (trick number `cardsEach`) in rounds 1-5. The round's breakdowns are pushed to `history` and added to `totals`. Hands are empty, `trick` and `turn` are null. Only `NEXT_ROUND` is legal.
3. **`over`**: the same, after round 6. Only `REMATCH` is legal. Final results: `standings(totals)` (also in the view).

## Actions

`reduce(state, action)` returns a **new** state, or the **same object** when the action is illegal now (wrong phase, not your turn, card not legal, bad or missing fields, unknown type). It never throws on a bad action and never mutates its input. Test legality with `reduce(s, a) !== s`.

| Action | Legal when | Effect |
|---|---|---|
| `{ type: 'PLAY_CARD', seat, card }` | phase `play`, `seat === turn`, `card` is in `legalCards(state, seat)` | card leaves the hand into `trick.plays`; turn passes clockwise, or the trick resolves (above), possibly ending the round or the game |
| `{ type: 'NEXT_ROUND' }` | phase `roundEnd` | `round + 1`; dealer moves one seat clockwise; the same shoe is rebuilt and reshuffled and dealt; the seat clockwise of the new dealer leads; `tricks` and `kittyTo` reset |
| `{ type: 'REMATCH', seed? }` | phase `over`; `seed` absent or an integer | a brand new game: `createGame` with the same players, decks and scoreDisplay and the fresh seed (a new cut, round 1, totals 0, history empty). Without `seed`, one is drawn from the old game's PRNG; the server should pass one from `crypto` |

`legalCards(state, seat)`: the ids `seat` may play now. `[]` unless phase `play` and `seat === turn`. The leader may play anything (hearts may be led at any time). A follower must play a card of the lead suit when they hold one; when void, anything.

The engine knows nothing about hosts, rooms, readiness or connections. The server decides **who** may send `NEXT_ROUND` (the host) and when to `REMATCH` (every seated player ready), and always sets `seat` from the caller's verified seat, never from the body.

## Views

`viewFor(state, seat)` returns what one seat may see; `viewFor(state, null)` (or any non-seat) is a spectator view with `you: null`. The result is a fresh JSON object (mutating it does not touch the state).

```js
{
  v, phase, round, decks, scoreDisplay, players, cut, firstDealer, dealer, turn,   // as in the state
  roundName: 'No Tricks' | ...,           // ROUNDS[round - 1].name
  config: describeConfig(players, decks), // cardsEach, kitty, tricks, ...
  trick: null | { n, leader, plays: [{ seat, card }], leadSuit: 'S'|'H'|'D'|'C'|null },  // leadSuit null before the lead
  tricksPlayed: int,                      // completed tricks this round
  last: null | Trick,                     // the last completed trick (as in the state), for the trick animation and the
                                          // results screen. last.penalty is null while this round's penalties are hidden.
  kitty: { count: int, to: seat | null, cards: [id] | null },   // cards only once taken (to !== null)
  seats: [{                               // per seat, public
    hand: int,                            // cards in hand (the viewer's own too; their cards are in you.hand)
    tricks: int,                          // tricks won this round
    captured: [id] | null,                // penalty cards (hearts, queens, Kings of Spades) won this round, kitty included
    roundScore: Breakdown | null,         // this round so far (equals history.at(-1).breakdown[s] once the round is over)
  }],
  totals: [int],                          // finished rounds only
  history,                                // as in the state: every finished round's breakdowns
  standings: { rows: [{ seat, total, rank }], winners: [seat] },   // standings(totals), every phase
  you: null | {
    seat,
    hand: [id],                           // unsorted
    legal: [id],                          // legalCards(state, seat): [] when it is not your turn
  },
}
```

**Hidden scores**: with `scoreDisplay: 'roundEnd'`, while phase is `play`, every seat's `captured` and `roundScore` and `last.penalty` are `null` for everyone. Trick counts (`seats[].tricks`), the cards in `trick` and `last.plays`, and a taken kitty stay public (they were played or turned face up in front of everyone). `totals` and `history` only ever hold finished rounds, so they are always shown. Once the round ends everything is visible. With `'live'` nothing is hidden.

**Never in a view**: `rng`, the seed, the shuffled order, another seat's hand cards, the kitty's cards before trick 1 completes. The tests check every reachable state of whole games: no other seat's hand id and no untaken kitty id appears anywhere in `JSON.stringify(view)`.

What the UI derives itself: "your turn" = `phase === 'play' && turn === you.seat`; which cards to highlight = `you.legal`; the leader of the current trick = `trick.leader`; the round results = `history.at(-1)` with `totals` (previous total = total minus `history.at(-1).breakdown[s].points.total`); the current rank = `standings`; "live" running total = `totals[s] + seats[s].roundScore.points.total`; final results = `history` (six rounds) and `standings` when `phase === 'over'`.

### Animating a trick the server has already resolved

A play that completes a trick comes back with `trick` already reset to the next trick (or null at round end), so the UI never sees a full `trick`. Detect it from the view: when `tricksPlayed` grew (or `phase` left `play`) since the last view, the new trick is `last` (`last.n`, `last.plays` in order, `last.winner`, `last.kitty`, `last.penalty`). Animate the plays you have not shown yet from `last.plays`, highlight the winner's card, show the penalty and kitty, then gather. The state has already moved on; skipping the animation loses nothing and no input depends on it. A late phone that missed several tricks only has the last one; jump straight to the current state. Key animations on `(round, last.n)` so the same trick is never animated twice.

## Validation

`checkState(state)` throws `Error('Invalid Canadian Salad state: ...')` when anything is wrong and returns nothing otherwise. Run it on every state read from storage (the D1 row is a trust boundary). It checks the spec section 24 invariants:

- shape: version 1, 2-8 players with string name and colour, decks 1-3, known scoreDisplay and phase, integer `rng`, round 1-6; `dealer === (firstDealer + round - 1) % n`; phase `over` exactly when round 6 is finished;
- the cut: rows follow the recut rule and the last row's single highest seat is `firstDealer`;
- every one of the `52*decks` cards exactly once across hands, kitty, the current trick and the completed tricks (no card duplicated, none missing, one location each);
- the kitty has the configured size; `kittyTo` is trick 1's winner exactly when trick 1 is complete and the kitty is not empty;
- every completed trick: numbered in order, led by the previous winner (trick 1 by the seat after the dealer), exactly one play per seat clockwise, the right winner (last identical highest lead-suit card), `kitty` and `penalty` exactly as recomputed;
- the current trick: number, leader, clockwise plays, fewer than all seats, `turn` = the next seat to play; in `roundEnd`/`over` all `cardsEach` tricks done and no trick or turn;
- equal hands: each hand holds `cardsEach` minus the cards that seat has played this round;
- follow suit: nobody who played off-suit in any trick of this round still holds that trick's lead suit;
- history: one entry per finished round with the right dealer; each breakdown's points match its counts; each round's counts add up to `tricks, hearts, queens, kingsOfSpades, 1` and its points to `expectedRound`; the round just finished matches its tricks; `totals` is the sum of the history; a finished game totals `expectedTotal`.

## Test and scenario helpers

- `layout({ players, decks = 1, round = 1, dealer = 0, hands = [], kitty = [], scoreDisplay = 'live' })`: a valid state at trick 1 of `round`, nobody has played. `players`: a count (named `P1`..) or a players array. `hands[s]` and `kitty` take codes: `'QH'` = `d1-QH`, `'QH2'` = `d2-QH`, or full ids. Unplaced cards fill the hands (seat order) and then the kitty in `shoe` order. Earlier rounds get a stand-in history where seat 0 took every penalty. Throws on an unknown or repeated code. Passes `checkState`. For tests, the design canvas and prepared UI screens.
- `cutForDealer(players, cards, g)`: the cut on its own, cards cut from the end of `cards`, `g` holds `rng` for a reshuffle when the shoe runs out. Returns `{ dealer, cut }`.
- `trickWinner(plays)`: the winning seat of a full or partial list of plays.

## Usage: server owns the state

```js
import { createGame, reduce, checkState } from '../site/salad/engine/reducer.js';
import { viewFor } from '../site/salad/engine/view.js';

// START (host, lobby full enough): seed from crypto, never from a client.
const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
let game = createGame({ players: seats.map(s => ({ name: s.name, color: s.color })), decks, seed, scoreDisplay });

// An action from the caller in seat `seat` (verified from the session, not the body):
checkState(game);                                     // the row came from D1
const a = body.action;
let action;
if (a.type === 'PLAY_CARD') action = { type: 'PLAY_CARD', seat, card: a.card };
else if (a.type === 'NEXT_ROUND' && seat === hostSeat) action = { type: 'NEXT_ROUND' };
else return json(409, { reason: 'illegal', version, view: viewFor(game, seat) });
const next = reduce(game, action);
if (next === game) return json(409, { reason: 'illegal', version, view: viewFor(game, seat) });
save(next);                                           // UPDATE ... WHERE id = ? AND version = ?

// Rematch once every seat is ready:
game = reduce(game, { type: 'REMATCH', seed: crypto.getRandomValues(new Uint32Array(1))[0] | 0 });

// Each player only ever gets their own view:
return json(200, { version, view: { room, game: viewFor(next, seat), you } });
```

Lobby actions (`SET_PLAYER`, `SET_READY`, `SET_CONFIG`, `START`, `LEAVE`, `REMATCH_READY`) are the server's; the engine sees only the finished player list at `START` and `REMATCH`. Names and colours inside a running game are fixed (the engine has no rename action).
