# DiceLanes plan and notes

An original lane-crossing dice game for one to five players, at `site/dicelanes/`. One game, two modes, one scoresheet, one engine, one saved state.

## Files

```
site/dicelanes/index.html            markup and CSS (lane colours, sheet, tray, dock), loads ui/app.js as a module
site/dicelanes/engine/lanes.js       lanes, points table, score, standings
site/dicelanes/engine/moves.js       canMark, skipped cells, applyPicks and pickOptions for the simultaneous digital turn
site/dicelanes/engine/reducer.js     newGame, reduce(state, action), resolve, seeded PRNG, end check, validState
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
  turn: null | { n, active, phase: 'roll' | 'choose' | 'over', dice: { w: [a, b], c: [r, y, g, b or null] } | null,
                 picks: [{ white: lane | null, colour: { lane, die } | null } per player], done: [bool per player] } }
```

`picks` and `done` hold one entry per player during `choose` and are empty otherwise.

Marks are cell indices 0 to 10, strictly increasing, so "left to right only" and "skipped is gone" fall out of one comparison with the newest mark. Actions: `mark`, `penalty`, `close` (physical); `roll`, `pick` (player, kind `white` with a lane, or kind `colour` with a lane and die 0 or 1, active player only), `unpick` (player, kind) and `done` (player, value true or false to reopen) for digital. A pick is accepted only when the player's whole pick still applies: white first, then colour, each against the sheet left by the one before. The roll resolves itself when the last player taps Done (`resolve`). `reduce` returns the same object for an illegal action, which is how the UI and tests tell.

## Rule readings

- Locking needs five marks in the lane before its last number; marking the last number takes the lock too (one more cross) and closes the colour for everyone.
- Digital turns are simultaneous: after a roll every player chooses in any order on the one device (tap a chip to switch sheets) and taps Done; picks are tentative and changeable until then, and Done can be reopened before the roll resolves. After a Done the sheet switches to the next player still choosing, as a convenience.
- Every pick is checked against the colours closed before the roll. Colours locked on the roll close only when it resolves, so several players can lock the same colour on one roll, with the white sum or the active player's colour pick. Reading: the active player's colour pick is not blocked by another player's tentative lock in that colour on the same roll; both count.
- The active player's two picks apply white first, then colour; they may tap them in either order as long as that result is legal. A cell both picks could reach goes to the kind not used yet, white first.
- A penalty goes only to the active player, only when they picked nothing.
- Digital: the end (a fourth penalty, or two closed colours) is checked when the roll resolves. Physical: at once.
- A closed colour rolls no die from then on; the tray shows its slot as an empty outline.
- Physical: tapping a lane's lock when its last number is not yet allowed closes (or reopens) that colour as locked by someone away from this device, for solo scorekeeping beside a paper game. It cannot reopen a colour a player here holds the lock for. With five marks, tapping the lock marks the last number.
- Solo digital: the single player is always active, picks both and taps Done.
- Reloading mid-game goes straight back to the game (the autosave is the current game); the start screen lists paused saves.

## UI

- Bank's menu circle top right, with the Undo circle under it during a game. Items: Scores, Rules, Settings (sheets), Pause and save, Restart, New game. Content keeps clear of the circles (header inset in portrait, right gutter in phone landscape).
- Digital: chips show the roller (dot) and who is done (check). The selected player's legal cells keep full strength with a ring, the rest step back, and tentative picks show an accent X with a ring; tap a pick again to take it back. The tray's main button is Done for that player (Done, take a penalty for the active player with no picks), or Change once they are done.
- Physical: a tap always crosses off. The big lane picker (setting, and always under 360px wide) applies to digital dice only: a lane opens in a sheet as two rows of six with 60px cells.
- Destructive actions (New game, Restart, delete a save) use two taps in place, never a dialog.
- Dice: no inset edge line, `backface-visibility: hidden`, a perspective per die, and once a roll ends only the front face stays visible, so nothing shows round the edge.

## Known gaps

- Icons reuse the site's `/icons/`; DiceLanes has no icon of its own yet.
- The service worker serves the cached page even after sign-out until the next fetch; the API stays gated.
- Online multiplayer is not built; the reducer is ready for it (state and actions are JSON).
