# Canadian Salad: server contract

The rooms API in the Worker (`server/salad.js`, table schema `migrations/0003_salad.sql`). `site/salad/ui/net.js` is built only from this file. Game shapes (`view.game`) are in `salad-engine-contract.md`; rules decisions in `salad-plan.md`. If this file and the code disagree, `server/salad.test.js` is the truth and this file has a bug.

## Transport

- Same origin, JSON in and out, `Content-Type: application/json` on requests with a body. Every answer has `Cache-Control: no-store`.
- **Identity.** Production: `Authorization: Bearer <Clerk session token>` (the same token `site/platform.js` sends to `/api/saves`; ClerkJS `Clerk.session.getToken()`). On 401 get a fresh token (`getToken({ skipCache: true })`) and retry once. The seat is the verified person id inside the token; the server never reads a seat or person id from a body.
- **Local development** (`wrangler dev --env dev`, signed out, `window.NL_CONFIG === null`): send `X-Dev-Person: <id>` instead, where `<id>` is 1 to 64 of `A-Z a-z 0-9 _ -`. Each distinct id is a different person. The Worker honours it only in a development build with Clerk unconfigured; production ignores it (401). Suggested client rule: `?as=alice` on the page URL picks the id; without it, a random id kept in `sessionStorage`, so every tab or browser profile is its own person.
- Errors: `{ "error": "<code>" }`, plus `version` and `view` when the caller is seated (see each route). 401 `unauthenticated` (no or bad token), 403 `not_associated` (signed in, no linked person: tell them to finish linking in the Control Center), 503 `unavailable` (database down: retry with backoff), 404 `not_found`, 405 `method_not_allowed`, 413 `too_large` (body over 4 KB).

## Routes

| Method and path | Body | Success |
|---|---|---|
| `POST /api/salad/rooms` | `{ name, color, config? }` | 201 `{ version, view }` |
| `POST /api/salad/rooms/join` | `{ code, name, color }` | 200 `{ version, view }` |
| `GET /api/salad/rooms/<roomId>?since=<version>` | none | 200 `{ version, view }` |
| `POST /api/salad/rooms/<roomId>/actions` | `{ action, expect, actionId }` | 200 `{ version, view }` |

`roomId` is `view.room.id` (a UUID). The share link uses the code: `/salad/?room=<CODE>`.

### Create

`POST /api/salad/rooms` `{ name, color, config? }`. The caller becomes the host in seat 0. `config` is optional and partial: `{ capacity, decks, tableTheme, scoreDisplay }` (rules under Config). Defaults: capacity 4, decks `defaultDecks(capacity)` (1 for 2-5, 2 for 6-8), tableTheme `"felt"`, scoreDisplay `"live"`. Creating a room also deletes every room idle for more than 24 hours.

Errors: 400 `invalid_name`, `invalid_color`, `invalid_config`, `bad_request` (not JSON / not an object).

### Join (also reconnect)

`POST /api/salad/rooms/join` `{ code, name, color }`. `code` is case-insensitive; spaces and hyphens are ignored.

- Already seated in that room: answers 200 with your seat and changes nothing (name and colour are not updated; use `SET_PLAYER`). This works in every phase, so it is also how a returning player gets back in from a link.
- Otherwise, in the lobby with a free seat: you take the next seat. If `color` is taken, you get the first free colour in the list order (check `view.room.seats[you.seat].color`).

Errors: 404 `not_found` (no room with that code), 409 `full`, 409 `started` (game already running: no late joins), 400 `invalid_name` / `invalid_color` / `bad_request`.

### Read and long poll

`GET /api/salad/rooms/<roomId>?since=<version>`

- Without `since`, or when `since` differs from the current version: answers at once.
- When `since` equals the current version: holds the request, re-reading about every 800 ms, and answers as soon as the version moves; after about 16 s it answers 200 with the same version (a fresh view: connection dots may have changed).
- Polling counts as presence: it refreshes your `lastSeen` (at most every 10 s, without changing `version`).

Errors: 404 `not_found` when the room does not exist or you are not seated in it (including after you `LEAVE`). A non-member can never tell the two apart.

### Actions

`POST /api/salad/rooms/<roomId>/actions` `{ action, expect, actionId }`

- `action`: `{ type, ...fields }` from the table below.
- `expect`: the `version` you last saw (integer).
- `actionId`: a fresh id per user intent, 8 to 64 of `A-Z a-z 0-9 _ -` (use `crypto.randomUUID()`). Reuse the same id when retrying the same intent after a network failure.

Order of checks: not seated → 404. `actionId` already applied in this room (among the last 64) → 200 `{ version, view, duplicate: true }` with the current state, nothing applied again. `expect` not the current version → 409 `stale` with the current `version` and `view`. Then the action's own rules. A write that loses a race to another write is also 409 `stale` (so two simultaneous submissions: exactly one applies).

Every refusal of a seated caller carries `{ error, version, view }`.

| `action` | Who, when | Effect | Refusals |
|---|---|---|---|
| `{ type: 'SET_PLAYER', name?, color? }` | anyone, lobby | change your name and/or colour | 400 `invalid_name` / `invalid_color`; 409 `color_taken` (another seat has it); 409 `wrong_phase` |
| `{ type: 'SET_READY', ready: boolean }` | anyone, lobby | your ready flag | 400 `bad_request`; 409 `wrong_phase` |
| `{ type: 'SET_CONFIG', capacity?, decks?, tableTheme?, scoreDisplay? }` | host, lobby | change the room config (only fields given) | 403 `not_host`; 400 `invalid_config`; 409 `capacity_below_players` (capacity under seated count); 409 `wrong_phase` |
| `{ type: 'START' }` | host, lobby | deals the game: players = seated seats in seat order, decks and scoreDisplay from config, seed from `crypto.getRandomValues`. Capacity and decks are locked from here on | 403 `not_host`; 409 `not_enough_players` (fewer than 2 seated); 409 `not_ready` (someone other than the host is not ready); 409 `wrong_phase` |
| `{ type: 'LEAVE' }` | anyone, lobby only | you lose your seat; later seats move down one (seat numbers stay 0..n-1); if the host leaves, the seat that takes the host's number becomes host (the next seat, wrapping to 0). The last person leaving deletes the room. Answers 200 `{ version, view: null }` | 409 `in_game` (once a game exists you keep your seat; just stop polling) |
| `{ type: 'PLAY_CARD', card }` | the seat whose turn it is, game phase `play` | the engine plays it; a completed trick resolves at once | 409 `illegal` (not your turn, card not in `you.legal`, wrong phase) |
| `{ type: 'NEXT_ROUND' }` | host, game phase `roundEnd` | deals the next round | 403 `not_host`; 409 `illegal` |
| `{ type: 'REMATCH_READY', ready?: boolean }` | anyone, game phase `over` | your rematch vote (default `true`). When every seat has voted yes, a new game starts at once with the same players, decks and scoreDisplay and a fresh seed; votes reset | 409 `illegal` (game not over) |

Unknown `type`, missing fields or wrong types: 400 `bad_request`. Seated actions also refresh your `lastSeen`.

## Bodies

### `{ version, view }`

`version` is an integer that rises by one with every applied change (presence updates do not change it).

```js
view = {
  room: {
    id: 'uuid',
    code: 'ABCDEF',                 // 6 letters from ABCDEFGHJKMNPQRSTUVWXYZ (no I, L, O)
    host: 0,                        // host seat
    phase: 'lobby' | 'game',        // 'game' from START on, for good (finished games stay 'game'; view.game.phase says 'over')
    config: {
      capacity: 2..8,               // seats available in the lobby
      decks: 1 | 2 | 3,
      tableTheme: 'felt',           // a slug; the server does not know the UI's theme list: fall back to your default when unknown
      scoreDisplay: 'live' | 'roundEnd',
    },
    seats: [{                       // index = seat, 0..n-1, n = seated count
      seat: 0,
      name: 'Ada',
      color: 'cobalt',
      ready: false,                 // lobby ready flag (the host's is ignored by START)
      connected: true,              // polled or acted within the last 30 s
      rematch: false,               // REMATCH_READY vote, only meaningful when view.game.phase === 'over'
    }],
  },
  game: null | viewFor(state, you.seat),   // null in the lobby; otherwise exactly the engine view for your seat
  you: { seat: 0, host: true },
}
```

In a game, `room.seats[i]` and `game.players[i]` are the same person (names and colours are frozen at START).

### Names, colours, config

- **Name**: string; control characters and bidi override characters removed, whitespace runs collapsed to one space, trimmed, cut to 20 characters. Empty after that: `invalid_name`. Names need not be unique.
- **Colour**: one of these 10 ids, in this order (the order of free-colour assignment): `cobalt, scarlet, forest, tangerine, violet, teal, rose, gold, slate, sky`. Two seats never share a colour. The UI chooses the actual swatches.
- **Config**: `capacity` integer 2-8 and at least the seated count; `decks` integer 1-3 (checked together with the engine's `describeConfig(capacity, decks)`); `tableTheme` 1-24 of `a-z 0-9 -` starting with a letter; `scoreDisplay` `'live'` or `'roundEnd'`. Anything else: `invalid_config`.

## Client loop (net.js)

1. Create or join → keep `roomId`, `version`, `view`. Store `roomId` and the code locally (`nl-salad-*`) so a reload can rejoin: `POST join` with the stored code, or `GET` the room directly.
2. Poll forever while the room screen is open: `GET /rooms/<id>?since=<version>`; on 200 replace `version` and `view` (render only if `version` changed or `connected` flags changed), then immediately poll again.
3. Actions: send with `expect = version`; on 200 (including `duplicate: true`) take the returned `version` and `view`. The poll in flight will return at once since the version moved; ignore any answer whose `version` is lower than the one you hold.
4. **409**: take `version` and `view` from the body and re-render. For `stale`, the user's intent may no longer make sense (the turn moved on); do not retry automatically except for idempotent lobby toggles if they still apply. For other codes show a short message.
5. **404** from GET or actions: you are not in this room any more (left, or the room expired after 24 h idle). Go back to Home and forget the stored room.
6. **Network error, 5xx, 429**: retry the same request after 1 s, then 2, 4, 8, capped at 15 s, with a little jitter; reset on success. An action retry reuses its `actionId` and `expect`; if the first attempt had landed, the retry answers `duplicate: true`.
7. **401**: refresh the token once and retry; still 401 means signed out (the page reload shows the sign-in page).
8. When the tab is hidden (`visibilitychange`), stop polling after the current request; resume with an immediate `GET` (no `since`) when visible. Others see you as disconnected after about 30 s.

Free plan limits behind these numbers: a long poll does at most about 20 database reads, every other call a handful; there is no push channel. A dropped seat is never removed and play waits for them.
