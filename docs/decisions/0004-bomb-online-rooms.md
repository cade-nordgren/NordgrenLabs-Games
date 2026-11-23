# 0004: Bomb online rooms in the Worker and D1, with long polling

**Status:** Proposed 2026-11-23 (decision 4 in `docs/plans/bomb-plan.md`, made while the owner was asleep; the owner can reverse it).
**Supersedes:** nothing. Decisions 0002 and 0003 stand unchanged: same Worker, same D1 database, same sign-in gate and bearer check.
**Authorizes:** the repo change that adds `server/rooms.js`, `migrations/0002_rooms.sql` and the dev identity header. It authorizes no migration on the production database, no deploy and no Cloudflare change; each needs the owner's go-ahead at the time (`docs/runbooks/deploy.md`).

## 1. Decision

Bomb's online play (2 to 6 phones at one table) runs in the existing Worker on the existing D1 database. The API is in `docs/plans/bomb-online-contract.md`.

- One `rooms` row per room holds the seats, decks, rematch votes and the engine state as JSON, with an integer `version`. Every change is one `UPDATE ... WHERE id = ? AND version = ?`, so of two simultaneous actions only one applies, and a stale phone can never overwrite a newer state. A repeated `actionId` from the same person answers success without applying twice (the last `actionId` per person is kept in `last_action`).
- `room_members (room_id, person_id, seen)` answers "is this person seated here" by primary key, and holds a coarse last-seen time for the `connected` flag. Seat numbers live only in the room JSON, so re-packing seats when someone leaves the lobby touches one member row, not all of them. Member changes ride in the same D1 batch as the room update, guarded on the version just read, so both apply or neither does.
- Phones wait with a long poll: the Worker re-reads only the room's `version` by primary key every 700 ms for up to 20 s and answers as soon as it changes.
- The server owns hidden information. It seeds each game from `crypto.getRandomValues`, runs the engine, and sends each caller only `viewFor(state, theirSeat)`. Online turns pass by themselves: the server applies the engine's `next` in the same write. Seats, persons and host rights come only from the verified `nl_person_id`; to anyone not seated a room is 404.
- Rooms idle for 24 hours are deleted when somebody creates a room. No cron.

## 2. Why not Durable Objects

A Durable Object per room with WebSockets would be truly real-time and is on the free plan, but it is a new Cloudflare product with a new binding and a different migration kind, which the owner's rule makes a stop-and-ask (0002 section 1), and it changes how the server tests run. Long polling meets "light and fast" for a turn-based card game (a move shows on the other phones within about a second), keeps one rule set (the Worker imports `site/bomb/engine/` directly), and needs nothing new. `server/config.test.js` still allows only `DB` and `ASSETS`. The client keeps all networking in `site/bomb/ui/net.js`, so a later move to Durable Objects swaps that file and `server/rooms.js`.

## 3. Limits

- **50 D1 queries per request** on the free plan. A poll makes at most `hold / interval + 4` = 32. Changing the timing in `server/rooms.js` must keep that under 50.
- **10 ms CPU per request.** Waiting is timers and I/O, which do not count. Measured in Node on a 6-player, 4-deck room (state about 10 KB): building a view (parse, `viewFor`, stringify) 0.1 ms; a full action (parse, `checkState`, `reduce`, stringify, view) 0.4 ms, warm. A cold isolate is several times slower and still well under the limit.
- **Requests:** about 800 to 1,000 Worker requests for a 20-minute, 4-player game, out of 100,000 a day shared with every page load. Roughly 100 online games a day before online play crowds the rest of the site.
- **D1 writes:** about 320 rows a game (one per action, last-seen at most every 30 s per polling phone), out of 100,000 a day. No index on `updated_at`, so actions do not pay an index write; the expiry sweep scans the small `rooms` table instead.
- `connected` is coarse: polled in the last 60 s, and only refreshed when a view is sent.
- No turn timer, no kicking an absent player, and no leaving a started game (409 `started`): a phone that disappears keeps its seat (plan decision 5). Abandoned rooms go after 24 hours idle.
- No cap on how many rooms one person may create; the 24-hour sweep is the only clean-up.

## 4. Local development

With sign-in off (`npm run dev`, the `dev` environment), the API has no tokens, so before this change every API call there was 401. A development build now accepts `X-NL-Dev-Person: <uuid>` as the caller (`devPerson` in `server/seam.js`), so two tabs can be two players. It needs both the build-time define `__GAMES_BUILD_MODE__ === "development"` and an empty `CLERK_JWT_KEY`; the production build defines `"production"`, wrangler folds the check to `false` (verified in the dry-run bundle), and a test runs the seam in both modes.
