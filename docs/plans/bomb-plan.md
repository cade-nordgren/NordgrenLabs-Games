# Bomb: build plan

Written 2026-11-23, the night the owner asked for it ("Get as much of this project done as possible, designed, tested, and built to my website as possible. I authorise pushes to deploy to my website."). The owner's words are in `bomb-spec-owner-2026-11-23.md`; read that first. This file says how Part 1 and Part 2 of that spec fit together and how the work is split. Decisions marked **(my call)** were made without the owner, who was asleep; they are listed again at the end so the owner can reverse any of them.

## What Bomb is

A shedding card game ("our version of the traditional Palace-style shedding card game"). Digital cards only. Two ways to play, chosen on the setup screen:

- **This phone**: 2 to 6 players pass one phone around. Privacy handoff between players, Next Turn button, exactly as Part 1 describes.
- **Online**: 2 to 6 signed-in players, each on their own phone, sharing one table. One person creates a room and the others join with a short code or link.

Design mock-ups: private claude.ai design canvas `Has6pimM66aju5b5vyfczB` (cream glass look taken from Crossix; card backs in the player's colour; dark Play pill beside Pick up; blue Next Turn pill).

## Rules (Part 1, widened by Part 2)

Unchanged from Part 1: ranks 2 low to Ace high; play equal or higher; several cards of one rank at once; 2 resets (no clear, no extra turn); 10 bombs; four consecutive equal ranks on top of the pile bomb; a bomb removes the pile from the game and gives the bomber exactly one more turn; 7 and 8 are ordinary; refill the hand to five while the deck lasts; pick up the pile voluntarily or when stuck; hand, then face-up, then face-down phases; a failed blind card goes to the hand with the pile; first player with no cards at all wins and the game ends there.

Widened:

- **Players**: 2 to 6 **(my call on the upper limit)**. Turn order is seat order, starting from whoever won the draw. An ordinary play or a pickup passes to the next seat; a bomb keeps the turn.
- **Decks**: 1 to 4 standard 52-card decks shuffled together, chosen at setup. Every player needs 13 cards, so the setup screen only offers deck counts with `decks * 52 >= players * 13`. Default **(my call)**: 1 deck for 2 or 3 players, 2 decks for 4 to 6. Cards are unique objects (`id` includes the deck number), so two Queens of hearts can coexist.
- **Four of a kind with several decks**: still four consecutive equal ranks on top. Playing five or more of a rank at once is legal and bombs.
- **Who goes first**: draw cards, no dice anywhere. From a freshly shuffled shoe every player draws one card. Highest rank starts (Ace high, 2 lowest: a 2 and a 10 count as plain ranks here). Suits never break ties: the players tied for highest draw again, only those players, until one is highest. Then every card goes back, the shoe is reshuffled, and the deal happens.
- **Order of a game**: setup, draw for first, deal, choose four face-up cards, play, results.
- **Face-up choice**: on one phone, players choose in turn with a handoff between them. Online, everyone chooses at the same time and play starts when the last player confirms.
- **Next Turn online (my call)**: the Next Turn button exists so a shared phone can change hands privately. Online there is nothing to hide, and the owner asked for "light and fast so there is not a lot of waiting", so online turns pass by themselves the moment a play or pickup resolves. The engine keeps the pending-turn state either way; the server applies the advance itself.
- **Card styles**: each player picks a card-back style (at least ten: a colour plus a pattern). The style's colour is the player's colour everywhere. Two players in one game cannot hold the same style. Text or marks drawn on a player colour use whichever of dark or white ink has the better contrast, and every pairing must reach 4.5:1 (3:1 for large numerals) in both themes; reuse the approach Dots and Boxes uses.
- **Add players**: the setup screen uses Bank's roster (the "+" circle and the name boxes).

## Architecture

Static site, no build step, same as every game here (`docs/BUILD-GUIDE.md`).

```
site/bomb/
  index.html            page, styles
  engine/               pure rules, no DOM, runs in the browser, in node tests and inside the Worker
  ui/                   app, rendering, local saves, net.js (the only file that talks to the server)
  sw.js, manifest.webmanifest
tests/bomb/             node --test
server/rooms.js         online rooms (new), wired into server/worker.js
migrations/0002_rooms.sql
```

### Engine

A deterministic reducer, `reduce(state, action)`, that returns the same object for an illegal action. Randomness comes from a seeded generator kept in the state, so the same seed and actions always give the same game (the server seeds from `crypto.getRandomValues`). It also exports `viewFor(state, seat)`: the state one player may see (their own hand and table, everybody's face-up cards, counts for other hands, backs for face-down cards, the pile, the deck count, never the deck order or anyone else's hidden cards). The local UI and the server both render from `viewFor`, so one screen works for both modes and the browser never holds another player's cards online. `checkState(state)` asserts the invariants in Part 1 section 20 (every card in exactly one zone, and so on). The engine agent writes `docs/plans/bomb-engine-contract.md` with the exact shapes.

### Online rooms: existing Worker and D1, long polling

Same choice as the shelved `dots-online-plan.md` option A, and for the same reason: the owner's rule is free plan only and any new Cloudflare product is a stop-and-ask, so no Durable Objects. No new binding; `wrangler.jsonc` keeps only DB and ASSETS.

- `rooms` table: `id`, `code` (6 letters, unambiguous alphabet), `version`, `state` (JSON: lobby, seats, engine state), `last_action`, `updated_at`. A `room_members` table (`room_id`, `person_id`, `seat`) answers "is this person in this room" by key. Rooms idle for more than 24 hours are deleted opportunistically when a room is created.
- Every route sits under the existing bearer-token check and is keyed on the verified `nl_person_id`. To anyone not seated, a room does not exist (404).
- `POST /api/bomb/rooms` `{ name, style, decks }` creates a room; the creator is the host in seat 0.
- `POST /api/bomb/rooms/join` `{ code, name, style }` takes the next free seat while the room is in the lobby. Joining a room you are already in returns it (that is how reconnecting works). Full or already started: 409 with a `reason`. If the style is taken, the server gives the first free one.
- `GET /api/bomb/rooms/<id>?since=<version>` long poll: re-reads the row about every 700 ms for up to about 20 s and answers as soon as the version changes (`{ version, view }`), or `{ version }` unchanged at the end. If the 10 ms CPU limit gets close, shorten the hold.
- `POST /api/bomb/rooms/<id>/actions` `{ action, expect, actionId }`. The Worker checks the caller's seat, runs the engine, and writes with `UPDATE ... WHERE id = ? AND version = ?`. A stale `expect` gets 409 with the current `{ version, view }`. A repeated `actionId` is answered as success without applying twice. Lobby actions: `SET_PLAYER { name, style }`, `SET_DECKS` (host), `START` (host, two or more seated), `LEAVE`, and after a game `REMATCH` (starts when every seated player has voted). Game actions are the engine's, with the seat filled in by the server, never trusted from the phone.
- Every response carries `view`: `{ room: { code, phase, host, seats: [{ name, style, connected }] , decks }, game: viewFor(state, seat) | null, you: seat }`.
- A phone that disappears keeps its seat. Its turn is never skipped **(my call: no turn timer in this version)**.

The client keeps all of this inside `ui/net.js`, so a later move to WebSockets swaps one file.

### Screens

Setup (mode, roster with "+", card style per player, decks) · online lobby (code, share link, seats filling, host's Start) · draw for first · face-up choice · handoff (one phone only) · table · results. The table shows the active viewer at the bottom and every other player as a compact panel (name, colour, hand count, four table spots); with 3 to 5 opponents the panels shrink and scroll sideways rather than squeezing cards unreadably. Portrait and a real landscape layout. Light, dark and follow-system through the shared theme code. Reduced motion respected.

## Split of work

1. Engine and its tests, plus the engine contract.
2. In parallel after 1: (a) server rooms with tests; (b) the whole UI, local and online.
3. Integration: two browser profiles through `wrangler dev`, then checks in portrait, landscape, light and dark with measured contrast.
4. Ship the way Dots shipped: merge `bomb` to `main`, copy `site/bomb` and the server changes into `release/bank-only`, `npm run check` on a clean copy, apply the D1 migration, deploy, push.

## Decisions the owner can reverse

1. Up to 6 players; default decks 1 (2 to 3 players) or 2 (4 to 6).
2. Online turns pass automatically (no Next Turn press); the button stays for one-phone play.
3. Only the players tied for highest redraw in the first-player draw.
4. Online uses long polling in the existing Worker and D1, not a new Cloudflare product.
5. No turn timer and no kicking of absent players online.
6. The game ends when the first player is out; nobody plays on for second place.
