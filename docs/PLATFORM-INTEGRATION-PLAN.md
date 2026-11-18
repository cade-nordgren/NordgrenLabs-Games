# Platform integration plan

Status: accepted 2026-11-18. The owner accepted all seven recommended answers below; they are recorded in `docs/decisions/0001-platform-adoption.md` (step 1, done). Steps 2 to 8 are not built.

Goal: Games becomes a real NordgrenLabs platform app. Players start with the signed-in person's name, saved games follow the person across devices, and Games is launchable from the Control Center.

Short names used below: `NL-ADR-000N` is `C:\Projects\NordgrenLabs-Platform\docs\decisions\NL-ADR-000N-*.md`; `CC` is `C:\Projects\NordgrenLabs-Control-Center`; `ASC` is `C:\Projects\Ascend` (the only other app built secretless from day one, used as precedent).

## Questions for the owner

Each has a recommended answer. The plan below assumes the recommendations.

1. **Hostname.** `games.nordgrenlabs.com`? This also fixes the catalog key (`games`) and the one origin the backend accepts tokens from. The ADRs give only examples of the `<app>.nordgrenlabs.com` shape, not a rule (NL-ADR-0001 §20), so this is yours to pick.
2. **Anonymous play.** Keep it? Recommended: yes. Signed-out visitors play exactly as today with saves in the browser. No ADR addresses anonymous use either way (NL-ADR-0003 §9 only defines "No Clerk session: Unauthenticated").
   - If yes: on first sign-in, move that browser's local saves into the account? Recommended: yes, once, otherwise saves seem to vanish when you sign in.
3. **Who gets server saves.** Every signed-in person who has an `nl_person_id`, with no Games membership list and no roles? Recommended: yes. The platform has no "open to everyone" app class; each app owns its membership policy (NL-ADR-0001 §5, CC `AGENTS.md:173-176`), so Games must state this in its own record.
4. **Data retention.** Recommended: keep a save until its owner deletes it; cap at 200 saves per person and 256 KB per save; back up the database file with the VM. Platform law only says removing access never deletes domain data, and deletion needs its own decision (NL-ADR-0002 §6, lines 217-226). Do you want anything stricter, such as auto-deleting finished games after N days?
5. **Saved games inside the Control Center.** Is "launch Games from the Control Center tile, already signed in, saves are there" enough? Recommended: yes. A saved-games list rendered inside the Control Center is not buildable under today's decisions (see section 3).
6. **Storage engine.** One SQLite file in a Docker volume (recommended: one container, zero secrets), or a PostgreSQL container (the platform default stack, NL-ADR-0001 §19, lines 705-721, but a second container, a database password and role provisioning)? SQLite is a departure that Games' own decision record must justify, the way Ascend's ADR 0003 justified its own.
7. **Confirm the Clerk key gate is closed.** NL-ADR-0007 §9 (line 130) says admitting a new app's users to Production while another runtime still holds a Clerk secret key needs your explicit decision. CC `docs/handoffs/CURRENT.md:52-57` reads as though that is resolved (shared `default` key revoked 2026-11-12). Confirm, or decide.

Defaults chosen without asking (say if wrong): the pre-filled name is the Clerk profile first name; the backend lives in this repo under `server/`; Node is the runtime.

## 1. Sign-in on the games site

**What the rules allow.**

- The session token carries exactly one custom claim, `nl_person_id` (NL-ADR-0003 §3 lines 103-104, §1). It is already live on the shared Clerk instance (CC `docs/handoffs/CURRENT.md:81-83`). A person who has not finished Control Center setup has a valid session without it: "authenticated but not associated", not an error and not access (NL-ADR-0003 §9).
- The token never carries a name, and apps may not call the Clerk Backend API or the Control Center to get one (NL-ADR-0007 §3.2; NL-ADR-0001 §3). The only precedent for a name in the browser is ClerkJS's own user state, which the Control Center itself uses (CC `src/components/signed-in-identity.tsx:36-37`).
- A token's claims count only after a server verifies it (NL-ADR-0003 §6 step 5). So the browser must not decode `nl_person_id` itself.
- No Clerk secret key, no Backend API call, no Frontend API proxy, cookies stay host-only, no shared `.nordgrenlabs.com` session (NL-ADR-0007 §3.1, §3.2, §3.7, §3.9). New apps are secretless from day one and may use "another seam recorded in its adoption record" (NL-ADR-0007 §6.1).

**Design.** Copy Ascend's seam (ASC `docs/decisions/0002-browser-authentication-seam-v1.md` §1): ClerkJS in the browser with only the publishable key, the session token sent as `Authorization: Bearer`, verified offline by the backend with the instance public key. NL-ADR-0009's cookie-based own-seam is the alternative; the bearer seam is smaller (no cookie parsing, no CSRF surface) and already measured in Production by Ascend.

How it plugs into `platform.js`:

- The backend serves `/config.js`, which sets `window.NL_CONFIG = { clerkPublishableKey }`. Under the plain `python -m http.server` preview that file is missing, so the site runs signed-out exactly as today.
- `platform.js` loads ClerkJS (version pinned) from the instance's own host, `clerk.nordgrenlabs.com`, then calls `GET /api/me` with the bearer token. No build step and no npm on the client.
- `NL.identity()` (`platform.js:33-37`) stays synchronous and keeps its return shape `{ displayName, personPublicId }` or `null`. It returns the cached result: `displayName` from `Clerk.user.firstName`, `personPublicId` from `/api/me`. `window.NL_IDENTITY` remains as the local test stub.
- New `NL.ready`, a promise that settles once sign-in state is known. Bank reads identity at script load (`bank/index.html:292-293`), so it changes to pre-fill the first player after `NL.ready` when the name list is still empty.
- A shared account control, `NL.account(el)`, shows "Sign in" (Clerk's sign-in component on this origin, no sign-up route, as in ASC `src/web/auth/clerk.ts`) or "Sign out". As built it sits under the tile on the games list and in each game's settings sheet, not in the menu.
- Signed in but not associated (`/api/me` answers 403): treated as signed-out for saves, with one line pointing to the Control Center to finish setup.

The name is only a pre-fill for an editable player field. It is Clerk's profile name, not the registry's `people.display_name`, which no app can read (NL-ADR-0002 §9 promises it for cross-app chrome but no decision delivers it). The build guide rule stands: never store a Clerk user id or email.

## 2. Server-side saves

**Shape.** One small Node process in one container, same origin as the site. It serves the static files and the API, so there is one hostname, one tunnel rule and no CORS.

| Route | `NL.saves` call | Behaviour |
|---|---|---|
| `GET /api/me` | (identity) | `{ personPublicId }`; 401 signed out; 403 no `nl_person_id` |
| `GET /api/saves?game=<game>` | `list(game)` | caller's records, newest first |
| `GET /api/saves/<id>` | `get(id)` | record, or 404 (adapter returns `null`) |
| `PUT /api/saves/<id>` | `put(record)` | validates with the same rules as `valid()` in `platform.js:9-12`, overwrites `personPublicId` with the verified claim, enforces the size and count caps |
| `DELETE /api/saves/<id>` | `remove(id)` | 204, idempotent |

Every query is filtered by the verified `nl_person_id`. An id owned by someone else behaves as not found. Data is keyed only on that UUID, never the Clerk subject or email (NL-ADR-0004 §2.B lines 131-134; NL-ADR-0002 §13, §14). Responses send `Cache-Control: no-store`. If the database is unavailable the answer is 503, never "allow" (NL-ADR-0003 §9).

**Verification seam** (one function, modelled on ASC `src/worker/auth/seam.ts:65-88`): `verifyToken` from `@clerk/backend` with the public key only (the one server dependency), then pin algorithm RS256, issuer exactly `https://clerk.nordgrenlabs.com`, `azp` exactly the Games origin as a source constant (each seam keeps its own list, NL-ADR-0001 §8), non-empty `sid` and `sub`, no `aud`, bounded clock skew and token length, `nl_person_id` in UUID shape. Any failure is 401. The process refuses to start if any `CLERK_*` variable name is present beyond `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY` and `CLERK_ISSUER` (NL-ADR-0007 §3.4(d), in the stricter allowlist form of NL-ADR-0009 §1(i)). All three values are public.

**Storage.** One table: `saves(id, person_public_id, game, updated_at, record)`, with the record stored whole as JSON and an index on `(person_public_id, game, updated_at)`. Last write wins; the client's timestamps are kept after format validation.

**Client adapter.** `NL.saves` keeps its four async methods. Signed in and associated: they call the API, and a failure rejects (no silent fall-back to local storage, which would split a person's saves). Otherwise: today's localStorage code, unchanged. Game code does not change.

**Hosting**, alongside the existing setup (CC `docs/handoffs/CURRENT.md:52-57`; CC `docs/runbooks/home-production-deployment.md`):

- Same Ubuntu VM (`nordgren-labs`), its own Compose project (for example `nordgrenlabs-games-prod`), its own volume and its own config directory `/etc/nordgren-labs/games/`. Nothing shared with RideLab or the Control Center (NL-ADR-0007 §6.2; CC ADR 0010).
- One service bound to loopback on a free port (`127.0.0.1:3000` is RideLab, `127.0.0.1:3001` is the Control Center, CC `docker-compose.prod.yml:246-251`). The port is checked on the guest.
- One new ingress rule in the host-level `cloudflared` config, `games.nordgrenlabs.com` to that loopback port, above the mandatory catch-all 404 (RideLab `docs/runbooks/ridelab-guest-production-runtime.md:1572-1583`), plus a proxied DNS record.
- Deploy the way the others do: check out the reviewed commit on the guest, `docker build` with an explicit tag, `docker compose up -d`. No registry, no CI deploy.
- DNS, tunnel, Clerk Dashboard and deploy are operator acts, each needing its own go-ahead (CC `AGENTS.md:1043-1046`; NL-ADR-0007 §3.6).

Not verified: whether `admin` and `ridelab` share one tunnel, which ports are free, and whether the Clerk instance needs the new origin admitted in its Dashboard. Ascend treated origin admission as an operator act "if the instance requires one" (ASC ADR 0002 §7).

## 3. Control Center visibility

**Catalog entry: allowed today, small.** A catalog entry is a stable key, a product name, a launch origin and an optional icon; no private contract is required, and it never means access (NL-ADR-0004 §5, lines 248-251). The provisioning contract of NL-ADR-0005 is optional (§1) and Games does not need it.

The whole change, in the Control Center repo:

- `src/lib/applications/catalog.ts:306-323`: add `{ key: "games", name: "Games", url: "https://games.nordgrenlabs.com" }`. The key fits the required pattern (NL-ADR-0006 §1). No icon means a monogram tile.
- `src/lib/applications/catalog.test.ts:41`: the test pins the exact key list, so it becomes `["ridelab", "ascend", "games"]`.
- No database row, migration, env var, network or credential.

Effects to expect: the tile is a plain link to the origin and shows "Access: unknown" to every signed-in viewer (CC `AGENTS.md:220-226`). A third entry switches the launcher from the two-up layout to the carousel (CC `src/lib/applications/launcher-layout.ts:23-28`).

This is a Control Center milestone. It needs its own decision record and your explicit authorization there (CC `AGENTS.md:105-111`; the catalog header and test expect an adoption record per entry), and it should wait until Games is live because the entry records the production origin. It is out of scope for sessions working in this repo.

**Saved games shown inside the Control Center: not available without new decisions.**

- Reading the Games database is forbidden outright (NL-ADR-0004 §13, lines 620-625; NL-ADR-0001 §6; CC `AGENTS.md:157-161`).
- The only sanctioned route is an app-owned private contract operation, the optional "Other platform-visible reads ... a personal surface" (NL-ADR-0004 §5, lines 264-266). That means a second private listener, a private two-member Docker network, a channel credential, a separate read-only database authority, target-scoped token verification (NL-ADR-0006 §3; new apps cannot use the older profile, §7), a conformance suite before Production (NL-ADR-0004 §14), plus a Control Center adapter and page under its own record.
- The payload for such a read is explicitly undesigned (NL-ADR-0004 §17: "any application payload schema", "targeted reads"). The ADRs neither name nor forbid a saved-games read, so in my reading it needs at least a Games contract record and a Control Center record, and probably a platform decision first.

Recommendation: do not build it. The tile launch gives "my saved games, from the Control Center" for one catalog line.

## Steps

Each step is one reviewable change. Steps 1 to 6 are in this repo; none deploys anything.

1. **Adoption record** (docs only). `docs/decisions/0001-platform-adoption.md`: the answers above, the seam choice under NL-ADR-0007 §6.1, the membership policy, storage and VM placement. Update the decisions log in `docs/BUILD-GUIDE.md`. Platform `AGENTS.md` rule 11 requires apps to adopt platform records through their own record.
2. **Server and verification seam.** `server/` with static file serving, `/config.js`, `/api/me`, the start-up tripwire, and a hermetic test file: a throwaway key pair and synthetic tokens covering good, expired, wrong issuer, wrong `azp`, has `aud`, missing `sid`, unsigned, oversized, and no `nl_person_id`.
3. **Saves API.** The table, the four routes and tests: shape validation, caps, and that one person can never read, overwrite or delete another's save.
4. **Client sign-in.** ClerkJS loading, `NL.ready`, `NL.identity()` wiring, the account control, and Bank's pre-fill. Signed-out behaviour is unchanged.
5. **Client saves adapter.** `NL.saves` switches on sign-in state; the one-time upload of local saves if question 2 says yes.
6. **Container and runbook.** `Dockerfile`, `docker-compose.prod.yml`, `docs/runbooks/deploy.md`, and a test that the Compose file names no Clerk secret variable (NL-ADR-0007 §7 evidence iii).
7. **Go live** (operator acts, each on your explicit go-ahead): admit the origin in Clerk if required, DNS and tunnel rule, deploy, then an acceptance pass recorded in the adoption record: fresh sign-in, reload, new tab, arriving from the Control Center, idle past token expiry, sign-out then sign-in, save and resume on a second device, session cookies host-only, no token in any URL or log (adapted from NL-ADR-0009 §3.3 and Ascend's Gate S-equivalent).
8. **Control Center catalog entry.** A separate Control Center milestone, as described in section 3.

## Risks and what this plan leaves out

- **Single sign-on across subdomains is unmeasured.** Whether a session on `admin.nordgrenlabs.com` is recognised on the Games origin without a second sign-in is recorded as an expectation, not a fact (RideLab ADR 0043 §18). The worst case is one extra sign-in on Games. Step 7 observes it.
- **Shared-instance script risk.** Any script flaw in Games could act on the shared Clerk Frontend API for an administrator who visits (NL-ADR-0007 §9, line 131, an accepted platform-wide residual). Games already inserts user text with `textContent` only. A content security policy is left out because game scripts are inline by design and would each need a hash.
- **Local preview cannot sign in.** The production Clerk key only works on the production origin. Local work uses the `window.NL_IDENTITY` stub and the synthetic-token tests; real sign-in is first exercised in step 7 unless a Clerk Development instance key is supplied.
- **Left out on purpose:** roles or sharing of saves, conflict handling beyond last write wins, a health route (deferred platform-wide, NL-ADR-0004 §17), the access contract, and any Control Center change beyond the one catalog line.
- **Staleness.** CC `docs/handoffs/CURRENT.md` trails its `main` branch in places (it still describes the catalog as RideLab only); where they differ this plan follows the code.
