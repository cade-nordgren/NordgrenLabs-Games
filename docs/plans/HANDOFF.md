# Dragon's Keep: handoff (start here)

Updated 2026-11-23. If you are picking this project up in a new session, read this page first. It says where things stand, what to read next, and how the owner wants the work done. Update it whenever the state below changes.

## 1. What this is

**Dragon's Keep** (formerly the working title Dusk Keep) is a 1-to-4-player pass-and-play web game within NordgrenLabs Games. The internal game id is `keep`, in `site/keep/`. It implements a documented tabletop rule set in this project's own code: a deterministic rules engine, a phone-first UI, original artwork supplied by the owner, and content the owner catalogued and approved.

This is the owner's **private, personal-use project**. It sits behind sign-in on the owner's site (sign-ups are waitlist-only). Do not assume permission to publish, sell, or distribute it to the public; doing so would need IP advice first.

## 2. Where the work lives

| Thing | Where |
|---|---|
| All Dragon's Keep work | git worktree `C:\Projects\NordgrenLabs-Games-keep`, branch `keep-engine` (pushed to GitHub) |
| Main checkout | `C:\Projects\NordgrenLabs-Games`, branch `main`. keep-engine is merged into it (last 7b8bd5c, 2026-11-22). |
| Release branch | `release/bank-only`, worktree `C:\Projects\NordgrenLabs-Games-release`. The live site is deployed from it. It carries Bank, Dragon's Keep, and the other agent's DiceLanes game (now renamed Crossix). |
| Live site | `https://games.nordgrenlabs.com/keep/`, sign-in required. Dragon's Keep was last deployed 2026-11-22 as Worker version b97641a8 (release 3868d47). |

Run `git status` and `git log --oneline -5` in the worktree before doing anything, and `git rev-list --count origin/keep-engine..keep-engine` to see how much is unpushed.

## 3. Standing rules from the owner

Treat these as fixed unless the owner explicitly directs otherwise in the current conversation.

- **Work only on `keep-engine`.** No merge into `main`, no push, no deploy without the owner's explicit go-ahead for that step. An approval covers that one step only.
- **Stage files by name.** Never `git add -A`: other agents work in this repository (one builds Crossix on `main` and the release branch).
- **Do not change approved mechanics without direction.** Rules, dice, card data, turn order, and hidden-information behavior change only on an owner ruling. Where something is unclear, flag it and propose; do not invent.
- **Record owner rulings verbatim** as a new `docs/plans/spec-vN-owner-<date>.md`. The latest owner-approved spec wins over earlier conflicting material. `spec-v15` is the latest.
- **Approval.** Every content category is approved (specs v13 and v14). Do not mark anything new approved unless the owner says so.
- **Test origin.** The owner plays on `http://localhost:8765` and has real saves there. Never script or clear that origin. Test this game on `http://127.0.0.1:8766/keep/`.
- **Free Cloudflare plan only.** Any paid product is a stop-and-ask.
- **Owner's working preference:** cheaper build agents do the bulk of the work; the orchestrating session briefs them, checks the result in a browser, and reports plainly what was and was not verified.
- **Owner controls naming and presentation.** Implement title, name, label and UI-copy edits the owner asks for. Keep them separate from mechanics unless the owner asks for both.
- **Compatibility.** Keep the game id `keep`, route `site/keep/`, save key `nl-keep-v1`, and save compatibility unless the owner approves a change.

## 4. Content, naming, and source-material boundaries

- **Mechanics:** Preserve the owner's catalogued tile layouts, numerical stats, card effects and counts, monster reaction tables, and approved interpretations as structured data. `site/keep/engine/describe.js` generates the player-facing explanations in the project's own words.
- **Artwork:** Original art made for this project only, never the reference game's artwork. The owner's hero, monster and dragon art is in `site/keep/art/`.
- **Biographies and poses:** The owner ruled on 2026-11-23 that neither is needed (spec v15). Biography fields stay empty, and each hero keeps its single pose. Do not write biographies or propose new poses.
- **Legal distinction:** Game procedures and numerical mechanics differ from copyrightable artwork and expressive prose. Names and titles are not automatically barred by copyright, but trademark may matter. Private-use intent does not erase anyone's rights. If a concrete issue comes up, explain it accurately and offer ways to proceed.

`docs/plans/dungeon-game-plan.md` section 2 has the older content-boundary discussion; read it as history where it conflicts with this page.

## 5. Reading order

1. This page.
2. `docs/BUILD-GUIDE.md`: house UI rules, the game section (still labeled "Dusk Keep" in places), and the tools line.
3. The newest `docs/plans/spec-v*-owner-*.md` files, newest first, as needed (v15, v14, v13, v12...).
4. `docs/plans/redesign-build-2026-11-21.md`: how the current look was built.
5. `docs/plans/dungeon-game-plan.md`: the header notes give the history; section 9 is the decision register (D01 to D67); section 13 is the open points.
6. `docs/plans/proposal-closed-door-forced-move-2026-11-20.md`: the one gameplay decision still waiting on the owner.
7. `docs/content-kit/README.md`: how content entries are written and checked.

## 6. How to run things

From the worktree root:

```
node --test "tests/keep/*.test.js"      # 392 tests pass as of 2026-11-22
node tools/keep-content.js check        # content checker; must report "No errors."
node tools/keep-content.js report       # what is written, draft or approved, per category
node tools/keep-soak.js 600             # random-play exposure counts
node tools/keep-scenario.js list        # prepared positions for rare screens
node tools/keep-scenario.js <name>      # prints a save for localStorage key nl-keep-v1
```

Preview: the launch config `keep-worktree` in `C:\Users\cades\Projects\.claude\launch.json` serves the worktree's `site/` on port 8766 with `Cache-Control: no-store`. Open `http://127.0.0.1:8766/keep/` and choose Start game. `keep-phone` (port 8767, all interfaces) exists for testing on a phone over the LAN; stop it when done.

To see a rare screen: generate a scenario save, store it in `localStorage['nl-keep-v1']` on the 127.0.0.1 origin, reload, then follow the scenario's hint. Do not add debug hooks or cheats to the shipped game.

In a hidden browser pane animation frames do not fire, so screenshots can show mid-transition frames.

File endings: `site/keep/index.html` is CRLF; `ui/app.js` and `ui/board.js` are LF. Git Bash `sed -i` silently turns CRLF into LF on this PC, so edit with Python (`newline=''`) and check endings before committing. `index.html` has two `<style>` blocks; the spec-v12 test reads the last `@media (orientation: landscape) and (max-height: 540px) {` block, so word any new landscape query differently.

### Shipping a change (each step needs the owner's go-ahead)

1. Commit on keep-engine, run the tests in a clean worktree, push keep-engine.
2. In `main`: `git merge --no-ff keep-engine`, run the keep tests and `cd server && npm ci && npm run check` in a clean worktree, push.
3. In the release worktree: `git checkout keep-engine -- site/keep`, commit, push.
4. Before deploying, compare `npx wrangler deployments list` with the release log. Everything else on the release branch should already be live, so that nothing unreleased from the other agent ships.
5. In a clean worktree of the release, run `cd server && npm ci && npm run check`. The dry run should list only DB, ASSETS and the three CLERK variables. Then run `npm run deploy`.
6. Signed out, `/`, `/keep/` and `/api/me` return 401, the manifest returns 200, and `config.js` has the pk_live key. Remove the scratch worktree.

Roll back with `npx wrangler rollback` only with the owner's go-ahead.

## 7. Current state (2026-11-23)

- **Engine:** complete for the documented rules. `MECHANICS_VERSION` is `rb-0.2/sp-1.0/v10`; saves from older versions are refused.
- **Content:** all 15 categories are written and approved (314 slots), so Start game is the way in and the play-test banner is gone. "Test with fixtures" stays under Builder tools. Saves made before spec v13 or v14 do not load ("Save was made with different content").
- **Look:** the owner's redesign (2026-11-21), dark in both themes. In the dark theme the pop-up sheets are dark vellum; in the light theme they are parchment. The title paints in its final look from the first frame, and the setup screens use two columns on a phone in landscape (spec v15).
- **Verified:** on 2026-11-23 the owner checked the live, signed-in game on their phone and reported that everything looks good. Earlier sessions browser-verified the 26-scenario pass at phone size, the spec v12 fixes, and a full two-player game.
- **Not verified:** a screen reader, and most rare scenarios at landscape and desktop sizes.

## 8. What is open

- **Decision 8, closed doors on compulsory moves** (plan 13 #14). A proposal is written: let the dark-room exit use another free passage, and keep the rubble and well cases as they are. Not approved, so do not change behavior.
- **Flask beside a forced skip.** It is still offered there; the owner listed it as not to be changed for now.
- **Physical checks the owner approved without:** the 21 inferred treasure coins (one at each value from 100 to 300) and the inferred B and C letters on the monster combat sets S09 to S12. If the owner ever counts their cards and finds a difference, that is a content change needing their ruling.
- **Known small layout limits:** in phone landscape, the second ring row and a fourth player name need a short scroll, and the Dragon's Lair label on the small tower map can be clipped. At 568x320 landscape, the Flee button, the A/B/C cards and the tower's Escape button may need a scroll. The solo dice-target fight screen is long on phones. The owner has not asked for any of these to be fixed.
- **Docs:** `docs/BUILD-GUIDE.md` still says "Dusk Keep" in places.

Nothing else is requested. Biographies and new hero poses are not wanted (spec v15).

## 9. Design history

The design canvas for the current look is the private claude.ai artifact `WBAZsXc9BgrwvdTb3pyBh2`; the build notes are in `docs/plans/redesign-build-2026-11-21.md`. The earlier mockups (`9fKBXUhunxVtpHFsKPAh8z`, `XfzLfCyjBkoVBrY4Hs8aNs`) are superseded. The content review page the owner approved from is `HNhvBGovuum7LtteAZoe6d`.

## 10. The next step

None is pending. The game is complete, approved and live, and the owner wrapped the project up on 2026-11-23. Wait for the owner's next request. Fix anything they report on keep-engine and ship it using the steps in section 6, one approval per step.
