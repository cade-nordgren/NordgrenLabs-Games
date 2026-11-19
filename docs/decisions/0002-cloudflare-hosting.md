# 0002: Hosting on Cloudflare Workers and D1

**Status:** Accepted 2026-11-18 by the owner.
**Supersedes:** in `0001-platform-adoption.md`, decision 8 (one Node process), decision 9 (one SQLite file in a Docker volume), the backup sentence of decision 10, decision 11 (hosting placement on the home VM) and the Compose file test in section 3. Everything else in 0001 stands.
**Authorizes:** the repo change that ports the server to a Worker. It authorizes no Cloudflare account action, no deploy, no DNS change and no Clerk Dashboard change. Each of those needs the owner's explicit go-ahead at the time (`docs/runbooks/deploy.md`).

## 1. Decision

Games runs as one Cloudflare Worker named `nordgrenlabs-games` on the custom domain `games.nordgrenlabs.com`. Workers static assets serve the `site/` directory and nothing else in the repo. The Worker runs first only for `/api/*` and `/config.js`, and also answers any request no file matched. Saves live in one D1 database, `games`, bound as `DB`.

Free plan only: Workers Free, static assets and D1. The operating-cost target is USD 0 per month. Any paid plan, and any other Cloudflare product (KV, R2, Durable Objects, Queues, Cron Triggers, Hyperdrive or anything else), is a stop-and-ask for the owner. `server/config.test.js` fails on any binding beyond `DB` and on settings that presume a paid plan.

## 2. Reasons

1. **Availability independent of the home VM and the home connection.** The owner's home internet drops out, and a Tunnel-published container goes down with it. A Worker and D1 at the edge do not. This is also Ascend's first reason (Ascend ADR 0003 section 2).
2. **Secretless by construction.** The Worker has no secret binding. Its only configuration is the three public Clerk values in `wrangler.jsonc`, and tokens are verified offline with the public key. A Worker cannot refuse to start, so it refuses to serve instead: any other `CLERK_` variable, or only some of the three set, makes every Worker route answer 503 `misconfigured`, logging the variable names and never their values.
3. **The owner's stated preference** on 2026-11-18 to host Games on Cloudflare instead of the home VM.

## 3. What did not change

- The verification seam (0001 decision 6 and its addendum): `verifyJwt` with the instance public key, then the same pins. The authorized party is still a fixed constant, chosen at build time by a wrangler `define`, never a runtime variable.
- The save record shape, the four routes, their status codes and error bodies, `Cache-Control: no-store` on every API response, the caps (200 saves per person, 256 KB per save) and the rule that one person can never read, overwrite or delete another's save.
- The membership policy (0001 decision 3), the data key (decision 4), retention (decision 10, apart from backups) and the hostname (decision 1).
- The client: plain HTML, CSS and JavaScript with no build step.

## 4. D1 rules

D1 has no interactive transactions. Every multi-statement write is one `batch()` or a single statement, and each ownership or cap check sits in the same statement as the read or write it guards. The save write is one `INSERT ... SELECT ... WHERE (already mine OR under the cap) ON CONFLICT DO UPDATE ... WHERE still mine`, batched with a count that only chooses between 409 and 404 when nothing was written. Migrations are forward only, live in `migrations/`, and are applied before the deploy that needs them, never after.

## 5. Behaviour that changed with the platform

- Static files are served by Cloudflare, not by our code. A directory without its trailing slash, and `/<dir>/index.html`, redirect with 307 to `/<dir>/` instead of the old 301. Static responses carry Cloudflare's own `Cache-Control` and `ETag`. `site/_headers` keeps `X-Content-Type-Options: nosniff` on them.
- A non-GET request to a path that is a static file gets Cloudflare's 405 without an `Allow` header. A non-GET request to any other non-API path still gets the Worker's 405 with `Allow: GET, HEAD`.
- The 413 response no longer sets `Connection: close`; a Worker cannot set that header. The body is still read only up to the cap.
- A JWT key that is not a usable public key now fails at test time (`server/config.test.js` parses the committed key) and fails closed at runtime (every token refused), instead of stopping start-up.

## 6. Vendor facts not yet verified

None of these can be checked without the Cloudflare account. Each is checked by the operator, with the owner's go-ahead, before anyone signs in on the production origin.

- Whether Workers Logs (enabled by `observability`) or `wrangler tail` record request headers such as `Authorization`, or cookies, and what redaction or disabling is available. Measure with synthetic unauthenticated requests first.
- That Games stays within the Workers Free and D1 free limits at its real usage.
- D1 Time Travel retention on the free plan, and whether it survives deletion of the database (assume not).
- That the custom domain route is created on first deploy for a zone already on the account, with no extra step.
- How a `wrangler rollback` interacts with a static assets upload (expected: assets roll back with the Worker version).
- That `batch()` is atomic against concurrent writers on remote D1. Verified locally only, on miniflare.

## 7. Backups

There is no VM backup any more. D1 Time Travel is the first line, within whatever window the free plan gives. For a copy on demand, the operator runs `wrangler d1 export games --remote --output <file>`, an operator act like any other.

## 8. The VM container

A container of Games was started on the home VM on 2026-11-18 from commit `226b9b7`. It was never made public, so it holds no player's saves. It is to be removed, with its volume, image, config directory and deploy key, by the steps in `docs/runbooks/deploy.md` under "Retire the VM container".

## 9. First deploy, 2026-11-18

- Database `games` created with `wrangler d1 create games` (id `fca7723e-47e4-483f-b173-4a176b98396a`, region WNAM); `0001_saves.sql` applied.
- Deployed from branch `release/bank-only` at `8b0e2a3`: `main` at `78c3f77` without Tidevault and Dungeon companion, which another session was still working on. Version ID `7f29e51d-3614-445f-8689-606a08209558`. The deploy created the custom domain `games.nordgrenlabs.com`.
- Checked on the live origin, signed out: `/` and `/bank/` answer 200; `/config.js` carries the publishable key; `/api/me` and `/api/saves` answer 401 with `no-store`; `/server/worker.js`, `/wrangler.jsonc`, `/docs/BUILD-GUIDE.md` and `/_headers` answer 404.
- Log check before any sign-in (section 6): one request with a made-up `Authorization` header, a made-up cookie, a plain header and a query string, watched with `wrangler tail --format json`. The tail showed `authorization` and `cookie` as `REDACTED`. It showed the plain header and the full URL, query string included, so a token must never be put in a URL (none is). The stored Workers Logs view in the dashboard has not been inspected.
- Owner check, 2026-11-18: signing in on the live origin worked and the signed-in first name pre-filled Bank's roster. No Clerk Dashboard change was needed for the new origin.
- Not yet confirmed: the rest of the acceptance list in `docs/runbooks/deploy.md` (save carried into the account, second device, idle then save, arriving from the Control Center, cookie scope, the stored Workers Logs view).
- VM container retired by the owner on 2026-11-18: the Compose project, its volume and network, the image, `/etc/nordgren-labs/games`, `/srv/nordgren-labs/games` and the deploy key files on the guest were removed and checked gone. RideLab and the Control Center were not touched.
