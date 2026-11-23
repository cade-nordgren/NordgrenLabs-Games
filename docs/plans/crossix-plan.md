# Crossix plan and notes

An original lane-crossing dice game for one to five players on one device, or two to eight online, at `site/crossix/`. One game, three ways to play (own dice, digital dice on one device, online), one scoresheet, one engine.

## Files

```
site/crossix/index.html            markup and CSS (lane colours, sheet, tray, dock), loads ui/app.js as a module
site/crossix/engine/lanes.js       lanes, points table, score, standings
site/crossix/engine/moves.js       canMark, skipped cells, applyPicks, pickOptions, pickedCells and cellChoice for the digital turn
site/crossix/engine/reducer.js     newGame, reduce(state, action), resolve, seeded PRNG, end check, validState
site/crossix/engine/history.js     snapshot undo, cleanHist for stored histories
site/crossix/ui/app.js             state, autosave, saves, rendering, wiring
site/crossix/ui/dice.js            CSS 3D dice
site/crossix/manifest.webmanifest  home-screen app scoped to /crossix/
site/crossix/sw.js                 offline cache
tests/crossix/engine.test.js       node --test "tests/crossix/*.test.js"
server/crossix.js                  online rooms: the Crossix adapter for server/rooms.js
server/crossix.test.js             online rooms through the Worker (cd server && npm test)
server/crossix-client.test.js      the client (Bomb's site/bomb/ui/net.js) against the Worker
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
- Penalties (digital): the active player may tick this roll's penalty any time while choosing (`penalty` action), even with legal picks, and untick it until they end their turn; it applies at the resolve. They can end their turn only with at least one pick or a ticked penalty (`canEnd`), never both: ticking the penalty clears their picks, and any pick unticks it, so the resolve never sees both. Nobody else takes penalties in digital mode, and there is no automatic penalty. Saves made before this read a missing `penalty` as false.
- Digital: the end (a fourth penalty, or two closed colours) is checked when the roll resolves. Physical: at once.
- A closed colour rolls no die from then on; the tray shows its slot as an empty outline.
- Physical: tapping a lane's last cell (number and lock) when it is not yet allowed closes (or reopens) that colour as locked by someone away from this device, for solo scorekeeping beside a paper game. It cannot reopen a colour a player here holds the lock for. With five marks, the tap crosses it (two crosses).
- Solo digital: the single player is always active, picks both and taps Done.
- Reloading mid-game goes straight back to the game (the autosave is the current game); the start screen lists paused saves.

## UI

- Bank's menu circle top right, with the Undo circle under it during a game. In a game: Scores, Exit, New game, Restart, Rules, Settings. On the start screen: Games, Rules, Settings. Exit is Bank's End game sheet (Save and exit, End or Exit without saving, Keep playing or Back to scores). New game is a sheet (Save and start new, Start new without saving, Keep playing) that starts straight into a fresh game with the same players and mode. Restart takes two taps mid-game. The results screen offers Play again and Change players.
- Digital layout: the dice tray (white sum, dice, Roll or Done) is the top element, narrowed so the two circles sit to its right; chips are under it. No helper line. Phone landscape and 1040px and up: the tray moves to a right column. Own dice: chips at the top beside the circles.
- Digital: chips show the roller (dot) and who is done (check). The selected player's legal cells keep full strength with a ring, swaps are muted with a dashed ring, everything else steps further back, and tentative picks show their dice: a white-sum pick turns the cell into a white die of the theme (`--die` fill, `--pip` X), a white-plus-colour pick gets an X and ring in the lane colour (a shade darker on light cells so yellow reads). Resolved marks use the normal X. Tap a pick again to take it back. The tray's main button reads End turn (disabled for the roller until they have a pick or a ticked penalty; the next penalty box then shows a dashed accent ring as the way out), or Change picks once they have ended their turn.
- Physical: a tap always crosses off. The big lane picker (setting, and always under 360px wide) applies to digital dice only: a lane opens in a sheet as two rows of six with 60px cells.
- Destructive actions (New game, Restart, delete a save) use two taps in place, never a dialog.
- Dice: no inset edge line, `backface-visibility: hidden`, a perspective per die, and once a roll ends only the front face stays visible, so nothing shows round the edge.

## Known gaps

- Icons reuse the site's `/icons/`; Crossix has no icon of its own yet.
- The service worker serves the cached page even after sign-out until the next fetch; the API stays gated.
- The home page tile still says "for one to five players"; another agent owns `site/index.html`.

## Scores setting and the end reveal

- Settings, Scores: While playing (default) or At the end. At the end hides the score line under the sheet, the totals on the chips and the Scores sheet's list until the game is over; the points table and penalty boxes stay. Stored per device with the other prefs.
- When the move that ends the game is made, the finish screen counts up. It is one list, which is also the ranking: a row per player with rank, name and the score line (red + yellow + green + blue - penalties = total; the + and = signs drop below 420px wide so names fit, five rows fit at 320). One column at a time for everyone: 1 s of counting with that column's boxes solid white with a thin edge in their colour (the rest grey), then a 0.5 s beat in which the rows re-sort by the score so far (counted columns, penalties subtracted, ties in seating order), sliding to their places in 400 ms with the rank badges updating. After the totals, the winner's row glows (ties: every tied winner, "Tie between ..."), the rest dim, and Play again / Change players appear. Tap anywhere or Skip to jump to the end. Reduced motion shows the end at once with a static ring. Undo cancels it and steps back into the game; a reload shows the final state without replaying. The count runs on timers, so it also finishes in a background tab.

## Dice roll fix (round 6)

Each roll used to set the die straight to the new face's pose with transitions off, then spin whole turns back to it: the new face flashed before the spin. The change() render for the roll also ran before `rolling` was set, so it could put the new faces in place at once. Now the die keeps its angles (`_rx`, `_ry`) and a roll turns on from where it rests to an angle equal to the new face's pose modulo 360 plus two or more whole turns; `rolling` is set before the roll is dispatched; the settled class (only the front face visible) is applied by `transitionend` or a 1.2 s fallback, guarded so an older roll can never mark a newer spin settled.

## Online

Owner's request: `crossix-online-spec-owner-2026-11-23.md`. API: `crossix-online-contract.md`.

- **Setup**: Play has a third choice, Online. You give your name, then Create room or Join with the 6-letter code; a link `/crossix/?room=CODE` joins straight away (or fills in the code when there is no name yet). The lobby is Bomb's: the code, Share link and Copy code, seats filling in (a seat is just a name, with Host, Ready or Away), the host's Start (2 to 8), Leave. A reload in a room reopens it; after leaving mid-game, Online offers Rejoin.
- **Server**: Bomb's `server/rooms.js`, now shared through a small per-game adapter; Crossix's is `server/crossix.js`. Same tables, no migration: a Crossix room's state carries `kind: 'crossix'` and every lookup matches it, so a code or id of one game never opens the other's room. The server rolls with a seed from `crypto.getRandomValues`; seed and rng never leave it.
- **A roll**: the roller's phone shows Roll; every phone spins the dice when the roll arrives and starts on its own sheet. Picks are made on the phone with the same reducer and taps as on one device (nothing is sent), and other sheets are there to look at (chips, read-only). End turn sends one request with the final picks; the engine checks them on the server. Change picks reopens until the roll resolves. Others' picks stay hidden until the resolve; chips show who is done. The last Done resolves and the next seat rolls.
- **Away**: a phone keeps its seat. A seat not seen (polled) for 60 s shows dimmed, and the host gets "Skip <name>": for the roller in the roll phase it rolls for them; in the choose phase it ends that seat's turn with nothing crossed, which for the roller is the penalty.
- **End**: the same finish screen and count. Play again becomes Rematch (starts when everyone has tapped it, as Bomb) and Change players becomes Leave (back to the lobby for the rest). No undo online, and online games are never written to Saved games or the autosave.
- **Validation**: names 1 to 20 characters; picks shape-checked, then replayed through the engine's own `pick`, `penalty` and `done` actions; the stored state is checked with `validState` before every action (`MAX_ONLINE` = 8 there; the one-device roster stays at `MAX_PLAYERS` = 5).

### Requests and the free plan

The free plan allows 100,000 Worker requests a day for the whole site (every page and file request goes through the Worker too). Every change wakes every seated phone's held poll once; nothing else changes the version. Per roll with N players: 1 roll and N Dones are N + 1 requests, each waking N polls: (N + 1)² requests. Assume 30 s a roll, so on average one held poll a phone times out per roll (20 s hold), and a page load of about 25 requests per phone.

| | per roll | rolls a game (assumed) | per game, with lobby and page loads | games a day in 100,000 |
|---|---|---|---|---|
| 4 players | 25 + 4 = about 29 | 40 (10 rounds) | about 1,300 | about 75 |
| 8 players | 81 + 8 = about 89 | 48 (6 rounds) | about 4,500 | about 22 |

That is if nothing else used requests that day; reopened Dones and Skips add a little. Free: yes, rooms and online play cost nothing on the free plan, up to these limits; past 100,000 requests the Worker answers with errors until the next day (UTC) rather than charging.

### Decisions the owner can reverse

- 8 players at most online (`MAX_ONLINE`); one device stays at 5.
- Other players' picks are hidden until the roll resolves (only who is done shows).
- The host's Skip for a seat unseen for 60 s, which gives a skipped roller the penalty.
- No turn timer: nothing happens by itself; a slow player is waited for until the host skips them.
- Long polling on the existing Worker and D1 (free plan), not WebSockets or Durable Objects.
