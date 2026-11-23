# Bomb: engine contract

The interface between `site/bomb/engine/` (rules) and everything built on it: the one-phone UI (`site/bomb/ui/`) and the online rooms in the Worker (`server/rooms.js`). Rules are in `bomb-spec-owner-2026-11-23.md` and `bomb-plan.md`; this file says exactly what the code accepts and returns.

Plain ES modules, no DOM, no dependencies, no node-only APIs, no top-level side effects. The same files load in the browser (`<script type="module">`), in `node --test`, and bundled into the Worker. Every state and view is plain JSON.

Tests: `node --test "tests/bomb/*.test.js"` from the repo root.

## Files and exports

```js
import { SUITS, RANKS, MIN_PLAYERS, MAX_PLAYERS, MAX_DECKS, label, card, fullDeck,
         allowedDecks, defaultDecks, required, canPlay, legalRanks, streak, shuffle } from './engine/cards.js';
import { HAND, TABLE, DEAL, FIRST_ORDER, createGame, pickFirst, layout, source, playable, canPickUp, mustPickUp,
         reduce, checkState } from './engine/reducer.js';
import { viewFor } from './engine/view.js';
```

## Cards

```js
{ id: 'QH1', rank: 12, suit: 'H', deck: 1 }
```

- `rank`: 2 to 14 (11 J, 12 Q, 13 K, 14 A). Ace is high, 2 is lowest.
- `suit`: `'S' | 'H' | 'D' | 'C'` (hearts and diamonds are the red ones).
- `deck`: 0 to `decks - 1`. Two Queens of hearts from different decks are different cards.
- `id`: `label(rank) + suit + deck`, e.g. `'10S0'`, `'AH2'`. Unique within a game. `label(rank)` gives `'2'`..`'10'`, `'J'`, `'Q'`, `'K'`, `'A'`.
- Cards are never mutated. There are no jokers.

## Helpers (pure)

| Function | Returns |
|---|---|
| `allowedDecks(players)` | deck counts in 1..4 with `decks * 52 >= players * 13`; `[]` unless players is an integer 2..6. 2-4 players: `[1,2,3,4]`; 5-6: `[2,3,4]`. |
| `defaultDecks(players)` | 1 for 2-3 players, 2 for 4-6. |
| `required(pile)` | the rank the next play must equal or beat, or `null` when anything goes (empty pile, or a 2 on top). |
| `canPlay(rank, pile)` | true for 2, 10, anything when `required` is null, else `rank >= required`. |
| `legalRanks(pile)` | the ranks in `RANKS` that `canPlay`. |
| `streak(pile)` | how many cards of the top card's rank sit consecutively on top; 0 for an empty pile. Four or more bomb. |
| `source(player)` | `'hand' \| 'up' \| 'down' \| null`: where this player plays from now (hand first, then face-up, then face-down). |
| `playable(state, seat)` | ids the seat may play right now (hand or face-up); `[]` when it is not their turn, a Next Turn is pending, or they are on face-down cards. |
| `canPickUp(state, seat)` | their turn, nothing pending, pile not empty. |
| `mustPickUp(state, seat)` | `canPickUp` and on hand or face-up with nothing playable. Never true on face-down (a blind card is always allowed). |

Constants: `HAND = 5` (refill target), `TABLE = 4` (face-up and face-down slots), `DEAL = 9` (cards to choose face-up from).

## Creating a game

```js
createGame({ players, decks = defaultDecks(players), seed }) // -> state, phase 'choose'
```

- `players`: 2 to 6. `decks`: one of `allowedDecks(players)`. Anything else throws an `Error`.
- `seed`: a 32-bit integer (`seed | 0` is used). The server should draw it from `crypto.getRandomValues`; the local UI can use `Math.random() * 2 ** 32 | 0`. Same seed and same actions always give the same game.
- It shuffles the shoe and gives each player 4 face-down cards and 9 to choose from. Play has no randomness after this, except the rare full tie for first player below.
- Who goes first is decided when the last seat confirms (see `pickFirst`).

Names, colours and card styles are not in the engine. Keep them beside the state (local save, room lobby) indexed by seat.

`layout({ decks = 1, players, pile = [], deck = [], turn = 0 })` builds a play-phase state from card codes, for tests and prepared screens (like `tools/keep-scenario.js` does for Dusk Keep). Codes are `'QH'` (deck 0), `'QH1'` (deck 1), `'10S'`. `players: [{ hand, up, down }]`; `up` and `down` are padded with empty slots to 4 (`null` is an empty slot). `deck[0]` is drawn first; the pile's last card is on top. Every card not placed goes to `removed`. It throws on an unknown or repeated code but does not check the rules: run `checkState` on the result if it must be a reachable position.

`pickFirst(players, g)` returns `{ first, firstWhy }` from the players' hands: compare how many cards of each rank they hold in `FIRST_ORDER` (`[3, 4, ..., 14, 2]`): the most 3s wins; only the seats tied on that count go on to 4s, and so on. If seats are identical on every rank, one of them is picked with the seeded generator in `g.rng` (which it advances). `firstWhy` is `{ rank, count, tied }`: the rank that decided it, how many of it the starter held, and whether the seats still in it had matched on a lower rank they held; `rank: null` (count 0, tied true) means the random pick. Exported so tests can feed it rigged hands.

## State

```js
{
  v: 1,
  rng: int,                 // PRNG state (mulberry32). Never shown to players.
  decks: 1..4,
  phase: 'choose' | 'play' | 'over',
  first: seat,              // 0 while choosing; then who goes first (decided at the last confirm)
  firstWhy: null | { rank: rank | null, count: int, tied: bool },   // why first starts (see pickFirst); null while choosing
  turn: seat,               // whose turn it is; while pending, the player who just moved; when over, the winner
  pending: null | { next: seat },    // set after a play or pickup that passes the turn, until Next Turn; never after a 2 or a bomb
  winner: null | seat,
  turns: int,               // plays + pickups resolved (a failed face-down card counts once)
  deck: [card],             // deck[0] is drawn next
  pile: [card],             // bottom to top; never holds a 10 or four-of-a-kind on top (those bomb at once)
  removed: [card],          // bombed cards, out of the game
  players: [{
    hand: [card],
    up: [card | null],      // 'choose': [] until arranged, then 4 cards. 'play'/'over': 4 slots, null once played
    down: [card | null],    // always 4 slots, null once played (a failed blind card leaves its slot empty)
    ready: bool,            // confirmed the face-up choice
    bombs: int,             // bombs this player triggered (10s and four-of-a-kinds, face-down included)
    pickups: int,           // piles picked up (voluntary, forced, or after a failed blind card)
  }],
  last: null | LastMove,    // the most recent play or pickup, for animation and the table's status line
}
```

`LastMove` is one of:

```js
{ seat, type: 'play', from: 'hand' | 'up' | 'down', cards: [card], bomb: bool, drew: int } // drew: cards taken from the deck after
{ seat, type: 'pickUp', count: int }
{ seat, type: 'failed', card: { rank, suit }, count: int }   // blind card too low: it and the pile (count includes it) went to the hand
```

`last` survives Next Turn, so the next player can see what just happened.

Older saves (before 2026-11-23's Part 3) may carry a `draws` list and no `firstWhy`, and a `pending` whose `next` equals `turn` (the old bomb). `checkState` accepts them, `viewFor` gives `firstWhy: null`, and `next` resolves the old pending as before.

## Phases

1. **`choose`**: every player picks 4 of their 9 cards to lie face up, in any order and in any seat order. `arrange` may be repeated (to change the cards or move them between the four positions) until that seat sends `confirm`. When the last seat confirms, `first` and `firstWhy` are set by `pickFirst` from the five-card hands, phase becomes `play` and `turn = first`.
2. **`play`**: the player on `turn` plays or picks up. If that passes the turn, `pending` is set and nothing but `next` is legal; `next` moves `turn` to `pending.next`. After a 2 or a bomb nothing is pending: the same seat simply moves again.
3. **`over`**: set the moment a player's last card resolves (including by a bomb). `winner` is that seat, `pending` stays null, no Next Turn is needed and no action is legal. The game ends there: nobody plays on for second place.

## Actions

`reduce(state, action)` returns a **new** state, or the **same object** when the action is illegal now (wrong phase, not your turn, pending Next Turn, bad ids, unknown type, missing fields). It never throws on bad actions and never mutates its input. Test legality with `reduce(s, a) !== s`.

Every action except `next` carries `seat`. Online, the server sets `seat` from the caller's verified seat and never trusts one from the phone. On one phone, the UI sends `seat: state.turn` (or the seat whose face-up choice is on screen).

| Action | Legal when | Effect |
|---|---|---|
| `{ type: 'arrange', seat, ids: [a, b, c, d] }` | `choose`, seat not ready; 4 distinct ids from that seat's hand + current face-up cards | face-up becomes exactly those cards in that order (position 0..3); the other 5 are the hand |
| `{ type: 'confirm', seat }` | `choose`, seat not ready, seat has arranged 4 | `ready = true`; when all are ready, `pickFirst`, phase `play`, `turn = first` |
| `{ type: 'play', seat, ids: [...] }` | seat's turn, nothing pending, source is hand or face-up, 1+ distinct ids all from that zone, all one rank, `canPlay(rank, pile)` | cards to the pile; bomb if a 10 or `streak >= 4` (pile goes to `removed`, `bombs++`); refill hand to 5 from the deck; then win, or after a 2 or a bomb nothing pending (same seat again), else `pending = { next: seat + 1 (wrapping) }` |
| `{ type: 'playDown', seat, slot }` | seat's turn, nothing pending, source is face-down, `down[slot]` present | the card is revealed and leaves its slot. If `canPlay`: exactly as `play`. Otherwise it goes on the pile and the whole pile goes to the hand (`pickups++`, `last.type = 'failed'`), pending next seat |
| `{ type: 'pickUp', seat }` | seat's turn, nothing pending, pile not empty | whole pile to the end of the hand, no refill, `pickups++`, pending next seat. Allowed at any time it is legal (also on face-down cards), forced only in the sense that nothing else is legal when `mustPickUp` |
| `{ type: 'next' }` | `pending` set | `turn = pending.next`, `pending = null` |

Mixing hand and face-up cards in one play is not allowed. Face-up cards are only playable once the hand is empty (which also means the deck is empty), face-down cards only once the face-up slots are all empty. Picking up while on face-up or face-down cards puts the player back on their hand; their table cards stay where they are.

## Views

`viewFor(state, seat)` returns what one seat may see; `viewFor(state, null)` (or any non-seat) is the spectator view for the one-phone handoff screen and holds no private cards at all. The result is a fresh JSON-safe object (mutating it does not touch the state).

```js
{
  v, phase, decks, first, firstWhy, turn, pending, winner, turns,   // as in the state (firstWhy null when missing)
  deck: int,               // cards left in the deck (never the order)
  removed: int,            // cards bombed out
  pile: [card],            // public, bottom to top
  required: rank | null,   // rank to equal or beat; null = anything
  streak: int,             // equal ranks on top of the pile (0 when empty)
  last,                    // as in the state (its ids are only ever public cards)
  players: [{
    hand: int,             // count only, the viewer's own included (their cards are in you.hand)
    up: [card | null] | null,   // null = hidden: other seats' choices during 'choose'. Your own is always shown.
    down: [bool],          // 4 slots, true = a card is there. Never rank or suit, the viewer's own included.
    left: int,             // hand + face-up + face-down: the results screen's "cards left"
    ready, bombs, pickups,
  }],
  you: null | {            // null for the spectator view
    seat,
    hand: [card],          // during 'choose': the 9 minus whatever is arranged face up
    source: 'hand' | 'up' | 'down' | null,   // null outside 'play'
    playable: [id],        // ids you may play now (hand or face-up); [] when not your turn
    blind: [slot],         // face-down slots you may turn now; [] unless it is your turn on face-down cards
    canPickUp: bool,
    mustPickUp: bool,      // nothing playable: Pick Up is the only move
    canArrange: bool,      // 'choose' and not yet confirmed
  },
}
```

Never in a view: `rng`, the seed, the deck order, any face-down card, another seat's hand cards, another seat's face-up choice before play starts. The tests assert that no such card id appears anywhere in `JSON.stringify(view)`.

What the UI derives itself: whether a selection is playable (all selected ids in `you.playable` and one rank); "your turn" (`phase === 'play' && turn === you.seat && !pending`); whether Next Turn is enabled (`pending !== null`); whether the handoff screen is needed on Next Turn (`pending.next !== turn`, false only for an older save's bomb); who goes first and why (`first`, `firstWhy`); the results (`winner`, `players[i].left`, `bombs`, `pickups`, `turns`).

## Validation

`checkState(state)` throws `Error('Invalid Bomb state: ...')` when anything is wrong and returns nothing otherwise. Run it on every stored or received state before using it (local resume, a row read from D1). It checks:

- shape: version 1, 2-6 players, an allowed deck count, known phase, integer counters and seats;
- every one of the `decks * 52` cards is present exactly once across deck, pile, removed, hands, face-up and face-down, each with the right rank, suit and deck for its id;
- `choose`: nothing played yet, deck is `decks * 52 - 13 * players`, every hand + face-up is 9 with 0 or 4 face-up, not everyone ready;
- `play` / `over`: everyone ready with 4 face-up slots; no face-up or face-down card gone while the deck has cards; no face-down card gone while face-up cards remain; every hand at least 5 while the deck has cards; the pile is a legal sequence with no 10 and no four-of-a-kind on top;
- `play`: no winner and nobody without cards; `pending` is null or `{ next: seat }` (a same-seat `next` from older saves included);
- `over`: exactly one player, the winner, has no cards; deck empty; nothing pending;
- `firstWhy` is missing, null, or (outside `choose`) `{ rank, count, tied }` with a real rank or null; `last` has a valid shape. An older save's `draws` is ignored.

## Usage: one phone (local)

```js
import { createGame, reduce, checkState } from './engine/reducer.js';
import { viewFor } from './engine/view.js';

let game = createGame({ players: 3, decks: 1, seed: Math.random() * 2 ** 32 | 0 });
let ready = false;               // UI state: has the person holding the phone pressed Ready to Play?

function render() {
  const seat = game.phase === 'choose' ? choosingSeat() : game.turn;   // choosingSeat: the first seat not ready, from first in turn order
  const view = viewFor(game, ready ? seat : null);                     // handoff screen: no private cards
  draw(view);
  localStorage.setItem('nl-bomb-v1', JSON.stringify({ game, names, styles }));
}

function send(action) {
  const next = reduce(game, action);
  if (next === game) return;                     // illegal: ignore (the buttons should not have offered it)
  // Hide the hand when the phone must change hands: on Next Turn to another seat, or a confirmed face-up choice.
  // A 2 or a bomb sets no pending, so the same player just carries on.
  if (action.type === 'next' && game.pending.next !== game.turn) ready = false;
  if (action.type === 'confirm') ready = false;
  game = next;
  render();
}

send({ type: 'play', seat: game.turn, ids: selectedIds });
send({ type: 'next' });

// Resume: never trust the stored copy, and start on the handoff screen.
const saved = JSON.parse(localStorage.getItem('nl-bomb-v1'));
checkState(saved.game);          // throws on a bad save: offer a new game instead
game = saved.game; ready = false;
```

## Usage: server owns the state (online)

```js
import { createGame, reduce, checkState } from '../site/bomb/engine/reducer.js';
import { viewFor } from '../site/bomb/engine/view.js';

// Start: seed from the platform's crypto, never from the client.
const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
let game = createGame({ players: seats.length, decks, seed });

// Action from the caller in seat `seat` (verified from the session, not the body):
checkState(game);                                   // the row came from D1: a trust boundary
const { type, ids, slot } = body.action;
let next = reduce(game, { type, ids, slot, seat }); // seat overwritten by the server
if (next === game) return json(409, { reason: 'illegal', version, view: viewFor(game, seat) });
// Online turns pass by themselves: apply Next Turn at once (a 2 or a bomb sets none: the same seat moves again).
if (next.pending) next = reduce(next, { type: 'next' });
save(next);                                         // UPDATE ... WHERE version = ?

// Each player gets only their own view:
return json(200, { version, view: viewFor(next, seat) });
```

Phones never receive the state, only `viewFor(state, theirSeat)`. Do not send `type: 'next'` from phones online; the server applies it. The face-up choice is simultaneous online: accept `arrange` and `confirm` from any seat during `choose`.
