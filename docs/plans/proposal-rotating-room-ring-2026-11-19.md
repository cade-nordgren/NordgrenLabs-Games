# Proposal: the Protection Ring and the rotating room (for owner approval, 2026-11-19)

> **Approved by the owner on 2026-11-20** (`spec-v9-owner-2026-11-20.md`): the recommended behaviour, variant (a), with flight and the forced move offered and declining allowed; the ring's part is an OWNER_APPROVED_INTERPRETATION, not a printed rule. Implemented as plan D67 (MECHANICS_VERSION v10, `tests/keep/spec-v9.test.js`). The text below is the proposal as it was put to the owner; "nothing has changed" was true then.

Asked for by owner specification v8 (`spec-v8-owner-2026-11-19.md`): "investigate allowing the Protection Ring to negate the room's rotation on entry. Do not change it until you've documented the exact timing, positioning consequences and proposed test cases." Plan section 13 #41a, status **OWNER DECISION REQUIRED**.

**Nothing has changed in the game.** The engine and the content behave exactly as before: the ring is offered only on a drawn card whose data says `kind: 'trap'`, never on entering the rotating room, and the room turns on every entry. `tests/keep/spec-v8.test.js` pins that on the owner's own tile. Everything below is a design for the owner to approve or reject, decision by decision (section 7).

## 1. What the rulebook says (2023 rules, section 5.7)

Checked again today in the official PDF (Alga 2023, `38010503_Drakborgen_rules.pdf`), read as text, rule statements only.

What 5.7 says:

- Drawing this tile means the hero has walked straight into one of the castle's traps ("en av Drakborgens otaliga fällor"). So yes: the printed rule calls the rotating room a trap, in its first sentence, tied to drawing the tile.
- Every time a hero enters it, it turns at once a quarter turn clockwise.
- It turns only at the moment someone steps in. A hero who stays in it: nothing happens.

What 5.7 does not say:

- Nothing about the Protection Ring, or about rings at all. The rulebook nowhere describes what the four rings do: it only says, at setup, that each player takes a magic ring and that the rings have different powers. The ring's power ("ignore one trap", owner spec v5) comes from the ring card, not from 5.7.
- Nothing about how the tile is placed before it turns on the first draw. That comes from 5.1 (a drawn tile is turned so the hero steps in over its dot); our ruling D10 is: place it by 5.1, then turn it.
- Nothing about the hero's position when the room turns (the hero simply stays in the room), nothing about a second hero (one hero per ordinary room, so it cannot arise), and nothing about flight, forced moves or card moves into it.
- It does not say whether the trap is the first discovery only or every entry. The trap sentence is tied to drawing the tile; the turning is tied to every entry.

So: the printed rule makes "the rotating room is a trap" a direct 2023 statement. That the Protection Ring therefore negates its rotation, and when, is still an interpretation joining 5.7 to the ring card.

## 2. How the rotating room works in the engine today

One place turns it on entry: `enterTile` in `site/keep/engine/movement.js`, the line `if (def.special === 'rotating') rotateTile(g, to)`. `rotateTile` (same file) adds 90 to the tile's `rotation` (clockwise, modulo 360) and logs a `rotate` entry. It sits inside the tile-effects block, which runs when `applyTile` is true; for a forced move it also needs the rules flag `forcedMoveTileEffects` (default true). It runs before every other tile effect and before any room card (D29 order). The owner's rotating room (TILE_014) has mark `none`, so no room card follows and the hero cannot search it.

Every path that reaches it:

| Path | Code | Turns? |
|---|---|---|
| First reveal (moving into an unexplored square) | `attemptMove` -> `enterTile`: the tile is drawn and placed with `rotationFor(def.entrySide, OPPOSITE[dir])`, so the entry side (the owner tile's only opening, S) faces the square the hero came from. Then the same `rotateTile` | Yes, after placing (D10). Net: the opening ends a quarter turn clockwise from the way in |
| Ordinary entry into the placed room | `attemptMove` -> `enterTile` (via `move`); also a move after a yellow corridor or a closed door (`CHOOSE_EXIT`), a dark-room exit (`rollDarkExit` -> `attemptMove`), well and rubble returns (`returnMove`), tower transit | Yes. Possible only through its opening, so again the opening ends a quarter turn clockwise from the way in |
| Through a door or portcullis | `doorOutcome` in `effects.js` (door card opens), `attemptMove` (portcullis lifted), `passBarrier` (Opening Ring) | Yes. Only if a neighbour's door or portcullis faces the opening; the owner tile has none of its own |
| Flight back into it | `flee` (from a monster's flee reaction, the Flee response, or the giant spider's flee option, ROOM_025) calls `enterTile` with `via: 'flight', applyTile: true` | Yes (D16: special rooms apply when fleeing; `monsters.test.js` pins it). Flight needs the open way back, so the opening faced the hero |
| Forced move after the dragon wakes | `forcedMove` in `treasury.js`, `via: 'forced'` | Yes while `forcedMoveTileEffects` is on (default). The target is any revealed, unoccupied maze square next to the chamber, whatever its walls (D19, plan 13 #52), so a hero can be driven in through a wall; the room then turns from wherever it stood |
| A card's move | `MOVE_HERO` in `effects.js` (`via: 'card'`), and the `move-choice` answer in `reducer.js` | Yes unless the card says `applyTile: false`. No owner card moves a hero; fixture cards only |
| The `ROTATE_TILE` effect | `effects.js`, turns the active hero's own square | Only a fixture card (FX_ROOM_SPIN); no owner card |
| The wizard's curse | `ROTATE_TILES`, only tiles of one mark (yellow) | Never: the rotating room's mark is `none` |

What never turns it: staying (a turn spent in the room, a forced skip, any start-of-turn effect; `beginTurn` never calls `rotateTile`), leaving it, another hero's move elsewhere. Pinned by `tiles.test.js` T13 (fixture tile) and now by `spec-v8.test.js` (owner tile, four directions, a forced move, a card move without tile effects).

One hero per ordinary room: `exits` marks an occupied maze square `occupied`, `forcedMoveTargets` and `canFlee` skip occupied squares. So a second hero can never enter while a hero is inside, and the room never turns under a hero who is already in it.

## 3. Positioning, worked through

### 3.1 The owner's tile (TILE_014: a dead end, one opening)

Today, whichever way the hero comes in, the opening ends a quarter turn clockwise from the side the hero came in by. With the ring used (proposal), it would stay on that side.

| Hero moves | Comes in by side | Opening after entry today | Opening with the ring used |
|---|---|---|---|
| North (from the square to the south) | S | W | S |
| East (from the square to the west) | W | N | W |
| South (from the square to the north) | N | E | N |
| West (from the square to the east) | E | S | E |

Hero moving north from square B into the rotating room R (U, L, Rt: the other neighbours):

```
 Today: the room turns              Ring used: it does not turn

            U                                  U
      +===========+                      +===========+
      |           |                      |           |
  L       H       |  Rt              L   |     H     |  Rt
      |           |                      |           |
      +===========+                      +====   ====+
            B  (came from here)                B  (came from here)

 opening on W, facing L              opening on S, facing B
```

What the turned opening can face, and what that means on later turns (rules as built):

- **An unexplored square:** the hero may move there next turn; the new tile is drawn and turned so its entry dot faces the hero (5.1), so the way is always open, unless the tile bag is empty (D27, `no-tiles-left`).
- **A placed tile with an open side toward it, a tower's open side, or the chamber:** an ordinary move.
- **A placed tile with a door or portcullis toward it:** a door card, a Strength test, or the Opening Ring.
- **A placed tile with a wall toward it, or the board edge:** no way out. The room has no dot, so no search (and no secret passage); the hero is offered only a forced skip (D20), or the Strength Ring or a usable item. Nothing reopens it while the hero is inside: no other hero can enter (one hero per room), so the room cannot turn again; only a yellow neighbour turned by the wizard's curse could open a way. Otherwise the hero is shut in until sunset (inside the castle at sunset).
- **An occupied square:** blocked for now; free again once that hero moves on.

With the ring used, the opening faces B, the square the hero just left, which the hero could necessarily cross. So next turn the hero can walk back out the way they came (unless another hero has moved into B meanwhile, which is temporary). That is what the ring protects against: being shut in.

All four entry directions, both cases (the opening is the gap in the border):

```
 Moved north         Moved east          Moved south         Moved west
 (came from S)       (came from W)       (came from N)       (came from E)
 today   ring        today   ring        today   ring        today   ring
 +===+   +===+       +   +   +===+       +===+   +   +       +===+   +===+
     |   |   |       |   |       |       |       |   |       |   |   |
 +===+   +   +       +===+   +===+       +===+   +===+       +   +   +===+
 open W  open S      open N  open W      open E  open N      open S  open E
```

### 3.2 Entering again later

The same hero leaves by the opening and later comes back in through it: the room turns again, and the opening again ends a quarter turn clockwise from the side the hero came in by (the same table). With the ring used on that entry instead, it stays facing the way in. The ring is single-use, so it can protect one entry only.

### 3.3 A second hero

A second hero cannot enter while the first is inside (one hero per room), with or without a ring. Once the first hero has left, a second hero entering turns the room for their own entry (and may use their own Protection Ring, if unused, for that entry). The first hero is not in it and is not affected. If a future card ever moved a hero into an occupied room (none does), the hero inside would stay on the square and their way out would follow the new rotation, as for the wizard's curse (D57).

### 3.4 The general case (any rotating tile shape)

The rule is the same for any tile data: on entry, every side moves a quarter turn clockwise; the ring would keep the tile as it was placed (first reveal) or as it stood (later entry). On a first reveal the placed position always has the entry side toward the hero, so with the ring the hero can always leave the way they came. A forced move can enter through a wall; there the ring keeps the walls where they were, which may or may not leave a way out.

## 4. Timing options

### 4.1 Recommended timing: at the moment of entering, before the turn

The hero has committed the move. The engine has drawn and placed the tile (first reveal) or the tile was already there; the hero is on the square; the move is logged. Then, before `rotateTile`, the hero with an unused Protection Ring gets the choice:

- **Use the Protection Ring:** the room does not turn on this entry. The ring is used and gone (single use, as for a trap card).
- **Keep the ring:** the room turns a quarter clockwise, as today.

After the choice the entry goes on as today (for the owner tile: no room card, the turn ends). Same shape as the trap-card prompt (D50): the choice comes before anything the trap does. A hero may decline: turning can help (a new way out toward unexplored squares).

What the player sees on a first reveal: the player picks a move into an unexplored square without knowing what is there. The tile is drawn and shown on the board, placed with its opening toward the hero, labelled as a rotating room, with the hero on it. Only now does the choice appear ("A rotating room: it turns a quarter clockwise as you enter"), and the board shows the room unturned while the choice is open. On a later entry the player already sees the rotating room on the board before choosing the move; the same choice appears after the move.

### 4.2 Variants (owner decisions, section 7)

- **(a) Every entry that would turn the room** (first reveal and every later entry). Follows 5.7's "every time" for the turning. Recommended.
- **(b) First reveal only.** Follows 5.7's trap sentence, which is tied to drawing the tile; on later entries the hero knows what the room does. Simpler, and the ring cannot be spent on a room the player chose to walk into knowingly.
- **Flight back into it** (from a monster or the giant spider): the hero's own turn, so the prompt fits. Either offer (consistent with "every entry", and D16 says special rooms apply on flight) or not (flight is a retreat, the turn ends anyway). Recommended: offer.
- **Forced move after the dragon wakes:** happens during the wake, outside turn order; the prompt would go to the driven hero (like the forced-move choice, which already goes to that hero), not to the active seat, and the wake would go on after it. Recommended: offer, for the same "every entry" reason; the alternative is not to offer it there.
- **A card's move with tile effects** (no owner card does this): follows the same rule as an ordinary entry; with `applyTile: false` the room does not turn, so no prompt.
- **Another hero already inside:** cannot arise (one hero per room).

### 4.3 Timings rejected

- Before choosing the move: impossible on a first reveal (the tile is unknown), and unlike every other ring timing.
- After the turn, to turn it back: not "negating the rotation on entry"; it would also need a new "turn back" effect.

## 5. Interaction checks

- **Single use, consumed:** the ring is spent exactly as for a trap card (`consumeRing`: `ringUsed`, item log "use" and "discard, out of the game"). Used on the room, it is gone for a later trap card; used on a trap card, it is not offered at the room.
- **A hero without the Protection Ring** (any other ring): no prompt; the room turns, exactly as today.
- **A hero whose Protection Ring is used:** no prompt; the room turns.
- **Solo and multiplayer:** the same. In multiplayer the prompt goes to the entering hero's seat; nobody else needs to look away (`screenOwner` stays null).
- **Hidden information:** none added. The tile is public once drawn, and each hero's unused ring is already shown in every player's inventory view.
- **Undo and commit points:** no new commit point. A first-reveal move already is one (tile drawn and revealed), so undo can come back to the prompt but not before the draw. A re-entry into a placed rotating room reveals nothing (as today, that move can be undone); the choice adds no roll or draw, so the move and the choice can both be undone and the ring comes back.
- **Other rings unaffected:** the Opening Ring (doors and portcullises only), the Strength Ring (turn action) and the Thunder Ring (normal encounters) are unchanged and are never offered at the rotating room.
- **Not part of this proposal, and staying excluded:** the well, rubble, the dark room and the portcullis (D50, plan 13 #41), and the wizard's curse (owner interpretation, spec v8, plan 13 #47).

## 6. The change it would take (design only, no code)

Smallest design, no content change:

1. **A rules flag**, as the plan does for provisional rulings: `rotatingRoomRing: 'never' | 'every-entry' | 'first-reveal'` in `DEFAULT_RULES` (`reducer.js`), with its allowed values and tag (`interpretation`), plus a sub-setting or second value for flight and forced moves if the owner splits them (section 7). Default stays `'never'` until the owner approves; on approval the default becomes the approved value.
2. **The ring keeps its data.** RING_4 stays `use: { timing: 'trap-drawn', effects: [IGNORE_TRAP] }`; the engine widens what meets that timing to "a drawn trap card, or a rotating room turning on entry" under the flag. (A new ring timing would mean a ring with two timings in its data, a schema change; not needed.) Its notes and the shown timing wording (`describe.js` `RING_TIMING`, `inventory.js` `RING_REASON`) get the extra words.
3. **In `enterTile`:** split the tile effects at the turn. If the tile is rotating, the flag allows this entry and `ringFor(g, content, seat, 'trap-drawn')` holds, set `g.pending = { kind: 'rotation-ring', seat, at }` and stop; the rest of the entry (the turn unless the ring was used, then any later tile effects and room card, in the D29 order) runs as a continuation when the answer comes. `phases.js` offers USE_RING and DECLINE_RING for this pending kind as for `trap-ring`; `reducer.js` USE_RING and DECLINE_RING resume the entry, skipping or applying `rotateTile`, and a `rotation-ignored` log entry records the use. For a forced move the continuation then calls `continueWake`.
   (Alternative: a tile-level trap marker in the tile data, `trap: true` on TILE_014, that the existing `trap-ring` prompt reuses. It needs a schema field, a content edit to the owner's tile file and a stack frame for a tile effect; more change for the same result.)
4. **MECHANICS_VERSION** to v10 once the default changes: the same actions then give a different game (a new prompt), so v9 saves are refused, as for every earlier rule change. While the default stays `'never'`, no bump is needed.
5. **UI:** the existing ring sheet (`ui/app.js`, the `trap-ring` branch) with room wording: title "A rotating room", "Use the Protection Ring: the room does not turn. The ring is then gone." and "Keep the ring: the room turns a quarter clockwise." For a forced move it names the seat that decides. The board already draws the tile from its stored rotation, so it shows the room unturned while the choice is open. One new log line in `ui/words.js` for `rotation-ignored`.

## 7. Decisions the owner must make

1. Should the Protection Ring be able to stop the rotating room turning at all? (Recommended: yes, as an interpretation of 5.7 "trap" plus the ring card.)
2. Offer it on every entry that would turn the room, or only on the first reveal? (Recommended: every entry.)
3. Offer it on a flight back into the room? (Recommended: yes.)
4. Offer it on a forced move after the dragon wakes, to the driven hero, outside turn order? (Recommended: yes.)
5. May the hero decline and keep the ring? (Recommended: yes, as for trap cards.)
6. Status labels: "the rotating room is a trap" as DIRECT 2023 RULE (5.7), and the ring's timing on it as PROVISIONAL/INFERRED (an interpretation joining 5.7 and the ring card). Agree?

## 8. Proposed test cases (each to approve or strike)

Owner tile TILE_014 unless said; "ring" means the Protection Ring, unused, held by the entering hero.

1. Given a hero with the ring moving into an unexplored square that draws the rotating room, when the tile is placed, then it is placed with its opening toward the hero, the hero is on it, no `rotate` entry is logged yet, and the hero's only choices are Use the ring and Keep the ring.
2. Given test 1, when the hero uses the ring, then the room keeps its placed rotation, the ring is used (`ringUsed`, item log use and discard), a `rotation-ignored` entry is logged, no die is rolled, and the turn ends as after any entry into this room.
3. Given test 1, when the hero keeps the ring, then the room turns a quarter clockwise exactly as today (same rotation and log as the current engine) and the ring stays unused.
4. Given a hero with no Protection Ring (any other ring), when entering the rotating room, then no prompt appears and the room turns as today.
5. Given a hero whose Protection Ring is already used, when entering, then no prompt appears and the room turns.
6. Given each of the four entry directions with the ring used, then the opening faces the side the hero came in by, and on the next turn a move back out that way is legal.
7. Given each of the four entry directions with the ring kept, then the opening faces a quarter turn clockwise from the way in (in by S: W; by W: N; by N: E; by E: S).
8. Given the rotating room already placed and a hero entering it again with the ring: under "every entry" the prompt appears and using it keeps the room still; under "first reveal only" no prompt appears and the room turns.
9. Given a hero fleeing back into the rotating room with the ring: offered or not as ruled (decision 3); either way no room card is drawn and the turn ends.
10. Given the dragon waking and driving a hero with the ring into the rotating room: if offered (decision 4), the prompt goes to the driven hero's seat, not the active seat, and after the answer the wake goes on with the next hero in the queue; if not offered, the room turns as today.
11. Given a card move with tile effects into the rotating room (fixture card), then it follows the ordinary-entry rule; with `applyTile: false`, no turn and no prompt.
12. Given a hero staying in the rotating room for a turn (forced skip), then there is no prompt and no turn.
13. Given the ring used on the rotating room, when that hero later draws a trap card, then no ring prompt appears; and given the ring used on a trap card, when that hero later enters the rotating room, then no prompt appears and it turns.
14. Given a 2-player and a 4-player game, when a hero with the ring enters the rotating room, then the prompt is that hero's, `screenOwner` is null, and every seat sees the same state apart from its own chamber cards (no hidden information added).
15. Given a first reveal, the ring choice can be undone back to the prompt but not past the tile draw; given a re-entry, the choice and the move can both be undone and the ring is unused again.
16. Given a hero holding the Opening, Strength or Thunder Ring, when entering the rotating room, then no prompt appears; the Opening Ring is still offered only at a door or portcullis.
17. Given the well, rubble, a dark room or a portcullis, then no Protection Ring prompt appears (unchanged).
18. Given the wizard's curse, then no Protection Ring prompt appears (unchanged, spec v8).
19. Given a v9 save, after the change it is refused (MECHANICS_VERSION v10); a recorded game in which no hero with the ring enters a rotating room replays the same.

## 9. Recommendation

Approve the timing in 4.1 with variant (a): offer the Protection Ring at the moment a hero enters the rotating room, before it turns, on every entry that would turn it, including a flight back into it and a forced move after the wake; single use, may be declined. Built as a rules flag (default unchanged until approved), the ring's data unchanged, a pending prompt that reuses the ring sheet, MECHANICS_VERSION v10.

Alternatives, in order: (b) first reveal only (closest to the trap sentence in 5.7, fewest prompts); (a) without forced moves (keeps the wake free of prompts outside turn order); keep the current exclusion (the ring never applies to the room), recorded as an owner interpretation against the plain wording of 5.7.
