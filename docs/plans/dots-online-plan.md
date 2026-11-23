# Dots and Boxes online: plan for approval

Status: shelved, 2026-11-23. The owner said: "Let's not make online rooms for now. Local only". Kept for reference only; do not build without a new go-ahead.

## What has to be true (spec section 13, plus the move-until-Next-turn ruling)

- One player creates a private room, the other joins with an invite. Exactly two seats, and no third player.
- Both phones show the same board, lines, boxes, letters and dice. The server rolls the digital dice, never the phones.
- Only the active player can draw or press Next turn, and the server checks every action with the same rules as local play.
- Until Next turn is pressed, the mover may move their line (owner ruling). The other phone sees the line move.
- Concurrent taps, repeated requests, stale phones and refreshes are safe. A dropped player reconnects to the exact state, including a pending Next turn. Their turn is never skipped.
- Both reach the same results, and a rematch starts only when both agree.
- Free plan only. A new Cloudflare product is a stop-and-ask.

## What exists today

- The Worker (`server/worker.js`) gates every page behind a Clerk session, and its `/api` takes a bearer token verified offline in `server/seam.js`. Each person is known by `nl_person_id`.
- D1 has one table, `saves` (`migrations/0001_saves.sql`). There are no rooms, invites or live updates.
- The engine (`site/dots/engine/reducer.js`) is a pure reducer: `reduce(state, action)` returns the same object when an action is illegal, and `checkState` validates a stored state. The Worker can import this exact file, since wrangler bundles it. Local and online play would then share one rule set, as the spec asks.

## Two ways to do it

### A. Rooms in the existing Worker and D1, with long polling (recommended)

- **Storage:** a new `rooms` table in the same D1 database. The room row holds the whole game state as JSON, plus a `version` number.
- **Actions:** a phone sends `POST /api/rooms/<id>/actions` with `{ action, expect: <version>, actionId }`.
  - The Worker loads the room, checks the caller holds the active seat, runs `reduce`, and writes the new state in one statement: `UPDATE rooms SET state = ?, version = version + 1 WHERE id = ? AND version = ?`.
  - If the version moved on, the write does nothing and the Worker answers 409 with the current state. The phone redraws from that.
  - Two quick taps can never both apply, and a stale phone can never overwrite a newer state.
- **Waiting phone:** sends `GET /api/rooms/<id>?since=<version>`. The Worker re-reads the row (by primary key, one row) about every 700 ms, for up to about 20 s, and answers as soon as the version changes. Then the phone asks again.
  - Moves show in under a second.
  - An idle game costs about 3 requests a minute per waiting phone, instead of 60 with plain 1-second polling.
- **Fits today's setup:** no new Cloudflare product, no new binding, the same gate and token, the same tests harness (`getPlatformProxy()` with a local D1).

### B. Durable Objects with WebSockets

- **How it works:** one Durable Object per room holds the state and pushes each change to both phones at once. It's truly real-time, with no polling, and it handles disconnects naturally.
- **Cost:** it's a new Cloudflare product, and needs a new binding and a migration of a different kind. It's on the free plan (SQLite-backed objects only: 100,000 requests a day including WebSocket messages, 13,000 GB-s a day), but your rule makes it a stop-and-ask.
- **Tests:** it also changes how the server tests run.

### Free-plan budget (limits from Cloudflare's docs, checked 2026-11-23)

The Workers free plan allows 100,000 requests a day, shared with every page and file load on games.nordgrenlabs.com. D1 allows 5 million rows read and 100,000 rows written a day.

| Per 20-minute game, about 150 lines | A: long polling | Plain 1 s polling (rejected) | B: Durable Objects |
|---|---|---|---|
| Worker requests | about 150 actions + 120 polls ≈ 300 | about 2,700 | about 300 WebSocket messages (count against the DO's own 100,000) |
| D1 rows read | about 150 + up to 30 per poll ≈ 3,800 | about 2,700 | none |
| D1 rows written | about 150 to 450 (with index) | same | none (DO storage instead) |

Either fits easily. Option A allows a few hundred online games a day before it gets near the shared request limit.

One risk to check first in A: the free plan allows 10 ms of CPU per request. A long poll spends most of its time waiting, which isn't CPU, but each D1 read costs a little. The first build step measures this. If a 20-second poll comes close to the limit, it falls back to shorter polls (about 8 s).

**Recommendation: A.** It meets every requirement with what Games already runs, needs no new product, and keeps one rule set. The client talks to the room through one small module, so moving to B later only swaps that module and the server end, not the game.

## Design (option A)

### Data

New migration `migrations/0002_rooms.sql`:

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,          -- uuid
  code TEXT NOT NULL UNIQUE,    -- invite code, 6 letters from an unambiguous alphabet
  game TEXT NOT NULL,           -- 'dots'
  seat0 TEXT NOT NULL,          -- nl_person_id of the creator
  seat1 TEXT,                   -- nl_person_id of the joiner, null until joined
  version INTEGER NOT NULL,
  state TEXT NOT NULL,          -- JSON: the room (below)
  last_action TEXT,             -- actionId of the last applied action, for safe retries
  updated_at TEXT NOT NULL
);
CREATE INDEX rooms_seat0 ON rooms (seat0, updated_at);
CREATE INDEX rooms_seat1 ON rooms (seat1, updated_at);
CREATE INDEX rooms_updated ON rooms (updated_at);
```

The room JSON holds the phase (`lobby`, `roll`, `playing`, `over`), each seat's name, letter and colour, the board spec, the roll rounds, the engine state once playing, and rematch votes.

### API (all under the existing bearer-token check, all keyed on the verified `nl_person_id`)

- `POST /api/rooms`: creates a room with a board spec and the creator's identity. Returns the id and code.
- `POST /api/rooms/join`: takes `{ code, identity }` and claims seat 1 in one statement, `... WHERE code = ? AND seat1 IS NULL AND seat0 != ?`.
  - The same person can't take both seats.
  - A full room answers 409, so a third person can't join.
  - Joining a room you're already in just returns it, which is how reconnecting works.
- `GET /api/rooms/<id>?since=<version>`: the long poll. For anyone not in either seat, the room doesn't exist (404), as with saves.
- `POST /api/rooms/<id>/actions`: takes `{ action, expect, actionId }`. Actions:
  - `identity`: change your own name, letter or colour in the lobby. Clashes are checked with the same rules as the client.
  - `roll`: the server rolls your die with `crypto.getRandomValues`. A tie rerolls both.
  - `start`
  - `draw` and `next`: passed to `reduce`. Only the active seat may send them, and `reduce` rejects anything illegal.
  - `rematch`: your vote. When both seats have voted, a new game state is created and the roll begins again, unless both chose to keep the first player.
  - `leave`
- **Retries:** if a phone resends an action whose `actionId` matches `last_action`, it gets the current state back and nothing is applied twice.
- **Size:** body capped like saves (256 KB). A room's state must pass `checkState` before every write.
- **Clean-up:** each `POST /api/rooms` deletes that person's rooms older than 7 days. Rooms nobody touched for 30 days are also deleted at that time, through the `rooms_updated` index, so no scheduled job is needed. A person may hold 20 open rooms at most.

### Client

- **New module:** `site/dots/ui/room.js` holds `create`, `join`, `send(action)` and a `watch` loop with back-off when offline, using `NL`'s existing token access. This is the one module option B would replace.
- **Menu and setup:**
  - Setup gets a segmented choice, "On this device" or "Online".
  - Online shows "Create a room" (choose a board, then share a link `games.nordgrenlabs.com/dots/?room=CODE` with the system share sheet, or show the code) and "Join with a code".
  - The lobby shows both seats, with each phone editing only its own player.
- **Board:** the same as local play, except only the active phone can tap or press Next turn. The other phone sees "Waiting for Erika" and watches the line move until Next turn.
  - A tap is drawn at once, then confirmed by the server.
  - On a 409 the phone redraws from the server's state, with a short note only if its own tap was undone.
- **Connection status:** a small banner when the poll fails, shown as Bank's "not synced" style ("Reconnecting"). Taps are held until it's back, and never queued blind.
- **Reconnecting:** the local autosave remembers the room id. Reopening the page goes straight back to the room. Refreshing mid-turn, with Next turn pending, restores exactly from the server.
- **Results and rematch:** each phone runs the same row-by-row count from the same final state. Rematch shows "Waiting for Brooke to agree" until both vote.
- **Saves:** an online game isn't put in `NL.saves`. The room is the save, and the saved-games list shows open rooms with "Resume".
- **Settings:** hidden counts stay a per-device setting, as the spec allows.

## Tests

- **Server** (`server/rooms.test.js`, real Worker and local D1, like `worker.test.js`):
  - create and join; the same person can't join twice; a third person is refused
  - a stranger gets 404
  - a wrong-seat draw and a stale `expect` (409 with the current state) are refused
  - a duplicate `actionId` applies once
  - two simultaneous draws: exactly one applies
  - server dice: a tie rerolls
  - a double capture gives +2 and one extra turn
  - moving a line before Next turn
  - a long poll returns on change and times out cleanly
  - reconnecting with Next turn pending
  - finishing; rematch only after both votes
  - the 256 KB cap and the room limit; clean-up
  - CPU time of a long poll measured
- **Client:** the room module in a Node vm, like `client.test.js` does for `platform.js`, with `fetch` routed into the Worker: two clients play a full game, drop and reconnect.
- **Browser:**
  - Two windows on a local `wrangler dev` with a throwaway key pair and two synthetic sessions, as the build guide describes. Never real keys, never `localhost:8765`.
  - A full game, double capture, refreshing one window mid-turn, rematch, phone portrait and landscape, light and dark.
  - Then a real two-phone test on production after deploy, with your go-ahead.

## Build order

1. Measure the long-poll CPU on a throwaway local Worker. This decides poll length.
2. Migration and the rooms API with server tests.
3. The `room.js` client and the Node-vm two-client test.
4. Screens: online choice, create and join, lobby, waiting state, banner, rematch votes.
5. Browser checks with two windows. Update `docs/BUILD-GUIDE.md` and add a decision record `docs/decisions/0004-online-rooms.md`.
6. Deploy, only with your go-ahead: `npm run db:migrate` (adds the table, forward only), then `npm run deploy`, from a clean checkout as the runbook says.

## Questions for the owner

1. **Option A (D1 and long polling) or B (Durable Objects)?** I recommend A.
2. **Accounts:** since Games requires sign-in and Clerk sign-ups are waitlist-only, your opponent needs an approved account to join. Is that fine, or should invites allow a guest seat? A guest seat would go against decision 0003 (no signed-out traffic).
3. **Rejoining after a drop:** should a dropped player have a time limit? The plan keeps the room open with no limit, and the other phone just shows "Waiting for Erika".
4. **Online history:** should finished online games stay in the saved-games list (for both players) or disappear after the results, as Dragon's Keep does?
