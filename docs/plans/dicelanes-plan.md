# DiceLanes plan and notes

An original lane-crossing dice game for one to five players, at `site/dicelanes/`. One game, two modes, one scoresheet, one engine, one saved state.

## Files

```
site/dicelanes/index.html            markup and CSS (lane colours, sheet, tray, dock), loads ui/app.js as a module
site/dicelanes/engine/lanes.js       lanes, points table, score, standings
site/dicelanes/engine/moves.js       canMark, skipped cells, phase 1 and phase 2 legal moves
site/dicelanes/engine/reducer.js     newGame, reduce(state, action), seeded PRNG, end check, validState
site/dicelanes/engine/history.js     snapshot undo, cleanHist for stored histories
site/dicelanes/ui/app.js             state, autosave, saves, rendering, wiring
site/dicelanes/ui/dice.js            CSS 3D dice
site/dicelanes/manifest.webmanifest  home-screen app scoped to /dicelanes/
site/dicelanes/sw.js                 offline cache
tests/dicelanes/engine.test.js       node --test "tests/dicelanes/*.test.js"
```

## Sheet

Red and yellow run 2 to 12, green and blue 12 to 2, each followed by a lock. Points by crosses: 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78. Four penalties, minus 5 each. The bottom line reads red + yellow + green + blue minus penalties = total, live.

## Engine

State is plain JSON:

```
{ v: 1, mode: 'physical' | 'digital', seed, rng, status: 'playing' | 'over',
  players: [{ name, marks: [[i...] x4], locks: [bool x4], penalties }],
  closed: [bool x4],
  turn: null | { n, active, phase: 'roll' | 'white' | 'colour' | 'over', dice: { w: [a, b], c: [r, y, g, b or null] } | null,
                 chooser, marked, pending: [lanes locked in phase 1, not closed yet] } }
```

Marks are cell indices 0 to 10, strictly increasing, so "left to right only" and "skipped is gone" fall out of one comparison with the newest mark. Actions: `mark`, `penalty`, `close` (physical), `roll`, `white` (lane or null to pass), `colour` (die and lane, or null to pass). Phase 1 resolves itself after the last chooser (`resolveWhite`). `reduce` returns the same object for an illegal action, which is how the UI and tests tell.

## Rule readings

- Locking needs five marks in the lane before its last number; marking the last number takes the lock too (one more cross) and closes the colour for everyone.
- Phase 1 locks wait in `turn.pending` until everyone has chosen, so two players can lock the same colour with one white sum; then the colour closes before the active player's phase 2.
- A penalty goes only to the active player, only when they marked nothing in either phase.
- Digital: the end (a fourth penalty, or two closed colours) is checked when the turn resolves, after phase 2. Physical: at once.
- A closed colour rolls no die from then on; the tray shows its slot as an empty outline.
- Physical: tapping a lane's lock when its last number is not yet allowed closes (or reopens) that colour as locked by someone away from this device, for solo scorekeeping beside a paper game. It cannot reopen a colour a player here holds the lock for. With five marks, tapping the lock marks the last number.
- Solo digital: the single player is always active, so every turn is phase 1 then phase 2 for them.
- Reloading mid-game goes straight back to the game (the autosave is the current game); the start screen lists paused saves.

## UI

- Bottom pill dock (Play, Scores, Rules, Settings) replaces the menu circle for this game; page content blurs and fades under it. Undo and Pause are round buttons on the Play screen header, next to the player chips.
- Digital: the sheet follows whoever chooses; their legal cells keep full strength with a ring and the rest step back. Other chips can be tapped to look; the next move snaps back.
- Big lane picker (setting, and always under 360px wide): a lane opens in a sheet as two rows of six with 60px cells.
- Destructive actions (New game, Restart, delete a save) use two taps in place, never a dialog.
- Dice: no inset edge line, `backface-visibility: hidden`, a perspective per die, and once a roll ends only the front face stays visible, so nothing shows round the edge.

## Known gaps

- Icons reuse the site's `/icons/`; DiceLanes has no icon of its own yet.
- The service worker serves the cached page even after sign-out until the next fetch; the API stays gated.
- Online multiplayer is not built; the reducer is ready for it (state and actions are JSON).
