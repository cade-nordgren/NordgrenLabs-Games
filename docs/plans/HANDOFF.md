# Dusk Keep: handoff (start here)

Written 2026-11-20. If you are picking this project up in a new session, read this page first. It says where things stand, what to read next, and how the owner wants the work done. Update it whenever the state below changes.

## 1. What this is

"Dusk Keep" (working title; game id `keep`, folder `site/keep/`) is a 1 to 4 player pass-and-play web game in the NordgrenLabs Games site. It implements a documented tabletop rule set in our own code: a deterministic rules engine, a phone-first UI, and content slots the owner fills. It is the owner's personal project, played with friends behind the site's sign-in.

## 2. Where the work lives

| Thing | Where |
|---|---|
| All Dusk Keep work | git worktree `C:\Projects\NordgrenLabs-Games-keep`, branch `keep-engine` |
| Main checkout | `C:\Projects\NordgrenLabs-Games`, branch `main` (has an older Dusk Keep, merged 2026-11-19) |
| GitHub | `keep-engine` was pushed as a backup on 2026-11-20 with the owner's go-ahead (including this page). `main` was last pushed on 2026-11-19 and does not have this work. Each later push still needs the owner's go-ahead. |
| Live site | `games.nordgrenlabs.com`. Dusk Keep has never been deployed. |

Run `git status` and `git log --oneline -5` in the worktree before doing anything, and `git rev-list --count origin/keep-engine..keep-engine` to see how much is unpushed.

## 3. Standing rules from the owner

These have been repeated in nearly every instruction. Treat them as fixed unless the owner says otherwise in the current conversation.

- **Work only on `keep-engine`.** No merge into `main`, no push, no deploy without the owner's explicit go-ahead for that step.
- **Stage files by name.** Never `git add -A`: other agents work in this repository.
- **Do not change approved mechanics.** Rules, dice, card data, turn order and hidden-information behaviour change only on an owner ruling. Where something is unclear, flag it and propose; do not invent.
- **Record owner rulings verbatim** as a new `docs/plans/spec-vN-owner-<date>.md`, then update the register, matrix and open points in the plan. The latest spec wins over earlier ones.
- **Nothing is "approved" unless the owner said so.** All content except tiles, board and chamber is `draft`. Do not mark entries approved, and do not describe the game or the card catalogue as approved.
- **Test origin.** The owner plays on `http://localhost:8765` (main checkout) and has real saves there. Never script or clear that origin. Test Dusk Keep on `http://127.0.0.1:8766/keep/`.
- **Free Cloudflare plan only.** Any paid product is a stop-and-ask.
- **Owner's working preference:** cheaper build agents do the bulk of the work; the orchestrating session briefs them, checks the result in a browser, and reports plainly what was and was not verified.

## 4. The content boundary

The engine implements the rules. The published game's own identity stays out of what the assistant builds:

- The assistant does not enter the published game's hero names, character biographies, card wording or artwork, and does not rename the game to the published title or its translation. The owner may edit names themselves (`site/keep/content/original/heroes.js`, and the title in `site/keep/index.html`).
- Mechanical data the owner catalogued from their own copy (tile layouts, stat lines, card effects and counts, monster reaction tables) is entered as structured data. Player-facing text is generated in our own words by `site/keep/engine/describe.js`.
- Biography fields stay empty until the owner supplies their own text. All artwork must be original to this project.
- The current hero roster on screen (Sir Edric Vale and so on) is the owner's own earlier proposal. The owner later asked for a different set of working names; the assistant declined to enter those and the owner chose to keep this roster for now.

See plan section 2 for the full statement.

## 5. Reading order

1. This page.
2. `docs/BUILD-GUIDE.md`: house UI rules, the Dusk Keep section, and the tools line.
3. `docs/plans/dungeon-game-plan.md`: the header notes (v1 to v14) give the history; section 9 is the decision register (D01 to D67); section 13 is the open points.
4. `docs/plans/unresolved-gameplay-2026-11-20.md`: what is still open, and the phone play-test checklist (its section 6).
5. The newest `docs/plans/spec-v*-owner-*.md` files, newest first, as needed. `spec-v12` is the latest.
6. `docs/plans/proposal-closed-door-forced-move-2026-11-20.md`: the one gameplay decision still waiting on the owner.
7. `docs/content-kit/README.md`: how content entries are written and checked.

Also useful: `docs/plans/audit-card-catalogue-2026-11-19.md` (how each card was classified) and `docs/plans/research-2023-rules-2026-11-19.md` (the 19 rule statements checked against the official rulebook).

## 6. How to run things

From the worktree root:

```
node --test "tests/keep/*.test.js"      # 391 tests at the time of writing; about 40 seconds
node tools/keep-content.js check        # content checker; must report "No errors."
node tools/keep-content.js report       # what is written, draft or approved, per category
node tools/keep-soak.js 600             # random-play exposure counts
node tools/keep-scenario.js list        # prepared positions for rare screens
node tools/keep-scenario.js <name>      # prints a save for localStorage key nl-keep-v1
```

Preview: the launch config `keep-worktree` in `C:\Users\cades\Projects\.claude\launch.json` serves the worktree's `site/` on port 8766 with `Cache-Control: no-store` (a plain Python server cached stale modules and caused false bug reports). Open `http://127.0.0.1:8766/keep/` and choose "Play-test my content".

To see a rare screen in a browser: generate a scenario save, store it in `localStorage['nl-keep-v1']` on the 127.0.0.1 origin, reload, then do what the scenario's hint says. Do not add debug hooks or cheats to the shipped game.

A trap when testing in a hidden browser pane: animation frames do not fire there, so screenshots can show mid-transition frames. The game itself no longer depends on animation frames for state (spec v12, fix 5).

## 7. Current state (2026-11-20)

- **Engine:** complete for the documented rules. `MECHANICS_VERSION` is `rb-0.2/sp-1.0/v10`; saves from older versions are refused.
- **Content:** all 15 categories are written. Approved: maze tiles (88), board, chamber ("Dragon's Lair"). Draft: heroes (8), special weapons (2), combat cards (36), monster cards (15), rings (4), dragon cards (8), room (60), treasure (33), search (15), room search (14), chest (14), door (15). "Start game" stays blocked until every category is approved; "Play-test my content" works on drafts.
- **UI:** phone-first, with landscape and desktop layouts. Every drawn card and automatic event shows an acknowledged result card; every die has a plain explanation.
- **Tests:** 391 pass. The content checker reports no errors.
- **Browser-verified by the orchestrating session:** the 26-scenario pass at phone size (rules behaved as ruled), the five UI fixes and four follow-ups of spec v12, both rotating-room ring choices in the trapped case, a full two-player game to the results screen.
- **Not verified:** a real phone, a screen reader, most scenarios at landscape and desktop sizes, "Start game" with approved content, signed-in saves on the deployed site.

## 8. What is open

Owner decisions:
- **Decision 8, closed doors on compulsory moves** (plan 13 #14). Proposal written; recommendation is to let the dark-room exit use another free passage and keep the rubble and well cases as they are. Not approved; do not change behaviour.
- **Flask beside a forced skip.** Still offered there. The owner listed it as not to be changed for now.
- **The game's name.** "Dusk Keep" is a working title. The owner asked for a rename to the published title in translation; the assistant declined and offered original alternatives. Unsettled.
- **Visual direction.** See section 9.
- **Approval of the 162 draft entries**, category by category, when the owner is ready.

Physical checks only the owner can do:
- That there is exactly one treasure coin card at each value from 100 to 300 (inferred from the 33-card total).
- The B and C letters on the monster combat cards (inferred from their hit targets).

Known small issues:
- At 568x320 landscape, the Flee button, the A/B/C cards and the tower's Escape button may still need a scroll (estimated from the CSS, not measured).
- The solo dice-target fight screen is long on phones.

## 9. Design work (not in the repository)

After the rules stabilised, the owner started on visual design and said the game may depart almost entirely from the shared site look and be its own game. The assistant will not mimic the published game's look; the directions below are original.

Three directions were proposed: **Last light** (dusk sky, keep in silhouette, amber for actions; the assistant's recommendation), **Torch and stone** (stone, torchlight, brass), **Cartographer's map** (ink on vellum). The owner has not chosen yet.

Two private artifacts on the owner's claude.ai account hold the mockups. They are not part of the repository and nothing in the game has been restyled yet:
- Launch page comparison (static page): `https://claude.ai/artifact/9fKBXUhunxVtpHFsKPAh8z`
- Design canvas with six working screens (three launch looks; hero pick, board and fight in Last light): `https://claude.ai/artifact/XfzLfCyjBkoVBrY4Hs8aNs`. Its source files were written under a session scratch folder and may not survive; read them back from the artifact before editing.

Launch-page findings already agreed in conversation: separate the player's page from builder tools, make the primary button the one that works (play-test while content is draft), put saved games first, and move the solo combat switch into Settings.

## 10. The next step

The owner's stated plan: a final end-to-end play-test on a real phone using the checklist in `unresolved-gameplay-2026-11-20.md`, then gameplay approval, rather than another build phase. In parallel, choose a visual direction and apply it to the real screens.

`keep-engine` is backed up on GitHub as of 2026-11-20. After further work, ask the owner before pushing again. Pushing the branch does not change `main` or the live site.
