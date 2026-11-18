# Deploy runbook

How NordgrenLabs Games goes onto Cloudflare Workers (`docs/decisions/0002-cloudflare-hosting.md`). Written 2026-11-18; not yet run.

**This runbook authorizes nothing.** Creating a Cloudflare resource, applying a migration, deploying, rolling back, changing DNS and changing the Clerk Dashboard are separate operator acts. Each needs the owner's explicit go-ahead at the time, and one go-ahead never covers the next act (`docs/decisions/0001-platform-adoption.md`; NL-ADR-0007 §3.6). Free plan only: if any step asks for a paid plan or another Cloudflare product, stop and ask the owner.

| What | Where |
|---|---|
| Worker | `nordgrenlabs-games` (`wrangler.jsonc` in this repo) |
| Static site | the `site/` directory, uploaded with each deploy |
| Saves database | D1 database `games`, bound as `DB`, schema in `migrations/` |
| Public route | custom domain `games.nordgrenlabs.com`, created by the route on deploy |
| Configuration | three public Clerk values in `wrangler.jsonc`; no secret anywhere |

All commands run from `server/` on the operator's PC, after `npm ci`. `wrangler` there means `node node_modules/wrangler/bin/wrangler.js`, the exact version pinned in `package.json`.

## Once, before the first deploy

1. **Log in.** The operator runs `node node_modules/wrangler/bin/wrangler.js login` themselves and signs in to the NordgrenLabs Cloudflare account. No API token is created for Games.
2. **Create the database.** `node node_modules/wrangler/bin/wrangler.js d1 create games`. Choose no location hint unless the owner asks for one.
3. **Paste the id.** Copy the `database_id` it prints into the top-level `d1_databases` entry in `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`. Leave the `dev` environment's dummy id alone. The id is not a secret.
4. **Commit** that one-line change, reviewed like any other.

Never add a Clerk secret key, or any other `CLERK_` variable, as a var or a secret. The Worker answers 503 `misconfigured` if one is present.

## Each release

1. Check out the reviewed commit: `git checkout --detach <sha>`, then `cd server && npm ci`.
2. `npm run check`: all tests pass, and the dry run lists only the three Clerk vars and `env.DB (games)`.
3. **Migrations before the deploy, never the reverse.** If the release adds a file under `migrations/`, run `npm run db:migrate` and confirm. A migration must keep the previous Worker version working, because the new code is not live yet and a rollback does not undo it. With no new migration this step prints that there is nothing to apply.
4. `npm run deploy`. Record the version id it prints.
5. Check:
   - `curl -s -o /dev/null -w '%{http_code}\n' https://games.nordgrenlabs.com/` prints 200.
   - `curl -s https://games.nordgrenlabs.com/config.js` prints `window.NL_CONFIG = {"clerkPublishableKey":"pk_live_..."};` with the key from `wrangler.jsonc`.
   - `curl -s -o /dev/null -w '%{http_code}\n' https://games.nordgrenlabs.com/api/me` prints 401. A 503 means the Worker refused its configuration; look at Workers Logs for the variable name.

## Roll back

`node node_modules/wrangler/bin/wrangler.js deployments list`, then `node node_modules/wrangler/bin/wrangler.js rollback <previous version id>`. A rollback does not undo a migration; that is why migrations stay compatible with the previous version.

## Once, to make it public

1. **Custom domain.** The first `npm run deploy` creates `games.nordgrenlabs.com` from the route in `wrangler.jsonc`. If it reports an existing DNS record for that name, stop and ask the owner; do not delete records by hand.
2. **Clerk, only if sign-in is refused.** If the shared instance refuses sign-in from the new origin, add `https://games.nordgrenlabs.com` as an allowed origin in the Dashboard. Change nothing else there: no cookie domain change, no satellite domain, no new key (NL-ADR-0007 §3.7).

## Acceptance, before telling anyone it is live

Do these on the real origin and record the date and result as an addendum to `docs/decisions/0001-platform-adoption.md` (section 3 there). Repeat after any change to the `@clerk/backend` version or the ClerkJS version pinned in `site/platform.js`.

- Before anyone signs in: send a few unauthenticated requests with a made-up `Authorization` header and a cookie, then look at Workers Logs and `wrangler tail`. Record whether either shows request headers or cookies (decision 0002 section 6). If they do, stop and ask the owner before any real sign-in.
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
- Workers Logs contain no token and no person id.
- Owner attestation, dated: no deploy tool, preview or backup of Games holds a Clerk secret key.

## Backup

D1 Time Travel covers the free plan's window. For a copy on demand: `node node_modules/wrangler/bin/wrangler.js d1 export games --remote --output games-<date>.sql`. Keep it off the repo; it holds people's saves.

## Retire the VM container

The container started on the Production VM `nordgren-labs` on 2026-11-18 from commit `226b9b7` was never public. Remove it, as its own operator act with the owner's go-ahead. The checkout is at `/srv/nordgren-labs/games/repo`, detached at that commit, so it still has the Compose file. On the guest:

```
cd /srv/nordgren-labs/games/repo
sudo GAMES_IMAGE_TAG=226b9b7af22e7a65300e96d2bd8b1d013d5e0f49 docker compose -f docker-compose.prod.yml down --volumes
sudo docker image rm nordgrenlabs-games-web:226b9b7af22e7a65300e96d2bd8b1d013d5e0f49
sudo rm -rf /etc/nordgren-labs/games
cd / && sudo rm -rf /srv/nordgren-labs/games
sudo rm -f /root/.ssh/games_deploy_ed25519 /root/.ssh/games_deploy_ed25519.pub
```

`down --volumes` removes the container, its network and the saves volume. The last line deletes the read-only deploy key made for the clone; also delete its entry under the GitHub repository's Settings, Deploy keys. Leave RideLab and the Control Center untouched. Games was never routed through the Tunnel, so its config should have no `games.nordgrenlabs.com` rule; look, and if one is there, stop and ask the owner before changing it.

## Afterwards

The Control Center catalog entry is a separate milestone in the Control Center repository, under its own decision record and authorization (`docs/PLATFORM-INTEGRATION-PLAN.md` section 3).
