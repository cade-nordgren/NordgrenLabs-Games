# 0003: Sign-in required

**Status:** Accepted 2026-11-18 by the owner.
**Supersedes:** in `0001-platform-adoption.md`, decision 2 (anonymous play stays) and the part of decision 3 that treats a signed-in person without `nl_person_id` "as signed-out". In `0002-cloudflare-hosting.md`, section 1's "The Worker runs first only for `/api/*` and `/config.js`" and the static-file behaviour in section 5.
**Authorizes:** the repo change that adds the gate. It authorizes no deploy, rollback, Cloudflare change or Clerk Dashboard change; each needs the owner's go-ahead at the time (`docs/runbooks/deploy.md`).

## 1. Decision

The owner, 2026-11-18: "I would prefer if users have to sign in before seeing game options. I do not want website traffic from unsigned in users."

A signed-out visitor can load only the sign-in page and the few files a home-screen install needs. The games list at `/`, every game folder present or future, and every other file under `site/` need a valid session. This reverses 0001's "anonymous play stays": there is no signed-out play in production any more.

- **Membership.** Any signed-in person may view and play. One whose session token carries `nl_person_id` gets server saves (0001 decision 3, unchanged); one without it plays with saves in that browser, as before. Games keeps no membership table and no roles.
- **Who may create an account** is decided in the Clerk Dashboard by the owner (sign-up on or off, allowed methods), not by this app. The gate only checks that a session is valid.

## 2. How it works

1. **The Worker runs first for every request** (`assets.run_worker_first: true`, files fetched through the `ASSETS` binding). Free plan, no new product: the assets binding is part of Workers static assets.
2. **Order in `server/worker.js`:** the configuration tripwire (503 `misconfigured`), then `/api/*` (unchanged), then the method check, then `/config.js`, then the gate.
3. **Allowlist, fail-closed.** Exact paths only: `/manifest.webmanifest`, `/apple-touch-icon.png`, `/favicon.ico` and the three files in `/icons/`. A phone fetches these at install time and from the home screen without a usable session. Anything else, including a new game folder, needs a session with no configuration change. `/config.js` is answered before the gate, as before; it holds only the publishable key.
4. **Cookie for pages, bearer for the API.** A browser navigation cannot send an `Authorization` header, so a page or file request proves its session with ClerkJS's `__session` cookie, which holds the same short-lived session token `getToken()` returns (NL-ADR-0009 names the session cookie as the sanctioned source for an app's own seam). `server/seam.js` reads it with `verifyCookie` and checks it with exactly the same verifier and pins as the API: RS256, issuer, authorized party, no `aud`, non-empty `sid` and `sub`, expiry, size cap, and a canonical `nl_person_id` when present. No other signal is trusted. The API still reads only the bearer header, so a cookie can never authorize a save request (no cross-site request forgery path), and a bearer header is not a page session. Both directions are tested.
5. **No session: the sign-in page in place.** Status 401, `Cache-Control: no-store`, at the requested address, never a redirect, so there is no `next=` parameter and no open redirect. `site/signin.html` is self-contained (inline CSS, no shared script); the Worker fills in the publishable key so it needs no other request, and the page starts the ClerkJS download at once from the same pinned URL as `platform.js`, with a preconnect to the Clerk host.
6. **Resume, RideLab's way** (its ADR 0051 B'-4). The usual reason for a 401 is that the cookie's one-minute token has expired while the Clerk session is alive. As soon as ClerkJS reports a session, the page calls `getToken({ skipCache: true })`, which writes a fresh cookie, and replaces itself with the same address. Meanwhile it shows a quiet skeleton, never the sign-in button. The button appears only when Clerk says there is no session. Loop guard: resumes less than a minute apart count as one run, and the third gives up with "Could not verify your session" and Try again; so does a 15 second wait or a failed ClerkJS load. After signing in from the button the person lands on the address they asked for; the bare domain lands on the games list.
7. **Sign-out** from the account control calls Clerk's sign-out back to the same address, where the Worker shows the sign-in page. It also clears this browser's cached saves list and name.
8. **Local development stays open.** With all three Clerk values empty (the `dev` environment, and the static preview where `config.js` is the null placeholder) there is no gate. In production a missing or partial configuration still answers 503 on every path, never an open site.

## 3. Caching

- Protected responses: `Cache-Control: private, no-cache`, with the asset's ETag passed through. `private` keeps them out of every shared cache. `no-cache` makes the browser come back for every use; the Worker checks the cookie first and only then lets the asset answer, so an unchanged file costs a 304 and a signed-out revalidation gets the 401 sign-in page. This replaces `no-store`, which would download every file on every load.
- Known limit: a browser may show a page from its back-forward cache after sign-out without asking the server. The pages hold no one's data (saves come from the API, which needs a token), so this was accepted.
- The sign-in page: `no-store`. Allowlisted files: Cloudflare's normal `public, max-age=0, must-revalidate` with ETag. API: `no-store`, unchanged.

## 4. Cost

Every request now invokes the Worker and counts toward the free plan's 100,000 requests a day. Measured locally on the Workers runtime (`wrangler dev`), one Bank load signed in is 6 Worker requests (the page, `style.css`, `config.js`, `platform.js`, the favicon, `GET /api/saves`), against 5 of 8 before (`config.js`, a 404 favicon, `/api/me` and two `/api/saves`; the page, stylesheet and script were served by Cloudflare without the Worker). A load that needs the resume hop adds 3 (the 401 page, its icon and favicon). Revalidations count even when they answer 304. At 7 to 9 requests a load the free plan covers roughly 11,000 page loads a day.

## 5. Not verified until the live site

- ClerkJS's real cookie behaviour on this host: that the cookie is named `__session` (not only a suffixed variant), host-only, readable by the page, and how soon it is refreshed after `getToken({ skipCache: true })`. If the name differs, every signed-in person sees the sign-in page and the resume gives up after two tries: roll back.
- That `openSignIn({ forceRedirectUrl })` and `signOut({ redirectUrl })` navigate as expected with ClerkJS 5.128.1.
- iOS Safari and an installed home-screen app: cookie persistence across launches, the resume hop, and the icon and name on the home screen.
- Real launch time. The local numbers in the change report use a fake ClerkJS that takes about 400 ms to download and 120 ms per Frontend API call.

## 6. Also changed with this record

- Saves are written to the browser first and uploaded from there (an outbox): a save survives a failed upload, a closed tab or no network, and is tagged with its owner so it is only ever uploaded into that person's account. A save made before any sign-in still moves to the first account.
- The last known saves list and first name are cached per person in this browser, shown at once on the next load and refreshed from the server; the cache is chosen by the `nl_person_id` in the cookie the Worker just accepted, and cleared on sign-out or a change of person.
- `/api/me` is no longer called by the client: the person id is read from the token ClerkJS already holds. The route stays.

## Deploy record, 2026-11-18

- Deployed from branch `release/bank-only` at `782edc0` (this work merged into the Bank-only release; Tidevault and Dungeon companion still unpublished). Version ID `02df0301-4b4c-44fd-b709-9ebdb3257109`. The version before it, to roll back to, is `7f29e51d-3614-445f-8689-606a08209558`.
- Checked on the live origin, signed out: `/`, `/bank/`, `/bank/index.html`, `/style.css`, `/platform.js`, `/signin`, an unpublished game path, an unknown path and look-alike paths under `/icons/` all answer 401 with the sign-in page and `no-store`; the six install files and `/config.js` answer 200; `/api/me` answers 401 with no header and with a cookie; a junk or unsigned `__session` cookie on a page answers 401.
- Changed in review before deploy: the gate accepts ClerkJS's suffixed cookie name (`__session_<suffix>`) as well as `__session`, checking at most four candidates.
- Owner check, 2026-11-18: a real sign-in through the gate reached the site ("Yes, I'm in"), so ClerkJS's session cookie is accepted by the Worker on the live origin.
- Not yet confirmed: the resume after the token expires, sign-out, the two-step delete on an iPhone, and the installed home-screen app. These are the owner's checks in `docs/runbooks/deploy.md`.
