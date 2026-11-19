# Dusk Keep: implementation plan

Working title "Dusk Keep", game id `keep`, folder `keep/`. All three are placeholders for the owner to rename.

> **v2 changes (2026-11-19).** The owner sent a revised specification and a firm tower and sunset ruling, recorded in [`spec-v2-owner-2026-11-19.md`](spec-v2-owner-2026-11-19.md); where it and an earlier ruling disagree, it wins. The engine now follows it: a 10 x 11 board (110 squares, corner towers, a two-square chamber in the middle) whose BoardDefinition is the authority for movement geometry; towers as shared rooms with an Escape / Stay / Continue choice on entry (D23 rewritten, D32, D33); the dark-room policy `darkRoomPolicy` (D06); well and rubble entry records; a semantic event log with a debug view; the synthetic-data list and the app label "Mechanics engine under verification". Every register row and rules-config entry carries a spec v2 authority tag (section 9). The UI follows it too (M4c, section 11).

Status: M0 approved by the owner (2026-11-18). The owner checked all 31 decisions (D01-D31, section 9) against the 2023 Swedish rulebook and ruled on each; the register records the rulings with a class. M1 (deterministic board, clock, hero, turn and dice engine) and M2 (tile effects, doors and gates, decks and the effect interpreter, monsters and A/B/C combat, inventory and gold, the chamber and dragon, the hidden-information view) are built on the local branch `keep-engine`, and M3 (the playable frontend at `site/keep/index.html`, fixtures only until owner content exists) is built on top. No push, no merge, no deploy.

Sources, cited throughout as:

- **RB**: `dungeon_adventure_core_rules_tiles_cards_pending.md` (the owner's rules summary, core rules v0.2), by section number.
- **SP**: `dungeon_adventure_exact_mechanics_digital_build_spec.md` (the owner's build spec, the primary contract), by section number.
- **BG**: `docs/BUILD-GUIDE.md`.

Authority order, per the owner: the 2023 Swedish rulebook first and final (never another edition), then SP as the contract, then RB as interpretive notes. The Swedish rulebook itself was not read by the engineer (no web fetch); the owner checked the decision register against it. Section 13 lists only the contradictions still open after those rulings.

---

## 1. What is being built

A fully digital, playable dungeon board game for 1 to 4 players in local hot-seat (pass-and-play), running in the NordgrenLabs games site. The computer is the board, the decks, the dice, the referee and the save file. Its rules engine reproduces the documented procedures of the source tabletop game as faithfully as the sources allow: turns on a sun clock from 1 to 27 (26 turns), D12 roll-under stat tests, tile reveal oriented by the entry dot, dot types and special rooms, doors, portcullises, temporary passages, separate decks with bottom-of-deck return, commit-before-reveal monster encounters with a right-hand monster controller, A/B/C combat, flight, ambush, the central chamber with its shared 8-card dragon deck, and escape to any corner tower with victory by gold among escapees. The engine is data-driven: tiles, cards, heroes, rings and the board are content slots filled later with the owner's own original content, and anything missing is shown as pending, never faked. Everything expressive (name, heroes, monsters, card wording, art, map art, story) is original. This is not Tidevault (`a414084`) and not the table companion at `dungeon/` (`becd950`, work stopped). Both stay untouched; the owner decides their fate.

## 2. Creative and content boundary

| Area | Treatment |
|---|---|
| Mechanics, procedures, dice formulas, turn economy, deck structures and counts, probabilities | Implemented faithfully, in our own independent code. In scope in full. |
| Game name, hero identities and art, monster names, card wording, iconography, map art, narrative, sound | Original. Placeholder working title "Dusk Keep". |
| Content slots: 88 tiles, 224 cards, 8 heroes, 4 rings, 2 crossbow cards, board layout | Filled with the owner's own original content that fits the documented structure: same deck categories and counts, same dot types and tile behaviours, same effect primitives. |
| Rulebook stat lines (knight 6/4/9/4/17, hunter 2/9/5/8/10) and the 4-HP troll combat example | Automated-test fixtures only, to verify rule arithmetic (RB 3, RB 8.5, SP 3, SP 7). Never shipped as heroes or monsters. |
| Purely mechanical gaps (tie-breaks, dragon reset on voluntary exit, damage floor, first-player ties and so on) | Decision register (section 9): all 31 ruled by the owner, each with a class (explicit rule, interpretation, house rule, application-only). Never decided silently. |

**Specific material at issue** (SP 13 item 7). The engine and its procedures are in scope in full. The one item this plan does not schedule is filling the slots with a card-by-card and tile-by-tile transcription of the published set: its card content, tile faces, printed board layout and hero characters with their stat lines. That is copying the game's content rather than its rules, so the slots take original content instead. This plan is not legal advice; the owner should get their own IP advice before any public distribution.

Consequence for SP's milestones: SP defines "component data complete" as transcription of the real set. Under this boundary it becomes "owner-original content complete and validated". The finished game is mechanically faithful with original content; it cannot claim the published set's exact encounter odds, and the UI and docs will not say "100% recreated" (SP 0).

**BUILD-GUIDE amendment (approved and applied 2026-11-18).** BG's decisions log says "Original designs only." Proposed replacement:

> **Original expression, faithful mechanics where asked.** Games are original in everything expressive: names, art, characters, card and screen wording, map art, narrative. A game may implement the documented procedures of an existing tabletop game (turn structure, dice formulas, deck sizes, probabilities) in our own code when the owner asks for it, with its content slots filled by the owner's original content, never a transcription of a published set's cards, tiles, board or characters. Bank shares only folk rules; Dusk Keep follows this rule.

And BG "Adding a game" step 2 ("games here must be original") gets the same qualifier.

## 3. Repo inventory

| Item | State (2026-11-18) |
|---|---|
| Branch | `main`. Last commits: `becd950` companion, `a414084` Tidevault, `226b9b7` menu buttons. |
| Former work in progress (not ours), now on `main` in `11f85ee` | Move of all static files into `site/` (`site/index.html`, `site/style.css`, `site/platform.js`, `site/config.js`, `site/{bank,tidevault,dungeon}/index.html`, new `site/_headers` with `X-Content-Type-Options: nosniff`), Docker files deleted, `server/` moved to a Cloudflare Worker (`server/worker.js`, `wrangler.jsonc`, D1 `migrations/0001_saves.sql`). BG now describes the `site/` layout. The game lives at `site/keep/` (section 6). |
| Games list | `site/index.html`: `.glass.tile` links to `bank/`, `tidevault/`, `dungeon/`. |
| Shared platform | `style.css` (tokens, glass, buttons, menu, sheets, segmented control, dice tokens `--die --die-edge --pip`). `platform.js` exposes `window.NL = { saves, identity, ready, account, theme, menu, segmented }`. |
| Saves | `NL.saves` (async `list/get/put/remove`): written to localStorage `nl-games-saves-v1` first, then uploaded to `/api/saves` for a signed-in person the server knows (BG contract 4, decision 0003; there is no signed-out play in production, only in the static preview). Server limits: 256 KB per save, 200 saves per person (`server/saves.js`). |
| Existing keys | Autosave `nl-bank-v2`, `nl-tidevault-v1`, `nl-dungeon-v1`; save `game` ids `bank`, `tidevault`, `dungeon`; theme `nl-games-theme`. |
| Tidevault (`a414084`) | `tidevault/index.html`, 782 lines, inline JS: seeded mulberry32 kept in state (`g.rng`), `change()` with undo snapshots, finished runs saved once. Pattern to reuse. |
| Companion (`becd950`) | `dungeon/index.html`, 818 lines. Physical-game helper. Stopped; untouched. |
| Tests | Only `server/`: `node --test` (`config.test.js`, `worker.test.js`). Games use inline `console.assert`. No browser test runner. Node 24.19 installed. |

## 4. Architecture

### 4.1 Ten systems

| # | System | Engine module (`keep/engine/`) | Owns |
|---|---|---|---|
| 1 | Deterministic game state and turn engine | `reducer.js`, `phases.js` | `Game`, phase machine, action validation, event log, round/turn order |
| 2 | Persistent shared grid/maze | `board.js` | `Board`, revealed `TileInstance`s, occupancy, edge state |
| 3 | Tile draw, orientation, connectivity, special rooms | `tiles.js` | tile bag, rotation, side resolution, dot behaviour, well/rotating/rubble/dark/door/gate rules |
| 4 | D12/D6 dice and attribute tests | `dice.js` | seeded PRNG, `roll(die)`, `test(stat)`, formula evaluation, scripted dice for tests |
| 5 | Data-driven card and deck engine | `decks.js`, `effects.js` | `Deck`, draw/retain/bottom/shuffle, effect interpreter |
| 6 | Monster reactions and A/B/C combat | `monsters.js`, `combat.js` | `Encounter`, `MonsterInstance`, reaction lookup, exchanges, flight, ambush |
| 7 | Health, equipment, inventory and gold | `heroes.js` | `HeroInstance`, HP, held cards, treasury cards kept separate, gold total |
| 8 | Central treasury and shared dragon deck | `treasury.js` | `Dragon`, two-card collect, wake queue, reset |
| 9 | Sunlight, escape and winning | `clock.js` | sun step, sunset, escape, ranking |
| 10 | Frontend, pass-and-play, save/resume | `keep/index.html` (markup and CSS) + `keep/ui/app.js`, `ui/board.js`, `ui/words.js` (M3) | rendering, privacy screens, actions to `reduce()`, `NL.saves`, autosave |

As built in M2: system 3's rules (moves, entry, dots, special rooms, doors, gates, carry-overs) are in `movement.js` (`tiles.js` keeps the pure orientation geometry); system 7 is `heroes.js`; combat arithmetic is `combat.js` and the encounter flow `monsters.js`; the hidden-information projection and D21 commit check are `view.js`.

Content and validation live beside the engine: `keep/content/schema.js` (validators and slot manifest), `keep/content/original/*.json` (owner content, empty at first), `keep/content/fixtures/*.json` (NON-AUTHENTIC TEST DATA).

```
                 +-------------------------------------------------+
                 |  (10) Frontend  keep/index.html                 |
                 |  setup, draft, board view, panels, cover/handoff|
                 |  change(action) -> undo stack -> render         |
                 +------+--------------------------------+---------+
                        | action                         ^ state (projection)
                        v                                |
   +-------------------------------------------------------------------+
   |  (1) reducer(state, action) -> state     phases.js legal actions  |
   |      event log: every draw, roll, choice appended                 |
   +--+---------+----------+----------+----------+----------+----------+
      |         |          |          |          |          |
      v         v          v          v          v          v
   (2) board (3) tiles  (5) decks  (6) monsters (8) treasury (9) clock
      |  ^      |  ^     effects    combat       dragon      escape/win
      |  +------+  |       |  ^       |  ^          |            |
      |            |       |  |       |  |          |            |
      +-----+------+-------+--+-------+--+----------+------------+
            |                 |          |
            v                 v          v
       (4) dice.js  <---- all randomness (seeded PRNG in state)
            |
       (7) heroes: HP, inventory, treasury cards, gold  <--- effects, combat, dragon
            ^
   content/schema.js validates  content/original/*.json  or  content/fixtures/*.json
   (load once at start; game state references definitions by id only)
```

### 4.2 Files, modules and the BUILD-GUIDE deviation

BG says game code stays inline in the game's `index.html`, with `console.assert` self-checks. This game deviates: the engine is a set of plain ES module files (`<script type="module">`, relative imports, no build, no npm dependency). Reasons:

1. SP 11 and SP 12 require the engine to be unit-testable without a browser in a table-driven suite of 30+ cases citing sources. `node --test` can import the same files the browser loads; inline script cannot be imported.
2. The engine is several times Tidevault's size (ten systems, schemas, interpreter). One 3000+ line HTML file is hard to review.
3. Still vanilla: no bundler, no transpile, no framework. Files serve as-is from any static host. `site/_headers` `nosniff` is fine because `.js` is served as JavaScript.

Tests live outside the served folder, at repo root `tests/keep/*.test.js`, importing `../../site/keep/engine/*.js` (the `site/` move has landed). Run: `node --test "tests/keep/*.test.js"` (Node 24 takes a glob, not a folder). Node 22+ detects ES module syntax in `.js` without a `package.json`; if that warns, add a two-line `tests/package.json` `{ "type": "module" }` (not served). No new dependency.

BG amendment to "Layout" and "Per-game contract" (approved and applied 2026-11-18):

> A game may keep its rules engine in plain ES module files under its folder (`<game>/engine/*.js`, with its screen code in `<game>/ui/*.js`, loaded with `<script type="module">`, no build) when the rules need tests under `node --test`; tests go in `tests/<game>/` at the repo root, outside the served site. Bank, Tidevault and the companion stay inline.

### 4.3 Deterministic reducer

- `reduce(state, action) -> state`, pure; no DOM, no `Math.random`, no clock. The UI only dispatches actions and renders the state.
- Randomness: mulberry32 (as Tidevault) with `rng` integer stored in `Game`. Every draw (tile, card, dragon card, die) goes through `dice.js` and appends an event `{ seq, kind: "roll"|"draw"|"shuffle", die|deck, value, reason }`.
- Scripted mode for tests: `dice.js` accepts a queue of predetermined dice and a fixed deck order; an empty queue throws so a test never silently falls back to random.
- Action validation: `legalActions(state)` from `phases.js`; `reduce` rejects anything not in it (no double resolution on repeated clicks or refresh, SP 4).
- Hidden information stays in state but the projection layer (`view(state, viewerSeat)`) strips it for whoever is looking.

### 4.4 State model

Notation below is descriptive (field: type), not TypeScript; the code is plain JS with validators.

| Object | Key fields |
|---|---|
| `Game` | `schemaVersion:int`, `mechanicsVersion:"rb-0.2/sp-1.0/v2"`, `contentMode:"original"|"fixture"`, `contentHash:string`, `phase:Phase`, `status:"setup"|"playing"|"over"`, `round:int`, `sun:int 1..27`, `seats:Seat[]` (clockwise), `firstSeat:int`, `activeSeat:int`, `rng:int`, `seed:int`, `log:Event[]`, `pending:Encounter|null`, `rules:{[flag]:value}` (rules config for class 3, class 4 and provisional rulings, for example `darkRoomPolicy`), `result:Result|null` |
| `Seat` | `seat:int`, `name:string`, `heroId:string|null`, `ringId:string|null` |
| `Board` | `defId`, `width:int`, `height:int`, `towers:Coord[4]`, `center:Coord[2]`, `chamberPlaced:bool`, `tiles:{[coordKey]:TileInstance}`, `tileBag:string[]` (ordered tile slot ids), `edges:{[edgeKey]:EdgeState}` |
| `TileInstance` | `slotId`, `defId`, `coord`, `rotation:0|90|180|270`, `entrySide:Side`, `temp:{[side]:"open-once"}`, `revealedRound:int` |
| `EdgeState` | `kind:"door"|"gate"|"secret"`, `open:bool`, `openedBy:heroId|null`, `openedTurn:int|null` |
| `HeroInstance` | `heroId`, `seat`, `status:"READY_IN_START_TOWER"|"EXPLORING"|"IN_TOWER_NOT_ESCAPED"|"ESCAPED"|"DEAD"`, `endResult:"INSIDE_AT_SUNSET"` (set at sunset on a hero who never escaped, apart from DEAD), `roomState:{special:"well"|"rubble", entryEdge, phase:"AT_NEAR_EDGE"|"CROSSED" (well), arrivalDir (rubble)}|null`, `coord`, `prevCoord`, `enteredVia:{side,edgeKind}|null`, `hp:int`, `hpStart:int`, `held:CardRef[]` (room loot, items), `treasury:CardRef[]` (central cards, private), `gold:int` derived, `conditions:Condition[]` (`well-edge`, `rubble`, `dark`, card-defined), `movedThisTurn:bool` |
| `Deck` | `category:DeckCategory`, `order:string[]` (top first), `out:{[cardInstanceId]:"held"|"in-play"|"aside"|"removed"}`, `shuffles:int`, `required:int` |
| `Encounter` | `kind:"room-card"|"monster"|"ambush"|"door"|"search"|"chest"|"treasury"|"dragon-wake"|"test"`, `stack:Step[]` (pending decisions, mandatory dice, nested draws), `cards:CardRef[]`, `controllerSeat:int|null` |
| `MonsterInstance` | `cardId`, `groupId`, `hp:int`, `wounds:int`, `declared:"attack"|"wait"|"flee"|"special"`, `reaction:ReactionId`, `exchanges:Exchange[]` |
| `Exchange` | `hero:"A"|"B"|"C"|null`, `monster:"A"|"B"|"C"|null`, `heroDmg:int`, `monsterDmg:int` |
| `Dragon` | `remaining:string[]`, `aside:string[]`, `wakeQueue:heroId[]`, `resetCount:int` |

### 4.5 Phase state machine (SP 4)

Phases: `SETUP, TURN_START, CHOOSE_ACTION, CHOOSE_EXIT, REVEAL_TILE, RESOLVE_TILE_ENTRY, DRAW_ROOM, RESOLVE_CARD, CHOOSE_MONSTER_RESPONSE, MONSTER_REACT, COMBAT_SELECT, COMBAT_REVEAL, RESOLVE_DAMAGE, FLEE, REQUIRED_STAT_TEST, ROOM_SEARCH, TREASURY_COLLECT, DRAGON_DRAW, DRAGON_WAKES, FORCED_MOVE, TURN_END, ESCAPED, DEAD, SUNSET_GAME_OVER`.

| From | To | When |
|---|---|---|
| SETUP | TURN_START | draft, rings, towers done; sun = 1 |
| TURN_START | REQUIRED_STAT_TEST / CHOOSE_EXIT (forced) / CHOOSE_ACTION | carry-over first (well edge, rubble, dark room, card condition), else free choice |
| CHOOSE_ACTION | CHOOSE_EXIT, ROOM_SEARCH, TREASURY_COLLECT, TURN_END | move; search (black/red room only); stay in chamber; no voluntary pass; a forced skip to TURN_END only when no legal action exists (D20) |
| CHOOSE_EXIT | REVEAL_TILE / RESOLVE_TILE_ENTRY / RESOLVE_CARD (door) / REQUIRED_STAT_TEST (gate) | unexplored, explored, door edge, gate edge |
| REVEAL_TILE | RESOLVE_TILE_ENTRY | tile drawn and oriented |
| RESOLVE_TILE_ENTRY | DRAW_ROOM, REQUIRED_STAT_TEST (well), TURN_END (dark, rubble), CHOOSE_EXIT (yellow), TREASURY_COLLECT, TOWER_CHOICE | dot/special type; tower; center |
| TOWER_CHOICE | TURN_END (ESCAPE: hero ESCAPED, out of the turn order; STAY: IN_TOWER_NOT_ESCAPED), CHOOSE_EXIT (CONTINUE: transit through another legal tower passage this turn) | spec v2, D23; CONTINUE only offered when such a passage exists and not after a flight |
| DRAW_ROOM | RESOLVE_CARD | always one card |
| RESOLVE_CARD | any effect target: CHOOSE_MONSTER_RESPONSE, REQUIRED_STAT_TEST, RESOLVE_CARD (sub-deck), FORCED_MOVE, CHOOSE_EXIT, TURN_END | interpreter |
| CHOOSE_MONSTER_RESPONSE | MONSTER_REACT | committed choice |
| MONSTER_REACT | TURN_END (monster flees), COMBAT_SELECT, RESOLVE_DAMAGE then FLEE or COMBAT_SELECT | reaction |
| COMBAT_SELECT | COMBAT_REVEAL | both sides locked |
| COMBAT_REVEAL | RESOLVE_DAMAGE | |
| RESOLVE_DAMAGE | COMBAT_SELECT, TURN_END, DEAD, FLEE | loop until a side dies |
| FLEE | RESOLVE_TILE_ENTRY (no room card), TURN_END | |
| TREASURY_COLLECT | DRAGON_DRAW | two cards drawn |
| DRAGON_DRAW | TURN_END, DRAGON_WAKES | |
| DRAGON_WAKES | FORCED_MOVE (per queued hero), DEAD | clockwise from waker |
| FORCED_MOVE | DRAGON_WAKES (next in queue), TURN_END | |
| any | DEAD | HP reaches 0 |
| TURN_END | TURN_START (next eligible seat), TURN_START (new round, sun + 1), SUNSET_GAME_OVER, game over (no hero inside) | |

### 4.6 Effect interpreter

Cards and tiles carry `effects: Effect[]`. Each effect is `{ op, ...args }` and is resolved by `effects.js` into state changes, dice requests or decisions pushed on `Encounter.stack`.

| Primitive | Args | Notes |
|---|---|---|
| `ROLL_D12` / `ROLL_D6` | `store` (named register) | raw roll |
| `CHECK_STAT` | `stat: "STR"|"AGI"|"ARM"|"LCK"`, `modifier: Expr`, `onPass: Effect[]`, `onFail: Effect[]` | D12 + modifier <= stat |
| `DEAL_DAMAGE` | `target: "hero"|"monster"`, `amount: Expr` | floor rule per D03 |
| `HEAL` | `amount: Expr` | cap per D04 (proposed addition; needed by "small bottle" style cards) |
| `DRAW_CARD` | `deck: DeckCategory`, `then: "resolve"|"keep"` | sub-deck branch |
| `RETAIN_CARD` | `into: "held"|"treasury"` | |
| `RETURN_CARD_TO_BOTTOM` | `card: "self"|CardRef` | default disposition |
| `SHUFFLE_DECK` | `deck` | "shuffle again" cards |
| `GRANT_TREASURE` | `gold: int` | value on held card |
| `REMOVE_TREASURY_CARDS` | `who: "hero"|"chamber"`, `to: "treasury-bottom"` | dragon |
| `MOVE_HERO` | `to: "prev"|"adjacent-choice"|Side`, `drawRoom: bool`, `applyTile: bool` | |
| `END_TURN` | | |
| `SET_CONDITION` / `CLEAR_CONDITION` | `id`, `turns: int|null`, `onTurnStart: Effect[]` | delayed and ongoing effects |
| `REQUEST_CHOICE` | `options: {label, effects}[]` | player decision |
| `REQUEST_COMBAT` / `MONSTER_ENCOUNTER` | `ambush: bool` | draws top monster card after commit |
| `OPEN_TEMPORARY_PASSAGE` | `side: Side|"any-orthogonal"` | secret door |
| `ROTATE_TILE` | `degrees: 90` | |
| `CONTINUE_MOVEMENT` | | corridor, door opens, secret door (proposed addition) |

`Expr` is an integer, or `{ die: "D12"|"D6", plus: int, minusStat: Stat|null, plusCount: "treasuryCards"|null }`. That covers `D12 - TF`, `D6 - 2`, `D12 + treasury cards`, straight `D12`. No free-form code in content.

### 4.7 Content schemas

Shared fields on every definition:

| Field | Type | Values |
|---|---|---|
| `id` | string | placeholder pattern per slot (table below) |
| `status` | enum | `EMPTY` (placeholder), `DRAFT`, `OWNER_APPROVED`, `FIXTURE` |
| `verified` | bool | true only when `status = OWNER_APPROVED` and validation passes |
| `source` | enum | `owner-original`, `fixture-non-authentic`, `rulebook-structure` (dragon card kinds only) |
| `copies` | int >= 1 | physical copies of this face in its deck |
| `name` | string | original wording |
| `notes` | string | optional |
| `text` | string | optional: the owner's own wording, shown instead of the summary generated from the mechanics (section 13 #21) |

**TileDefinition**

| Field | Type | Values |
|---|---|---|
| `sides` | `{N,E,S,W}` | each `"wall"|"open"|"door"|"gate"` in reference orientation |
| `entrySide` | Side | side carrying the entry dot in reference orientation |
| `mark` | enum | `black`, `red`, `yellow`, `blue`, `none` |
| `special` | enum | `none`, `well`, `rotating`, `rubble` |
| `effects` | Effect[] | tile-printed extras only; dot and special behaviour come from engine rules, not data |
| `art` | string | original asset path or null |

Rules: `mark = blue` requires exactly 2 or 3 non-wall sides including `entrySide` (RB 6.2). `entrySide` must not be `wall`. No hard-coded ban on a special room also carrying a mark or other marking: verified tile data decides which combinations exist (D29). Sum of `copies` over all tile definitions = 88.

**BoardDefinition**: `width:int`, `height:int`, `towers:Coord[4]` (must be the four corners), `center:Coord[2]` (orthogonally adjacent, central), `chamber:{ sides: per outer edge "wall"|"open"|"door"|"gate" }`, `fixedEdges` (printed walls, optional), `towerSides` per tower. Validation: grid squares excluding towers and center <= 88 is reported (D27), towers on corners, center in the middle.

**CardDefinition** (decks ROOM, SEARCH, ROOM_SEARCH, CHEST, DOOR, TREASURY)

| Field | Type | Values |
|---|---|---|
| `deck` | enum DeckCategory | `ROOM`, `SEARCH`, `ROOM_SEARCH`, `CHEST`, `DOOR`, `MONSTER`, `TREASURY`, `DRAGON`, `HERO`, `RING`, `SPECIAL_WEAPON`, `COMBAT` |
| `kind` | enum | ROOM: `empty`, `treasure`, `item`, `monster`, `trap`, `branch`; DOOR: `opens`, `closed`, `trap`; other decks: `treasure`, `item`, `trap`, `secret-door`, `empty`, `branch`, `reshuffle` |
| `gold` | int >= 0 | coin value when kept |
| `effects` | Effect[] | |
| `followUpDeck` | DeckCategory or null | must be one of SEARCH, CHEST, DOOR, MONSTER |
| `turnDisposition` | enum | `continue`, `end-turn`, `ongoing` |
| `cardDisposition` | enum | `UNDER_SAME_DECK` (default), `RETAIN_HELD`, `RETAIN_TREASURY`, `REMOVE`, `RESHUFFLE_DECK` |
| `privacy` | enum | `public`, `private-to-holder` (TREASURY default) |
| `specialWeapon` | bool | item usable as "special weapon" response |

**MonsterCardDefinition** (deck MONSTER): `hp:int >= 1`, `groupId:string` (links a combat set), `reactions:{ attack: Reaction, wait: Reaction, flee: Reaction }` where `Reaction = { type: "monster-flees"|"combat"|"strike-then-flight"|"strike-then-combat"|"flight-succeeds"|"other", damage: Expr|null, effects: Effect[] }`. `special` is not a key: special weapon reads `attack` (RB 8.1). Validation: all three reaction keys present; `damage` present for strike types; `strike-then-flight` and `flight-succeeds` only under `flee`; `groupId` resolves to a monster-group combat set.

**HeroDefinition** (deck HERO): `class:string`, `stats:{ STR, AGI, ARM, LCK: int 1..12 }`, `hp:int >= 1`, `equipment:string[]` (item ids or text), `combatSetId:string`, `specialWeaponId:string|null`, `art`. Validation: combat set exists and is `owner: "hero"`.

**CombatCardDefinition** (deck COMBAT): `setId:string`, `owner:"hero"|"monster-group"`, `letter:"A"|"B"|"C"`, `doubleAgainst:("A"|"B"|"C")[]` (letters this card hits twice when it wins with a different letter, D13), `art`. Validation: each set has exactly one A, one B, one C; a card may only list the letter it beats (A vs B, B vs C, C vs A). A same-letter tie always deals 1 to both sides unless a verified card explicitly overrides it (D13). 36 cards = 12 sets.

**RingDefinition** (deck RING): `power:string` (original text), `effects:Effect[]`, `trigger:"passive"|"once-per-game"|"on-test"|"on-encounter"`. Exactly 4, all distinct.

**SpecialWeaponDefinition** (deck SPECIAL_WEAPON, the 2 crossbow cards): `heroIds:string[]`, `effects:Effect[]` applied when "special weapon" is declared, `uses:int|null`.

**DragonCardDefinition** (deck DRAGON): `kind:"sleeping"|"awake"`. Structure known (RB 9, SP 8): 7 sleeping, 1 awake. Art original.

**Slot manifest and placeholder ids.** `schema.js` generates every placeholder at load, so the content screen lists each missing id with its category and status.

| Category | Count | Placeholder ids | Status at start |
|---|---:|---|---|
| Tile slots | 88 | `TILE_001`..`TILE_088` (one per physical tile; a definition may cover several via `copies`) | EMPTY |
| Board | 1 | `BOARD_01` | EMPTY |
| Central chamber tile | 1 | `CHAMBER_01` | EMPTY (sides) |
| Hero | 8 | `HERO_1`..`HERO_8` | EMPTY |
| Special weapon (crossbow) | 2 | `XBOW_1`, `XBOW_2` | EMPTY |
| Combat | 36 | `COMBAT_S01_A`..`COMBAT_S12_C` (sets S01 to S08 hero, S09 to S12 monster groups; split is an inference, D24) | EMPTY |
| Treasury | 33 | `TREASURY_001`..`TREASURY_033` | EMPTY |
| Dragon | 8 | `DRAGON_1`..`DRAGON_8` (1 awake, 7 sleeping) | kind set (rulebook structure); art EMPTY |
| Room | 60 | `ROOM_001`..`ROOM_060` | EMPTY |
| Search | 15 | `SEARCH_001`..`SEARCH_015` | EMPTY |
| Room search | 14 | `RSEARCH_001`..`RSEARCH_014` | EMPTY |
| Chest | 14 | `CHEST_001`..`CHEST_014` | EMPTY |
| Door | 15 | `DOOR_001`..`DOOR_015` | EMPTY |
| Monster | 15 | `MONSTER_001`..`MONSTER_015` | EMPTY |
| Ring | 4 | `RING_1`..`RING_4` | EMPTY |
| Card total | 224 | | |

**Load-time validation** (errors name the exact id, never fall back):

1. Every slot id present exactly once; deck sums equal the counts above; card total 224; tile total 88.
2. Each definition passes its field rules; enum values only; every `Expr` and `Effect` op known.
3. Cross references resolve: hero to combat set, monster to group set, card `followUpDeck`, weapon to hero.
4. Dragon deck is exactly 7 sleeping and 1 awake.
5. Content screen ("Content status") shows per category, for example "Room cards 0/60 defined, 0 approved", with each missing id listed.
6. "Start game" is disabled unless every category is 100% `OWNER_APPROVED` and valid. "Test with fixtures" is always available, loads `content/fixtures/`, and shows a persistent banner "NON-AUTHENTIC TEST DATA" on every screen and in the save title.

### 4.8 Persistence and undo

- Autosave the whole state on every committed action to localStorage `nl-keep-v1` (shape-checked on read, BG contract 3). It carries `owner: NL.person()`; an autosave whose owner is another person is ignored, so a game in progress never shows to the next person on this browser (BG contract 5).
- `NL.saves` records with `game: "keep"`, `personPublicId: NL.person()`, title like "Dusk Keep, 3 players, sun 14", status `in_progress` or `finished`. A finished game saves itself once (as Tidevault). A resumed game reuses its `id` and `createdAt`.
- `put` writes to this browser first and returns at once; the upload runs in the background (BG contract 4, decision 0003). The saved-games list shows `NL.saves.cached('keep')` at once, or a skeleton with `aria-busy` while nothing is known, then refreshes from `list('keep')`, after Save and exit or New game, and on the `nl-saves` event. Pending rows say "Not synced yet", or why the server refused them (`save_limit`, `too_large`, `refused`). When `list` rejects the shown list stays with a note (a Try again button if nothing was known); deletes are optimistic and the row comes back with a message when `remove` rejects.
- State includes `rng`, deck orders, dragon remaining, edges, pending encounter and hidden selections, so resume mid-encounter is exact (SP 11, test T29).
- Size: the 256 KB server limit. Log events are compact tuples; undo history capped (proposal: 20 snapshots stored, as diffs if needed); a test asserts a 26-round 4-player fixture game stays under 200 KB.
- Undo pops a full snapshot including `rng` and decks, so it restores exact dice and draws (SP 11). Hidden-information policy for undo is D21.

### 4.9 Hot-seat privacy and solo

| Moment | Screen |
|---|---|
| Monster response | Active hero commits Attack / Wait / Flee / Special weapon (Ambush: Attack / Flee only) before any monster data exists in the view. |
| Monster reaction | "Pass to {right-hand player}" cover screen; controller sees card, HP and the matched reaction; taps "Announce"; the public table returns with no cover (M4d: the public view never shows more than any seat's); hero sees only the announced reaction. |
| A/B/C exchange | Hero picks behind a cover, "Pass to {controller}", controller picks behind a cover, then simultaneous reveal. Monster HP never shown to the hero; the damage tally is the controller's alone (D37); each exchange's result is public. |
| Treasury cards | Private to the holder: hidden on the shared board, viewable via a "Show my cards" step with a cover. Gold of held room loot is public (D25). |
| Dragon draw | Unbiased draw from remaining cards; the right-hand player's presentation is represented by a "Pass to {right}" shuffle step only if the owner wants the ritual (not ruled; default no ritual step, M3); odds shown as "1 in N" from actual remaining cards. |

Right-hand player: with clockwise turn order, the player to the right of the active hero is the previous seat in turn order. Solo: the hero still commits before the reveal; the computer is the monster player, so the card and HP stay hidden and the reaction is announced at once (D37, spec v3). Solo combat: the physical target with manual result entry (outer/inner/corner/skull plus face, with reroll) is the original solo mode. A/B/C with computer-chosen monster cards is offered only as an explicitly labelled digital variant, never presented as an original rule (D17). It never offers a fake random "throw" button.

## 5. Owner acceptance criterion and replay tests

Criterion: given the same tiles, card effects, dice rolls, hero attributes and player decisions, the engine produces the same outcomes as the documented physical rules.

Design for it:

- The engine's only inputs are content definitions, a seeded or scripted random source, and a sequence of player actions. All randomness passes through `dice.js`, so a test can replace it with a scripted list of dice and deck orders.
- Replay test format (`tests/keep/replays/*.json`): `{ cite, content: "fixtures", deckOrders: {...}, tileOrder: [...], dice: [...], actions: [...], expect: { afterAction: n, hero: {hp, coord, status, treasury}, phase, sun, log: [...] } }`. A runner reduces the actions with scripted dice and asserts each checkpoint. Unused or missing dice fail the test.
- Every expectation is hand-derived from the cited rule, written before the code (troll example, well jump arithmetic, dark-room mapping, dragon wake order).
- The same replay saved via `NL.saves`, reloaded and continued must reach the same end state (determinism across persistence).

## 6. Site integration

| Item | Plan |
|---|---|
| Branch | Local branch `keep-engine`, cut from `main` at `21abb5f` (after the `site/` move landed), in the worktree `C:/Projects/NordgrenLabs-Games-keep`. No push, no merge, no deploy without owner approval (SP 0.5, SP 11). |
| Folder and route | `site/keep/` served at `/keep/`. `index.html`, `engine/*.js`, `content/schema.js`, `content/original/`, `content/fixtures/`, `art/`. |
| Tests | `tests/keep/` at repo root, outside `site/`, so they are not served. |
| Games list tile | One `.glass.tile` link in `site/index.html` to `keep/index.html`, same markup as the others, with an original short description. Added in M3. |
| Keys | Autosave `nl-keep-v1`; save `game: "keep"`. No collision with `nl-bank-v2`, `nl-tidevault-v1`, `nl-dungeon-v1`, `nl-games-saves-v1`, `nl-games-theme`, or ids `bank`, `tidevault`, `dungeon`. Optional per-browser UI prefs under `nl-keep-prefs-v1`. |
| Shared code | Reuse `style.css` tokens, glass, buttons, menu, sheets, segmented control, dice tokens, skeletons and tap feedback (no pressed-state code of its own); `NL.menu`, `NL.saves` (including `cached` and the `nl-saves` event), `NL.identity`, `NL.settled`, `NL.person`, `NL.account`, `NL.theme`. No changes to shared files. |
| Sign-in | Decision 0003: production is behind the Worker's sign-in gate, so the game has no sign-in control and no signed-out path of its own. `NL.account` in Settings shows the name and Sign out and stays hidden in the static preview, which still runs signed out with saves in this browser. The first player is pre-filled from `NL.identity()` only into an empty roster with no game in progress, with a placeholder row until `NL.settled`. |
| Home screen | `<head>` carries the shared home-screen tags with absolute paths (favicon, apple-touch-icon, manifest, the mobile-web-app and apple metas titled "Games", light and dark `theme-color`); content stays below `env(safe-area-inset-top)` for `black-translucent`. |
| Untouched | `tidevault/` (`a414084`), `dungeon/` (`becd950`), `bank/`, `server/`, `platform.js`, `style.css`. |
| BUILD-GUIDE | Two amendments, approved and applied 2026-11-18: the content boundary line (section 2) and the ES-module engine exception (section 4.2). Also add a "Dusk Keep specifics" decisions entry and the `keep/` layout line when the game lands. BG is also stale about the `site/` and Worker move; that is the owner's in-progress change, not this plan's. |
| Quality floor | BG checklist: keyboard focus, 44px targets, reduced motion and transparency, 375px no scroll, landscape 667x375, light and dark, 3:1 contrast on pieces, names via `textContent`, no `alert/confirm/prompt`. |

## 7. Rules-to-engine traceability matrix

Status: VERIFIED (documented procedure, implementable now), NEEDS CONTENT (procedure known, needs slot data), RULED (former edge case, now implemented per the owner's ruling; class from section 9), PROVISIONAL (ruled, but open to change when the rulebook or a card is verified). No row is UNVERIFIED any more. SP uses "NEEDS SOURCE" where this plan says NEEDS CONTENT. Module numbers refer to the ten systems.

| ID | Rule (own words) | Source | Digital behaviour | State | Dice/cards/tiles | Sys | Status | Tests |
|---|---|---|---|---|---|---|---|---|
| R01 | 1 to 4 players, one hero each | RB 1, SP 2 | setup accepts 1-4, rejects 5 | seats | - | 1 | VERIFIED | T02 |
| R02 | Win: only escapees compared, highest gold wins | RB 1, SP 10 | ranking at game end | result, gold | treasure cards | 9 | VERIFIED | T27 |
| R03 | One escapee wins outright; none means castle wins | RB 1, SP 10 | result screen | result | - | 9 | VERIFIED | T27 |
| R04 | Chamber is optional for winning | RB 1, SP 10 | no center check in ranking | - | - | 9 | VERIFIED | T27 |
| R05 | Equal gold among escapees | RB 1, SP 10 | co-winners: every escapee on the top gold total wins | result | - | 9 | RULED D01 (class 3) | T27b |
| R06 | Sun starts at 1, sunset at 27, 26 turns max | RB 1, SP 4, SP 10 | round r played at sun r; advancing to 27 ends game | sun, round | sundial | 9 | VERIFIED (timing D02, class 2) | T05 |
| R07 | Component counts: 88 tiles + 1 chamber, 224 cards in 12 categories; board 10 x 11 | RB 2, SP 2, spec v2 #1 | slot manifest validation; any board must be 110 squares (10 x 11 or 11 x 10) | content | all | 5 | VERIFIED (board size spec v2) | T01, v2 board |
| R08 | Four stats plus HP, roll D12 <= stat succeeds | RB 3, RB 5.1, SP 2 | `test(stat)` | hero stats | D12 | 4 | VERIFIED | T04 |
| R09 | HP 0 means death | RB 3, SP 7 | status dead, removed from turn order | hp, status | - | 7 | VERIFIED; **M2** implemented | T04b |
| R10 | Eight hero slots with stats, equipment, combat set | RB 3, SP 3 | hero definitions | HeroDefinition | hero cards | 7 | NEEDS CONTENT | T01, T03 |
| R11 | Shuffle tiles face down; chamber held aside | RB 4, SP 3 | tile bag from 88 slots, drawn without replacement; chamber separate; 104 maze squares, so once the bag is empty the remaining unexplored squares are impassable | tileBag | tiles | 3 | VERIFIED (exhaustion D27, class 3) | T01, T06, T07b |
| R12 | Seven draw decks shuffled separately | RB 4, SP 3 | one `Deck` per category | decks | 7 decks | 5 | VERIFIED; **M2** implemented | T18 |
| R13 | D12 each, highest is first player | RB 4, SP 3 | roll per seat; tied highest seats reroll until one is highest | firstSeat | D12 | 1 | VERIFIED (ties D05, class 3) | T03, T03b |
| R14 | Heroes chosen clockwise from first player | RB 4, SP 3 | draft order | seats.heroId | hero cards | 1 | VERIFIED | T03 |
| R15 | Last hero picker takes first ring, then counterclockwise | RB 4, SP 3 | ring draft order | seats.ringId | rings | 1 | VERIFIED | T03 |
| R16 | Rings are four distinct powers | RB 2, SP 2 | ring definitions and effects | RingDefinition | rings | 7 | NEEDS CONTENT | T01 |
| R17 | Each hero gets own A/B/C set; monster sets by group | RB 4, SP 3 | combat set lookup | combatSetId | combat cards | 6 | NEEDS CONTENT (split D24, class 2, provisional); **M2** engine implemented, content pending | T20 |
| R18 | Starting HP from hero card | RB 4, SP 3 | hp = hpStart | hp | hero card | 7 | VERIFIED | T03 |
| R19 | Towers chosen first player then clockwise; sharing allowed | RB 4, SP 3, spec v2 #2 | tower pick step; a setup hero is READY_IN_START_TOWER, never escaped and never offered Escape (D33); tower side openings from BoardDefinition | coord, status | board | 2 | VERIFIED (tower sides D31, class 2; D33) | T03, T07, T27c, v2 setup hero |
| R20 | Board: 110 squares, four corner towers, a one-cell chamber at a centre position (D36) | RB 4, SP 3, SP 5, spec v2 #1, spec v3 #1 | BoardDefinition is the authority for movement geometry: size (off-board outside it), tower openings, the chamber cell (`center`, open on every side), printed walls, fixed edges; validated | board | board | 2 | NEEDS CONTENT (geometry fields built) | T01, v2 board, v2 bilateral wall, v2 chamber reserve, v3 one-cell chamber open on every side |
| R21 | Living, unescaped heroes act clockwise each round | RB 5, SP 4 | next eligible seat; the sun advances per round even if the first player is dead or escaped | activeSeat | - | 1 | VERIFIED (D30, class 2) | T05, T05b |
| R22 | Carry-over effects resolve before a fresh action | RB 5, SP 4 | TURN_START checks conditions | conditions | - | 1 | VERIFIED; **M2** implemented | T11, T12, T14 |
| R23 | Move orthogonally only, through a free passage | RB 5, SP 5 | legal exits N/E/S/W | board | tiles | 2 | VERIFIED | T07 |
| R24 | Free passage must be open from both sides | RB 6.1, SP 5 | edge legal if both tile sides open | board | tiles | 3 | VERIFIED | T07 |
| R25 | New square: draw tile, rotate so entry dot faces entry side | RB 5, SP 4 | rotation = f(entrySide, approach) | TileInstance | tile bag | 3 | VERIFIED | T06 |
| R26 | Revealed tile never redrawn or rotated on revisit | RB 5, RB 6.9, SP 4 | reuse instance | tiles | - | 3 | VERIFIED | T06 |
| R27 | One hero per ordinary room; towers and center exempt | RB 5, SP 5 | occupied room not a legal exit | occupancy | - | 2 | VERIFIED | T07 |
| R28 | A turn may be spent without moving (door, test, fight) | RB 5 | only rules-defined stationary actions (search, chamber collect, door, test, fight); no voluntary pass; forced skip only when no legal action exists | - | - | 1 | RULED D20 (class 2; forced skip class 4); **M2** implemented | T07c, T14, T16 |
| R29 | Damage formulas like D12-TF, D6-2 are calculations, not tests | RB 5.1 | `Expr` evaluator | - | D12, D6 | 4 | VERIFIED; **M2** implemented | T23 |
| R30 | Negative formula result | RB 5.1, RB 8.6, SP 7 | floor at 0, never heals | - | - | 4 | RULED D03 (class 3); **M2** implemented | T22b |
| R31 | Healing above start HP | RB 5.1 | cap at start HP unless the card says otherwise | hp | - | 7 | RULED D04 (class 3); **M2** implemented | T09b |
| R32 | Black dot: draw one room card on every entry | RB 6.1, SP 5 | DRAW_ROOM | ROOM deck | 60 room | 5 | VERIFIED; **M2** implemented | T08 |
| R33 | Red dot: room card, and a gate falls behind | RB 6.1, RB 6.7, SP 5 | DRAW_ROOM + entry edge becomes gate | edges | room deck | 3 | VERIFIED; **M2** implemented | T09 |
| R34 | Yellow dot: no room card, may continue same turn | RB 6.1, SP 5 | back to CHOOSE_EXIT, optional stop | movedThisTurn | - | 3 | VERIFIED; **M2** implemented | T10 |
| R35 | Blue dot: entering ends the turn | RB 6.1, RB 6.2, SP 5 | initial reveal: turn ends, D6 exit sequence next turn; a flee (or forced move) back into a dark room keeps the effect; ordinary re-entry only under `darkRoomPolicy: EVERY_ENTRY` (default `ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY`) | conditions, rules | D6 | 3 | VERIFIED initial reveal; RULED D06 (interpretation) | T11, T11c, v2 dark room |
| R36 | Dark two exits: D6 1-3 dot exit, 4-6 other | RB 6.2, SP 5 | forced exit by roll | - | D6 | 3 | VERIFIED; **M2** implemented | T11 |
| R37 | Dark three exits: 1-2 dot, 3-4 clockwise, 5-6 counterclockwise | RB 6.2, SP 5 | forced exit by roll | - | D6 | 3 | VERIFIED; **M2** implemented | T11 |
| R38 | Dark exit then continues as a normal move; no choice | RB 6.2, SP 5 | moves through rolled exit; blocked rolled exit: hero stays and rolls again next turn | - | - | 3 | VERIFIED (blocked exit D07, class 3, provisional); **M2** implemented | T11b |
| R39 | Well: AGI test on entry, fail is death | RB 6.3, SP 5 | REQUIRED_STAT_TEST | status | D12 | 3 | VERIFIED; **M2** implemented | T12 |
| R40 | Well success: stuck at near edge, turn ends | RB 6.3, SP 5 | condition `well-edge` | conditions | - | 3 | VERIFIED; **M2** implemented | T12 |
| R41 | Next turn: go back or jump (AGI test, D12 + treasury cards held) | RB 6.3, SP 5 | REQUEST_CHOICE then test; failed jump is death | treasury | D12 | 3 | VERIFIED (jump fail D08, class 2); **M2** implemented | T12, T12b |
| R42 | May discard treasury cards before the jump; room loot no penalty | RB 6.3, SP 5 | discard step; discards go to the bottom of the treasury deck | treasury | treasury | 7 | VERIFIED (D09, class 2); **M2** implemented | T12 |
| R43 | Rotating room turns 90 clockwise on every entry, not on staying | RB 6.4, SP 5 | ROTATE_TILE on entry; first reveal orients by dot, then rotates | rotation | - | 3 | VERIFIED (D10, class 2); **M2** implemented | T13 |
| R44 | Rubble: entry ends turn; next turn go back or AGI test | RB 6.5, SP 5 | condition `rubble` | conditions | D12 | 3 | VERIFIED; **M2** implemented | T14 |
| R45 | Rubble success: leave through any exit; failure: retry later | RB 6.5, SP 5 | exits unlocked same turn | - | - | 3 | VERIFIED; **M2** implemented | T14 |
| R46 | Door: draw door card before crossing | RB 6.6, SP 5 | DRAW_CARD DOOR | DOOR deck | 15 door | 5 | VERIFIED; **M2** implemented | T15 |
| R47 | Door opens: cross this turn | RB 6.6, SP 5 | CONTINUE_MOVEMENT | edges | door | 3 | VERIFIED; **M2** implemented | T15 |
| R48 | Door stays closed: may use another free passage this turn | RB 6.6, SP 5 | back to CHOOSE_EXIT | - | door | 3 | VERIFIED; **M2** implemented | T15 |
| R49 | Door trap: resolve, turn ends | RB 6.6, SP 5 | effects then END_TURN | - | door | 5 | NEEDS CONTENT; **M2** engine implemented, content pending | T15 |
| R50 | Door relocks after crossing, except same-turn successful flight | RB 6.6, SP 5 | edge open until TURN_END only for flight back | edges | - | 3 | VERIFIED; **M2** implemented | T15 |
| R51 | Gate ahead: STR test; success cross and reseals; failure ends turn | RB 6.7, SP 5, spec v3 #3 | REQUIRED_STAT_TEST; the test is previewed in `view.pendingTests` before the move | edges | D12 | 3 | VERIFIED; **M2** implemented | T16, v3 portcullis |
| R52 | Secret doors, lifted gates, opened doors are one-use passages | RB 6.8, SP 5 | `temp` cleared after use | temp | - | 3 | VERIFIED; **M2** implemented | T15, T16, T17 |
| R53 | A path may dead-end | RB 6.9 | zero legal exits allowed; hero uses any other rules-defined action (search), else a forced skip | - | - | 2 | VERIFIED (D20) | T07c |
| R54 | Tile mix and faces | RB 6.9, App A | tile definitions; no hard-coded ban on special rooms with a mark, verified data decides | TileDefinition | 88 tiles | 3 | NEEDS CONTENT (D29, class 4) | T01 |
| R55 | Room search instead of moving, black/red rooms only | RB 7.1, SP 6 | ROOM_SEARCH action | RSEARCH deck | 14 cards | 5 | VERIFIED; **M2** implemented | T17 |
| R56 | Secret door found: move to any orthogonal square this turn | RB 7.1, SP 6 | OPEN_TEMPORARY_PASSAGE any; may cross printed walls; use and timing follow the card | temp | room search | 3 | VERIFIED (D11, class 2, provisional until the full card definition); **M2** implemented | T17 |
| R57 | Searching may repeat on later turns | RB 7.1, SP 6 | no limit | - | - | 5 | VERIFIED; **M2** implemented | T17 |
| R58 | Room deck 60 cards: empty, loot, monster, trap, branch | RB 7.2, SP 6 | card definitions | ROOM deck | 60 | 5 | NEEDS CONTENT; **M2** engine implemented, content pending | T01 |
| R59 | Kept cards stay with the hero; others go under their own deck | RB 7.2, RB 7.4, SP 6 | cardDisposition | decks, held | all decks | 5 | VERIFIED; **M2** implemented | T18 |
| R60 | Branches: chest, search, door, monster, treasury decks | RB 7.3, SP 6 | followUpDeck | decks | sub-decks | 5 | VERIFIED; **M2** implemented | T18 |
| R61 | Card text decides turn cost of a branch | RB 7.3 | turnDisposition | - | - | 5 | NEEDS CONTENT; **M2** engine implemented, content pending | T18 |
| R62 | "Shuffle again" card reshuffles its own pile | RB 7.4, SP 6 | SHUFFLE_DECK | deck order | - | 5 | VERIFIED; **M2** implemented | T18b |
| R63 | Decks never merged | RB 7.4, SP 2 | separate Deck objects | - | - | 5 | VERIFIED; **M2** implemented | T18 |
| R64 | Monster: commit Attack/Wait/Flee before reveal | RB 8.1, SP 7 | CHOOSE_MONSTER_RESPONSE first | declared | - | 6 | VERIFIED; **M2** implemented | T19 |
| R65 | Special weapon response counts as Attack for reaction | RB 8.1, SP 7 | reads `attack` reaction; weapon effects | - | weapon card | 6 | VERIFIED (effects NEEDS CONTENT); **M2** engine implemented, content pending | T19b |
| R66 | Right-hand player controls the monster, reads card privately | RB 8.1, SP 7 | controllerSeat = previous seat (seated, even if dead or escaped); cover screen; solo hero reveals | controllerSeat | monster | 6 | VERIFIED (D12, class 2); **M2** implemented | T19 |
| R67 | Monster cards: type, HP, reaction matrix | RB 8.1, SP 7 | MonsterCardDefinition | - | 15 monster | 6 | NEEDS CONTENT; **M2** engine implemented, content pending | T01 |
| R68 | Monster flees: no combat, cards under decks, turn ends | RB 8.2, SP 7 | reaction `monster-flees` | decks | - | 6 | VERIFIED; **M2** implemented | T19c |
| R69 | Combat: monster HP hidden; wounds tracked privately; dead at wounds >= HP; death announced without HP | RB 8.3, SP 7, spec v3 #2 | wounds on MonsterInstance, private to the monster player (D37) | wounds | - | 6 | VERIFIED; **M2** implemented; spec v3 privacy built | T21, v3 monster HP never reaches the hero |
| R70 | A/B/C simultaneous; same letter both -1; A>B, B>C, C>A loser -1 | RB 8.4, SP 7 | resolve exchange | exchanges | combat cards | 6 | VERIFIED; **M2** implemented | T20 |
| R71 | Printed double hit deals 2 instead of 1 | RB 8.4, SP 7 | `doubleAgainst` applies only to a won matchup with different letters; same letter always 1 to both unless a verified card overrides | - | combat cards | 6 | NEEDS CONTENT (D13, class 1); **M2** engine implemented, content pending | T20, T20b, T21 |
| R72 | Cards return to hand; loop until one dies; then turn ends | RB 8.4, SP 7 | COMBAT_SELECT loop; both at 0 in one exchange both die | - | - | 6 | VERIFIED (D14, class 2); **M2** implemented | T21 |
| R73 | Troll example: hero -3, monster -4 in five exchanges | RB 8.5, SP 7 | fixture test only | - | fixture | 6 | VERIFIED; **M2** implemented | T21 |
| R74 | Flight goes back to the previous tile only | RB 8.6, SP 7 | MOVE_HERO prev | prevCoord | - | 6 | VERIFIED; **M2** implemented | T22 |
| R75 | No flight if the way back is gone (used secret door) | RB 8.6, SP 7 | Flee hidden from choices; also behind a red-room gate | enteredVia | - | 6 | VERIFIED (D15, class 2); **M2** implemented | T22, T22c |
| R76 | Flight results: escape; strike then escape; strike then combat | RB 8.6, SP 7 | Reaction types | - | monster | 6 | VERIFIED; **M2** implemented | T22 |
| R77 | Successful flight: no room card on return, tile effects still apply | RB 8.6, SP 7 | MOVE_HERO drawRoom false, applyTile true | - | - | 6 | VERIFIED (D16, class 1); **M2** implemented | T22 |
| R78 | Ambush: D12 - Luck damage, then Attack or Flee only | RB 8.7, SP 7 | DEAL_DAMAGE then limited choice | - | D12 | 6 | VERIFIED (floor D03); **M2** implemented | T23 |
| R79 | Target combat scoring table and die faces | RB 8.8, SP 7 | manual result entry, scoring arithmetic; the original solo mode (D17) | - | symbol die | 6 | VERIFIED (scoring); die faces and geometry NEEDS CONTENT; **M2** engine implemented, content pending | T31 |
| R80 | Target doubling only multiplies existing damage | RB 8.8 | arithmetic | - | - | 6 | VERIFIED; **M2** implemented | T31 |
| R81 | Chamber tile placed on first entry to either center square | RB 9.1, SP 8 | chamberPlaced | board | chamber tile | 8 | VERIFIED; **M2** implemented | T25 |
| R82 | Collect: two treasury cards, private | RB 9.1, SP 8 | DRAW_CARD x2 RETAIN_TREASURY, also on the entry turn | treasury | 33 treasury | 8 | VERIFIED (entry turn D18, class 2); **M2** implemented | T25 |
| R83 | Then one dragon card from remaining | RB 9.1, SP 8 | unbiased draw | dragon | 8 dragon | 8 | VERIFIED; **M2** implemented | T24 |
| R84 | Sleeping card set aside, no replacement; turn ends | RB 9.1, SP 8 | aside[] | dragon | - | 8 | VERIFIED; **M2** implemented | T24 |
| R85 | Every hero in the chamber collects on own turn; shared deck | RB 9.1, SP 8 | one Dragon | dragon | - | 8 | VERIFIED; **M2** implemented | T24, M-A |
| R86 | Leaving turn: no treasury, no dragon draw | RB 9.1, SP 8 | move action skips collect | - | - | 8 | VERIFIED; **M2** implemented | T25 |
| R87 | Wake: everyone in chamber, waker first then clockwise | RB 9.2, SP 8 | wakeQueue | dragon | - | 8 | VERIFIED; **M2** implemented | T26, M-A |
| R88 | Wake step 1: return all treasury cards to bottom of treasury deck | RB 9.2, SP 8 | REMOVE_TREASURY_CARDS | treasury | - | 8 | VERIFIED; **M2** implemented | T26 |
| R89 | Wake step 2: straight D12 damage, no Luck | RB 9.2, SP 8 | DEAL_DAMAGE D12 | hp | D12 | 8 | VERIFIED; **M2** implemented | T26 |
| R90 | Wake step 3: survivor moves to an adjacent square, no room card, outside turn order | RB 9.2, SP 8 | FORCED_MOVE to an already-revealed orthogonally adjacent maze tile; never reveals a tile; no room card; none legal: hero stays put | coord | - | 8 | RULED D19 (class 2; stay-put exception class 3, provisional); **M2** implemented | T26, T26b |
| R91 | After evacuation all eight dragon cards reshuffled | RB 9.2, SP 8 | reset | dragon | - | 8 | VERIFIED; **M2** implemented | T26 |
| R92 | Dragon deck reset when the chamber becomes empty | RB 9.2, SP 8 | reset all eight when no hero is in the chamber, also after voluntary exits | dragon | - | 8 | RULED D22 (class 2, preferred interpretation); **M2** implemented | T24b |
| R93 | Odds shown from actual remaining cards (1/8 ... 1/1) | RB 9.3, SP 8 | "1 in N" | - | - | 8 | VERIFIED; **M2** implemented | T24 |
| R94 | Solo: commit before reveal; ~~monster HP visible~~ the computer plays the monster, card and HP hidden (D37 reverses this) | RB 10, SP 9, spec v3 #2 | view rule for 1 seat; reaction announced at once | - | - | 10 | RULED D37 (interpretation); built | T28 |
| R95 | Solo uses target combat, not A/B/C | RB 10, SP 9 | physical target with manual result entry; A/B/C with computer-chosen monster cards only as a labelled digital variant | - | - | 6 | RULED D17 (class 1; variant class 4); **M2** implemented | T28, T28b |
| R96 | Solo log: escaped or not, gold extracted | RB 10, SP 9 | finished save record | save | - | 10 | VERIFIED; **M2** engine part; **M3** finished record saved once | T28 |
| R97 | Escape: reach any corner tower alive before sunset | RB 12, SP 10, spec v2 #2, owner tower ruling | entering any tower from the castle raises TOWER_CHOICE: Escape (final), Stay, or Continue (transit); only Escape sets ESCAPED; any hero, any tower, any number per tower; never forced, also when the tower is the only legal destination; the choice resolves before sunset | status | - | 9 | RULED D23 (interpretation; escape finality legacySupported/interpretation) | T27, T27c, T05b, M-B, v2 tower tests |
| R98 | Still inside at sunset loses | SP 10, SP 12, owner tower ruling | every hero who never chose Escape gets endResult INSIDE_AT_SUNSET (status unchanged, never DEAD), towers included; `towerAtSunsetCountsAsEscape` false | status, endResult | - | 9 | VERIFIED; tower case RULED D32 (interpretation) | T05, v2 sunset, v2 final turn |
| R99 | Private treasury cards not exposed | RB 9.1, SP 9 | view strips them; held room-loot gold is public | - | - | 10 | VERIFIED (D25, class 2); **M2** implemented | T29b |
| R100 | No PvP, trading, revival or extra decisions | SP 9 | no such actions | - | - | 1 | VERIFIED; **M2** implemented | T30 |
| R101 | Save/resume exact, no double draws on refresh | SP 11 | autosave per action, idempotent reducer | all | - | 10 | VERIFIED; **M2** engine part; **M3** autosave and resume checked in the browser | T29 |
| R102 | Undo restores exact RNG, decks, board | SP 11 | full snapshots; undo covers only uncommitted actions: no reroll of revealed dice, redraw of hidden cards, or undo of a resolved dragon awakening | all | - | 10 | RULED D21 (class 4); **M2** engine part; **M3** undo wired to `canUndoTo` | T29c |
| R103 | Full Start blocked until content complete; fixtures labelled | SP 11 | content gate | content | - | 5 | VERIFIED | T30 |
| R104 | Physical HP marker supply is 80 | RB 2, SP 2 | not enforced | - | - | 7 | RULED D26 (class 4) | - |
| R105 | A dead hero's acquired cards | not documented | acquired held and treasury cards go to the bottom of their original decks unless the card says otherwise; hero identity, combat and starting ring cards never become loot | decks, held | all decks | 7 | RULED D28 (class 3); **M2** implemented | T04c |
| R106 | Sun advances per round whoever is first player | RB 5 | clock steps per round even if the first player is dead or escaped | sun | - | 9 | RULED D30 (class 2) | T05b |
| R107 | Towers and chamber draw no room cards | RB 4, SP 3 | no DRAW_ROOM on tower or chamber entry; tower sides from BoardDefinition | board | - | 2 | RULED D31 (class 2); **M2** implemented | T07, T25 |
| R108 | Well and rubble entry records | spec v2 #6 | `roomState`: entry edge; well phase AT_NEAR_EDGE then CROSSED; rubble arrival direction; cleared on leaving | roomState | - | 3 | RULED (spec v2) | v2 well and rubble |
| R109 | Semantic, replayable event log | spec v2 #11 | entries carry round and seat; moves from/to and mark; gate and door edges; card ids; commitments; tests, formulas and damage with arithmetic; the normal view hides private cards and RNG calls, `view(..., { debug: true })` shows all | log | all | 10 | RULED (spec v2, app-only) | v2 event log, T29b |
| R110 | Synthetic-data banner and app label | spec v2 #12, #13 | `syntheticCategories(content)` and `contentStatus().synthetic` list each synthetic category; `APP_LABEL` "Mechanics engine under verification" | content | - | 5 | RULED (spec v2, app-only) | v2 banner |
| R111 | Tower transit | spec v2 #2 | CONTINUE: the turn goes on through another legal tower passage, not back the way in (`tower-entry` reason); STOP leaves the hero in the tower | turn.transitFrom | - | 2 | RULED D23 (interpretation) | v2 tower transit |

Rows: 111 (R108-R111 added for spec v2). "**M2** implemented" marks the rows built and tested in M2 (rows without it were built in M1, or are content-only).

## 8. Three lists

### 8.1 Verified rules (implementable now)

R01-R04, R06-R09, R11-R15, R18, R19, R21-R27, R29, R32-R48, R50-R53, R55-R57, R59, R60, R62-R64, R66, R68-R70, R72-R78, R80-R89, R91, R93, R94, R96-R101, R103 (scoring arithmetic of R79 and the routing of R65 also verified). Ruled and implementable per section 9: R05, R28, R30, R31, R90, R92, R95, R102, R104-R107. Several verified rows carry a ruled sub-case.

### 8.2 Missing content (exact slot counts)

| Slot | Count | Needed fields |
|---|---:|---|
| Board layout | 1 | grid size, tower and center positions, printed edges, chamber sides |
| Square tiles | 88 | sides, entry side, mark, special, copies, art |
| Central chamber tile | 1 | outer edge sides, art |
| Heroes | 8 | class, 4 stats, HP, equipment, combat set, art |
| Special weapon (crossbow) cards | 2 | effects, uses |
| Combat cards | 36 | set, letter, double-hit matchups |
| Treasury cards | 33 | gold, effects |
| Dragon cards | 8 | art only (kinds known) |
| Room cards | 60 | kind, gold, effects, follow-up, dispositions |
| Search cards | 15 | same |
| Room-search cards | 14 | same, incl. secret door cards |
| Chest cards | 14 | same |
| Door cards | 15 | opens / closed / trap with effects |
| Monster cards | 15 | HP, group, three reactions |
| Ring cards | 4 | power, effects, trigger |
| Symbol die faces and target geometry | 1 set | needed for the original solo mode (D17); manual entry works without them |

### 8.3 Original creative elements to design

Game name and route id; logo and games-list tile copy; visual theme and palette within site tokens; map art for the board and 88 tiles plus chamber; tile iconography for the dot types, doors, gates, well, rotating room, rubble; eight heroes (names, classes, portraits, equipment names); monster names and portraits for 15 cards and monster groups; card names and wording for all 224 cards; ring names and powers; crossbow item naming; dragon art; story and intro text; sound (optional, none planned); results and death copy.

## 9. Decision register (owner rulings, 2026-11-18)

The owner checked every item against the 2023 Swedish rulebook, the final authority (never another edition). Every suggested default was accepted except D06, D13, D17, D19, D20, D21, D22 and D29, which the owner changed; D07, D08, D11, D23 and D28 carry owner clarifications. Rulings are recorded close to verbatim.

Classes: **1** Explicit original rule; **2** Interpretation of original rule; **3** House rule; **4** Application-only behaviour. Tags (spec v2 authority levels): A `explicit2023`, B `componentData`, C `legacySupported`, D `interpretation`, E `houseRule`, F developer assumption (forbidden unless approved), plus `app-only` for class 4. The tag decides how the code treats the row; spec v2 moves D03 (damage floor) to `legacySupported`. A row with parts of different classes lists the main class first. "Provisional" means implemented now but open to change when the rulebook or a card definition is verified.

| ID | Question | Source | Ruling | Class | Tag |
|---|---|---|---|---|---|
| D01 | Equal gold among escapees | RB 1, SP 10 | Shared win: co-winners. | 3 | houseRule |
| D02 | Exact clock timing so there are 26 turns | RB 1, SP 4, SP 10 | Round 1 is played at sun 1; the sun advances at the start of each later round; advancing to 27 ends the game before anyone acts. | 2 | interpretation |
| D03 | Negative damage formula results (D6-2, D12-Luck) | RB 5.1, RB 8.6, SP 7 | Floor at 0; damage never heals. | 3 | legacySupported |
| D04 | Healing above starting HP | RB 5.1 | Cap at starting HP unless the card says otherwise. | 3 | houseRule |
| D05 | First-player D12 ties | SP 3 | Tied players reroll until one is highest. | 3 | houseRule |
| D06 | Blue (dark) room: which entries trigger it | RB 6.1, RB 6.2, spec v2 #3 | Apply the dark-room D6 sequence on the initial reveal. Preserve special-room effects when a hero flees (or is forced) back into one. Ordinary re-entry does not trigger it: rules-config `darkRoomPolicy: 'ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY'` (default), alternative `'EVERY_ENTRY'`. Spec v2 replaces the earlier `darkRoomOnReentry` flag (default on). | 2 (initial reveal part 1) | interpretation (initial reveal explicit2023) |
| D07 | Dark-room rolled exit is blocked (wall beyond, occupied room, closed door) | RB 6.2 | The hero stays and rolls again next turn. | 3, provisional | houseRule |
| D08 | Well jump failure | RB 6.3 | A failed jump is death. | 2 | interpretation |
| D09 | Where treasury cards discarded at the well go | RB 6.3 | Bottom of the treasury deck. | 2 | interpretation |
| D10 | Rotating room on first reveal | RB 6.4 | Orient by the dot, then rotate 90, since rotation happens on every entry. | 2 | interpretation |
| D11 | Secret door to an adjacent square through a printed wall | RB 7.1 | Secret passages may cross printed walls, but their use and timing follow the actual card instructions; reconcile with the full card definition when it arrives. | 2, provisional | interpretation |
| D12 | Monster controller when the right-hand player is dead or escaped | RB 8.1 | Still the seated player to the right; ~~if solo, the hero reveals it~~ solo part superseded by D37 (the computer reads it). | 2 | interpretation |
| D13 | Does a "hits twice" apply on a same-letter tie | RB 8.4 | Matching letters always deal 1 to both sides unless a verified card explicitly overrides this. Double damage normally applies only to winning matchups with different letters. | 1 | explicit2023 |
| D14 | Both hero and monster reach 0 in one exchange | RB 8.4 | Both die. | 2 | interpretation |
| D15 | Flight back through the red-room gate that fell behind | RB 6.7, RB 8.6, owner spec v3 section 3 item 8 | Flee not offered (way back blocked), like the used secret door. Spec v3 calls this "the approved D15 interpretation". Spec v3 section 3 also confirms the rest as built: no Strength test to enter a red room, its room card is drawn, the portcullis sits on the exact entry edge (`board.edges`), crossing it is D12 <= STR, success leaves it down behind, failure stays and ends the turn, other exits stay free (tests: v3 portcullis). | 2 | interpretation (owner-approved) |
| D16 | Flight back onto a special tile: does it re-trigger | RB 8.6 | Yes, tile effects apply (RB 8.6 wording). | 1 | explicit2023 |
| D17 | Solo combat method in a fully digital game | RB 10, SP 7, SP 9 | Physical target combat is the original solo mode (manual result entry). A/B/C with computer-chosen monster cards is allowed only as an explicitly labelled digital variant, not an original rule. | 1 (variant 4) | explicit2023 (variant app-only) |
| D18 | Does the turn a hero enters the chamber also collect | RB 9.1 vs SP 8 | Yes, collect on entry (SP 8, SP 12 T25). | 2 | interpretation |
| D19 | Forced move after the dragon wakes | RB 9.2, SP 8 | Survivors move to an already-revealed orthogonally adjacent maze tile, with no room card. Never reveal a new tile. If no legal adjacent tile exists, the hero stays put (provisional house-rule exception). Reading of "legal", closest to RB 9.2 "any orthogonally adjacent maze tile" (flagged, not blocking): a revealed ordinary maze tile (not a tower, not the chamber), orthogonally adjacent; no open passage required; single occupancy still applies (RB 5 occupancy is a board rule, not a movement rule); the hero's player picks among legal tiles. Tile special effects at the target follow the flight rule (D16) until verified; see section 13. | 2 (stay-put exception 3, provisional) | interpretation (stay-put houseRule) |
| D20 | May a hero pass a turn without moving or searching | RB 5 | No voluntary skip-turn action. Only legal movement, searches, chamber actions or other rules-defined choices. A forced skip is allowed when no legal action exists. | 2 (forced skip 4) | interpretation (forced skip app-only) |
| D21 | Undo after hidden information is revealed | SP 11 | Undo only covers uncommitted actions. In normal play a player can't reroll revealed dice, redraw hidden cards, or undo a resolved dragon awakening. | 4 | app-only |
| D22 | Dragon deck reset when everyone leaves without waking | RB 9.2, SP 8 | Reset the dragon deck when the treasure chamber becomes empty, even if every hero left voluntarily. Preferred interpretation of the rulebook wording. | 2 | interpretation |
| D23 | Towers: start, escape, re-entry | RB 12, SP 10, spec v2 #2, owner tower ruling | **Rewritten by spec v2** (was: "leave the starting tower and return to any tower to escape"). Towers are shared rooms. Being in a tower is not escaping. Entering any tower from the castle offers Escape (final: the hero leaves the turn order, no re-entry), Stay (turn ends, hero stays active in the tower) or Continue (on through another legal tower passage this turn), subject to legal moves. Only Escape sets ESCAPED. Any hero may use any tower, any number may share one, and returning to a tower is legal and never forces escape, even as the only route. The choice resolves before sunset closes the turn. | 2 | interpretation (escape finality legacySupported/interpretation) |
| D24 | Split of the 36 combat cards | RB 2, RB 4 | 12 sets of 3: S01-S08 hero, S09-S12 monster groups. | 2, provisional (until the combat cards are verified) | interpretation |
| D25 | Is held room-loot gold public | SP 9 | Public; only treasury cards are private. | 2 | interpretation |
| D26 | 80 HP marker supply as a limit | RB 2 | Not enforced (physical artefact). | 4 | app-only |
| D27 | Tile bag runs out before the board is full | RB 4, SP 3 | Tiles are drawn without replacement; squares with no tile left are impassable. | 3 | houseRule |
| D28 | A dead hero's cards | not documented | Acquired held cards go back to their original decks (bottom) unless the card says otherwise; never recycle hero identity, combat or starting ring cards as loot. | 3 | houseRule |
| D29 | Can a special room also carry a dot or other marking | RB 6.1 | Don't hard-code any ban; verified tile data decides which combinations exist. | 4 | app-only |
| D30 | Who advances the sun if the first player dies or escapes | RB 5 | The clock advances per round regardless. | 2 | interpretation |
| D31 | Towers or chamber trigger room cards; tower side openings | RB 4, SP 3 | No room cards in towers or the chamber; tower sides defined in BoardDefinition. | 2 | interpretation (tower sides componentData) |
| D32 | A hero in a tower at sunset who never chose Escape | owner tower ruling, spec v2 | Not escaped and not dead: end result INSIDE_AT_SUNSET, kept apart from DEAD in state and results (the same end result as any other hero still inside). Rules-config `towerAtSunsetCountsAsEscape: false` (firm). | 2 | interpretation |
| D33 | Escape straight from the start tower | owner tower ruling | Placing a hero in its start tower is not entering a tower: a READY_IN_START_TOWER hero is never offered Escape. Rules-config `escapeWithoutExploring: false` (firm). | 2 | interpretation |
| D34 | Escaping on a later turn from a tower the hero stayed in | owner tower ruling (escape is a choice, never forced), section 13 #25 | A hero in IN_TOWER_NOT_ESCAPED (so it has explored) is offered Escape as a turn action on every later turn, beside its legal moves, the final turn included. Never for a READY_IN_START_TOWER hero (`escapeWithoutExploring: false`). No switch; tagged in `RULE_TAGS.towerEscapeOnLaterTurns`. | 2 | interpretation |
| D35 | Which sides of the central chamber can be entered | owner ruling (2026-11-18), section 13 #9 and #27 | **Geometry superseded by D36** (one cell); "open on every side" stands. Original text: the two-square chamber can be entered from every orthogonally adjacent square: all six outer sides are open (subject, as for any move, to the neighbouring tile having an opening toward it). Board data: `chamberSides` all `open`. Supersedes the fixture's NON-AUTHENTIC chamber sides (one wall on each square). | 2 | componentData (owner-verified) |
| D37 | Who may see the monster's card, HP and damage | owner spec v3 section 2 (2026-11-19); reverses the solo part of D12 and R94 | "The monster player or computer knows the monster's HP and privately tracks damage. The hero must never see the monster's starting HP, remaining HP, percentage, or an HP bar. Announce when the monster dies." Built: the hero's and the public view carry only the monster's combat group (`encounter.monster = { groupId }`), never its card id (the content would give its HP), HP or wound total; `monster-wound` log entries are private to the monster player (the running total blanked for others, each hit's amount still announced); `monster-dead` is public with no figure. Solo (literal reading, flagged): the computer is the monster player, the card is never shown and its reaction is announced at once (no MONSTER_REACT step); the dice-target mode keeps its manual entry and gets a separate `combat.label`. | 2 | interpretation (solo part) |
| D36 | How many cells the treasure chamber has | owner spec v3 section 1 (2026-11-19), reverses spec v2 item 1's "two centre cells" | "The chamber is one cell and can be moved out of to any adjacent cell. Not two cells." With D35: one cell, enterable from and exitable to every orthogonally adjacent cell (subject, as for any move, to that cell's tile having an opening toward it). Board data: `center` is a list of exactly one `{ x, y }` at a centre position (the odd side's middle line; on the even side either middle line, so (4,5) or (5,5) on 10 x 11); `chamberSides` and the chamber tile's `sides` are no longer used and are reported as errors. The fixture chamber is at (4,5); (5,5) is an ordinary maze square (105 maze squares). | 2 | componentData (owner ruling) |

Count by main class: class 1: 3 (D13, D16, D17); class 2: 24 (D02, D06, D08, D09, D10, D11, D12, D14, D15, D18, D19, D20, D22, D23, D24, D25, D30, D31, D32, D33, D34, D35, D36, D37); class 3: 7 (D01, D03, D04, D05, D07, D27, D28); class 4: 3 (D21, D26, D29). Mixed rows: D06 (1 and 2), D17 (1 and 4), D19 (2 and 3), D20 (2 and 4). Provisional: D07, D11, D19 stay-put exception and its "legal" reading, D24.

Engine rule: a ruling that may flip after verification, or that the owner fixed as an interpretation, is a named entry in the rules config (`rules` in `Game`; `DEFAULT_RULES` and `RULE_TAGS` in `engine/reducer.js`), so the change is data, not code:

| Entry | Default | Values | Ruling | Tag |
|---|---|---|---|---|
| `darkRoomPolicy` | `ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY` | or `EVERY_ENTRY` | D06 | interpretation |
| `forcedMoveTileEffects` | `true` | `true` / `false` | section 13 #3 | interpretation |
| `soloCombat` | `target` | or `abc-digital-variant` | D17 | explicit2023 (variant app-only) |
| `towerAtSunsetCountsAsEscape` | `false` (firm) | `true` / `false` | D32 | interpretation |
| `escapeWithoutExploring` | `false` (firm) | `true` / `false` | D33 | interpretation |
| `towerEscapeOnLaterTurns` (tag only, no switch) | always on | none | D34 | interpretation |

Each class 3 and class 4 behaviour is implemented in one named place and cited in the code. Class 4 behaviour is never presented in the UI as an original rule.

## 10. Test plan

Table-driven `node --test` files in `tests/keep/`, each case carrying `cite: "RB x / SP y"`. Fixtures are NON-AUTHENTIC and live in `site/keep/content/fixtures/` (shared with the "Test with fixtures" mode). Replay format per section 5.

| Test | Spec 12 # | Asserts | Cite | Rows |
|---|---|---|---|---|
| T01 | 1 | slot manifest 88 + 1, 224 in 12 categories, validation errors name ids | SP 2, RB 2 | R07, R10, R16, R20, R54, R58, R67 |
| T02 | 2 | 1-4 seats accepted, 5 rejected | SP 2 | R01 |
| T03 | 3 | highest D12 first, clockwise heroes, reverse ring draft, towers clockwise; T03b tied highest seats reroll (D05) | RB 4, SP 3 | R13-R15, R18, R19 |
| T04 | 4 | stat 4: D12=4 pass, 5 fail; stat 9: 9 pass, 10 fail (knight/hunter fixtures) | RB 3, SP 12 | R08, R09 |
| T05 | 5 | exactly 26 turns per hero; reaching 27 ends game; heroes who never escaped get INSIDE_AT_SUNSET, never DEAD; not 25, not 27; T05b sun advances with the first player dead or escaped (D30) | RB 1, SP 4, SP 10 | R06, R21, R98, R106 |
| T06 | 6 | entry dot aligned for all four approaches; revisit keeps tile and rotation | RB 5, SP 4 | R25, R26, R11 |
| T07 | 7 | no diagonals; both-side openness; one hero per room; many in towers/center; T07b empty tile bag makes unexplored squares impassable (D27); T07c no voluntary pass, forced skip only with no legal action (D20) | RB 5, RB 6.1, SP 5 | R23, R24, R27, R53, R11, R28 |
| T08 | 8 | black room draws exactly one card, also on revisit | RB 6.1, SP 5 | R32 |
| T09 | 9 | red room card plus gate behind | RB 6.1, RB 6.7 | R33 |
| T10 | 10 | yellow: no card, continue same turn, chain of corridors | RB 6.1, SP 5 | R34 |
| T11 | 11 | blue ends turn on the initial reveal; D6 maps 1-3/4-6 and 1-2/3-4/5-6 with clockwise/counterclockwise; a flee back into a dark room keeps the effect; T11b blocked rolled exit, hero stays and rolls next turn (D07); T11c ordinary re-entry triggers it only under `darkRoomPolicy: EVERY_ENTRY` (D06) | RB 6.2, SP 5 | R35-R38 |
| T12 | 12 | well entry fail kills; pass strands; jump uses D12 + treasury count; discard lowers it and goes to the treasury bottom (D09); room loot ignored; T12b failed jump is death (D08) | RB 6.3, SP 5 | R39-R42 |
| T13 | 13 | rotating room +90 on every entry, none when staying | RB 6.4, SP 5 | R43 |
| T14 | 14 | rubble ends turn; next turn return or AGI; fail retries | RB 6.5, SP 5 | R44, R45, R22 |
| T15 | 15 | door card required; opens/closed/trap; relocks; same-turn flight back | RB 6.6, SP 5 | R46-R50, R52 |
| T16 | 16 | gate STR test; fail ends turn; success crosses and reseals | RB 6.7, SP 5 | R51 |
| T17 | 17 | search only black/red; room-search deck; secret door orthogonal move same turn; repeatable | RB 7.1, SP 6 | R55-R57 |
| T18 | 18 | card under own deck; retained stays held; branch to named sub-deck; reshuffle card | RB 7.2-7.4, SP 6 | R12, R59-R63 |
| T19 | 19 | commit before reveal; controller is right-hand seat; HP hidden in view; special weapon reads attack; monster flees path | RB 8.1, RB 8.2, SP 7 | R64-R66, R68 |
| T20 | 20 | A>B, B>C, C>A, ties both -1, double only from data; T20b a same-letter tie deals 1 each even when a card lists a double (D13) | RB 8.4, SP 7 | R70, R71, R17 |
| T21 | 21 | troll replay: five exchanges, hero -3, monster -4, monster dead, turn ends (troll and knight are fixtures) | RB 8.5, SP 7 | R69, R72, R73 |
| T22 | 22 | flight to previous tile only; no room card; tile effects run; strike-then-flight; strike-then-combat; blocked way back | RB 8.6, SP 7 | R74-R77 |
| T23 | 23 | ambush damage D12 - Luck with scripted dice; Wait not offered | RB 8.7, SP 7 | R78, R29 |
| T24 | 24 | dragon 7/1; no replacement; odds 1/8 .. 1/1; shared across heroes | RB 9.1, RB 9.3, SP 8 | R83-R85, R93 |
| T25 | 25 | two treasury + one dragon on entry and on staying; leaving draws nothing; chamber placed on first entry | RB 9.1, SP 8 | R81, R82, R86 |
| T26 | 26 | wake: treasury cards to bottom, full D12, forced move to an already-revealed adjacent maze tile without room card and never to an unexplored square, clockwise from waker, deck reset after; T26b no legal adjacent tile, hero stays put (D19) | RB 9.2, SP 8 | R87-R91 |
| T27 | 27 | any tower, by choosing Escape on entry; highest gold among escapees; non-center hero can win; zero escapees castle wins; T27b equal top gold gives co-winners (D01); T27c a setup hero is never escaped and is offered no Escape (D33) | RB 1, SP 10 | R02-R05, R97 |
| T28 | 28 | solo commit before reveal; the computer plays the monster, card and HP hidden (D37); solo log record; target manual entry is the default solo combat; T28b the A/B/C computer variant is labelled a digital variant (D17) | RB 10, SP 9 | R94-R96 |
| T29 | 29 | save, reload, resume mid-encounter keeps RNG, decks, HP, rotations, phase, hidden picks, dragon depletion; under 200 KB | SP 11 | R101, R99, R102 |
| T30 | 30 | full Start refused with any EMPTY slot; fixture runs flagged NON-AUTHENTIC; no PvP/trade actions exist | SP 11 | R100, R103 |
| T31 | (extra) | target scoring arithmetic: RB 8.9 five-throw example gives hero -4, monster -6 then dead (troll fixture) | RB 8.8, RB 8.9 | R79, R80 |
| v2 | (spec v2) | `tests/keep/v2.test.js`: board 110 squares and corner towers, either orientation; chamber reserve; bilateral wall, fixed edges and board chamber sides; setup hero not escaped and no Escape before leaving; tower entry from every permitted direction offers Escape / Stay / Continue; B enters A's tower; shared tower; return to a connected tower, re-entry without escaping, the tower as the only legal destination with no forced escape; tower transit; final-turn tower entry (choice offered at sun 26, Escape counts); sunset policy (in tower, not escaped, not dead; the flag flips it); closed door lets another exit be used, and ends the turn on a compulsory move; dark room initial reveal only by default and with EVERY_ENTRY; well and rubble entry records; semantic log, normal and debug views; synthetic list and app label | spec v2, owner tower ruling | R07, R11, R19, R20, R35, R48, R97, R98, R108-R111 |
| T04b, T04c, T09b, T18b, T19b, T19c, T22b, T22c, T24b, T29b, T29c | sub-cases | death at 0; dead hero's acquired cards return to their decks, hero/combat/ring cards never loot (D28); heal cap (D04); reshuffle; special weapon; monster flees; damage floor (D03); no flight through the red-room gate behind (D15); dragon deck resets when the chamber empties, also after voluntary exits (D22); privacy (D25); undo covers only uncommitted actions, never rerolls revealed dice, redraws hidden cards or undoes a dragon awakening (D21) | as rows | as rows |

As built (M2), all under `node --test "tests/keep/*.test.js"`: `tiles.test.js` (T08-T17 with T11b, T11c, T12b), `decks.test.js` (T18, T18b, T04b, T09b, T22b, T30, every effect primitive, card-data validation), `monsters.test.js` (T19-T23, T19b, T19c, T22c, T28, T28b, T31, T04c, D14), `treasury.test.js` (T24, T24b, T25, T26, T26b, the section 13 #3 flag), `view.test.js` (T29 engine part, T29b, T29c), `v2.test.js` (the spec v2 acceptance tests), `scenarios.test.js` (M-A, M-B, M-C as scripted replays, plus a solo acceptance run with real gold), `replay.test.js` (random full games with a card census after every action and the 200 KB size check). Replays are scripted JS tables (dice, deck orders, decisions, checkpoints; a leftover die fails), not the JSON files sketched in section 5. M-A starts from a constructed position (tiles and heroes placed by the test).

Manual scenarios (spec 12, run in the browser with fixtures, scripted seed recorded in the save):

| ID | Scenario | Checks |
|---|---|---|
| M-A | 4 players, two heroes in the chamber, one wakes the dragon | second hero processed next clockwise outside turn order; both lose treasury cards; full D12 each; forced moves; deck reset; turn order resumes correctly |
| M-B | Day-26 near escape | hero reaches a tower on the last turn and escapes; a hero one square short is lost at sunset; no 27th turn |
| M-C | Corridor chain into a room with a monster | yellow chain in one turn, room card, monster commit, cover screens, combat, turn ends |

Also the BG browser checks: console clean, every action, undo, reload mid-game, save, resume, delete, finished save, 375x812, wide, light, dark, keyboard only, reduced motion; clear test data after.

## 11. Milestones

| M | Scope | Done means | Relative size |
|---|---|---|---|
| M0 | This plan; owner approves mechanical contract, boundary, register rulings, BG amendments | Owner sign-off; decision register ruled or explicitly deferred | S (done when approved) |
| M1 | Systems 1, 2, 4, 9 and the placement part of 3: reducer, phases, seeded PRNG in state and scripted dice, setup (player count, first player, hero and ring drafts, towers), board, tile bag, orientation, connectivity, occupancy, clock, escape, ranking; schema.js, slot manifest, content report and full-fidelity start gate; fixture board and tiles. Tile special effects (dot types, well, rotating, rubble, dark), doors and gates move to M2, with hooks left in place. | T01-T07, T05, T27 and their M1 sub-cases green; deterministic replay and save/restore continuation green. **Built** (`443c287`). | L |
| M2 | Systems 5, 6, 7, 8 and the rest of 3: tile special effects (dot types, dark, well, rotating, rubble), doors and gates, decks, effect interpreter, room/search/chest/door/monster flow, commit and controller, A/B/C, flight, ambush, inventory, treasury and dragon; fixture cards | T08-T26, T28, T30, T31 green; all fixture replays green. **Built** on `keep-engine` (2026-11-18): 92 tests green, M-A/M-B/M-C automated as scripted replays (browser runs stay in M3). | L |
| M3 | System 10: `keep/index.html` UI (setup, draft, board with zoom/pan, panels, cover screens, combat, chamber, results, content status, fixtures banner), `NL.saves`, autosave, undo, games-list tile | T29 green; M-A, M-B, M-C pass; BG quality floor checks pass; screenshots and replay log shown to owner. **Built** on `keep-engine` (2026-11-18): title and setup with the content report and gated Start, fixtures banner, draft, tabletop (SVG map, legal targets, arrow keys, zoom steps, sun clock, heroes, event log), a panel per engine phase, commit-before-reveal and cover screens, A/B/C with simultaneous reveal, solo target entry and the labelled digital variant, private chamber cards, dragon odds and wake, results, autosave `nl-keep-v1`, `NL.saves`, D21 undo, games-list tile. Engine additions: `view()` gold per viewer and `screenOwner()` (who must be looking), with tests; 94 tests green. Browser checks: M-A, M-B, M-C and a solo target fight replayed from constructed positions through the real buttons; about 75 random fixture games (1 to 4 players) clicked through end to end with a privacy check (no monster card name on a public screen) and no errors; refresh mid-encounter keeps the phase and the draw count; save, resume (same record id), delete; 375x812, 667x375, light, dark, keyboard only; piece contrast measured (section 13 #19). | L |
| M4 | Owner supplies or approves original content in the documented slots (board, 88 tiles, chamber, 8 heroes, 224 cards, rings, crossbow), plus original art | Content status 100% OWNER_APPROVED; validation clean; full Start unblocked. **Content kit built** on `keep-engine` (2026-11-18): one authoring file per slot type in `site/keep/content/original/` (empty templates with a commented skeleton; entries carry the placeholder id, `copies`, `status: 'draft' \| 'approved'`, optional `text`, and the schema fields), the guide `docs/content-kit/README.md`, the checker `node tools/keep-content.js check \| report \| new <slot>` (reuses `schema.js`), the play-test mode (owner entries over NON-AUTHENTIC fill-in, section 13 #23) and `text` shown in place of the generated summary (section 13 #21); 104 tests green. The owner's content itself is still to come. | M (engineering), owner-paced |
| M4b | Owner specification v2 in the engine (2026-11-19): 10 x 11 board with board-driven geometry, shared towers and the tower and sunset ruling, dark-room policy, door, well and rubble records, authority tags, semantic log with a debug view, synthetic-data list and app label | **Built** on `keep-engine`: engine, tests, content kit and plan updated; 119 tests green; the tower and dark-room rules were broken on purpose and the tests caught both. The UI is updated in M4c | M |
| M4c | Spec v2 in the UI (2026-11-19): tower prompt and later-turn Escape, new statuses and results, map viewport, board-data tile drawing, move reasons, inspect sheet, hero panel, synthetic banner and app label, semantic and debug log, keyboard grid | **Built** on `keep-engine`. Engine: Escape offered on later turns after Stay (D34, section 13 #25), 122 tests green. UI: "You reached a tower" with Escape the castle / Stay in the tower / Continue through the other passage (only when legal), Escape beside the moves on later turns; results list Escaped, Dead and Inside at sunset apart; the rules panel lists every `RULE_TAGS` entry with its value, ruling and tags. Map (`ui/board.js`): the 10 x 11 rectangle in a viewport with pinch and drag (pointer events), wheel and +/- zoom, Fit board, Centre on hero (also a tap on the active hero), a long press or a second tap inspects; a CSS transform, the glide off under reduced motion. Tiles drawn from board and tile data: openings, walls, doors, portcullises (fallen ones in red), the entry dot, mark shape and colour, special glyph, tokens, printed walls and fixed edges, chamber sides, tower openings; unexplored, out of board (hatched band), chamber reserve (dashed), tower and a side shut from the other side (dashed bar) all differ. Every legal move is a lit square and a button with a reason line; tapping or Enter on another square opens the inspect sheet with its sides, occupants and, when adjacent, why the hero cannot go there (wall on this side, wall on their side, printed wall, occupied room, no tiles left, the door stayed shut, the way into the tower). Hero panel per hero: name, four stats, HP, ordinary gold, hidden chamber-card count, ring, special weapon and uses, special-room state, location, status. Banner lists the synthetic categories (folded on phones); APP_LABEL on the title and in Settings. Event log: round on every line, coordinates, marks, gate and door edges, public card ids, commitments, dice arithmetic; Settings "Debug log" (off by default, `nl-keep-prefs-v1`) shows the debug view: RNG state, deck tops, shuffles, raw fields. Keyboard: the map is a role=grid with one roving tab stop, arrows move focus, Enter or Space chooses or inspects, Esc closes the sheet or clears an uncommitted target entry; cell labels give coordinate and topology. Browser checks at 127.0.0.1:8769: console clean; a 2-player fixture game (shared start tower, flight back into a tower with no Continue, Stay then Escape next turn, Continue through a tower then Stop, the inspect reason for the way back in); a solo target-entry fight; no Escape at setup; a final-turn tower entry (sun 26 set in the save) offering the choice, Stay, and results showing Inside at sunset; a well death listed under Dead; Fit, Centre, +, wheel, mouse drag, synthetic two-finger pinch and long press; a blocked-cell inspect; a keyboard-only turn; 375x812 and 667x375 in light and dark | M |
| M4d | Mobile pass (2026-11-19): board and prompt on one phone screen, auto-zoom, near-miss taps, fewer covers, wake lock, thumb-reach undo, screen-reader announcements | **Built** on `keep-engine`, owner-approved list of seven. Below 820px in portrait the table is one screen: a one-line status bar (turn, sun, dragon odds, tiles left), the map filling what is left with -, +, Fit board and Centre on hero floating in its corner as 44px icon buttons, and the prompt docked under it (at most half the screen, its own scroll, latest results first with whose turn they were on, and an "Undo {name}'s ..." button when undo is allowed); map key, heroes and log below the fold; landscape and 820px and wider unchanged; the folded test-data banner is one slim line. The map zooms to the active hero (48px a square, 3x3 around them) when the hero or their square changes, never during a gesture. A single tap on an unlit square gives its one-line reason as a toast; long press, double tap and Enter keep the inspect sheet. The "Pass back to the table" cover is gone (a test checks the public view is within every seat's view through a fight); every "I am X, show me" cover stays, and comes back if the phone sleeps or the page is hidden on a private screen. Screen wake lock while a game is on. One permanent polite live region reads the latest results from the current viewer's view. The keyboard hint shows only with a fine pointer. 126 tests green; browser check at 375x812 still to do. | S |
| M5 | Full playtests with real content, solo and 4 players, edge-case review, polish | All tests green with real content; owner approves merge; push and deploy only on explicit owner go-ahead | M |

## 12. Needed from the owner

1. Approve this plan and the content boundary, including that the finished game uses original content and makes no 1:1 odds claim.
2. Done: D01-D31 ruled (section 9).
3. When convenient: verify the provisional rulings (D07, D11, D19, D24) and the open points in section 13 (new with spec v2: rows 25-28) against the Swedish rulebook and the components.
4. Original content for every slot in section 8.2, or approval of drafts we write to the documented structure; original art direction. How to write it, deck by deck: the content kit, [`docs/content-kit/README.md`](../content-kit/README.md).
5. Final name, route id and theme (placeholders: "Dusk Keep", `keep`).
6. ~~Approve the two BUILD-GUIDE amendments.~~ Approved and applied to BG on 2026-11-18, with the `keep/` layout line and a "Dusk Keep specifics" decisions entry.
7. Done: the `site/` and Worker move is on `main` (`11f85ee`); the game lives at `site/keep/`.
8. Decide the fate of the companion (`dungeon/`, `becd950`) and Tidevault (`a414084`); this plan leaves both untouched.
9. Get independent IP advice before any public distribution.

## 13. Remaining contradictions

Only points still open after the owner's rulings (section 9). Resolved and removed: chamber collect on the entry turn (D18), dark room on first discovery and on retreat (D06), solo combat (D17), the status label (NEEDS CONTENT is used), hero naming (fixtures only). None blocks M1 to M3; each has a default (a rules-config entry, one named function, or a pending gate). Rows 10-17 were found while building M2, rows 18-22 while building M3, rows 23-24 while building the M4 content kit, rows 25-28 with spec v2.

| # | Point | Sources | Default now | Blocks implementation? |
|---|---|---|---|---|
| 1 | Ordinary re-entry into a dark room | RB 6.1 table "entering" vs RB 6.2 "as soon as this special tile is drawn"; SP 5 "entering" | **Ruled by spec v2:** `darkRoomPolicy: ON_INITIAL_REVEAL_PLUS_SPECIAL_REENTRY` (D06, interpretation): no effect on ordinary re-entry; `EVERY_ENTRY` is the alternative | No: one entry, both values tested (T11c, v2 dark room). |
| 2 | Meaning of "legal" for the forced move after the wake | RB 9.2 "any orthogonally adjacent maze tile"; SP 8 "special room/placement exceptions must be verified" | revealed ordinary maze tile, no open passage needed, single occupancy applies (D19, flagged); adjacency is measured from the one chamber cell (D36) | No: one predicate, `forcedMoveTargets` in `treasury.js` (M2). |
| 3 | Tile special effects at the forced-move target (well test, rotation, dark room, rubble) | RB 9.2 and SP 8 say only "no room card"; SP 8 says exceptions must be verified | apply as for flight (D16): rules flag `forcedMoveTileEffects`, default on, both values tested | No; verify against the rulebook. |
| 4 | Secret passage use and timing through printed walls | RB 7.1 and SP 6 ("any orthogonally adjacent square") vs the card text not yet seen | crossing allowed, timing from the card (D11, provisional) | No: depends on the card definition (M4). |
| 5 | Combat card split 24 + 12 | RB 4 "his hero's three cards" and monster cards "by group"; SP 2 "A/B/C cards for hero/monster sets" | 12 sets of 3 (D24, provisional) | No: set ids are data. |
| 6 | Monster control by the computer in multiplayer | RB 8.1 right-hand player; SP 9 also allows "an accurately modeled secret AI reaction" | right-hand human controller; a computer controller only as a labelled digital variant (in line with D17) | No: M3 option at most. |
| 7 | What "complete content" means | SP 0 and SP 11: transcription of the real 88 tiles and 224 cards, checked against the physical set; plan section 2: owner-original content in the slots; the rulings speak of "verified" cards and tiles | engine is content-agnostic; validation counts verified slots either way | No for M1-M3; the owner decides before M4. |
| 8 | A tile whose entry side is a door or gate | RB 6.1 and SP 5 orient by the entry dot; nothing says the dot side can be a door or gate | **Pending gate** (M2): content validation rejects such a tile by id ("PENDING owner ruling on door/gate entry sides"), so no game can start with one; the M1 runtime error is gone | No for M2; blocks only a tile that has it, until the owner rules with the real tile data (M4). The content kit's checker reports it per tile id and the guide explains it; still open. |
| 9 | Chamber tile orientation | RB 9.1 and SP 8 place the chamber tile on first entry; its orientation and outer openings are not documented | **Ruled (D35, D36, owner):** one cell, open on every side, so it can be entered from and left to all four neighbouring squares; no side data | No: test v3 one-cell chamber open on every side. |
| 10 | What a successful well jump does | RB 6.3 "leap across to the far side"; SP 5 "the next turn must be spent either returning or attempting to jump" | the turn is spent; the hero is across (condition cleared) and moves freely next turn; the engine does not stop a later move back over the near side | No; verify the wording and the well tile's geometry. |
| 11 | Flight, or a card move, into the chamber or a tower | RB 8.6 "tile effects still apply"; D18 collect on entry; D23 (spec v2) tower entry offers a choice | flight into the chamber collects (D18 applied to every entry); flight or a card move into a tower raises TOWER_CHOICE like any entry, but after a flight Continue is not offered (the flight ends the turn) | No; rare, verify. |
| 12 | Special weapon during an ambush | RB 8.7 "attack or flee, not wait"; RB 8.1 the weapon counts as an attack | not offered during an ambush | No; one line in `responseOptions`. |
| 13 | Order of effects on a tile with a special and a mark (D29 allows the combination) | RB 6 lists each separately | rotation, gate behind (red), well test, turn-ending conditions, then the room card | No; data decides which combinations exist. |
| 14 | A door that stays closed during a compulsory move (dark-room exit, well or rubble return) | RB 6.6 "another free passage" vs RB 6.2 "no choice"; D07 lists a closed door as blocked | the turn ends and the hero stays (D07 extended to doors). This default applies to compulsory moves only (`noDetour` in `attemptMove`); on a voluntary move a closed door leaves the other free passages open the same turn (RB 6.6, spec v2 #4; tests T15, v2 doors) | No. |
| 15 | Secret passage reach and lifetime | RB 7.1, RB 6.8, D11 (timing from the card) | crosses printed walls only (open, door and gate edges resolve normally); lasts until the hero moves or the turn ends | No; reconcile with the card text (M4). |
| 16 | Remaining room-card effects after an encounter | RB 8.2 "nothing further occurs"; RB 8.5 cards under their decks | monster flees or hero flees: the rest of the room card is skipped; after a won combat the rest of the card still runs (lets a card say "defeat it, then keep this") | No; follows card data. |
| 17 | Target combat for groups | RB 8.9 recommends the target "for groups that prefer" it too | multiplayer always uses A/B/C; target entry only in solo | No; an M3 option at most. |

| 18 | Monster reaction when the controller is in the hot seat | RB 8.1 "announces"; plan 4.9 | the controller's screen shows the card, HP and the matched reaction; "Announce to the table" hands back through a cover; the hero sees only the reaction type. Solo: nobody reads the card; the computer announces at once (D37) | No; application behaviour (class 4), M3. |
| 19 | Game-piece contrast | BG quality floor 3:1 | **Resolved (M4c):** every fill is 3:1 or better against the floor in both themes, measured (WCAG relative luminance). Floors: light #f4ead9, dark #6b5848 (lightened from #3b312a so dark fills can reach 3:1). Light: wall 11.1, unexplored 3.3, tower 7.1, chamber 3.6, door 5.3, black 14.1, red 5.5, yellow (now dark gold #8a6500) 4.5, blue 5.1, target 4.9, seats 4.4 to 5.4. Dark: wall 5.5, unexplored 3.1, tower 4.1, chamber 4.0, door 3.8, black 3.1, red 3.4, yellow 4.8, blue 3.7, target 4.1, seats 3.7 to 4.0 (dark seat colours are light, with black numbers 11:1; white numbers on light seats 5.3 to 6.4). Shapes still differ, so colour is never the only cue | No; revisit with the owner's art direction (M4). |
| 20 | Screens the engine does not need: the shared reveal after an A/B/C exchange, "Pass back to the table" covers, the holder's chamber-card view after a private draw and on "Show my cards" | plan 4.9 | UI state only, saved with the autosave; a refresh always re-covers a private screen | No; class 4. |
| 21 | Card wording | plan 2, 4.7 | **Resolved (M4 kit):** every definition takes an optional `text` field with the owner's wording, validated as text; the UI shows it in place of the summary generated from effect data (cards, monsters, tiles, heroes, rings). The mechanics still come from the data fields | No. |
| 23 | Play-testing a partly written deck | SP 11 full-Start gate; owner workflow | "Play-test my content" (content mode `mixed`, class 4): every owner entry, draft or approved, plus the whole fixture deck for each slot the owner has not completed; a completed slot plays alone; the dragon deck is never layered (fixture deck until the owner's 8 are written), so there is always one awake card in 8; fixture heroes and monsters keep their fixture combat sets. Needs at least one owner entry and no checker errors. Decks are larger than the real counts, so odds differ; the banner "Play-test: your content plus NON-AUTHENTIC fill-in" shows on every screen and in the save title. The full Start still needs 100% approved | No; application behaviour. |
| 24 | Authoring statuses and ids | plan 4.7 | owner files say `draft` / `approved` and leave out `source`; the loader maps them to `DRAFT` / `OWNER_APPROVED` and `owner-original`. Owner entries must use their slot's placeholder ids (validation error otherwise); fixtures keep `FX_` ids | No. |
| 22 | Well discard in hot seat | RB 6.3, D25 | the discard buttons are numbered, not named, on the shared screen; the holder checks which is which with "Show my cards" | No. |
| 25 | Escaping on a later turn from a tower the hero stayed in | owner tower ruling: the choice is offered on entering a tower | **Resolved (D34, interpretation):** a hero in IN_TOWER_NOT_ESCAPED is offered TOWER_CHOICE ESCAPE in CHOOSE_ACTION on later turns, beside its moves, the final turn included; never for READY_IN_START_TOWER | No; tests in `v2.test.js` (plan 13 #25). |
| 26 | Where a hero stands after a successful well jump | RB 6.3 "leap across"; spec v2 #6 phase CROSSED | the hero stays on the well tile with `roomState.phase: CROSSED` and moves freely next turn (as row 10); no far-edge exit restriction | No; verify against the well tile's geometry. |
| 27 | The real board's geometry | spec v2 #1, owner ruling on board geometry | the fixture board's tower openings are NON-AUTHENTIC placeholders; its chamber is one open cell at (4,5) per D35 and D36, and it prints no walls or fixed edges (the placeholder wall `7,2\|S` and door `7,8\|E` were removed so an empty board is a clean grid; engine support stays, tested with test-local board data in v2 bilateral wall); the owner's board goes in `board.js` as data (towers, `center`, `walls`, `edges`) | No; owner data (M4). |
| 28 | Fixture tile count | spec v2 #1 and D36 (105 maze squares) vs 88 owner tiles | NON-AUTHENTIC fixtures carry 104 tiles (one per maze square before D36, now 104 of 105); owner content stays exactly 88, the checker rejects 89 | No; application behaviour. |

Shortcuts in the M4c code: the move reason lines (`MARK_EFFECT`, `SPECIAL_EFFECT` in `ui/app.js`) restate the engine's entry effects in words for an ordinary move, not for flight or forced moves; the pinch was checked with synthetic pointer events, not a real phone; tower names assume the four towers sit in the board corners (spec v2 #1); the viewport is not kept across reloads (it fits again). Rows 25 and 19 of section 13 are resolved.

Shortcuts in the M3 code (marked `shortcut:` where they live): undo keeps up to 20 full snapshots and clears them at every commit point (`ui/app.js`); a save drops the undo history if the record would pass 240 KB; card text is summarised from effect data unless the entry has the owner's `text` (`ui/words.js`, section 13 #21). Not verified in M3: the full-fidelity Start (no owner content exists, so only its disabled state and reason were checked), signed-in `NL.saves` against the Worker, a real phone, and screen readers beyond labelled controls.

Shortcuts in the M2 code (each marked `shortcut:` where it lives):

- An exhausted deck yields no card (`decks.js`); a door attempt with an empty door deck counts as a door that stays shut (`movement.js`). Real decks are large enough that this should not happen; revisit with real content.
- Treasure-chamber cards are kept as drawn; effects printed on them are not run at collection (`treasury.js`). Revisit when treasury card content exists (M4).
- Ambush offers no special weapon (`monsters.js`, row 12 above).

RB itself warns it "may contain extrapolations" (SP 14); no numeric conflict was found between RB and SP on dice formulas, counts or probabilities.
