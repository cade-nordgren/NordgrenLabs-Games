# Crossix online: server contract

The HTTP API of Crossix's online rooms, for the browser client (`site/crossix/ui/app.js`, through Bomb's `site/bomb/ui/net.js` with `base: '/api/crossix/rooms'`). The server is `server/rooms.js` with the Crossix adapter in `server/crossix.js`; the tables are Bomb's (`migrations/0002_rooms.sql`, no new migration). Tested in `server/crossix.test.js` and `server/crossix-client.test.js`.

Everything in `bomb-online-contract.md` under **Basics**, **Errors common to every route**, `name`, `code` and `actionId` applies unchanged, with `/api/crossix/rooms` in place of `/api/bomb/rooms`. The differences are below.

## Rooms are per game

A room's stored state carries `kind: 'crossix'` (Bomb rooms carry none). Every lookup by id or code also matches the kind, so a Crossix code or id never opens a Bomb room through either game's routes, and the other way round (404). Codes are unique across both games (the `code` column is `UNIQUE`).

## Routes

| Route | Body | Answer |
|---|---|---|
| `POST /api/crossix/rooms` | `{ name }` | `{ id, version, view }`: a lobby with you in seat 0, the host |
| `POST /api/crossix/rooms/join` | `{ code, name }` | `{ id, version, view }`; 404 no such room; 409 `full` (8 seated) or `started`; already seated: the room as it is (a reconnect) |
| `GET /api/crossix/rooms/:id?since=v` | | long poll, held up to 20 s: `{ version, view }` as soon as `version` differs from `since` (at once without `since`); **at timeout also `{ version, view }`** (Bomb sends the version alone), so `connected` stays current for the host's Skip |
| `POST /api/crossix/rooms/:id/actions` | `{ action, expect, actionId }` | `{ version, view }`; `LEAVE` answers `{ version, view: null }` |

## The view

```js
{
  room: { id, code, phase: 'lobby' | 'game' | 'over', host: 0, rematch: [seat...], startedAt: null, endedAt: ms | null,
          seats: [{ name, connected }] },   // connected: polled in the last 60 s
  game: null | {                             // the engine state (crossix-plan.md, Engine) without seed and rng
    v: 1, mode: 'digital', status: 'playing' | 'over', players: [{ name, marks, locks, penalties }], closed,
    turn: { n, active, phase: 'roll' | 'choose' | 'over', dice, done: [bool...],
            picks: [] | [your picks, or null for every other seat] }   // choose only
  },
  you: 0..7
}
```

Redaction: `seed` and `rng` (the dice to come) never leave the server. While a roll is being chosen, every other seat's picks are `null`; who is done is public. Your own picks come back to you (after Done, so reopening keeps them). Marks, locks, penalties, dice and scores are public; the "scores at the end" setting is applied by each phone.

## Actions

| Action | Who, when | Expect | Refusals (409) |
|---|---|---|---|
| `{ type: 'START' }` | host, lobby, 2 or more seated | any | `started`, `not_host`, `too_few_players` |
| `{ type: 'LEAVE' }` | lobby or over (the rest go back to the lobby) | any | `started` |
| `{ type: 'REMATCH' }` | over; the new game starts when every seat has voted | any | `not_over` |
| `{ type: 'roll' }` | the active seat, roll phase; the server rolls | strict | `stale`, `not_your_turn`, `illegal` |
| `{ type: 'done', n, picks: { white, colour, penalty } }` | any seat not done, choose phase of roll `n` | any | `stale` (another roll), `illegal` (the engine refused) |
| `{ type: 'reopen', n }` | a seat that is done, before roll `n` resolves | any | `stale`, `illegal` |
| `{ type: 'skip', seat }` | host, for another seat not seen for 60 s (below) | strict | `stale`, `not_host`, `not_away`, `illegal` |

- `picks`: `white` is `null` or a lane 0 to 3; `colour` is `null` or `{ lane: 0..3, die: 0 | 1 }` (the active seat only); `penalty` is a boolean (the active seat only) and never together with a pick. The server checks them with the engine's own actions: a fresh pick, `pick` white, `pick` colour, `penalty`, then `done` for that seat. The last Done resolves the roll and the next seat is active.
- `done` and `reopen` carry the roll number `n` instead of relying on `expect`: one player's picks do not depend on anyone else's Done, so simultaneous Dones all apply, and a late one can never land on the next roll.
- `skip`: in the roll phase, for the active seat: the server rolls for them. In the choose phase, for a seat not done: Done with nothing picked; for the active seat that means the penalty (the rules' answer to marking nothing).
- A seat field in any action is ignored: you always act as your own seat.
- Unknown types, or a field with a wrong type or value, are 400 `action`.

## Requests

Every change bumps `version` and so ends every seated phone's held poll; nothing else bumps it (last-seen is written beside the room, not in it). Per roll with N players: 1 roll + N Dones = N + 1 actions, each waking N polls, about (N + 1)² requests; a reopen adds N + 1. See `crossix-plan.md`, Online, for the estimate against the free plan.
