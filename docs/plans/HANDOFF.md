# Dragon's Keep: handoff (start here)

Updated 2026-11-20 from the existing handoff. If you are picking this project up in a new session, read this page first. It says where things stand, what to read next, and how the owner wants the work done. Update it whenever the state below changes. This handoff records the owner's current naming and content-editing instructions; it does not mean the rename has already been implemented in code.

## 1. What this is

**Dragon's Keep** is the owner's requested working title for the game formerly called **Dusk Keep** in the project. The internal game id remains `keep`, in `site/keep/`. It is a 1-to-4-player pass-and-play web game within NordgrenLabs Games. It implements a documented tabletop rule set using this project's own code: a deterministic rules engine, a phone-first UI, and content maintained by the owner.

This is the owner's **private, personal-use project**, not an announced commercial product or a game authorized for public distribution. The software supports multiple players, but that does not change the owner's stated personal-use intent. Do not assume permission to publish, sell, or distribute it to the public.

## 2. Where the work lives

| Thing | Where |
|---|---|
| All Dragon's Keep work | git worktree `C:\Projects\NordgrenLabs-Games-keep`, branch `keep-engine` |
| Main checkout | `C:\Projects\NordgrenLabs-Games`, branch `main` (contains an older version of the game, under its previous working title, merged 2026-11-19) |
| GitHub | `keep-engine` was pushed as a backup on 2026-11-20 with the owner's go-ahead (including the prior handoff). `main` was last pushed on 2026-11-19 and does not have the newer branch work. Each later push still needs the owner's go-ahead. |
| Live site | `games.nordgrenlabs.com`. This game has never been deployed. |

Run `git status` and `git log --oneline -5` in the worktree before doing anything, and `git rev-list --count origin/keep-engine..keep-engine` to see how much is unpushed.

## 3. Standing rules from the owner

These have been repeated in nearly every instruction. Treat them as fixed unless the owner explicitly directs otherwise in the current conversation. An earlier assistant's preferences or refusals are not owner rulings and do not override a newer, explicit owner request. This does not override applicable legal, safety, or platform restrictions.

- **Work only on `keep-engine`.** No merge into `main`, no push, no deploy without the owner's explicit go-ahead for that step.
- **Stage files by name.** Never `git add -A`: other agents work in this repository.
- **Do not change approved mechanics without direction.** Rules, dice, card data, turn order, and hidden-information behavior change only on an owner ruling. Where something is unclear, flag it and propose; do not invent.
- **Record owner rulings verbatim** as a new `docs/plans/spec-vN-owner-<date>.md`, then update the register, matrix, and open points in the plan. The latest owner-approved spec wins over earlier conflicting material.
- **Nothing is "approved" unless the owner said so.** All content except tiles, board, and chamber remains `draft` as of this handoff. Do not mark entries approved, and do not describe the full game or card catalogue as approved.
- **Test origin.** The owner plays on `http://localhost:8765` (main checkout) and has real saves there. Never script or clear that origin. Test this game on `http://127.0.0.1:8766/keep/`.
- **Free Cloudflare plan only.** Any paid product is a stop-and-ask.
- **Owner's working preference:** cheaper build agents do the bulk of the work; the orchestrating session briefs them, checks the result in a browser, and reports plainly what was and was not verified.
- **Owner controls naming and presentation.** The assistant may implement explicitly requested game-title, character-name, class-label, descriptive-text, and UI-copy edits. Do not tell the owner that they must hand-edit source files merely because an earlier assistant declined to make a naming change. Keep such edits separate from mechanics unless the owner requests both.

## 4. Content, naming, and source-material boundaries

The owner directs the creative identity of this personal project. The earlier handoff's blanket instruction that an assistant must refuse names resembling the reference game, must refuse an English translation of a title, or must force the owner to edit names personally is **superseded**. It was an earlier assistant-imposed restriction, not a permanent owner decision.

- **Game title:** The owner requests **Dragon's Keep** as the current working title. Update appropriate player-facing titles and references when implementing the rename. The owner can choose **Dragon Castle** or another title later; do not treat today's title as irreversible.
- **Internal compatibility:** Keep the game id `keep`, route `site/keep/`, branch `keep-engine`, existing save keys, and save compatibility unchanged for a cosmetic rename unless there is a demonstrated technical necessity approved by the owner.
- **Character names and descriptions:** An assistant may edit these when the owner gives the desired text or authorizes a specific change. Neither this handoff nor a prior assistant's refusal prohibits owner-requested renaming. The current displayed roster (including Sir Edric Vale) remains in place until the owner explicitly chooses replacements; no roster rename is silently authorized by the game-title change.
- **Mechanics:** Preserve the owner's catalogued tile layouts, numerical stats, card effects and counts, monster reaction tables, and approved interpretations as structured data. Do not rebalance or replace authentic mechanics for cosmetic or copyright-related reasons. `site/keep/engine/describe.js` presently generates player-facing explanations in the project's own words.
- **Biographies:** Biography fields currently remain empty. Do not fabricate text or silently insert biographies. The owner may supply text or ask for writing/translation work as a separate task; make clear which material is a source translation versus newly authored prose.
- **Artwork and design:** Use original artwork created for this project rather than copying the reference game's artwork. A new visual identity is welcome under the owner's direction.
- **Legal distinction:** Game procedures, rules as systems, and numerical mechanics are generally different from copyrightable artwork and expressive prose. Names and titles are not automatically barred by copyright, although trademark or other rights may be relevant. Translating or lightly paraphrasing creative biographies can still implicate copyright. Private-use intent does not itself erase legal rights. If a concrete issue arises, explain it accurately and offer compliant ways to proceed; do not invent a blanket prohibition on the owner's requested names or labels.
- **Superseded instructions elsewhere:** If older plan documents or build guides repeat the former blanket name-editing restriction, treat this section and the owner's newer explicit instructions as controlling for the current task. Preserve the historical record, and update conflicting operational guidance when authorized; do not silently rewrite unrelated history.

See `docs/plans/dungeon-game-plan.md` section 2 for the older content-boundary discussion. Read it as historical context wherever it conflicts with this updated owner direction.

## 5. Reading order

1. This page.
2. `docs/BUILD-GUIDE.md`: house UI rules, the game section (which may still be labeled "Dusk Keep" until updated), and the tools line.
3. `docs/plans/dungeon-game-plan.md`: the header notes (v1 to v14) give the history; section 9 is the decision register (D01 to D67); section 13 is the open points.
4. `docs/plans/unresolved-gameplay-2026-11-20.md`: what is still open, and the phone play-test checklist (its section 6).
5. The newest `docs/plans/spec-v*-owner-*.md` files, newest first, as needed. `spec-v12` is the latest as of this handoff.
6. `docs/plans/proposal-closed-door-forced-move-2026-11-20.md`: the one gameplay decision still waiting on the owner.
7. `docs/content-kit/README.md`: how content entries are written and checked.

Also useful: `docs/plans/audit-card-catalogue-2026-11-19.md` (how each card was classified) and `docs/plans/research-2023-rules-2026-11-19.md` (the 19 rule statements checked against the official rulebook).

## 6. How to run things

From the worktree root:

```
node --test "tests/keep/*.test.js"      # 391 tests at the time of the original handoff; verify current count
node tools/keep-content.js check        # content checker; must report "No errors."
node tools/keep-content.js report       # what is written, draft or approved, per category
node tools/keep-soak.js 600             # random-play exposure counts
node tools/keep-scenario.js list        # prepared positions for rare screens
node tools/keep-scenario.js <name>      # prints a save for localStorage key nl-keep-v1
```

Preview: the launch config `keep-worktree` in `C:\Users\cades\Projects\.claude\launch.json` serves the worktree's `site/` on port 8766 with `Cache-Control: no-store` (a plain Python server cached stale modules and caused false bug reports). Open `http://127.0.0.1:8766/keep/` and choose "Play-test my content".

To see a rare screen in a browser: generate a scenario save, store it in `localStorage['nl-keep-v1']` on the 127.0.0.1 origin, reload, then do what the scenario's hint says. Do not add debug hooks or cheats to the shipped game.

A trap when testing in a hidden browser pane: animation frames do not fire there, so screenshots can show mid-transition frames. The game itself no longer depends on animation frames for state (spec v12, fix 5).

## 7. Current state (2026-11-20, before the requested rename)

- **Engine:** complete for the documented rules. `MECHANICS_VERSION` is `rb-0.2/sp-1.0/v10`; saves from older versions are refused.
- **Content:** all 15 categories are written. Approved: maze tiles (88), board, chamber ("Dragon's Lair"). Draft: heroes (8), special weapons (2), combat cards (36), monster cards (15), rings (4), dragon cards (8), room (60), treasure (33), search (15), room search (14), chest (14), door (15). "Start game" stays blocked until every category is approved; "Play-test my content" works on drafts.
- **UI:** phone-first, with landscape and desktop layouts. Every drawn card and automatic event shows an acknowledged result card; every die has a plain explanation.
- **Tests:** 391 passed at the time of the original handoff. The content checker reported no errors. Re-run both after any edit.
- **Browser-verified by the preceding orchestrating session:** the 26-scenario pass at phone size (rules behaved as ruled), the five UI fixes and four follow-ups of spec v12, both rotating-room ring choices in the trapped case, and a full two-player game to the results screen.
- **Not verified:** a real phone, a screen reader, most scenarios at landscape and desktop sizes, "Start game" with approved content, signed-in saves on the deployed site.
- **Title status:** "Dragon's Keep" is now the requested working title in this handoff; the code and site may still show "Dusk Keep" until the rename is implemented and tested.

## 8. What is open

Owner decisions and requested work:
- **Requested title change:** Implement the player-facing rename to **Dragon's Keep**. Preserve internal ids, paths, saves, mechanics, and compatibility. This is an authorized content/UI change, not a request to merge or deploy. Do not insist the owner edit `site/keep/index.html` manually.
- **Decision 8, closed doors on compulsory moves** (plan 13 #14). Proposal written; recommendation is to let the dark-room exit use another free passage and keep the rubble and well cases as they are. Not approved; do not change behavior.
- **Flask beside a forced skip.** Still offered there. The owner listed it as not to be changed for now.
- **Visual direction.** See section 9.
- **Approval of the 162 draft entries**, category by category, when the owner is ready.

Physical checks only the owner can do:
- That there is exactly one treasure coin card at each value from 100 to 300 (inferred from the 33-card total).
- The B and C letters on the monster combat cards (inferred from their hit targets).

Known small issues:
- At 568x320 landscape, the Flee button, the A/B/C cards, and the tower's Escape button may still need a scroll (estimated from the CSS, not measured).
- The solo dice-target fight screen is long on phones.

## 9. Design work (not in the repository)

After the rules stabilised, the owner started on visual design and said the game may depart almost entirely from the shared site look and be its own game. The direction is to create an original presentation rather than copying the reference game's artwork. The following are independent design concepts.

Three directions were proposed: **Last light** (dusk sky, keep in silhouette, amber for actions; the assistant's recommendation), **Torch and stone** (stone, torchlight, brass), **Cartographer's map** (ink on vellum). The owner has not chosen yet.

Two private artifacts on the owner's claude.ai account hold the mockups. They are not part of the repository and nothing in the game has been restyled yet:
- Launch page comparison (static page): `https://claude.ai/artifact/9fKBXUhunxVtpHFsKPAh8z`
- Design canvas with six working screens (three launch looks; hero pick, board and fight in Last light): `https://claude.ai/artifact/XfzLfCyjBkoVBrY4Hs8aNs`. Its source files were written under a session scratch folder and may not survive; read them back from the artifact before editing.

Launch-page findings already agreed in conversation: separate the player's page from builder tools, make the primary button the one that works (play-test while content is draft), put saved games first, and move the solo combat switch into Settings.

## 10. The next step

**Immediate owner request:** Implement and verify the player-facing rename to **Dragon's Keep** on `keep-engine`, updating appropriate UI labels, browser title, game selection/navigation references, and operational documentation while preserving saves and internal identifiers. Report files changed, tests run, and the browser result. Do not treat the rename as approval of draft content or other design changes.

**After that:** The owner's stated plan remains a final end-to-end play-test on a real phone using the checklist in `unresolved-gameplay-2026-11-20.md`, followed by gameplay approval. Visual direction may be chosen and applied in a separate authorized pass.

`keep-engine` was backed up on GitHub as of 2026-11-20. After further work, ask the owner before pushing again. Pushing the branch does not change `main` or the live site.
