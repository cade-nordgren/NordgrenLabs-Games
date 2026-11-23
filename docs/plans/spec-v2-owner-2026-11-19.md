# Owner specification v2 (received 2026-11-19)

The owner sent a revised developer specification. This file records the parts that change the Dusk Keep build; the plan (`dungeon-game-plan.md`) is updated to match. Where this file and an earlier register ruling disagree, this file wins (it is the owner's later instruction).

## Authority levels (new register tags)

| Level | Source | Code treatment |
|---|---|---|
| A | Explicit 2023 rulebook text | Mandatory |
| B | Owner-verified component data | Mandatory (tile geometry, card data, hero stats, rings, combat cards) |
| C | Earlier official rules where the 2023 text omits an operational detail and the mechanic was retained | Strong evidence, tag `legacySupported` |
| D | Owner-approved interpretation | Implement exactly, tag `interpretation` |
| E | Owner-approved house rule | Implement exactly, tag `houseRule` |
| F | Developer assumption | Forbidden unless approved |

## Changes to make

1. **Board footprint 10x11** (110 coordinates), four corner towers, exactly two centre cells for the double chamber. Axis orientation (10 wide or 11 wide) and the exact chamber pair come from `BoardDefinition`, never hard-coded in UI. The fixture board becomes 10x11. Validation: 110 cells, four towers at the corners, chamber = two adjacent centre cells.
2. **Towers are shared rooms, not spawn points or automatic exits.** Replaces the old D23 ruling ("must leave the start tower and return").
   - Hero statuses: `READY_IN_START_TOWER`, `EXPLORING`, `IN_TOWER_NOT_ESCAPED`, `ESCAPED`, `DEAD`.
   - A hero at setup is never escaped.
   - Entering any tower from the castle offers a choice: escape (final, no re-entry), stay (remain active), or continue through another legal tower passage this turn (transit).
   - Any hero may use any tower; any number of heroes may share one. Returning to a tower is legal even as the only route.
   - Escape finality (no re-entry) is `legacySupported/interpretation`.
3. **Dark room:** the effect is explicit on the initial draw (turn ends, next-turn D6 exit) and on a flee back into it (special rooms apply when fleeing). Ordinary re-entry does NOT trigger it by default. Policy name `ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY`, tagged interpretation.
4. **Doors (2023):** a closed door lets the hero continue the same turn through another free passage; a door trap ends the turn; an opened door relocks after passing, except the same-turn successful flee back.
5. **No voluntary pass** (unchanged from D20).
6. **Well:** a failed second jump = death stays, tagged interpretation (not explicit 2023). Well state records entry edge and phase `AT_NEAR_EDGE | CROSSED`.
7. **Dragon wake:** move only to an existing adjacent labyrinth tile, no room card, never reveal (unchanged from D19). Reset when the chamber empties stays, tagged interpretation.
8. **Damage floor** `max(0, result)`: tag `legacySupported`.
9. **Solo:** target-die entry is the authentic mode; any automated monster is a labelled digital variant (unchanged from D17).
10. **Monster reactions** come only from monster-card data, never percentages (already so).
11. **Event log:** semantic, replayable entries (round, hero, from/to coordinates, marks, gate edges, card ids, commitments, dice and arithmetic). Debug mode shows deck ids and RNG calls; normal mode hides private information.
12. **Test-data banner** in developer builds lists exactly which data is synthetic (for example "Tile distribution: synthetic, Room deck: synthetic, Heroes 0/8 verified").
13. **App label:** "Mechanics engine under verification" until the completion gate passes; never claim exactness.

## Tower and sunset ruling (firm, owner interpretation unless the 2023 rules confirm it)

1. Being in a tower is not escaping; tower occupancy and escape status are separate states.
2. A hero starting in a tower is not escaped.
3. Any hero may enter any tower through a legally connected passage.
4. Entering a tower offers Escape, Stay or Continue, subject to legal moves.
5. Only choosing Escape sets `ESCAPED`.
6. At sunset, a hero in a tower who has not chosen Escape is not escaped, and is not automatically dead either: they get a distinct end result, "inside at sunset" (`INSIDE_AT_SUNSET`), kept apart from `DEAD` in state and results. Change this only if the endgame rules require it.
7. A hero must be able to complete a legal escape decision before sunset closes their turn.

Rules-config entries (both firm, tagged `interpretation`): `towerAtSunsetCountsAsEscape: false`, and `escapeWithoutExploring: false` (placing a hero in its start tower is not entering a tower: a `READY_IN_START_TOWER` hero is never offered Escape). Returning to a tower never forces escape, even when it is the only legal destination.

**Board geometry.** The BoardDefinition is the authority for movement geometry, not only dimensions and chamber placement: each tower's printed openings, the chamber's outer sides, printed walls and fixed edges, and the out-of-board area (everything outside the 10 x 11 rectangle). Movement legality reads these from board data, so correcting the map from the owner's photo is a data edit only.

## UI requirements

- Map viewport: pinch zoom, wheel and +/- zoom, drag pan, Fit board (fits all 110 cells), Centre on active hero, tap the hero to re-centre, double-tap a cell to inspect. The board keeps its rectangular shape and dominates the play screen on phones.
- Tiles show openings, walls, doors, portcullises, entry marker, mark type, special identity, occupancy and orientation before any decoration. Visually distinct: unexplored valid cell, revealed wall, blocked by a neighbour's wall, out of board, chamber reserve, tower.
- Every legal move is both a highlighted cell and an accessible control with a reason line ("Unexplored, will reveal a tile"; "Tower: you may escape or continue"; "Portcullis, Strength 6 test"). An illegal adjacent cell can explain why.
- Tower entry prompt: Escape the castle / Stay in the tower / Continue through the other passage (only if legal).
- Hero panel: name, Strength, Agility, Armour, Luck, HP current/max, ordinary gold, count of hidden chamber cards, ring, special weapon, special-room state, location, status.
- Privacy handoffs for chamber cards and the monster controller (already built; keep).
- Accessibility: full turn by keyboard, arrow keys move map focus, Enter/Space chooses, Esc cancels an uncommitted choice, visible focus, cell labels describing coordinate and topology for screen readers, 4.5:1 text contrast, 44px primary targets, reduced motion.

## Acceptance tests added by v2

Board 110 cells and corner towers; chamber reserve; bilateral wall; tower ownership (B enters A's tower); shared tower; setup hero not escaped; return to any connected tower; tower entry offers escape rather than forcing it; tower transit; door closed lets another exit be used the same turn; dark room on initial reveal only by default; rubble records arrival direction; well records entry edge; sun and dragon tests as before.

## Unchanged boundary

Content slots take the owner's own original content in the documented structure. The project does not transcribe the published set's card faces, tile faces, board printing or hero characters; see plan section 2. Board dimensions and tower and chamber positions are structural rules and are in scope.
