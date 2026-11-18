# Build guide

How games in this repo are built, so the next one matches Bank.

## What this is

A small static site of original tabletop helpers (scorekeepers, dice) from NordgrenLabs. Plain HTML, CSS and JavaScript: no build step, no npm, no framework, no TypeScript, no Tailwind. Any static host can serve it, any file opens in a browser as is, and there is nothing to upgrade or break. Keep it that way; if a game ever needs a server, that is a separate backend (see the decisions log), not a build step here.

## Layout

```
index.html          games list
style.css           shared: tokens, backdrop, glass, buttons, top bar, sheets, segmented control, theme icon
platform.js         shared: window.NL (saves, identity, theme, top bar highlight, segmented control)
bank/index.html     one game: its own CSS and JS inline
docs/BUILD-GUIDE.md this file
docs/decisions/     decision records (0001: platform adoption)
```

Shared code lives only in `style.css` and `platform.js`. Everything game-specific (rules, screens, layout) stays inline in that game's `index.html`. Do not add a third shared file without a strong reason.

## Design system

Apple-style minimalism: system fonts, frosted glass, light and dark, quiet motion.

- **Tokens** (`style.css`, `:root`): `--canvas --solid --ink --ink2 --accent --danger --good --primary --glass --glass-strong --edge --hair --fill --thumb --shadow`, fonts `--text` and `--num` (rounded, for numbers), and the spring `--spring` / `--spring-dur` (stiffness 400, damping 30, about 0.45s). Use tokens; do not hard-code colours.
- **Glass**: add `class="glass"` to a panel. Falls back to solid under `prefers-reduced-transparency`.
- **Buttons**: `.btn`, `.btn.primary` (full width, 54px), `.btn.danger`.
- **Top bar**: `<nav class="topbar glass">` with an `<i class="hl">` first, then `.item` buttons or links, each an inline 22px SVG (`stroke="currentColor"`) plus a `<span>` label. Call `NL.topbar(nav)` once; it returns a `hide()` to call when the items change. Items are actions, not tabs: the highlight follows hover and keyboard focus and is hidden otherwise.
- **Sheets**: `<dialog class="sheet glass">` with a single inner `<div>`; open with `showModal()`. Close on backdrop click with `d.onclick = e => { if (e.target === d) d.close(); }`; Esc is native. Never use `alert()`, `confirm()` or `prompt()`: they are suppressed in some hosts.
- **Segmented control**: `<div class="segmented" role="group" aria-labelledby=...>` of `<button value=...>`. `const show = NL.segmented(group, value => ...)` wires it; call `show(value)` to mark the chosen one (sets `aria-pressed`, the thumb springs).
- **Theme**: `<html data-theme="light|dark">` holds the resolved theme; dark tokens apply under `:root[data-theme="dark"]` (with a `prefers-color-scheme` fallback when the attribute is missing). The preference `system|light|dark` is in localStorage `nl-games-theme`; `NL.theme.get()` and `NL.theme.set(p)` read and change it, and system follows the OS live. Every page needs the one-line no-flash script in `<head>` (copy it from `bank/index.html`) before the stylesheet. The Appearance control and its sun/moon icon markup are in Bank's settings sheet; the icon's CSS is `.theme-icon` in `style.css`.

Quality floor for every screen: visible keyboard focus, 44px touch targets, `prefers-reduced-motion` (global rule in `style.css`; also check it before any `element.animate()`), `prefers-reduced-transparency`, 375px wide with no horizontal scroll, light and dark both checked. Copy is plain sentence case, no all-caps labels, no em dashes, no arrows on labels. User input (player names) goes in with `textContent`, never `innerHTML`.

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
5. **Identity via `NL.identity()`**: `{ displayName, personPublicId }` or `null`. Use it to pre-fill the first player and to stamp `personPublicId` on new saves. Never store a Clerk user id or an email.

## Adding a game

1. Create `<game>/index.html`. Copy Bank's `<head>` (meta, no-flash script, `../style.css`) and its top bar and settings sheet markup as a starting point.
2. Write the rules as pure functions with asserts. Design the rules yourself; games here must be original.
3. Hold state in one object, route actions through `change()`, autosave under `nl-<game>-v1`.
4. Wire `NL.topbar`, sheets, `NL.segmented` and saves as above. Load `../platform.js` before the game script.
5. Add a `.glass.tile` link to `index.html`.
6. Preview and run the checks below.

## Preview and checks

From the repo root: `python -m http.server 8765`, then open http://localhost:8765/. (The owner's Claude launch config already serves this repo on port 8765.)

Before calling it done:

- Console clean, no failed asserts.
- Play a full short game: every action, undo, reload mid-game restores it, save, resume, delete, a finished save.
- 375x812 and a wide window; light and dark; keyboard only; reduced motion on.
- Clear test data from localStorage afterwards.

## Decisions log

- **Static, vanilla, no build.** Nothing to install or maintain; any static host works.
- **Storage behind an async adapter (`NL.saves`).** localStorage for now; a server can replace it without touching game code.
- **Control Center compatibility.** The Control Center (`C:\Projects\NordgrenLabs-Control-Center`) is Next.js 16, React 19, TypeScript and Tailwind 4 with Clerk. Platform rules live in `C:\Projects\NordgrenLabs-Platform` (NL-ADR-0002 to 0005, `docs/architecture/app-access-architecture.md`). Per those records: each app owns its own data and authorization; the Control Center never reads an app's database; apps are keyed on the `nl_person_id` claim (a UUID, `personPublicId` here), never the Clerk subject or email; apps must not hold a Clerk secret key; app hostnames follow `<app>.nordgrenlabs.com`.
- **Platform integration is decided, not yet built.** `docs/decisions/0001-platform-adoption.md` (accepted 2026-11-18) records it: sign-in with ClerkJS on `games.nordgrenlabs.com`, a small backend in `server/` that verifies the session and implements the same `NL.saves` interface keyed on `nl_person_id`, anonymous play kept, and a Control Center catalog entry. `docs/PLATFORM-INTEGRATION-PLAN.md` has the step list. Until those steps land, saves are local to the browser and `NL.identity()` reads `window.NL_IDENTITY`. The client stays static with no build step throughout.
- **Original designs only.** Bank shares only folk rules with other Bank scorekeepers; no copied layouts, art or text.
- **Bank specifics.** Standings are always sorted (banked points, or "if banked now" as a setting); rank and gap always use banked points. Rows are keyed per player and slide into place (FLIP). In the live phase the 2 and 12 keys are disabled with the label "doubles" so players learn the Doubles key.
