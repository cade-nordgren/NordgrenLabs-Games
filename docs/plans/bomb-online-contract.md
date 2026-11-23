# Bomb online: server contract

The exact HTTP API of Bomb's online rooms, for the browser client (`site/bomb/ui/net.js`). The server is `server/rooms.js`, wired into `server/worker.js`; the tables are `migrations/0002_rooms.sql`; the reasons for the design are in `docs/decisions/0004-bomb-online-rooms.md`. Engine shapes (`viewFor`, actions, cards) are in `bomb-engine-contract.md`. Everything here is tested in `server/rooms.test.js`.

## Basics

- Every route is under `/api/bomb/rooms` on the same origin as the page. Request and response bodies are JSON (`Content-Type: application/json` on requests with a body). Every response is `Cache-Control: no-store`.
- **Who you are** is taken only from the verified session, never from a body. Send `Authorization: Bearer <token>` (see "Identity" below). There are no person ids, seat numbers or host flags in any request.
- **Unknown fields are ignored.** A field with a wrong type or value is 400.
- **Request bodies are at most 4096 bytes** (413 `too_large` past that).
- **Not seated means not there.** A room you are not seated in answers 404, exactly like a room that does not exist. The only way into a room is `join` with its code.
- **Versions.** Each room has an integer `version`, 1 when created, plus 1 on every change. Every successful answer carries the room's current `version`; send it back as `since` (poll) and `expect` (actions). Only game actions must match `expect`; room-level actions apply to the room as it is.

### Errors common to every route

| Status | Body | When |
|---|---|---|
| 401 | `{ "error": "unauthenticated" }` | no token, or a token that does not verify (expired, wrong key...). Refresh the token once and retry. |
| 403 | `{ "error": "not_associated" }` | signed in, but the account has no `nl_person_id` yet. Online play is not possible for this person; say so. |
| 404 | `{ "error": "not_found" }` | no such room, or you are not seated in it (also: unknown path). |
| 405 | `{ "error": "method_not_allowed" }` with an `Allow` header | wrong method for the path. |
| 400 | `{ "error": "invalid", "reason": "<field>" }` | bad input. `reason` names the field: `body`, `name`, `style`, `decks`, `code`, `expect`, `actionId`, `action`, `since`. |
| 413 | `{ "error": "too_large" }` | body over 4096 bytes. |
| 409 | `{ "error": "conflict", "reason": "<reason>", "version": n, "view": View }` | did not apply now; `version` and `view` are the room as it is (omitted on `join`, where you are not seated). Reasons are listed per route. |
| 503 | `{ "error": "unavailable" }` (or `"misconfigured"`) | database trouble. Retry with backoff. |

### Values

- `name`: a string, trimmed by the server, 1 to 20 UTF-16 code units after trimming (the same limit as the other games' `maxlength="20"` roster inputs), no control characters. The server stores the trimmed name.
- `style`: one of these 12 ids, the card styles in `bomb-plan.md` in the same order:

  | id | Style | Hex | Ink |
  |---|---|---|---|
  | `cobalt` | Cobalt Stripes | #1f6fd6 | white |
  | `scarlet` | Scarlet Dots | #d42f3a | white |
  | `forest` | Forest Diamonds | #1c7f3e | white |
  | `tangerine` | Tangerine Waves | #d96c00 | dark |
  | `violet` | Violet Crosshatch | #9046d6 | white |
  | `teal` | Teal Checks | #0c7c78 | white |
  | `rose` | Rose Chevrons | #cc2f7c | white |
  | `gold` | Gold Sunburst | #b58300 | dark |
  | `indigo` | Indigo Scales | #575bdb | white |
  | `slate` | Slate Pinstripes | #62738a | white |
  | `sky` | Sky Rings | #1f93c9 | dark |
  | `lime` | Lime Plaid | #62970f | dark |

- `decks`: an integer 1 to 4. Whether it suits the player count (`allowedDecks(players)` in the engine) is checked at `START`.
- `code`: 6 letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, L, O). Case-insensitive and trimmed on join; the server always shows it upper case.
- `actionId`: 1 to 64 characters from `A-Z a-z 0-9 _ -`. Use a fresh `crypto.randomUUID()` per user action, and the same one for retries of that action.

## The view

Every successful room answer carries `view` (except `LEAVE`, below):

```js
{
  room: {
    id: '7b0c…-uuid',          // the room id, for the URLs below
    code: 'KQZMTP',
    phase: 'lobby' | 'game' | 'over',   // 'game' covers the engine's 'choose' and 'play'
    host: 0,                   // always seat 0: the host is whoever sits first
    decks: 1..4,
    seats: [{ name, style, connected }],  // seat order = turn order = the engine's seat numbers
    rematch: [seat],           // seats that voted for a rematch (only while phase is 'over'); [] otherwise
    startedAt: null | ms,      // server clock (epoch ms) when play began (the last face-up confirm); null before
    endedAt: null | ms,        // server clock when the game ended; null until phase is 'over'
  },
  game: null | viewFor(state, you),   // null in the lobby; the engine contract's view for YOUR seat
  you: seat,                   // your seat number
}
```

- `connected` is coarse: true when that person has polled in the last 60 seconds (the server records it at most every 30 s). It is computed when a view is built, so it only refreshes when you receive a view.
- `game` never holds another player's hand, any face-down card, the deck order, the seed or the PRNG (the engine's guarantee, checked by the server tests on every response of a full game).
- Names and styles are not in `game`; take them from `room.seats[seat]`.

## Routes

### Create a room: `POST /api/bomb/rooms`

Request: `{ "name": "Alex", "style": "cobalt", "decks": 1 }`

200: `{ "id": "<room id>", "version": 1, "view": View }`. You are the host in seat 0, `phase: 'lobby'`.

400 reasons: `body`, `name`, `style`, `decks`. Creating a room also deletes rooms nobody has touched for 24 hours.

### Join a room: `POST /api/bomb/rooms/join`

Request: `{ "code": "kqzmtp", "name": "Brooke", "style": "scarlet" }`

200: `{ "id", "version", "view" }`, seated in the next free seat.

- **Reconnecting:** if you are already seated in that room, this returns it unchanged, in any phase (your name and style are not changed; use `SET_PLAYER` in the lobby). This is how a phone that lost the room id gets back in.
- **Style taken:** you get the first free style in the list order instead. Check `view.room.seats[view.you].style`.
- **Decks:** if the new player count needs more decks (5 or 6 players with 1 deck), `decks` rises to the smallest allowed count.
- 404 `not_found`: no room has that code.
- 409 (no `version`/`view`): `reason: "started"` (the game has started, or finished), `reason: "full"` (6 seated).
- 400 reasons: `body`, `code`, `name`, `style`.

### Long poll: `GET /api/bomb/rooms/<id>?since=<version>`

- Without `since`, or with a `since` that is not the current version: answers at once with `{ "version", "view" }`.
- With `since` equal to the current version: the server waits until the version changes and then answers `{ "version", "view" }`, or after about 20 seconds answers `{ "version" }` alone (nothing changed: poll again with the same `since`).
- 404 when the room is gone or you are no longer seated (you left).
- 400 `since`: not a non-negative integer.

### Actions: `POST /api/bomb/rooms/<id>/actions`

Request: `{ "action": { "type": "...", ... }, "expect": <version you last saw>, "actionId": "<uuid>" }`. All three are required.

200: `{ "version", "view" }` after the action applied (for `LEAVE`, `view` is `null`).

Order of checks: shape (400) → seated (404) → `actionId` already applied for you (200 with the current view, nothing applied again) → for game actions only, `expect` equals the current version (else 409 `stale`) → rules (409 with a reason) → conditional write.

- **Game actions** keep a strict `expect`: if someone else changed the room first, 409 `stale` (only one of two simultaneous moves applies).
- **Room-level actions** (`SET_PLAYER`, `SET_DECKS`, `START`, `REMATCH`, `LEAVE`) ignore `expect` (it must still be a valid integer). Each is checked against the room as it is now; if the conditional write loses a race, the server re-reads the room and tries again, up to 5 times (each try is 3 to 4 queries), so simultaneous rematch votes all count and two players picking the same style get one 200 and one 409 `style_taken`. 409 `stale` only if all 5 tries lose.

**Room-level actions** (`phase: 'lobby'`; in another phase they answer 409 `started`, except `REMATCH` and `LEAVE`):

| action | Who | Effect | 409 reasons |
|---|---|---|---|
| `{ type: 'SET_PLAYER', name, style }` | anyone, for their own seat | changes your name and style | `style_taken` (another seat has it), `started` |
| `{ type: 'SET_DECKS', decks }` | host | sets the deck count | `not_host`, `started` |
| `{ type: 'START' }` | host | deals: `phase` becomes `'game'`, the engine is in `'choose'` | `not_host`, `too_few_players` (fewer than 2 seated), `decks` (not allowed for this many players), `started` |
| `{ type: 'LEAVE' }` | anyone, `phase: 'lobby'` or `'over'` | frees your seat; later seats move up one, so if the host leaves, seat 1 becomes seat 0 and host. After a finished game the room goes back to the lobby for everyone left (`game: null`, rematch votes discarded, times cleared): the host can `START` again with whoever is left, and others can join by code. The last one out deletes the room. Answer: `{ version, view: null }`; afterwards the room is 404 for you. The others see the seat gone on their next poll | `started` (leaving a game in progress is not supported in this version: just stop polling; the room expires after 24 h idle) |
| `{ type: 'REMATCH' }` | anyone, `phase: 'over'` | records your vote in `room.rematch`; when every seated player has voted, a new game starts at once with the same seats and decks (new seed, new draw for first), `rematch` back to `[]`, times cleared | `not_over` |

**Game actions** (`phase: 'game'`), passed to the engine with your seat filled in by the server:

| action | 
|---|
| `{ type: 'arrange', ids: [a, b, c, d] }` (4 card ids) |
| `{ type: 'confirm' }` |
| `{ type: 'play', ids: [...] }` (1 to 16 card ids) |
| `{ type: 'playDown', slot: 0..3 }` |
| `{ type: 'pickUp' }` |

- Card ids must look like engine ids (`'QH1'`, `'10S0'`); other shapes are 400 `action`. `next` is 400 `action`: **never send `next`**. After a `play`, `playDown` or `pickUp`, the server applies the engine's `next` in the same write, so the view you get back already shows the next player's turn (or yours again after a bomb). `game.pending` is therefore always `null` online. To animate, use `game.last`.
- During the engine's `choose` phase every seat may `arrange` and `confirm` at the same time.
- 409 reasons: `illegal` (the engine refused it: not your turn, wrong cards...), `not_started` (game action in the lobby), `stale`.

## The client loop

One poll loop per open room, and actions sent beside it:

```js
let version = 0, view = null;                  // 0: the first poll answers at once

async function call(path, init) {              // returns { status, body }; throws on network error
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(path, { ...init, headers: { ...await authHeaders(attempt > 0), 'Content-Type': 'application/json' } });
    if (r.status === 401 && attempt === 0) continue;  // token expired: refresh once
    return { status: r.status, body: await r.json().catch(() => null) };
  }
}

function accept(b) { if (b?.view && b.version >= version) { version = b.version; view = b.view; render(view); } }

async function watch(id) {
  let delay = 1000;
  while (open) {
    try {
      const { status, body } = await call(`/api/bomb/rooms/${id}?since=${version}`);
      if (status === 200) { accept(body); delay = 1000; continue; }   // changed, or { version } alone: poll again at once
      if (status === 404) return gone();       // left, room deleted or expired: back to the menu
      if (status === 401 || status === 403) return signedOut();
    } catch {}                                 // network error or 503: show "Reconnecting", back off
    await wait(delay); delay = Math.min(delay * 2, 15000);
  }
}

async function send(action) {                  // disable the controls until it settles
  const msg = JSON.stringify({ action, expect: version, actionId: crypto.randomUUID() });
  for (let delay = 1000; ; delay = Math.min(delay * 2, 8000)) {
    try {
      const { status, body } = await call(`/api/bomb/rooms/${id}/actions`, { method: 'POST', body: msg });
      if (status === 200) return accept(body), body;      // LEAVE: body.view is null, stop the loop
      if (status === 409) return accept(body), body;      // redraw from the truth; show body.reason if useful
      return body;                                         // 400 (a bug) or 404 (gone)
    } catch { await wait(delay); }                         // network error: resend the SAME msg (same actionId)
  }
}
```

- **On 409 `stale`** (game actions only): someone acted first. Redraw from the `view` in the answer; do not resend automatically (the move may no longer make sense). The poll loop will also have caught up. The exception is `arrange` and `confirm` in the `choose` phase: every seat chooses at once and another seat's choice cannot change yours, so `net.js`'s caller resends those once on `stale`.
- **On a network error during an action:** resend the identical body. If the first attempt did apply, the server recognises the `actionId` and answers 200 with the current view, applying nothing twice.
- **On 404:** the room is gone for you (you left, everyone left, or it expired after 24 h idle). Stop polling, forget the room id.
- **Backoff:** after a failed poll wait 1 s, then 2, 4, 8, capped at 15 s; reset after any success. Never poll in a tight loop on errors.
- **Resume after reload:** keep the room id (and code) in `localStorage`; on load, poll without `since` (or `since=0`). If that is 404, the room is gone. `join` with the code also gets you back in while you are seated.
- **Tab hidden:** you may stop polling while `document.hidden` and poll at once on `visibilitychange`; other players will see you as not connected after about a minute.
- Abort the in-flight poll (`AbortController`) when leaving the room screen; the server stops the request when the client disconnects.

## Identity

**Production** (signed in through the gate): get the token from ClerkJS, which `platform.js` has loaded once `NL.ready` resolves:

```js
async function authHeaders(fresh) {
  if (window.NL_CONFIG === null) return { 'X-NL-Dev-Person': devPerson() };   // dev only, below
  await NL.ready;
  const t = await window.Clerk?.session?.getToken(fresh ? { skipCache: true } : undefined);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
```

Ask for the token on every request, never keep one: ClerkJS tokens live about 60 seconds and `getToken()` returns its cached one while it is fresh and a new one otherwise. The server checks the token when a request arrives, so a 20-second long poll that outlives its token is fine; the next poll asks again. `net.js` does exactly this (`browserAuth`), tested against the real Worker in `server/bomb-client.test.js`.

`NL.person()` is your own person id if you need it for local bookkeeping; the server never needs it from you. A 403 `not_associated` means the account is not linked to a person yet: online play is unavailable for them (local play still works).

**Local development** (`cd server && npm run dev`, then `http://localhost:8787/bomb/`): sign-in is off and `window.NL_CONFIG` is `null`. The server then accepts the header `X-NL-Dev-Person: <lowercase UUID>` as the caller's identity, so each browser tab can be a different person:

```js
function devPerson() {
  let id = sessionStorage.getItem('nl-bomb-dev-person');           // per tab: two tabs are two players
  if (!id) sessionStorage.setItem('nl-bomb-dev-person', id = crypto.randomUUID());
  return id;
}
```

`sessionStorage` survives a reload of the same tab (so reconnecting can be tested) and differs between tabs and browser profiles. The header is honoured only by a development build (`wrangler dev --env dev`, build mode `"development"`) with no Clerk key configured; the production build ignores it completely, so it is safe for the client to send it whenever `NL_CONFIG` is `null`.

## Free-plan budget

Limits (Workers free plan, D1 free): 100,000 Worker requests a day shared with every page and file load of the site; 10 ms CPU per request; 50 D1 queries per request; D1 5,000,000 rows read and 100,000 rows written a day.

Per request:

| Request | D1 queries | Rows read | Rows written |
|---|---|---|---|
| create | 4 (sweep, insert, view) | 1 + members + expired rooms scanned | 2 (+ 2 per expired room deleted, with members) |
| join | 4 to 5 | about 10 | 2 (room + member) |
| action | 3 to 4 (view, update, view); a room-level action that loses a race retries, at most 5 x 4 + 2 = 22 | about 15 | 1 (LEAVE: 2) |
| poll that changes at once | 3 to 4 | about 8 | 0, or 1 when last-seen is 30 s old |
| poll held to the end | up to 2 + 28 | up to 30 | 0 or 1 |

A poll makes at most `hold / interval` (20 000 / 700 = 28) version reads plus 4 others: 32 queries, under the 50 limit. CPU per request is a few JSON parses of one room row and `viewFor`; the waiting between reads is timers and I/O, which do not count as CPU. Measured in Node on a 6-player, 4-deck room (about 10 KB of state), warm: a view 0.1 ms, a whole action 0.4 ms.

Measured under `wrangler dev`: a poll with nothing happening answered `{ version }` after 19.9 s; a poll waiting while another tab sent `START` answered with the new view within one 700 ms interval of the action.

Per game, 4 players, about 150 actions (8 for the face-up choice, the rest plays and pickups), 20 minutes:

- Worker requests: each action is 1 request and ends 4 waiting polls, which are then re-sent: about 150 x 5 = 750, plus idle-timeout polls (at most 3 a minute per phone while nothing happens) and a few lobby calls: **about 800 to 1,000 requests**.
- D1 rows read: about 150 x (15 + 4 x 8) ≈ 7,000 plus held-poll reads: **under 15,000**.
- D1 rows written: 150 actions + last-seen at most 2 a minute per phone (4 x 2 x 20 = 160) + lobby: **about 320**.

So the free plan carries roughly 100 such games a day before online play uses the request allowance the rest of the site needs (it is shared), and about 300 a day before D1's write limit; reads are far from their limit. 6-player games cost about 1.5 times as much.
