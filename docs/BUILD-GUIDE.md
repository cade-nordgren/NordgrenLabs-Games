# Build guide

How games in this repo are built, so the next one matches Bank.

## What this is

A small static site of original tabletop helpers (scorekeepers, dice) from NordgrenLabs. Plain HTML, CSS and JavaScript: no build step, no npm, no framework, no TypeScript, no Tailwind. Any static host can serve it, any file opens in a browser as is, and there is nothing to upgrade or break. Keep it that way; if a game ever needs a server, that is a separate backend (see the decisions log), not a build step here.

## Layout

```
site/                    the published site, and nothing else
  index.html             games list
  style.css              shared: tokens, backdrop, glass, buttons, menu, sheets, segmented control, theme icon
  platform.js            shared: window.NL (saves, identity, sign-in, theme, menu, segmented control)
  config.js              placeholder for the Worker's /config.js (Clerk publishable key); keeps the static preview signed out
  _headers               response headers for the static files on Cloudflare (nosniff)
  bank/index.html        one game: its own CSS and JS inline
  tidevault/index.html   solo dive game: its own CSS and JS inline
  dungeon/index.html     table companion for an owned dungeon board game: its own CSS and JS inline
server/                  the Worker (/api and /config.js) and its tests
migrations/              D1 schema, forward only
wrangler.jsonc           Cloudflare Worker configuration
docs/BUILD-GUIDE.md      this file
docs/decisions/          decision records (0001: platform adoption, 0002: Cloudflare hosting)
```

Only `site/` is ever published. Shared code lives only in `style.css` and `platform.js`. Everything game-specific (rules, screens, layout) stays inline in that game's `index.html`. Do not add a third shared file without a strong reason.

## Design system

Apple-style minimalism: system fonts, frosted glass, light and dark, quiet motion.

- **Tokens** (`style.css`, `:root`): `--canvas --solid --ink --ink2 --accent --danger --good --primary --glass --glass-strong --edge --hair --fill --thumb --shadow`, fonts `--text` and `--num` (rounded, for numbers), and the spring `--spring` / `--spring-dur` (stiffness 400, damping 30, about 0.45s). Use tokens; do not hard-code colours.
- **Glass**: add `class="glass"` to a panel. Falls back to solid under `prefers-reduced-transparency`.
- **Buttons**: `.btn`, `.btn.primary` (full width, 54px), `.btn.danger`.
- **Menu**: `<nav class="menu">` fixed top right, holding a `.menu-trigger.glass` button (hamburger `.bars` and `.x` SVGs) and a `.menu-items` div of `.item.glass` buttons or links, each an inline 22px SVG (`stroke="currentColor"`) plus a `<span class="glass">` label chip. Call `NL.menu(nav)` once: it handles `aria-expanded`, `inert`, Esc, outside taps and closing on a choice; mark an item `data-keep-open` (Bank's Undo) to keep the menu open after it.
- **Sheets**: `<dialog class="sheet glass">` with a single inner `<div>`; open with `showModal()`. Close on backdrop click with `d.onclick = e => { if (e.target === d) d.close(); }`; Esc is native. Never use `alert()`, `confirm()` or `prompt()`: they are suppressed in some hosts.
- **Segmented control**: `<div class="segmented" role="group" aria-labelledby=...>` of `<button value=...>`. `const show = NL.segmented(group, value => ...)` wires it; call `show(value)` to mark the chosen one (sets `aria-pressed`, the thumb springs).
- **Theme**: `<html data-theme="light|dark">` holds the resolved theme; dark tokens apply under `:root[data-theme="dark"]` (with a `prefers-color-scheme` fallback when the attribute is missing). The preference `system|light|dark` is in localStorage `nl-games-theme`; `NL.theme.get()` and `NL.theme.set(p)` read and change it, and system follows the OS live. Every page needs the one-line no-flash script in `<head>` (copy it from `bank/index.html`) before the stylesheet. The Appearance control and its sun/moon icon markup are in Bank's settings sheet; the icon's CSS is `.theme-icon` in `style.css`.

Quality floor for every screen: visible keyboard focus, 44px touch targets, `prefers-reduced-motion` (global rule in `style.css`; also check it before any `element.animate()`), `prefers-reduced-transparency`, 375px wide with no horizontal scroll, light and dark both checked. Game pieces need at least 3:1 contrast against the panel they sit on in both themes, measured rather than eyeballed: Bank's white dice were about 1.1:1 on the light glass, so dice now use the `--die`, `--die-edge` and `--pip` tokens in `style.css` (dark dice with white pips in light, white dice with dark pips in dark). Check phones in landscape too (667x375), under `(orientation: landscape) and (max-height: 540px)`: keep content clear of the menu circle, sheets scroll, layouts respect `env(safe-area-inset-*)` on all four sides, and text inputs stay at 16px or larger so iOS does not zoom on focus. Copy is plain sentence case, no all-caps labels, no em dashes, no arrows on labels. User input (player names) goes in with `textContent`, never `innerHTML`.

## Per-game contract

1. **Rules are pure functions** with `console.assert` self-checks right under them (Bank: `applyRoll`, `standings`). No DOM in rule functions.
2. **All game actions go through `change(fn)`**, which pushes a snapshot to an undo history (capped) before mutating, then renders. Undo pops a snapshot.
3. **Autosave**: the whole game state is written to localStorage on every render under a versioned key (`nl-<game>-vN`). Bump N when the shape changes. Check the shape when reading it back.
4. **Saves via `NL.saves`** (all async): `list(game)` newest first, `get(id)`, `put(record)`, `remove(id)`. Record shape:

   ```
   { schemaVersion: 1, id: crypto.randomUUID(), game: "<game>", personPublicId: <uuid or null>,
     title: string, status: "in_progress" | "finished", createdAt: <ISO UTC>, updatedAt: <ISO UTC>,
     state: { ...owned by the game... } }
   ```

   camelCase, lowercase hyphenated UUIDs, ISO-8601 UTC, integer schema versions. `NL.saves` drops records that fail this shape; the game must also validate its own `state` before playing it (stored data is a trust boundary). Saving a resumed game reuses its `id` and `createdAt`. Keep a capped slice of undo history in `state` so undo survives resume.

   Signed out, saves live in this browser's localStorage. Signed in as a person the server knows, the same four calls go to the games server, and saves made in the browser while signed out move to the account once. A signed-in call rejects when the server is unreachable or refuses (it never falls back to localStorage), so catch it: show the save as failed, and treat a failed `list` as empty. A `get` for an id the server does not have logs a 404 in the browser console; that is expected.
5. **Identity via `NL.identity()`**: `{ displayName, personPublicId }` or `null`. It is `null` until `NL.ready` resolves (to the same value) when sign-in is configured, and `displayName` can be empty for a signed-in person. Pre-fill the first player in `NL.ready.then(...)`, only into an empty roster with no game in progress, and stamp `personPublicId` on new saves. Put `NL.account(el)` in the game's settings sheet for the shared sign-in control; it stays hidden without a key. Never store a Clerk user id or an email.

## Adding a game

1. Create `site/<game>/index.html`. Copy Bank's `<head>` (meta, no-flash script, `../style.css`) and its menu and settings sheet markup as a starting point.
2. Write the rules as pure functions with asserts. Design the rules yourself; games here must be original.
3. Hold state in one object, route actions through `change()`, autosave under `nl-<game>-v1`.
4. Wire `NL.menu`, sheets, `NL.segmented` and saves as above. Load `<script src="../config.js"></script>` then `<script src="../platform.js"></script>` before the game script.
5. Add a `.glass.tile` link to `site/index.html`.
6. Preview and run the checks below.

## Preview and checks

From the repo root: `python -m http.server 8765 --directory site`, then open http://localhost:8765/. It runs signed out. To run the Worker and the site together, with a local D1 and still signed out, use `cd server && npm run dev` and open http://localhost:8787/.

Before calling it done:

- Console clean, no failed asserts.
- Play a full short game: every action, undo, reload mid-game restores it, save, resume, delete, a finished save.
- 375x812 and a wide window; light and dark; keyboard only; reduced motion on.
- Clear test data from localStorage afterwards.

## Server

Production is one Cloudflare Worker on the free plan (decision 0002). Workers static assets serve `site/` directly; the Worker in `server/worker.js` runs first only for `/api/*` and `/config.js`, and also answers any request no file matched. It verifies Clerk session tokens offline in `server/seam.js` (decision 6 of the adoption record). Plain JavaScript modules, no build step of our own: wrangler bundles the Worker. Its only runtime dependency is `@clerk/backend`, and its only dev dependency is `wrangler`, both pinned exactly. `wrangler.jsonc` holds the three public Clerk values and nothing secret. The Worker answers 503 `misconfigured` if any other `CLERK_` variable is present or if only some of the three are set; all three empty is the signed-out `dev` environment.

Run the tests with `cd server && npm install && npm test`. They call the real Worker handler against a real local D1 from wrangler's `getPlatformProxy()`, with a throwaway key pair; they need no network, no Cloudflare login and no real keys. `npm run check` adds a `wrangler deploy --dry-run`.

The saves API in `server/saves.js` backs the four `NL.saves` methods: `GET /api/saves?game=<game>` is `list`, `GET /api/saves/<id>` is `get`, `PUT /api/saves/<id>` is `put` and `DELETE /api/saves/<id>` is `remove`. Every save is keyed on the verified `nl_person_id`, so another person's save always answers 404, and the `personPublicId` a client sends is replaced with the verified one. Saves live in the D1 database `games` (schema in `migrations/`), and each person may keep 200 saves of at most 256 KB each. D1 has no interactive transactions, so every ownership or cap check sits in the same statement as the read or write it guards.

A new game folder under `site/` ships without any change to the Worker. Anything that must not be public stays outside `site/`. `docs/runbooks/deploy.md` has the release steps.

## Decisions log

- **Static, vanilla, no build.** Nothing to install or maintain; any static host works.
- **Storage behind an async adapter (`NL.saves`).** localStorage when signed out, the games server when signed in, with no change to game code.
- **Control Center compatibility.** The Control Center (`C:\Projects\NordgrenLabs-Control-Center`) is Next.js 16, React 19, TypeScript and Tailwind 4 with Clerk. Platform rules live in `C:\Projects\NordgrenLabs-Platform` (NL-ADR-0002 to 0005, `docs/architecture/app-access-architecture.md`). Per those records: each app owns its own data and authorization; the Control Center never reads an app's database; apps are keyed on the `nl_person_id` claim (a UUID, `personPublicId` here), never the Clerk subject or email; apps must not hold a Clerk secret key; app hostnames follow `<app>.nordgrenlabs.com`.
- **Platform integration is built in this repo, not yet live.** `docs/decisions/0001-platform-adoption.md` (accepted 2026-11-18) records it: sign-in with ClerkJS on `games.nordgrenlabs.com`, a small backend in `server/` (now a Cloudflare Worker with D1, decision 0002) that verifies the session and implements the same `NL.saves` interface keyed on `nl_person_id`, anonymous play kept, and a Control Center catalog entry. `docs/PLATFORM-INTEGRATION-PLAN.md` has the step list; deployment and the catalog entry are still to do, and real sign-in has not been exercised. Under the plain static preview everything runs signed-out and `NL.identity()` reads `window.NL_IDENTITY`. The client stays static with no build step throughout.
- **Hosted on Cloudflare, free plan only.** `docs/decisions/0002-cloudflare-hosting.md` (2026-11-18) moved Games from a container on the home VM to one Worker with static assets and D1, so the site stays up when the home connection drops. Any paid plan or any other Cloudflare product is a stop-and-ask for the owner.
- **Original designs only.** Bank shares only folk rules with other Bank scorekeepers; no copied layouts, art or text.
- **Bank specifics.** Standings are always sorted (banked points, or "if banked now" as a setting); rank and gap always use banked points. Rows are keyed per player and slide into place (FLIP). In the live phase the 2 and 12 keys are disabled with the label "doubles" so players learn the Doubles key.
- **Tidevault specifics.** A solo push-your-luck dive on a 7x7 map revealed room by room from a weighted bag, driven by a seeded PRNG kept in the run (`g.rng`) so runs replay and undo restores the dice too. Every finished run (surfaced, drowned or caught by the tide) saves itself once as a finished record titled with its relic value, and Best runs ranks those; Undo is off once a run is over.
- **Dungeon companion specifics.** A helper used beside a physical dungeon board game the owner already has, like Bank is a scorekeeper. It holds no published content (no card texts, art, hero names, title or branding): players type their own hero numbers, and it only tracks HP, gold, vault cards, status, the sun (1 to 27), d12 stat tests, the 8-card guardian deck and a simple fight tally. Plain rolls skip the undo history; everything else goes through `change()`. Escaped heroes rank by gold plus the vault card value typed in at the end; nobody escaped means the castle wins.
