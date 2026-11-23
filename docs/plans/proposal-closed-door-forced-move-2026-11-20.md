# Proposal: a door during a forced or compulsory move (spec v11 decision 8, plan section 13 #14)

Asked for by the owner in [`spec-v11-owner-2026-11-20.md`](spec-v11-owner-2026-11-20.md), decision 8 ("NOT YET APPROVED"): identify the exact forced-movement situations, their triggering rule, whether another exit is legal and the existing engine behaviour, and propose a resolution **without changing the implementation**. Nothing in the engine, the content or the tests changed for this document; section 13 #14 stays open and points here. Engine references are to `site/keep/engine/`. Rulebook references are to the official 2023 rules PDF (algaspel.se, `38010503_Drakborgen_rules.pdf`), re-read on 2026-11-20 with local `pdftotext` from the copy downloaded for the 2026-11-19 audit; sections are paraphrased, not quoted, apart from one short phrase.

## 1. What the rules say (paraphrased)

- **6.2 Doors.** To try a door you first draw a door card. Opens: you carry on through it as an ordinary move. Stays shut: "kan du fortsätta ditt drag genom en annan fri passage" (you may continue your move through another free passage). Door trap: your move is over. An opened door relocks once you are through, except that a successful flight from a monster met on that same move may go back through it.
- **6.1 Free passages.** An opening not blocked from either side. Temporary free passages (a found secret door, a lifted portcullis, an opened door) are used once.
- **6.3 Portcullis** (for comparison): a failed Strength test ends the move; try again next move or choose another opening.
- **5.5 Dark room.** Drawing the tile ends the move at once. Next move a D6 picks the exit (two exits: 1-3 the dot's exit; three exits: 1-2 the dot, 3-4 clockwise, 5-6 counter-clockwise); you leave by the exit the die chose and carry on the move as usual. Nothing is printed for a chosen exit that is blocked.
- **5.6 Well.** Agility on entry; on a pass you are on the edge and next move either turn back or jump across (Agility, +1 per chamber card, discards first).
- **5.8 Rubble.** You stop at the entrance and the move ends; next move turn back or force it (Agility); a pass takes you through to any exit, a fail keeps you stuck to try again.
- **9.4 Flight.** Back to the tile you came from if possible (not through a secret door); no room card, but a special room's special rules apply as usual; the move is over.
- **10.1 The dragon wakes.** Each hero in the chamber, from the waker clockwise: chamber cards to the bottom, a D12 of fire, then (if alive) move to any adjacent maze tile, without a room card, outside the turn order. Nothing is printed about doors or walls on that move.

## 2. Every movement the player does not freely choose that can meet a door

How the engine handles a door today, common to the situations that draw a card: `attemptMove` (`movement.js`) draws the top door card through `drawAndResolve(... 'DOOR' ...)` with `door: { dir, edge, noDetour }`; `doorOutcome` (`effects.js`) then resolves it:

- **opens** (DOOR_001, 7 copies): `turn.openedDoor` is set and `enterTile(..., via: 'door')` crosses; the new tile resolves as on any entry (room card, dot, special room).
- **stays shut** (DOOR_002, 5 copies): the edge goes into `turn.triedDoors` (not offered again this turn); with `noDetour` set the turn ends (`turn.endAfter`) and the hero stays where they were; without it `allowContinue('door-stayed-closed')` offers the other exits this turn (6.2).
- **door trap** (DOOR_003 D12 - Luck, DOOR_004 D6, 1 copy each): the card is kind `trap`, so the Protection Ring is offered first (`drawAndResolve`, spec v5, D50); its damage runs unless the ring is used; the turn ends; the hero stays.
- **shuffle again** (DOOR_005): the replacement door card is drawn at once with the same `door` context, `noDetour` included (`redraw`, D62).
- An empty door deck counts as a door that stays shut (`attemptMove`, shortcut; never reached in soak play).

| # | Situation | Trigger and reference | Door card drawn? | "Stays shut" today | "Opens" today | "Door trap" today |
|---|---|---|---|---|---|---|
| A | **Dark-room exit**: the D6 picks a side whose edge is a door | `ROLL_DARK_EXIT` -> `rollDarkExit` -> `attemptMove(dir, { noDetour: true })`; 5.5, D06, D07; plan 13 #14 | Yes | Turn ends; the hero stays in the dark room with the `dark` condition, so next turn rolls the D6 again (the same as D07's blocked exit) | Crosses; the move carries on as usual from the new tile | Ring offered; damage; turn ends; still in the dark room, rolls again next turn |
| B | **Rubble: turn back** through the entry edge, which is a door (the hero came in through it; an opened door relocks, 6.1) | `RUBBLE_RETURN` -> `returnMove` -> `attemptMove(enteredFrom, { noDetour: true })` (`reducer.js`); 5.8 | Yes | Turn ends; the hero stays at the rubble entrance (`rubble` condition); next turn turn back or force again. Forcing the rubble is not offered the same turn | Crosses back out | Ring offered; damage; turn ends; still in the rubble |
| C | **Well: turn back** from the near edge through the entry edge, a door | `WELL_RETURN` -> `returnMove`, as B; 5.6, D42 | Yes | Turn ends; the hero stays clinging at the near edge (`well-edge`); next turn turn back or jump. The jump is not offered the same turn | Crosses back out | Ring offered; damage; turn ends; still on the edge |
| D | **Flight** from a monster (or the giant spider's Flee) back to the previous tile through a door | `flee` (`movement.js`), allowed only when `canFlee`: the edge back is open, or is a door opened on this same move (6.2 exception); 9.4, D16 | **No.** A door not opened this move makes `canFlee` false, so Flee is not offered at all; through the door opened this move the hero passes without a card | Cannot happen | Passes back without a card (6.2 exception) | Cannot happen |
| E | **The dragon's forced exit** to an adjacent revealed tile across a door edge | `FORCED_MOVE` -> `forcedMove` (`treasury.js`) -> `enterTile(..., via: 'forced', drawRoom: false)`; 10.1, D19 (spec v11: adjacent already-placed maze tile), `forcedMoveTargets` ignores edges | **No.** The door is ignored as walls are (no `attemptMove`); spec v9 found the lack of a free-passage requirement "not established as defective" | Cannot happen | (crosses as if open) | Cannot happen |
| F | **A card's move** (`MOVE_HERO`: adjacent choice, a fixed side or back) | `MOVE_HERO` (`effects.js`) -> `enterTile(..., via: 'card')` | **No** (door edges count as legal exits in `moveChoices` and are crossed without a card) | Cannot happen | (crosses) | Cannot happen |

Not forced, listed because they were checked: the Opening Ring (`passBarrier`, a choice: no card, the door opens), tower transit and the move after forcing rubble (`allowContinue`: voluntary, 6.2 applies with its other exits), a secret passage (crosses walls only; a door on that edge resolves normally as a voluntary move), the rotating room and the wizard's curse (turn tiles, never move a hero), the trapdoor (no move), a forced skip (D20, no move).

So the question is real only in **A, B and C** (a door card is drawn on a move the player did not choose freely). D, E and F never draw a door card: D by the 6.2 flight exception, E and F because they enter the tile directly.

## 3. How often (owner tiles)

Door sides on the owner's 88 tiles: TILE_004 black four-way, 3 doors (2 copies); TILE_005 black four-way, 1 door (4 copies); TILE_008 and TILE_009 black three-ways, 1 door each (2 copies each); TILE_022 red straight, 1 door (2 copies). 12 tiles, 16 door sides; an edge is a door when either neighbour shows a door there and neither shows a wall. The dark rooms (TILE_013, 2 copies), rubble (TILE_015, TILE_016), the well (TILE_017) and the rotating room have no doors of their own, so A to C need a door on the neighbour's side of the edge. Black and red tiles with doors are 12 of the 72 black and red tiles.

Random legal play (the soak seeds and picker of `tools/keep-soak.js`, 3000 games, 1/2/4 players, run 2026-11-20 for this note, script not kept): compulsory door draws in 44 games (about 1 in 70). By result: dark-room exit A: 12 opens, 7 stays shut, 2 traps, 2 shuffles; rubble B: 27 opens, 20 stays shut, 2 traps, 2 shuffles; well C: 4 opens, 1 stays shut, 1 trap. So "stays shut" on a compulsory move came up 28 times in 3000 games (about 1 game in 110), most often turning back out of rubble; a door trap on one 5 times. Situation E with a door edge: 0 of 4 forced moves (wakes are rare in random play; at a real table it needs a revealed door tile next to the chamber with its door facing the chamber). Rare edge overall.

## 4. Is another exit legal there?

- **A, dark room.** 5.5 gives the choice of exit to the die, but then says the move carries on "as usual" once the hero leaves. Trying a door is part of moving as usual, and 6.2 is the rule that resolves a door that stays shut: the hero may continue through another free passage. Read that way, another free passage out of the dark room is legal after a shut door; the die chose which exit to try, not that no other may be used after a 6.2 failure. The other reading: the die removes the choice of exit altogether (the theme of 5.5: you have lost your bearings), so a failed exit leaves you there, as D07 does for a wall or an occupied room (approved by spec v11 as an owner interpretation). Both are arguable; the printed text supports the first more directly, because 6.2 is explicit about doors and 5.5 is silent about blocked exits.
- **B, rubble; C, well.** 5.8 and 5.6 give the hero at the entrance two options: turn back, or force the rubble / jump the well (a test). From the entrance there is no other **free passage**: every other exit lies past the rubble or across the well. So 6.2's "another free passage" offers nothing here. The only alternative a player could ask for is to take the **other option** (force or jump) on the same move after the door stays shut, which 6.2 does not grant (it speaks of passages, not of tests), and 5.8 and 5.6 present the two as one choice per move.
- **D, E, F.** No door card is drawn, so the question does not arise. For E, whether a door edge should be crossed at all (or draw a card) is a separate question about 10.1 "any adjacent maze tile", already answered for walls by spec v9 and for the target by spec v11 decision 5.
- **Door trap, every situation.** 6.2: the move is over. Today's behaviour already matches in A, B and C.

## 5. Proposed resolution

| # | Proposal | Alternatives |
|---|---|---|
| A dark room | **(A2) Apply 6.2 after the die's exit:** a shut door on the rolled exit lets the hero continue this turn through another free passage of the dark room (the other exits, not the shut door, which is in `triedDoors`), or stop; the dark condition is left behind once the hero leaves; if no other free passage exists, the turn ends and the hero rolls again next turn (as D07). A door trap still ends the turn. | (A1) keep today: the turn ends, roll again next turn (D07 extended to doors); (A3) roll the D6 again at once for another exit |
| B rubble | **(B1) Keep today:** the turn ends and the hero stays at the entrance; next turn turn back or force | (B2) after the door stays shut, offer forcing the rubble on the same turn (one test, as if forcing had been chosen) |
| C well | **(C1) Keep today:** the turn ends and the hero stays on the edge; next turn turn back or jump | (C2) after the door stays shut, offer the jump on the same turn |
| D flight | No change: no door card is ever drawn (6.2 exception) | none needed |
| E dragon | No change for this question: no door card (doors ignored as walls are, D19, spec v9); a separate owner question only if doors should matter on the forced move | (E2) draw a door card on a door edge: opens, cross; stays shut, choose another target or stay (D40); trap, damage and stay |
| F card move | No change: no owner card moves a hero (`MOVE_HERO` is unused by the owner content); revisit if a card ever does | (F2) a card's move through a door draws a door card |

Recommended: A2, B1, C1, and no change for D, E and F. Why: A2 follows the printed 6.2 for the one situation where another free passage really exists and 5.5 says the move then goes on as usual; B1 and C1 keep today's behaviour because no other free passage exists from a rubble entrance or a well edge, and 6.2 grants passages, not a second test. The door trap ends the move in every case (6.2), as today.

What A2 would change if approved (not done): `doorOutcome` would treat `noDetour` as "no detour" only for B and C, for example by passing the kind of compulsory move (`compulsory: 'dark' | 'return'`) in the door context instead of the boolean; for `'dark'` a shut door would `allowContinue('door-stayed-closed')` exactly as on a voluntary move, and the dark condition goes when the hero leaves the tile (as today in `enterTile`). It changes behaviour, so MECHANICS_VERSION would be bumped (older saves refused). The plan rows to update: D07 (the door part), section 13 #14, R38, the v2 doors test's wording.

## 6. Tests to add with the decision

For A (on the fixture board with `FX_DOORWAY` beside a dark room, scripted D6 and door deck order, as in `tiles.test.js` T11 and `v2.test.js` "v2 doors"):

1. Dark-room exit rolled at a door, the door card opens: the hero crosses and the move goes on as usual (room card on a black tile; a yellow corridor offers going on).
2. Rolled at a door that stays shut, with another free passage from the dark room: under A2 the phase is `CHOOSE_EXIT`, the shut door is not offered again (`door-closed`), the other exits are, Stop is offered, and leaving clears `dark`; under A1 the turn ends and next turn starts with `ROLL_DARK_EXIT`.
3. Rolled at a door that stays shut with no other free passage (every other side a wall or occupied): the turn ends and next turn rolls again (both options).
4. Rolled at a door trap: the Protection Ring is offered before the damage; with it kept, the damage and the turn ends; the hero still in the dark room, rolling next turn.
5. Rolled at the door shuffle card: the replacement resolves with the same rule as 1-4 (redraw keeps the compulsory kind).
6. Rubble turn-back through a shut door: the turn ends, the hero stays at the entrance, next turn `RUBBLE_RETURN` and `RUBBLE_FORCE` (B1; B2 would offer `RUBBLE_FORCE` the same turn). Today's `v2.test.js` case already pins B1.
7. Well turn-back through a shut door: the turn ends at the near edge, next turn `WELL_RETURN`, discards and `WELL_JUMP` (C1; C2 would offer the jump the same turn).
8. A door trap on the rubble and well turn-back: ring first, damage, the turn ends, the hero stays (all options).
9. Flight back through a door opened on the same move: no door card drawn; through a door not opened this move, Flee is not offered (pins D).
10. The dragon's forced move to a tile across a door edge: no door card drawn, the target reached (pins E as today, or tests E2 if chosen).
11. A 300-game random-play check that no compulsory move ever leaves the hero with `mayContinue` set after a door trap, and (A2) that a shut door on a dark-room exit is followed only by `CHOOSE_EXIT` or the end of the turn.

## 7. Decisions for the owner

1. **Dark-room exit at a door that stays shut (A):** A2 (6.2 applies: another free passage this turn), A1 (today: the turn ends, roll again next turn) or A3 (roll again at once)?
2. **Turning back out of rubble or off a well edge through a door that stays shut (B, C):** keep today (the turn ends; the other option next turn), or allow forcing / jumping on the same turn (B2, C2)?
3. **Optional, the dragon's forced move across a door edge (E):** keep it ignoring doors as it ignores walls (today), or draw a door card (E2)?
4. Confirm that a door trap ends the move in every situation (today's behaviour, printed 6.2).

Until the owner decides, the engine keeps today's behaviour in all six situations, and section 13 #14 stays OPEN.
