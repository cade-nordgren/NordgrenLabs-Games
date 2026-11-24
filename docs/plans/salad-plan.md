# Canadian Salad: build plan

Written 2026-11-23, the night the owner asked for it ("Get as much of this project done as possible, designed, tested, and built to my website as possible. I authorise pushes to deploy to my website. Also only use whole decks of cards"). The owner's words are in `salad-spec-owner-2026-11-23.md`; read that first. Decisions marked **(my call)** were made while the owner slept and are listed again at the end so any can be reversed.

Branch `salad`, worktree `C:/Projects/NordgrenLabs-Games-salad`, game folder `site/salad/`, storage keys `nl-salad-*`, cache `salad-vN`. Other agents work in this repo (a Bomb session is active on branch `bomb`): stage files by name, never `git add -A`, touch only Salad files plus the minimal shared lines named below.

## What it is

The traditional six-round trick-taking game (No Tricks, No Hearts, No Queens, No King of Spades, No Last Trick, Canadian Salad), lowest total wins. Online only: 2 to 8 people, each on their own device, one shared table, private hands held by the server. No bots, no pass-and-play mode (the spec does not ask for one).

## Rules decisions

- **Whole decks only (owner).** Section 6's card-removal table is void. The host picks 1, 2 or 3 complete 52-card decks. Nothing is ever removed.
- **Leftover cards (my call).** When `52 * decks` does not divide by the player count, every player gets `floor(52 * decks / players)` cards and the remainder is a face-down **kitty**. The winner of the first trick of the round takes the kitty: it is turned face up for everyone, and its hearts, queens and Kings of Spades score against that player in the rounds where those score. The kitty is not a trick (no 10 for it, never the last trick). This keeps every card of every deck in play, so totals stay exact, and it is the usual table convention for uneven deals.
- **Defaults (my call):** 1 deck for 2 to 5 players, 2 decks for 6 to 8. The lobby shows cards each, kitty size, tricks per round and a long-game warning above 26 cards each. Classic default is 4 players, 1 deck, 13 each.
- **Identical cards:** the last identical highest lead-suit card played wins the trick (owner's rule).
- **Scoring:** as the spec; every count derived from the cards actually in the round. Expected total per game = `10*T + 10*H + 25*Q + 100*K + 100` twice over (once across rounds 1 to 5, once in round 6), where T tricks per round, H hearts, Q queens, K kings of spades in the shoe. 4 players, 1 deck: 1,120.
- **Dealer:** a card cut at the start (tied players cut again; suits never break a tie). Owner ruling 2026-11-24: the highest cut goes first, leading the first trick, so the seat before it is the first dealer (before that the highest cut dealt). Dealer moves one seat clockwise each round; the player clockwise of the dealer leads.
- **Flow:** a play is applied the moment the server accepts it; no Next Turn. A finished trick is resolved by the server at once; phones animate it and anyone may tap to skip the animation. After a round the host presses Next Round. After round 6, final results; Rematch is a ready-up by every seated player.
- **Ties:** tied lowest scores are joint winners; equal scores share a rank.

## Things the spec asks for that the site's standing rules change

- **Sign-in stays (my call, following decision 0003).** The spec says no account; the owner's own standing decision is that the site serves nothing to signed-out visitors. Players sign in as on every other game, then pick a username and colour per room. The verified `nl_person_id` is the private seat credential, so the room code alone never reveals a hand. Opening the site to guests is the owner's decision to make, not mine.
- **No Durable Objects or WebSockets (my call, following decision 0002).** Free plan, no new Cloudflare product without asking; `server/config.test.js` fails on any binding beyond DB and ASSETS. Online uses the existing Worker and D1 with long polling, as planned for Bomb. All network code sits in `ui/net.js` so a later move to WebSockets swaps one file.
- **Custom card-back image stays on the player's own device (my call).** It is re-drawn through a canvas to a small JPEG (so SVG and scripts cannot survive), capped in size, saved locally, and never uploaded; other players are unaffected because every card design is a local choice. The host's table theme is the shared default; each player may override it locally.
- **No turn timer, no kicking.** A missing player keeps the seat; play waits (spec section 20). Rooms idle for 24 hours are deleted when another room is created.

## Architecture

Static site, no build step (`docs/BUILD-GUIDE.md`).

```
site/salad/
  index.html              page and styles
  engine/                 pure rules, no DOM: cards.js, reducer.js, score.js, view.js
  ui/                     app, screens, cards and themes, net.js (only file that talks to the server)
  sw.js, manifest.webmanifest
tests/salad/              node --test
server/salad.js           rooms API (new), one import and one route line in server/worker.js
migrations/0003_salad.sql (0002 is left for Bomb's rooms)
```

### Engine

`reduce(state, action)` returns the same object for an illegal action. Randomness from a seeded generator kept in state. `viewFor(state, seat)` returns only what that seat may see: own hand, hand counts for others, the current trick, captured-trick public data, scores (respecting the live or round-end score setting), never the deck or other hands. `checkState(state)` asserts the invariants in spec section 24. `legalCards(state, seat)` drives the UI's playable highlighting. The engine agent writes `docs/plans/salad-engine-contract.md` with exact shapes; server and UI are built to that file.

### Server: `/api/salad/*` in the existing Worker

Under the existing bearer-token check, keyed on the verified person id. To anyone not seated a room is 404.

- Tables `salad_rooms` (`id`, `code` 6 letters from an unambiguous alphabet, `version`, `state` JSON, `updated_at`) and `salad_members` (`room_id`, `person_id`, `seat`).
- `POST /api/salad/rooms` create (host, seat 0). `POST /api/salad/rooms/join` `{code,name,color}`: next free seat while in the lobby; rejoining returns your seat (this is reconnection); full or started is 409 with a reason; a taken colour is swapped for the first free one.
- `GET /api/salad/rooms/<id>?since=<version>` long poll: re-read the row about every 800 ms, at most about 20 reads (free plan allows 50 subrequests a request), answer as soon as the version moves.
- `POST /api/salad/rooms/<id>/actions` `{action, expect, actionId}`: seat checked, engine run, written with `UPDATE ... WHERE id=? AND version=?`; stale `expect` gets 409 with the current view; a repeated `actionId` succeeds without applying twice. Lobby actions: `SET_PLAYER`, `SET_READY`, `SET_CONFIG` (host: capacity, decks, table theme, score display), `START` (host), `LEAVE`; game: `PLAY_CARD`; between rounds `NEXT_ROUND` (host); after the game `REMATCH_READY`.
- Every answer carries `{version, view}` with `view = {room, game: viewFor(state, seat) | null, you}`. Last-seen time per seat gives the connected dot.

### Screens

Home (Create, Join, How to Play, Settings) · create and join forms (name, colour, table theme, decks) · lobby (code, copy link, copy code, native share, QR, seats, ready, config summary) · dealer cut · table (portrait and a real landscape layout; viewer at the bottom, others as compact panels that scale to 7 opponents) · round results with category breakdown and ticking numbers · final results replaying all six rounds in the Crossix style, lower is better · detailed scorecard · settings · How to Play with a short interactive follow-suit demo. Six card themes, card backs with colour and pattern options, seven table themes, light, dark and follow-system, reduced motion, optional sounds (off by default). A link `…/salad/?room=CODE` opens straight into joining that room.

## Split of work

1. Engine, tests, contract. In parallel: the design canvas (owner's "design first" rule).
2. After 1, in parallel: server rooms with tests; the whole UI.
3. Integration through `wrangler dev` with several browser profiles; portrait, landscape, light, dark; measured contrast.
4. Ship as Dots shipped: merge `salad` to `main`, copy into `release/bank-only`, `npm run check` on a clean copy, apply the D1 migration, deploy, push.

## Decisions the owner can reverse

1. Leftover cards form a kitty taken by the first trick's winner (the alternative is to offer only player counts that divide evenly: 2, 4 and 8, plus 3 and 6 with three decks).
2. Defaults of 1 deck up to 5 players and 2 decks from 6.
3. Sign-in is still required; no guest play.
4. Long polling on the existing Worker and D1; no Durable Objects.
5. Uploaded card-back images never leave the device.
6. No turn timer and no removing absent players.
7. No pass-and-play mode.
