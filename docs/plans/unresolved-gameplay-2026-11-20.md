# Dusk Keep: what is still unresolved (2026-11-20, after spec v10)

Purpose: one list the owner can settle so the engine can be approved in full and given a final end-to-end play-test. The owner's words: "With these approved, I'd focus next on the remaining unresolved gameplay behaviors rather than continuing to relabel established decisions. The goal is to get the engine to a point where we can approve the full implementation and perform a final end-to-end play-test."

Method: every register row D01-D67 (plan section 9), every section 13 row, the matrix statuses (section 7), the card audit (`audit-card-catalogue-2026-11-19.md`), the `Status:` note of every content entry (`node tools/keep-content.js check`), the rules-config flags (`DEFAULT_RULES`, `RULE_TAGS` in `engine/reducer.js`), the `shortcut:` comments in `site/keep` (there are no TODO or FIXME comments) and the UI gaps recorded in the plan and audit. An item is listed when it is not yet a printed 2023 rule, direct card data or an explicit owner approval. Behaviour was read in the code and, where the line matters, confirmed by an existing test. Nothing here changes behaviour or labels.

"How often" comes from random legal play over the owner's full content (`tools/keep-soak.js` seeds and picker, 300 games, 1/2/4 players, run 2026-11-20) unless it says "reasoning". Random play is not real play: it rarely aims for the treasure chamber (2 of 300 games collected, no wake) and it opens every chest it is offered, so dragon items are rarer and card items more common there than at a real table. Scale: every game / some games (roughly 1 game in 3 to 1 in 20) / rare edge (rarer, or only with a prepared position).

## 1. Gameplay rules needing an owner decision

Each has a working default today, so none blocks a play-test; each is a question the printed rules and cards do not answer and the owner has not yet ruled on. A recommendation that keeps today's behaviour needs no code change (only a label); any other answer is a small data or code change with a MECHANICS_VERSION bump (older saves refused) and a test.

| # | Id | Situation in play | What the game does today | Why unresolved | Options | Recommended | How often |
|---|---|---|---|---|---|---|---|
| 1 | D55, section 13 #49 | A hero fell into a trapdoor pit (ROOM_015) and climbs out on a later turn, or holds a rope | Each later turn starts with "Climb out", an Agility test: a pass lifts the pit and the turn goes on as a normal full turn (move, search, ring); a fail ends the turn. A held rope frees the hero at the start of the next turn with no test, and is never used up | OWNER DECISION REQUIRED since the catalogue (2026-11-19); spec v6 did not address it; the card text is the owner's paraphrase | (a) keep: a pass lets the turn go on; (b) climbing out uses the whole turn; (c) a pass allows movement only; separately, the rope kept for ever or spent once used | (a), rope kept: it matches the printed escapes from rubble (2023 rules 5.8, force through and go on) and the dark room (5.5, roll out and go on), and the card prints no limit on the rope | Some games (trapdoor drawn in 108 of 300 games, a fall in 45; a rope freeing someone in none) |
| 2 | D58, section 13 #49 | A hero meets the giant spider (ROOM_025) | Its own event, not A/B/C: Fight or Flee. Flee only when a way back exists (as for monsters, 2023 rules 9.4), D6 3-6 is the normal flight (no room card, turn ends), 1-2 means fight. A fight round: name three numbers, roll a D6; a match kills it, a miss costs 1 HP and the next turn is another fight round; a kill on that later turn ends that turn | OWNER DECISION REQUIRED (the later-turn kill ending the turn) since the catalogue; spec v6 only confirmed it is not a trap | (a) keep; (b) a kill on a later turn lets the turn go on; also whether Flee needs a way back | (a): a fight round is the turn's action, like A/B/C combat, which ends the turn (2023 rules 9.1); Flee follows the printed flight rule | Some games (drawn in 110 of 300, a second fight round in 44) |
| 3 | D57, section 13 #47 | The wizard's curse (ROOM_007) turns every placed yellow corridor while heroes stand on some of them | D6: 1-2 a quarter turn clockwise, 3-4 a half turn, 5-6 a quarter turn counter-clockwise. Heroes stay on their squares and their ways out follow the new rotation; fallen portcullises (board edges) and this turn's tried doors stay; no special tile is yellow in the owner's tiles | OWNER DECISION REQUIRED (heroes on a turned corridor) since the catalogue | (a) keep: heroes stay and turn with the tile; (b) heroes on a turned corridor do not have their tile turned; (c) heroes are moved | (a): the card turns tiles and says nothing about heroes; it matches the rotating room, where the hero turns with the room (5.7) | Some games (drawn in 67 of 300; a hero standing on a yellow corridor at that moment in a share of those, more with 3-4 players) |
| 4 | D54 | A hero takes the poisonous mist (ROOM_003) or the explosion (ROOM_005) | Mist: D6 - 3 damage, then one skipped turn per point actually taken (0 damage skips none). Explosion: 4 damage, then the next turn is skipped. Skipped turns add up, run before anything else at turn start, and the table is told each one | PROVISIONAL/INFERRED: the engineer's reading of the owner's catalogue paraphrase, never confirmed | (a) keep; (b) the mist skips a fixed one turn whatever the damage; (c) skipped turns do not add up | (a): the most literal reading of the catalogue; (b) only if the physical card says one turn | Some games (a skipped turn in 69 of 300) |
| 5 | D19, section 13 #2, #52 | The dragon wakes and drives a surviving hero out of the chamber | Each survivor, waker first then clockwise, moves to an already-revealed ordinary maze tile orthogonally next to either chamber square, chosen by that hero's player; single occupancy applies; no open passage is needed (walls are ignored); no room card; never a new tile. With no such tile the hero stays inside and the dragon stays awake (D40) | Spec v6 restated the wake as "move to any adjacent maze tile"; section 13 #52 asks whether unrevealed squares should count. The walls part is answered by the owner's spec v9 statement (see section 3, item 3) | (a) keep: revealed tiles only; (b) also unrevealed squares, revealing a tile outside turn order (with or without its room card); (c) require an open passage | (a): no tile is ever revealed outside turn order; with (b) the forced move would also have to decide the new tile's dot, room card and special room | Every wake; wakes are rare in random play (0 in 300) but a real table that keeps collecting meets one in some games; a stuck hero (no revealed free tile) mostly early in a game, reasoning |
| 6 | Section 13 #3, flag `forcedMoveTileEffects` | The dragon drives a hero onto a well, rubble, dark room or rotating room next to the chamber | The tile's effect applies as for a flight (D16): the well's Agility test, the rotating room's turn (with the Protection Ring offer, spec v9), the dark room and rubble carry-overs. Flag default on; off skips them | Default chosen at M0 with "verify against the rulebook"; never put to the owner as a question. Spec v9 already assumes it for the rotating room (the ring offered on the forced move) | (a) on; (b) off | (a): the same as a flight (D16, printed 9.4 "tile effects still apply"), and consistent with spec v9 | Rare edge (a wake, and a special tile next to the chamber) |
| 7 | Section 13 #11 | A hero flees back into the chamber (it came from there), or flees or is moved by a card into a tower | Fleeing into the chamber is an entry: two treasure cards and a dragon card are drawn (D18 applies to every entry), unless the dragon is awake. Into a tower: Escape / Stay, never Continue after a flight | "Rare, verify" since M2; never asked | (a) keep; (b) a flight into the chamber draws nothing | (a): 2023 rules 10 has every entry collect and 9.4 says tile effects apply after a flight | Rare edge |
| 8 | Section 13 #14 | A compulsory move (the dark room's rolled exit, a well or rubble climb-back) meets a door that stays shut | The turn ends and the hero stays (D07 extended to doors); on a voluntary move a shut door leaves the other passages open (printed 6.2) | Engineer's extension of D07; never asked | (a) keep; (b) let the hero try another passage | (a): a compulsory move has no choice of exit (5.5), so there is no other passage to try | Rare edge |
| 9 | D44 and the rules switches without a control | Options that exist in the engine but cannot be chosen on screen | Only solo combat (target or the A/B/C digital variant) has a control. `soloMonsterHp: 'hidden-house-rule'` (D44), `darkRoomPolicy: 'EVERY_ENTRY'`, `forcedMoveTileEffects: false`, `towerAtSunsetCountsAsEscape: true`, `escapeWithoutExploring: true`, `rotatingRoomRing: 'first-reveal' / 'never'` are settable only in code; Settings, Rules in play lists the values in force | The owner said the hidden HP "can be offered later as an explicitly labeled house rule" (spec v4); the others are old alternatives kept as data | (a) leave them without controls for the play-test; (b) add a labelled house-rule control for D44 only; (c) remove the unused alternatives | (a) now, decide (b) or (c) after the play-test: no rule depends on it | Never in play today (reasoning) |

Optional variants recorded but not built, no decision needed unless wanted: a computer monster controller in multiplayer (section 13 #6) and target combat for groups (section 13 #17). Recommended: leave unbuilt.

## 2. Provisional data needing physical verification

| Id | What | Today | Check on the physical set |
|---|---|---|---|
| D64, section 13 #46 | The 21 treasure-chamber coin cards (TREASURY_013 to TREASURY_033) | One card of each value 100 to 300 in steps of 10, inferred from the official total of 33 minus the 12 photographed valuables; every one `Status: PROVISIONAL/INFERRED` | Count the coin cards by face value; a different spread is a data edit in `treasury.js` |
| D52 | The 12 monster combat cards (S09-S12): letters B and C | A is legible on the photos; B and C were inferred from each card's hit target (A beats B, B beats C, C beats A); a normal hit of 1, no double hit | Read the B and C letters and check for a printed double hit on each monster combat card |
| D51 (optional) | The four monster cells that print FP where HP belongs (#6 Flee/Skeleton, #14 Flee/Orc, #15 Flee/Dark Elf, #15 Flee/Skeleton) | Read as HP (owner spec v6, DIRECT 2023 RULE); the print kept as `printedStat: 'FP'` | Settled by the owner; a second look only if the owner wants it |
| R79, plan 8.2 | Symbol die faces and target geometry for the solo target combat | Not entered: solo target combat takes the result by hand from the physical target and die (D17); the digital game cannot roll it | Only needed if the game should run the target itself; otherwise nothing |
| Section 13 #8b | The "poison powder" the rules mention | No card for it; spec v5 settled the special weapons as the two crossbows on HERO_5 and HERO_6 | Confirm no poison powder card exists in the set |
| All decks (audit section 1) | Card effects | Every card is structured data entered from the owner's catalogue paraphrases, not from the printed card wording | Part of the content approval (section 4): compare each card's effect, as the game describes it, with the physical card |

## 3. Settled in behaviour, provisional or interpretation only for lack of an explicit approval

These behave as the owner directed or as the cards say; the label lags. The owner can approve them in one line ("approve section 3 as described"); they are not relabelled here.

1. **D07** (section 13 #14 is item 8 above): a blocked dark-room exit (wall, occupied room, shut door) leaves the hero there to roll again next turn. Owner M0 ruling, marked "provisional" until the rulebook was read; 2023 rules 5.5 print nothing about a blocked exit. Some games (15 of 300).
2. **D11, section 13 #4 and #15**: a secret passage may cross a printed wall to any orthogonal neighbour and lasts for this turn's move. Owner M0 ruling, "provisional until the full card definition"; the owner's secret door card (RSEARCH, 5 copies) is now catalogued and the audit found the engine correct. Every game (secret passages in 218 of 300).
3. **D19 stay-put exception and the walls part of the forced move**: "provisional house-rule exception" in the register, but spec v4 (D40) directs it in the owner's words ("leave them in the chamber with the dragon awake"), and spec v9 says the forced move's lack of a free-passage requirement "is not established as defective". Only the unrevealed-square question stays open (section 1, item 5).
4. **D01 and section 13 #35**: equal top gold among escapees gives co-winners. The owner ruled it at M0 and chose to keep it; section 13 #35 still reads "owner to rule on the tiebreak" because the owner once asked whether the faster escape should win (each escape sun is kept, so faster-wins is a data change if ever wanted). Close #35 with co-winners. Rare edge (no tie above 0 gold in 300 random games; plausible at a real table).
5. **D56 torch**: once relit (three named numbers, a D6 match) the turn goes on and the card returns under the room deck. Status DIRECT 2023 CARD covers the return; the turn going on is the same shape as item 1 of section 1 (approve together). Some games (69 of 300).
6. **D65 draft banner**: "Play-test: your own draft content, not approved yet", with Details counting entries by status. It is the owner's own instruction (app-only), labelled PROVISIONAL/INFERRED only because no label fitted. Every play-test game.
7. **Matrix rows with stale content statuses**: R20 (board) and R54 (tiles) still say NEEDS CONTENT though the owner's board, chamber and 88 tiles are entered and approved; R65 says the special weapon's effects need content though both crossbows are data (D46). A documentation tidy, no owner input needed.

Checked and already settled (listed because they were asked about): D60 bones (DIRECT 2023 CARD: odd D12 is a normal Skeleton encounter), D61 optional draws (DIRECT 2023 RULE), D59 ceiling, D62 "shuffle again" in all five decks, D63 the trap list, D51 the FP cells (owner decisions in specs v6 and v7, with evidence labels), D66 hero names (the owner keeps the roster and edits names; section 4), and the six behaviours of spec v10.

### 3b. Latent edges: no decision needed with the current content

Behaviour exists and is documented, but the owner's content never reaches it (reasoning, and 0 in 300 random games where counted):

- A `DRAW_CARD` with `then: 'keep'` that draws a "shuffle again" card would keep it instead of redrawing (noted with spec v7). No owner card draws to keep (only a fixture does), and the treasure deck, drawn at collection, has no shuffle card.
- An exhausted deck yields no card (`decks.js` shortcut); an empty door deck counts as a door that stays shut (`movement.js` shortcut). No deck emptied in 300 games.
- Treasure-chamber cards are kept as drawn, any printed effect not run (`treasury.js` shortcut). No owner treasure card has an effect.
- The tile bag running out leaves the remaining squares impassable (D27, owner M0 ruling). Never in 300 games (mean game 16 rounds).
- D04 heal cap at starting HP: no owner card heals with a cap (the flask and the Strength Ring are uncapped by ruling).
- D38 a held item used as the turn's action ends the turn: no owner held card has that use.
- Section 13 #13 order of effects on a tile with a special and a dot: no owner tile has both. Section 13 #16 card effects after an encounter: no owner card has any.
- D42 a well tile that is not straight: the owner's only well tile is straight.
- Undo keeps at most 20 snapshots (`ui/undo.js` shortcut) and clears them at every reveal.

## 4. Non-rule work before a final play-test

**Content status (everything owner-written is draft).** The checker today: tiles 88/88, board and chamber approved; every other category draft: heroes 8, special weapons 2, combat cards 36, treasure 33, dragon 8, room 27 entries (60 cards), search 7 (15), room search 8 (14), chest 9 (14), door 5 (15), monster 15, rings 4, so 162 entries. "Start game" stays off until every slot is approved and valid ("Start is off until the content is complete: Heroes 8/8 (0 approved, 8 draft)" names only the first blocking category). To approve, the owner changes `status: 'draft'` to `status: 'approved'` on each entry in `site/keep/content/original/*.js` after checking it against the physical card, and runs `node tools/keep-content.js check`; approving an entry does not change its rules. Hero names (D66): the owner keeps the current roster for now and edits the `name` fields in `heroes.js` directly (the catalogue's working names are in audit section 1). Biographies: every hero `text` is empty (8), as are the dragon, monster, special weapon and ring texts; card texts are optional (the game generates them from the data). Art: `art: null` on the 31 tile entries, 8 heroes, 2 crossbows, 36 combat cards, 8 dragon and 15 monster cards; nothing requires art for Start, and the art direction (plan 12 #4) is undecided. The game name and route id are placeholders ("Dusk Keep", `keep`).

**UI flows never seen in a real browser** (the build agents had no browser; the orchestrating session did browser-test at phone size: the hero picker, ring pick, a crossbow shot, solo and two-player play on the owner's cards including a full game to the results screen, and on 2026-11-20 both rotating-room ring choices in the trapped case at the board edge, one entry direction; everything else in this list is unseen):

- The torch and giant spider number picker, the ceiling's one number then second die (roll card, keyboard, screen reader).
- The wizard's curse roll and the corridors redrawn turned.
- The trapdoor fall and the "Climb out" prompt, with and without a rope; mist and explosion skipped-turn notices and the "Unconscious" line.
- Bones; "Open the chest?" / "Search the body?"; a room, search, room search, chest or door "shuffle again" with the replacement in the same action.
- The flask Use button at the start of a turn and while choosing whether to keep moving (HP above the starting value).
- The Protection Ring on a trap card (choice before any die) and at a rotating room: the room shown placed and unturned behind the prompt, Use and Keep, above all where the turned opening would face the board edge or a wall, and the dragon driving a ring holder into it.
- The dragon: odds 1 in 8, 1 in 7 on the status chip, the wake, two forced moves, "The dragon is awake", a stuck hero, a hero entering while awake.
- Flight and forced entry into the rotating room; the move reason lines only restate tile effects for ordinary moves, not for flights or forced moves (M4c shortcut).
- Landscape (667x375) and wide layouts for every prompt added since M4d (rotation ring, number picker, optional draws, climb out, skipped turns, flask, draft banner Details).
- The solo target-entry screen, reported earlier as long on a phone (not recorded in the plan; to confirm and shorten).
- A screen reader beyond labelled controls (the live region reads results), a real phone (pinch was only checked with synthetic events), the 375x812 check still open since M4d, the full-fidelity Start (never enabled), and signed-in saves against the Worker.

**Test suite.** 314 tests, about 36 seconds on this machine; the 300-game catalogue soak is most of it (`KEEP_CATALOGUE_GAMES` sets its size) and the new spec v10 random-play check takes about 4 seconds. Acceptable as is.

**Save compatibility.** Saves and the autosave carry MECHANICS_VERSION (`rb-0.2/sp-1.0/v10`); any rule change bumps it and older saves are refused. Settle section 1 before the final play-test so its saves stay loadable. A save keeps the newest undo steps that fit in about 240 KB.

**Outside the game, still the owner's:** independent IP advice before any public distribution (plan 12 #9), the fate of the companion and Tidevault (12 #8), and any merge, push or deploy (explicit go-ahead only).

## 5. Proposed order of work

1. Owner: answer section 1 in one sitting (recommendations given; items 1-5 are the ones that come up in play, 6-9 are quick).
2. Owner: approve section 3 in one line.
3. Engineer: apply any answer that differs from today (data or code, test, MECHANICS_VERSION bump), then relabel sections 1 and 3 as decided. If every recommendation is taken, this is labelling only and no save is invalidated.
4. Owner: check section 2 on the physical set (coins and monster B/C letters at least); engineer enters any correction.
5. Engineer with a browser: walk the section 4 UI list on a desktop browser and a phone-sized window, fix what is found (the solo target screen first); then the owner on a real phone.
6. Owner: final end-to-end play-test (below) on "Play-test my content", which plays the owner's entries alone (no fixture fill-in) under the draft banner, so nothing needs approving first.
7. Owner: approve the content category by category (`status: 'approved'`, checker clean), names as wanted; a short smoke game with the full "Start game" once it unlocks.
8. Owner: approve the implementation; merge, push and deploy only on the owner's explicit go-ahead.

## 6. End-to-end play-test script (phone)

**Setup tips.** Use the branch's local preview (BUILD-GUIDE "Preview and checks") opened from the phone on the same network, or a desktop browser in a phone-sized window first. Title screen, "Play-test my content". Play at least one solo game (target combat, then the A/B/C digital variant) and one 3- or 4-player hot-seat game; pick the two hunters (crossbows) and give the rings out so all four are in play. Keep the event log open on a second look after each step; it states every roll and draw. Tick each line once seen.

**Title and settings**

- [ ] The draft banner shows; its Details list the draft categories and the counts by status.
- [ ] "Start game" is off and says why; "Play-test my content" starts.
- [ ] Settings: Rules in play lists each rule; light and dark; reduced motion.

**Setup**

- [ ] First player by D12 (multiplayer), heroes chosen clockwise, rings from the last picker counter-clockwise, towers chosen; shared towers allowed.

**Moving and tiles**

- [ ] A new tile is drawn and turned so its dot faces the way in; a revisited tile keeps its place and turn.
- [ ] Black room: one room card on every entry. Red room: a room card and the portcullis falls behind (no flight back through it).
- [ ] Yellow corridor: no card, go on or stop.
- [ ] Dark room: the turn ends; next turn a D6 picks the way out and the move goes on.
- [ ] Rubble: the turn ends; next turn go back or an Agility test to force through.
- [ ] Well: Agility on entry (fail is death); next turn climb back or jump (+1 per treasure-chamber card, drop cards first); a jump ends on the far edge of the same tile.
- [ ] Rotating room: turns a quarter clockwise on every entry, not when staying; with the Protection Ring unused, the Use / Keep prompt before it turns.
- [ ] Door: a door card; opens (through), stays shut (another way this turn), trap (turn ends); the Opening Ring at a door or portcullis.
- [ ] Portcullis ahead: a Strength test (previewed first).
- [ ] Search in a black or red room: the room search deck; a secret door opens a one-use way through a wall.

**Cards**

- [ ] Empty room; treasure kept (gold shown); "Open the chest?" and "Search the body?" with Leave it.
- [ ] A trap card with the Protection Ring: the choice comes before any die; with Keep the trap resolves.
- [ ] Ceiling collapses: pick one number, a D6; on a miss a second D6 is the damage.
- [ ] Torch goes out: three numbers each turn until a match.
- [ ] Giant spider: Fight or Flee; a fight round names three numbers.
- [ ] Trapdoor: Luck test, a fall, "Climb out" next turn (with a rope: freed at once).
- [ ] Poisonous mist or explosion: the skipped-turn notice.
- [ ] Wizard's curse: the yellow corridors redrawn turned.
- [ ] Small flask: drunk at the start of a turn and while choosing whether to go on; the turn is not used; HP can go above the start.
- [ ] A "shuffle again" card: the cards are shuffled and the replacement follows in the same action.
- [ ] Bones: odd D12 starts a Skeleton encounter.

**Monsters**

- [ ] Attack / Wait / Flee chosen before the monster shows; in multiplayer the right-hand player gets a covered screen, reads the card and announces; the hero never sees its HP.
- [ ] A/B/C picks revealed together; the fight loops until one side dies.
- [ ] Flight back the way in: no room card there; strike-then-flee and strike-then-fight reactions.
- [ ] Ambush: damage first (D12 - Luck), then Attack or Flee, never Wait.
- [ ] Crossbow: Shoot (4 shots), a miss, a hit, a kill.
- [ ] Thunder Ring: the monster flees, no card drawn; not offered in an ambush.
- [ ] Solo: the computer plays the monster; its HP shows once revealed; target result entry; the A/B/C variant labelled as such.

**Rings, treasure chamber, towers, end**

- [ ] Strength Ring at full HP: the turn is skipped, +5 HP.
- [ ] Enter the chamber: two private cards, then a dragon card with "1 in 8", next time "1 in 7"; Stay and collect; "Show my cards"; leaving draws nothing.
- [ ] The dragon wakes: chamber cards lost, a D12 each, forced moves outside turn order, the deck back to 8 once the chamber is empty.
- [ ] Reach a tower: Escape / Stay / Continue; Escape later after Stay.
- [ ] A hero dies: out of the turn order, their cards back to their decks.
- [ ] Sunset after 26 rounds, or nobody left: results list Escaped (gold), Dead and Inside at sunset; highest gold wins.

**Undo, saving, phone behaviour**

- [ ] Undo only before something is revealed, with the "Undo {name}'s ..." label.
- [ ] Save; reload mid-encounter (same phase, nothing drawn twice); resume the saved game; delete a save.
- [ ] Lock the phone on a private screen: the cover comes back; the screen stays awake during play.
- [ ] Portrait and landscape; VoiceOver or TalkBack on a few prompts.

**Rare enough to need a prepared position.** These come up too seldom to be sure of meeting them in a few games, and nothing should be added to the shipped game to force them: the wake with a hero who cannot get out, then another hero entering the awake lair; the dragon driving a hero onto a well or into the rotating room; the jump back across the well; a dark room's blocked exit; a tower reached on the last turn (sun 26); equal top gold (co-winners); each of the nine trap cards and the door's "shuffle again"; the tile bag or a deck running out. Each is covered by Node tests today (`treasury.test.js` T26 and T26b, `spec-v4.test.js`, `spec-v6.test.js`, `spec-v9.test.js`, `spec-v10.test.js`, `scenarios.test.js` M-A and M-B, `v2.test.js`). Seeing them on screen needs a position prepared outside the shipped game, for example a developer script under `tools/` that replays a scripted list of actions through the same reducer and writes a save the preview can load on a desktop browser; that tool does not exist yet and is the owner's call.
