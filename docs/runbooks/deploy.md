# Deploy runbook

How NordgrenLabs Games goes onto the Production VM. Written 2026-11-18; not yet run.

**This runbook authorizes nothing.** Deploying, changing DNS or the Cloudflare Tunnel, and changing the Clerk Dashboard are separate operator acts. Each needs the owner's explicit go-ahead at the time, and one go-ahead never covers the next act (`docs/decisions/0001-platform-adoption.md`; NL-ADR-0007 §3.6).

Where things live on the guest (`nordgren-labs`):

| What | Where |
|---|---|
| Compose project | `nordgrenlabs-games-prod` (`docker-compose.prod.yml` in this repo) |
| Config | `/etc/nordgren-labs/games/games.env` |
| Saves database | Docker volume `nordgrenlabs-games-prod_games_data`, file `/data/games.db` in the container |
| Listener | `127.0.0.1:3002` (RideLab has 3000, the Control Center 3001) |
| Public route | `games.nordgrenlabs.com` through the host-level Cloudflare Tunnel |

Nothing here is shared with RideLab or the Control Center, and none of it is a secret.

## Once, before the first deploy

1. **Get the repository onto the guest.** This repo has no remote yet. Either push it to a private GitHub repository, the way the other apps are deployed, or carry it over as a `git bundle`. Creating a remote is its own decision.
2. **Check the port.** `ss -ltn | grep ':3002 '` must print nothing. If 3002 is taken, change the one port line in `docker-compose.prod.yml` in a reviewed commit; `server/deploy.test.js` still requires a loopback binding.
3. **Write the config file** `/etc/nordgren-labs/games/games.env`, owned by root, mode 0644, with exactly these three lines. The values come from the Clerk Dashboard's API keys page for the shared Production instance and are all public:

   ```
   CLERK_PUBLISHABLE_KEY=<the pk_live_ publishable key>
   CLERK_JWT_KEY=<the JWT public key, PEM>
   CLERK_ISSUER=https://clerk.nordgrenlabs.com
   ```

   Put the PEM on one line: join its lines with nothing between them, keep the BEGIN and END markers, and add no quotes and no `\n` escapes. The server refuses to start if the key is unusable, if any of the three is missing, or if any other variable whose name begins `CLERK_` is present. Never put a Clerk secret key on this guest for Games.

## Each deploy

1. Check out the reviewed commit, detached: `git checkout --detach <sha>`.
2. Run the tests where Node is available: `cd server && npm ci && npm test`.
3. Build: `docker build -t nordgrenlabs-games-web:<sha> .`
4. Start: `GAMES_IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml up -d`. There is no default tag.
5. Check on the guest:
   - `docker compose -f docker-compose.prod.yml ps` shows `web` healthy.
   - `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/` prints 200.
   - `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/api/me` prints 401.
   - `docker compose -f docker-compose.prod.yml logs web` shows the one start-up line and no refusal.

**Roll back** by starting the previous tag: `GAMES_IMAGE_TAG=<previous sha> docker compose -f docker-compose.prod.yml up -d`. The database is not rolled back; it is one table whose shape has not changed.

## Once, to make it public

Each of these is its own operator act.

1. **Clerk.** If the shared instance requires origins to be admitted, add `https://games.nordgrenlabs.com` in the Dashboard. Change nothing else there: no cookie domain change, no satellite domain, no new key (NL-ADR-0007 §3.7).
2. **Tunnel.** In the host-level `cloudflared` config, add an ingress rule above the final catch-all, then restart `cloudflared`:

   ```yaml
     - hostname: games.nordgrenlabs.com
       service: http://127.0.0.1:3002
   ```

   The catch-all `http_status:404` rule must stay last. Follow RideLab's `docs/runbooks/ridelab-guest-production-runtime.md` §K.5 for the mechanics. Not verified from here: whether `admin` and `ridelab` are rules on one tunnel or two; look at the config on the guest first.
3. **DNS.** Route `games.nordgrenlabs.com` to the tunnel as a proxied record. Clerk's own records stay DNS-only.

## Acceptance, before telling anyone it is live

Do these on the real origin and record the date and result as an addendum to `docs/decisions/0001-platform-adoption.md` (section 3 there). Repeat after any change to the `@clerk/backend` version or the ClerkJS version pinned in `platform.js`.

- Signed out: the site loads, Bank plays, a save stays in the browser.
- Fresh sign-in from the account control. Note whether the sign-in window shows a sign-up link and what sign-in methods it offers.
- The signed-in first name pre-fills an empty roster.
- The local save from the first check appears in the account's saved games.
- Reload, and a new tab: still signed in.
- Arrive from the Control Center while signed in there. Note whether Games asks for a second sign-in.
- Leave the tab idle for several minutes, then save: it still works.
- Save on one device, resume on a second.
- Sign out, then sign in again.
- A signed-in person with no linked Person sees the line pointing to the Control Center and keeps local saves.
- In the browser's developer tools: session cookies are scoped to `games.nordgrenlabs.com` only, and no token appears in any URL.
- `docker compose logs web` contains no token.
- Owner attestation, dated: no deploy tool, preview or backup of Games holds a Clerk secret key.

## Backup

The VM backup covers the volume. For a copy on demand, stop the service briefly so the file is at rest:

```
docker compose -f docker-compose.prod.yml stop web
docker run --rm -v nordgrenlabs-games-prod_games_data:/data -v "$PWD":/out alpine cp /data/games.db /out/games-$(date +%F).db
GAMES_IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml start web
```

## Afterwards

The Control Center catalog entry is a separate milestone in the Control Center repository, under its own decision record and authorization (`docs/PLATFORM-INTEGRATION-PLAN.md` section 3).
