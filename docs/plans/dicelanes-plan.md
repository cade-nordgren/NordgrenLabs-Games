# DiceLanes plan and notes

An original lane-crossing dice game for one to five players, at `site/dicelanes/`. One game, two modes, one scoresheet, one engine, one saved state.

## Files

```
site/dicelanes/index.html            markup and CSS (lane colours, sheet, tray, dock), loads ui/app.js as a module
site/dicelanes/engine/lanes.js       lanes, points table, score, standings
site/dicelanes/engine/moves.js       canMark, skipped cells, applyPicks, pickOptions, pickedCells and cellChoice for the digital turn
site/dicelanes/engine/reducer.js     newGame, reduce(state, action), resolve, seeded PRNG, end check, validState
site/dicelanes/engine/history.js     snapshot undo, cleanHist for stored histories
site/dicelanes/ui/app.js             state, autosave, saves, rendering, wiring
site/dicelanes/ui/dice.js            CSS 3D dice
site/dicelanes/manifest.webmanifest  home-screen app scoped to /dicelanes/
site/dicelanes/sw.js                 offline cache
tests/dicelanes/engine.test.js       node --test "tests/dicelanes/*.test.js"
```

## Sheet

Red and yellow run 2 to 12, green and blue 12 to 2, each ending in a lock. On screen each lane has eleven cells: ten numbers, then one wider cell holding the last number and its lock (engine index `LAST`), which counts as two crosses when crossed. Points by crosses: 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78. Four penalties, minus 5 each. The bottom line reads red + yellow + green + blue minus penalties = total, live.

## Engine

State is plain JSON:

```
{ v: 1, mode: 'physical' | 'digital', seed, rng, status: 'playing' | 'over',
  players: [{ name, marks: [[i...] x4], locks: [bool x4], penalties }],
  closed: [bool x4],
  turn: null | { n, active, phase: 'roll' | 'choose' | 'over', dice: { w: [a, b], c: [r, y, g, b or null] } | null,
                 picks: [{ white: lane | null, colour: { lane, die } | null, penalty: bool } per player], done: [bool per player] } }
```

`picks` and `done` hold one entry per player during `choose` and are empty otherwise.

Marks are cell indices 0 to 10, strictly increasing, so "left to right only" and "skipped is gone" fall out of one comparison with the newest mark. Actions: `mark`, `penalty`, `close` (physical); `roll`, `pick` (player, kind `white` with a lane, or kind `colour` with a lane and die 0 or 1, active player only), `unpick` (player, kind) and `done` (player, value true or false to reopen) for digital. A pick is accepted only when the player's whole pick still applies: white first, then colour, each against the sheet left by the one before. The roll resolves itself when the last player taps Done (`resolve`). The UI sends `choose` (player, lane, index) for every tap on a cell; `cellChoice` decides what it means: take back a pick, add a legal one, or swap. `reduce` returns the same object for an illegal action, which is how the UI and tests tell.

## Rule readings

- Locking needs five marks in the lane before its last number; marking the last number takes the lock too (one more cross) and closes the colour for everyone.
- Digital turns are simultaneous: after a roll every player chooses in any order on the one device (tap a chip to switch sheets) and taps Done; picks are tentative and changeable until then, and Done can be reopened before the roll resolves. After a Done the sheet switches to the next player still choosing, as a convenience.
- Every pick is checked against the colours closed before the roll. Colours locked on the roll close only when it resolves, so several players can lock the same colour on one roll, with the white sum or the active player's colour pick. Reading: the active player's colour pick is not blocked by another player's tentative lock in that colour on the same roll; both count.
- The active player's two picks apply white first, then colour; they may tap them in either order as long as that result is legal. A cell both picks could reach goes to the kind not used yet, white first.
- Once the active player has a pick, a cell that is legal on its own but not beside that pick (it would need a second pick of the same kind, or break the white-first order) shows as a swap: muted with a dashed ring. Tapping it puts it in and drops what conflicts, keeping as many picks as possible; on a tie it becomes the white pick. Owner's example (whites 1 and 2, red 1): with red 2 picked as a colour, red 3 is a swap; tapping it makes red 3 the white pick and red 2 a swap. A non-active player has one pick, which a tap on another legal cell simply moves.
- Penalties (digital): the active player may tick this roll's penalty any time while choosing (`penalty` action), even with legal picks, and untick it until they end their turn; it applies at the resolve. They can end their turn only with at least one pick or a ticked penalty (`canEnd`). Nobody else takes penalties in digital mode, and there is no automatic penalty. Saves made before this read a missing `penalty` as false.
- Digital: the end (a fourth penalty, or two closed colours) is checked when the roll resolves. Physical: at once.
- A closed colour rolls no die from then on; the tray shows its slot as an empty outline.
- Physical: tapping a lane's last cell (number and lock) when it is not yet allowed closes (or reopens) that colour as locked by someone away from this device, for solo scorekeeping beside a paper game. It cannot reopen a colour a player here holds the lock for. With five marks, the tap crosses it (two crosses).
- Solo digital: the single player is always active, picks both and taps Done.
- Reloading mid-game goes straight back to the game (the autosave is the current game); the start screen lists paused saves.

## UI

- Bank's menu circle top right, with the Undo circle under it during a game. In a game: Scores, Exit, New game, Restart, Rules, Settings. On the start screen: Games, Rules, Settings. Exit is Bank's End game sheet (Save and exit, End or Exit without saving, Keep playing or Back to scores). New game is a sheet (Save and start new, Start new without saving, Keep playing) that starts straight into a fresh game with the same players and mode. Restart takes two taps mid-game. The results screen offers Play again and Change players.
- Digital layout: the dice tray (white sum, dice, Roll or Done) is the top element, narrowed so the two circles sit to its right; chips are under it. No helper line. Phone landscape and 1040px and up: the tray moves to a right column. Own dice: chips at the top beside the circles.
- Digital: chips show the roller (dot) and who is done (check). The selected player's legal cells keep full strength with a ring, swaps are muted with a dashed ring, everything else steps further back, and tentative picks show an accent X with a ring; tap a pick again to take it back. The tray's main button reads End turn (disabled for the roller until they have a pick or a ticked penalty; the next penalty box then shows a dashed accent ring as the way out), or Change picks once they have ended their turn.
- Physical: a tap always crosses off. The big lane picker (setting, and always under 360px wide) applies to digital dice only: a lane opens in a sheet as two rows of six with 60px cells.
- Destructive actions (New game, Restart, delete a save) use two taps in place, never a dialog.
- Dice: no inset edge line, `backface-visibility: hidden`, a perspective per die, and once a roll ends only the front face stays visible, so nothing shows round the edge.

## Known gaps

- Icons reuse the site's `/icons/`; DiceLanes has no icon of its own yet.
- The service worker serves the cached page even after sign-out until the next fetch; the API stays gated.
- Online multiplayer is not built; the reducer is ready for it (state and actions are JSON).

## Scores setting and the end reveal

- Settings, Scores: While playing (default) or At the end. At the end hides the score line under the sheet, the totals on the chips and the Scores sheet's list until the game is over; the points table and penalty boxes stay. Stored per device with the other prefs.
- When the move that ends the game is made, the results open with a reveal: one card per player shaped like the score line, all at 0, then red counts up for everyone at once at a shared pace (one point per step, each phase about 1.4 s), then yellow, green, blue, penalties and totals, with short beats and a light haptic per phase. Then the winner's card glows (ties: every tied winner, "Tie between ..."), the rest dim, and the ranking and buttons appear. Tap anywhere or Skip to jump to the end. Reduced motion shows the end at once with a static ring. Undo cancels it and steps back into the game; a reload shows the final state without replaying. The count runs on timers, so it also finishes in a background tab.
