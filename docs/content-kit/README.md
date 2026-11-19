# Dusk Keep content kit

This kit lets you write the game's content yourself, one deck at a time, in a plain text editor. You never touch the engine. You fill in small files, run one command to check them, and play-test what you have written.

Contents:

1. [What a slot is, and the boundary](#1-what-a-slot-is-and-the-boundary)
2. [The files](#2-the-files)
3. [Writing an entry: the notation](#3-writing-an-entry-the-notation)
4. [Fields every entry has](#4-fields-every-entry-has)
5. [Effects and dice](#5-effects-and-dice)
6. [Every slot type](#6-every-slot-type), each with its rulings and a worked example
7. [How the engine reads your content](#7-how-the-engine-reads-your-content)
8. [The workflow](#8-the-workflow)
9. [The checker](#9-the-checker)
10. [Stored now, used later](#10-stored-now-used-later)

---

## 1. What a slot is, and the boundary

The game engine plays the rules: the sun clock, the dice, the tile reveal, the decks, combat and the dragon. It does not contain any cards, tiles, heroes or board. Those are **slots**: numbered places the engine expects to be filled with content of a known shape. There are 88 tile slots, 224 card slots in 12 decks, 8 heroes, 4 rings, 2 special weapon cards, 1 board (110 squares: 10 x 11 or 11 x 10) and 1 central chamber tile.

Each slot has a placeholder id, such as `ROOM_017` or `TILE_034`. You use these ids for your entries, so every message from the checker names a real slot.

**The boundary.** The slots take your own original content, written to the documented structure: the same deck categories and counts, the same dot types and tile behaviours, the same effect building blocks. They never take a transcription of the published game: not its card texts, tile faces, printed board layout, or hero characters and stat lines. Names, wording, heroes, monsters and art are yours. This is the rule in the plan (`docs/plans/dungeon-game-plan.md`, section 2) and in the build guide. The kit is not legal advice; get your own IP advice before any public release.

The finished game is faithful to the rules and original in its content, so it will not claim the published set's exact odds.

## 2. The files

Everything you write lives in `site/keep/content/original/`, one file per slot type:

| File | Slot type | How many |
|---|---|---:|
| `board.js` | Board | 1 |
| `chamber.js` | Central chamber tile | 1 |
| `tiles.js` | Maze tiles | 88 |
| `heroes.js` | Heroes | 8 |
| `combat.js` | Combat cards (12 sets of A, B, C) | 36 |
| `rings.js` | Ring cards | 4 |
| `special-weapons.js` | Special weapon cards | 2 |
| `room.js` | Room cards | 60 |
| `search.js` | Search cards | 15 |
| `room-search.js` | Room search cards | 14 |
| `chest.js` | Chest cards | 14 |
| `door.js` | Door cards | 15 |
| `monster.js` | Monster cards | 15 |
| `treasury.js` | Treasury cards | 33 |
| `dragon.js` | Dragon cards (7 sleeping, 1 awake) | 8 |

`index.js` in the same folder only gathers the files; leave it alone.

Each file ships as an empty template. At the top is a **skeleton**: a commented-out entry that shows every field with its allowed values. Below it is the list your entries go in:

```js
export default [
];
```

`board.js` and `chamber.js` hold a single entry instead of a list, so they end with `export default null;` until you write one.

The made-up test data the game uses for "Test with fixtures" is in `site/keep/content/fixtures/fixtures.js`. It is marked NON-AUTHENTIC and is never your content. You can read it to see complete working examples of every slot type, but don't copy it into your files: the checker refuses fixture data in your content.

## 3. Writing an entry: the notation

The files are JavaScript data, which the browser and the checker both read without any build step. You only need a few pieces of notation:

| You write | It means |
|---|---|
| `'words in quotes'` | text. Use straight single quotes. For an apostrophe inside, use double quotes around the text: `"the keeper's lamp"` |
| `12`, `-2` | a whole number, no quotes |
| `true`, `false` | yes or no, no quotes |
| `null` | nothing, none |
| `[ a, b ]` | a list. `[]` is an empty list |
| `{ name: value, other: value }` | a group of named fields |
| `// anything` | a comment for you; the game ignores the rest of the line |

Put a comma after every field and after every entry. A comma after the last one is fine. An entry in a list looks like this:

```js
export default [
  {
    id: 'ROOM_001',
    copies: 2,
    status: 'draft',
    name: 'A name of your own',
    // ... the other fields
  },
  {
    id: 'ROOM_002',
    // ...
  },
];
```

The quickest way to start an entry is to let the checker copy the skeleton for you, with the next free id already filled in:

```
node tools/keep-content.js new room
```

The new entry is a valid `draft` with neutral values. Change the values, then check.

## 4. Fields every entry has

| Field | Required | What it is |
|---|---|---|
| `id` | yes | One of the slot's placeholder ids, for example `ROOM_001` to `ROOM_060`. Each id at most once. |
| `copies` | yes | How many identical physical copies of this one face are in the deck or tile bag. A whole number, 1 or more. See [copies versus unique entries](#copies-versus-unique-entries). |
| `status` | yes | `'draft'` while you work on it, `'approved'` when it is final. Only approved entries count towards the full game. |
| `name` | most slots | Your own name for the card, tile or hero. |
| `text` | no | Your own wording. When it is set, the game shows it instead of the summary it would otherwise generate from the mechanics (for cards, monsters, tiles, heroes and rings). Leave it out, or `''`, to use the generated summary. |
| `notes` | no | Notes to yourself. Never shown in the game. |
| `art` | where the skeleton has it | Leave `null` for now. Art comes later. |

You don't write `source`; the kit marks every entry in these files as your original content.

**The text is wording, not rules.** The engine does what the mechanical fields say, whatever `text` says. If the text promises 3 damage and `effects` deals 2, the game deals 2. Keep the two in step, and play-test to see them side by side.

## 5. Effects and dice

### Effects

Cards (and special weapons, rings and monster reactions) carry `effects`: a list of steps the engine carries out in order. Each step is `{ op: 'NAME', ...its arguments }`. These are the only steps that exist; an unknown name is an error.

| Step (`op`) | Arguments | What it does |
|---|---|---|
| `ROLL_D12` / `ROLL_D6` | `store: 'a name'` | Rolls the die and remembers the result under that name, for a later step to use (see `reg` below). |
| `CHECK_STAT` | `stat: 'STR' \| 'AGI' \| 'ARM' \| 'LCK'`, `modifier:` dice or number, `onPass: [steps]`, `onFail: [steps]` | A stat test: roll a D12, add the modifier; at or under the hero's stat passes. Then runs `onPass` or `onFail`. |
| `DEAL_DAMAGE` | `target: 'hero' \| 'monster'`, `amount:` dice or number | Damage. A result below 0 counts as 0 (ruling D03). |
| `HEAL` | `amount:` dice or number, `uncapped: true` (optional) | Healing, never above the hero's starting HP (D04) unless `uncapped: true`. |
| `DRAW_CARD` | `deck: 'ROOM' \| 'SEARCH' \| 'ROOM_SEARCH' \| 'CHEST' \| 'DOOR' \| 'TREASURY' \| 'MONSTER'`, `then: 'resolve' \| 'keep'` | Draws from another deck: `resolve` plays that card now, `keep` puts it in the hero's hand unplayed (a treasury card goes to their private treasury). |
| `RETAIN_CARD` | `into: 'held' \| 'treasury'` | The hero keeps this card (its gold counts at the end). `treasury` keeps it private. |
| `GRANT_TREASURE` | none | Same as keeping the card in hand: its `gold` counts. |
| `RETURN_CARD_TO_BOTTOM` | `card: 'self'` | This card goes under its deck now (the usual ending, written out, for example in one choice of a `REQUEST_CHOICE`). |
| `SHUFFLE_DECK` | `deck:` a deck name (optional) | Shuffles this card's deck after it is done, or the named deck now. |
| `REMOVE_TREASURY_CARDS` | `who: 'hero'` | The hero loses their treasure chamber cards, to the bottom of the treasury deck. |
| `MOVE_HERO` | `to: 'prev' \| 'adjacent-choice' \| 'N' \| 'E' \| 'S' \| 'W'`, `drawRoom: true/false`, `applyTile: true/false` | Moves the hero: back where they came from, to a neighbouring square they choose, or one step that way. `drawRoom` says whether a room card is drawn there, `applyTile` whether the tile's dot and special rules apply. |
| `END_TURN` | none | The turn ends at once; later steps on this card are skipped. |
| `CONTINUE_MOVEMENT` | none | The hero may keep moving this turn. |
| `SET_CONDITION` | `id: 'a name'`, `turns:` a number or `null`, `onTurnStart: [steps]` | A lasting effect on the hero. Its `onTurnStart` steps run at the start of each of their turns, for that many turns (`null`: until cleared). |
| `CLEAR_CONDITION` | `id: 'a name'` | Ends a lasting effect with that name. |
| `REQUEST_CHOICE` | `options: [{ label: 'words', effects: [steps] }, ...]` | The player picks one option; its steps run. |
| `MONSTER_ENCOUNTER` / `REQUEST_COMBAT` | `ambush: true/false` | A monster: the hero commits to Attack, Wait, Flee or Special before the monster card is revealed. In an ambush the monster strikes first and Wait is not offered (RB 8.7). |
| `OPEN_TEMPORARY_PASSAGE` | `side: 'N' \| 'E' \| 'S' \| 'W' \| 'any-orthogonal'` | A secret passage for this turn's move, which may cross a printed wall (D11, provisional; plan 13 #4 and #15). |
| `ROTATE_TILE` | `degrees: 90` | Turns the hero's room a quarter turn clockwise. |

### Dice and numbers

Wherever a step asks for an amount or a modifier you can write:

| You write | It means |
|---|---|
| `2` | exactly 2 |
| `{ die: 'D6' }` | a D6 roll |
| `{ die: 'D6', plus: -2 }` | D6 minus 2 |
| `{ die: 'D12', minusStat: 'LCK' }` | D12 minus the hero's luck |
| `{ die: 'D12', plusCount: 'treasuryCards' }` | D12 plus the number of treasury cards the hero holds |
| `{ reg: 'a name', plus: -3 }` | a roll remembered earlier by `ROLL_D6` or `ROLL_D12` with `store: 'a name'`, minus 3 |

There is no free-form code: if what you want can't be said with these steps, note it and raise it, rather than bending a card to fit.

## 6. Every slot type

Rulings named here (D01 to D31) are in the plan's decision register, section 9. Open points ("plan 13 #n") are in its section 13.

### Board

`board.js`, exactly 1 entry, id `BOARD_01`. No `copies`.

| Field | Allowed values | Meaning |
|---|---|---|
| `width`, `height` | 10 and 11, or 11 and 10 | Squares across and down: the board is always 110 squares. Columns count from 0 in the west, rows from 0 in the north. |
| `towers` | four `{ x, y, sides }` | The four corner towers, one on each corner. `sides` gives `N`, `E`, `S`, `W`, each `'wall'`, `'open'`, `'door'` or `'gate'`. |
| `center` | two `{ x, y }` in a list | The two squares of the treasure chamber, side by side in the middle of the board. They are one room: open on every outer side, no move between the halves (D39). |
| `walls` | list of `'x,y\|SIDE'` | Printed walls between squares, for example `'3,2\|E'` is a wall on the east side of column 3, row 2. Optional. |
| `edges` | `{ 'x,y\|SIDE': 'wall' \| 'door' \| 'gate' }` | Other fixed edges printed on the board, for example a door between two squares. Optional. |

The board is the authority for movement geometry: the engine reads tower openings, the chamber squares, printed walls and fixed edges only from here, and every square outside `width` x `height` is off the board. Correcting the map from the real board is a data edit, never a code change. An edge is blocked if either side, a printed wall or a fixed edge says `'wall'`.

Rules the checker applies (owner specifications v2 and v3): 110 squares, 10 x 11 or 11 x 10; towers on the four corners (RB 4); the chamber is exactly two side-by-side squares in the middle (D39, the owner's ruling, replacing the one-square chamber of D36). The odd side has one middle row or column, the even side two, and the chamber takes both: on a 10-wide, 11-deep board it is `[{ x: 4, y: 5 }, { x: 5, y: 5 }]`, on an 11-wide, 10-deep board `[{ x: 5, y: 4 }, { x: 5, y: 5 }]`. The two squares are one room: a hero in it is simply in the chamber, any number of heroes may be there, and a hero may enter it from, and leave it to, every square next to either half (six on a 10 x 11 board), subject, as for any move, to that square's tile having an opening toward it. `chamberSides` is no longer used and is reported as an error. That leaves 104 ordinary squares for 88 tiles: squares left without a tile are impassable once the bag runs out (D27). There are no room cards in towers or the chamber, and tower sides come from this entry (D31). Towers are shared rooms: any hero may enter any tower, and entering one from the castle offers a choice to escape, stay, or continue through another passage (spec v2, replacing D23).

**Example only, not real content, not authentic:**

```js
export default {
  id: 'BOARD_01', status: 'draft', name: 'Example board',
  width: 10, height: 11,
  towers: [
    { x: 0, y: 0, sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' } },
    { x: 9, y: 0, sides: { N: 'wall', E: 'wall', S: 'open', W: 'open' } },
    { x: 0, y: 10, sides: { N: 'open', E: 'open', S: 'wall', W: 'wall' } },
    { x: 9, y: 10, sides: { N: 'open', E: 'wall', S: 'wall', W: 'open' } },
  ],
  center: [{ x: 4, y: 5 }, { x: 5, y: 5 }],
  walls: ['2,3|E'],
  edges: { '6,7|S': 'door' },
};
```

### Central chamber tile

`chamber.js`, exactly 1 entry, id `CHAMBER_01`. No `copies`.

The entry holds only `id`, `status` and the optional `name`, `text`, `notes` and `art`. The chamber is one room over two squares, open on every outer side (D39), so it has no `sides`; a `sides` field is reported as an error. Where it sits comes from `center` in `board.js`. A hero entering collects at once (D18); the chamber deck resets when it empties (D22).

**Example only, not real content, not authentic:**

```js
export default {
  id: 'CHAMBER_01', status: 'draft', name: 'Example chamber',
  art: null,
};
```

### Maze tiles

`tiles.js`, 88 tiles in all (copies added up), ids `TILE_001` to `TILE_088`.

| Field | Allowed values | Meaning |
|---|---|---|
| `sides` | `N`, `E`, `S`, `W`: `'wall' \| 'open' \| 'door' \| 'gate'` | The tile's four edges, drawn with the entry dot on the side named in `entrySide`. |
| `entrySide` | `'N' \| 'E' \| 'S' \| 'W'` | The side carrying the entry dot. It must be `'open'`. |
| `mark` | `'black' \| 'red' \| 'yellow' \| 'blue' \| 'none'` | The dot type. Black: draw one room card. Red: draw one room card, and a gate falls behind you. Yellow: a corridor, no card, keep moving. Blue: a dark room, roll your way out. |
| `special` | `'none' \| 'well' \| 'rotating' \| 'rubble'` | A special room. |
| `effects` | list of steps | Extra printed effects (stored, not run yet: see section 10). |

Rules and rulings:

- **Entry side must be open.** A door or gate on the dot side is not documented in the rules, so the checker rejects it by id ("PENDING owner ruling on door/gate entry sides", plan 13 #8). If your tile design needs one, make the ruling first; until then, the tile cannot be loaded.
- **Blue (dark) tiles** need exactly 2 or 3 non-wall sides (RB 6.2). They trigger on first discovery, on retreat into them, and on ordinary re-entry while the `darkRoomOnReentry` flag is on (D06, provisional). A blocked rolled exit keeps the hero there to roll again next turn (D07).
- **Well:** a failed jump is death (D08); treasury cards discarded there go to the bottom of the treasury deck (D09).
- **Rotating:** it turns 90 degrees on every entry, including the first reveal, after being oriented by the dot (D10).
- **Special plus mark:** allowed. Nothing bans a special room from also having a dot (D29); your data decides. The order the engine applies them in is plan 13 #13.
- Total copies must be exactly 88 for the full game.

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'TILE_001', copies: 12, status: 'draft', name: 'Example crossing',
    sides: { N: 'open', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_002', copies: 3, status: 'draft', name: 'Example dark bend',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'blue', special: 'none', effects: [], art: null },
];
```

### Heroes

`heroes.js`, 8 heroes, ids `HERO_1` to `HERO_8`, `copies: 1` each.

| Field | Allowed values | Meaning |
|---|---|---|
| `class` | text | Your own class word. |
| `stats` | `{ STR, AGI, ARM, LCK }`, each a whole number 1 to 12 | Strength, agility, armour, luck. A stat test passes when a D12 (plus any modifier) is at or under the stat. |
| `hp` | whole number, 1 or more | Starting hit points (also the healing cap, D04). |
| `equipment` | list of text | What they carry, as words. |
| `combatSetId` | `'S01'` to `'S08'` | The hero's own A/B/C combat set in `combat.js`. It must exist and be a hero set. |
| `specialWeaponId` | `null`, `'XBOW_1'` or `'XBOW_2'` | The special weapon card this hero may use, if any. It must exist in `special-weapons.js`. |

A dead hero's identity, combat and ring cards never become loot (D28). Heroes are original characters: don't reuse the published set's characters or stat lines.

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'HERO_1', copies: 1, status: 'draft', name: 'Example lamplighter', text: 'Example wording: never without a light.',
    class: 'lamplighter', stats: { STR: 4, AGI: 7, ARM: 5, LCK: 6 }, hp: 12,
    equipment: ['lantern', 'rope'], combatSetId: 'S01', specialWeaponId: null, art: null },
];
```

### Combat cards

`combat.js`, 36 cards in 12 sets of three, ids `COMBAT_S01_A` to `COMBAT_S12_C`. The id says the set and the letter.

| Field | Allowed values | Meaning |
|---|---|---|
| `setId` | `'S01'` to `'S12'` | The set. `S01` to `S08` are hero sets (one per hero), `S09` to `S12` monster groups (D24, provisional). |
| `owner` | `'hero'` or `'monster-group'` | `'hero'` for S01 to S08, `'monster-group'` for S09 to S12. |
| `letter` | `'A' \| 'B' \| 'C'` | Each set has exactly one A, one B and one C. |
| `doubleAgainst` | `[]`, or the one letter this card beats | This card hits twice when it wins against that letter. |

**Matchups (RB 8.4):** A beats B, B beats C, C beats A. The winner deals 1 damage, or 2 if its card lists the losing letter in `doubleAgainst`. So an A card may only list `['B']`, a B card only `['C']`, a C card only `['A']`. The same letter on both sides is a tie: 1 damage each, always, even if a card lists a double (D13). Hero and monster can both reach 0 in one exchange; then both die (D14). Solo play uses the target with results entered by hand; A/B/C against a computer pick is a labelled digital variant (D17).

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'COMBAT_S01_A', copies: 1, status: 'draft', setId: 'S01', owner: 'hero', letter: 'A', doubleAgainst: ['B'], art: null },
  { id: 'COMBAT_S01_B', copies: 1, status: 'draft', setId: 'S01', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S01_C', copies: 1, status: 'draft', setId: 'S01', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
  { id: 'COMBAT_S09_A', copies: 1, status: 'draft', setId: 'S09', owner: 'monster-group', letter: 'A', doubleAgainst: [], art: null },
  { id: 'COMBAT_S09_B', copies: 1, status: 'draft', setId: 'S09', owner: 'monster-group', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S09_C', copies: 1, status: 'draft', setId: 'S09', owner: 'monster-group', letter: 'C', doubleAgainst: ['A'], art: null },
];
```

### Ring cards

`rings.js`, 4 rings, ids `RING_1` to `RING_4`, all different.

| Field | Allowed values | Meaning |
|---|---|---|
| `power` | text | Your own words for the ring's power, shown during the draft (your `text`, if set, is shown instead). |
| `trigger` | `'passive' \| 'once-per-game' \| 'on-test' \| 'on-encounter'` | When the power applies. |
| `effects` | list of steps | The power as steps (stored, not run yet: see section 10). |

Rings are drafted in reverse seat order at setup (RB 4) and are never loot (D28).

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'RING_1', copies: 1, status: 'draft', name: 'Example ring of small mercies',
    power: 'Example wording: once per game, heal 2.', trigger: 'once-per-game', effects: [{ op: 'HEAL', amount: 2 }] },
];
```

### Special weapon cards

`special-weapons.js`, 2 cards, ids `XBOW_1` and `XBOW_2`.

| Field | Allowed values | Meaning |
|---|---|---|
| `heroIds` | list of hero ids | The heroes who may use it. They must exist in `heroes.js`. |
| `effects` | list of steps | What happens when the hero declares the special weapon at a monster. |
| `uses` | `null` or a whole number | `null` for no limit, otherwise uses per game. |

Declaring the special weapon is answered by the monster's **attack** reaction (RB 8.1). It is not offered during an ambush (plan 13 #12).

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'XBOW_1', copies: 1, status: 'draft', name: 'Example sling', heroIds: ['HERO_1'],
    effects: [{ op: 'DEAL_DAMAGE', target: 'monster', amount: { die: 'D6', plus: -3 } }], uses: 2, art: null },
];
```

### Room cards

`room.js`, 60 cards, ids `ROOM_001` to `ROOM_060`. A room card is drawn on entering a black or red dot room.

| Field | Allowed values | Meaning |
|---|---|---|
| `deck` | `'ROOM'` | Always `'ROOM'` in this file. |
| `kind` | `'empty' \| 'treasure' \| 'item' \| 'monster' \| 'trap' \| 'branch'` | What sort of card it is. It labels the card; what happens comes from the fields below. |
| `gold` | whole number, 0 or more | Coins it is worth if the hero keeps it. |
| `effects` | list of steps | What happens, in order. |
| `followUpDeck` | `null`, `'SEARCH'`, `'CHEST'`, `'DOOR'`, `'MONSTER'` | After this card, draw from that deck ([branch draws](#branch-draws-name-a-subdeck)). |
| `turnDisposition` | `'end-turn'` (usual), `'continue'`, `'ongoing'` | `'continue'` lets the hero keep moving afterwards. |
| `cardDisposition` | `'UNDER_SAME_DECK'` (usual), `'RETAIN_HELD'`, `'RETAIN_TREASURY'`, `'REMOVE'`, `'RESHUFFLE_DECK'` | Where the card goes afterwards ([card disposition](#card-disposition)). |
| `privacy` | `'public'` (usual), `'private-to-holder'` | Whether other players see it when kept. Kept room loot and its gold are public (D25). |
| `specialWeapon` | `true` / `false` | Marks an item as a special weapon. It can be chosen before a monster is revealed only if `use` says how (otherwise the app shows its effect as pending). |
| `use` | optional `{ timing, effects, afterUse, uses }` | How a kept card can be used ([using kept cards](#using-kept-cards)). Leave it out and the card has no Use action. |

After a monster flees or the hero flees, the rest of the room card is skipped; after a won fight the rest still runs (plan 13 #16), so a card can say "defeat it, then keep this".

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'ROOM_001', copies: 6, status: 'draft', name: 'Example quiet cellar', text: 'Example wording: cold stone and nothing more.',
    deck: 'ROOM', kind: 'empty', gold: 0, effects: [], followUpDeck: null,
    turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false },
  { id: 'ROOM_002', copies: 1, status: 'draft', name: 'Example loose flagstone',
    deck: 'ROOM', kind: 'trap', gold: 0,
    effects: [{ op: 'CHECK_STAT', stat: 'AGI', modifier: 0, onPass: [], onFail: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -2 } }] }],
    followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false },
  { id: 'ROOM_003', copies: 2, status: 'draft', name: 'Example locked coffer',
    deck: 'ROOM', kind: 'branch', gold: 0, effects: [], followUpDeck: 'CHEST',
    turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false },
];
```

### Search, room-search, chest and treasury cards

These four decks share the card fields of room cards above, with their own `deck` value and a wider list of kinds:

| File | `deck` | Count | Ids | Drawn when |
|---|---|---:|---|---|
| `search.js` | `'SEARCH'` | 15 | `SEARCH_001`..`SEARCH_015` | A card branches to it. |
| `room-search.js` | `'ROOM_SEARCH'` | 14 | `RSEARCH_001`..`RSEARCH_014` | A hero searches a black or red room (RB 7.1); searching can repeat. |
| `chest.js` | `'CHEST'` | 14 | `CHEST_001`..`CHEST_014` | A card branches to it. |
| `treasury.js` | `'TREASURY'` | 33 | `TREASURY_001`..`TREASURY_033` | Two per turn in the treasure chamber (RB 9.1). |

`kind`: `'treasure' \| 'item' \| 'trap' \| 'secret-door' \| 'empty' \| 'branch' \| 'reshuffle'`.

- **Secret doors** (room search): `kind: 'secret-door'` with `OPEN_TEMPORARY_PASSAGE`. They may cross printed walls; use and timing follow your card (D11, provisional; plan 13 #4 and #15).
- **Reshuffle cards:** `kind: 'reshuffle'` with `cardDisposition: 'RESHUFFLE_DECK'`: the card goes back and its deck is shuffled.
- **Treasury cards** are private: `privacy: 'private-to-holder'` and `cardDisposition: 'RETAIN_TREASURY'`. Their gold counts at the end only if the hero escapes. When the dragon wakes they go to the bottom of the treasury deck (RB 9.2). Effects printed on treasury cards are not run at collection yet (section 10).

**Example only, not real content, not authentic:**

```js
// room-search.js
export default [
  { id: 'RSEARCH_001', copies: 2, status: 'draft', name: 'Example draught behind the panel',
    deck: 'ROOM_SEARCH', kind: 'secret-door', gold: 0, effects: [{ op: 'OPEN_TEMPORARY_PASSAGE', side: 'any-orthogonal' }],
    followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false },
];
// treasury.js
export default [
  { id: 'TREASURY_001', copies: 10, status: 'draft', name: 'Example purse',
    deck: 'TREASURY', kind: 'treasure', gold: 10, effects: [], followUpDeck: null,
    turnDisposition: 'end-turn', cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder', specialWeapon: false },
];
```

### Door cards

`door.js`, 15 cards, ids `DOOR_001` to `DOOR_015`, `deck: 'DOOR'`. Same fields as room cards. A door card is drawn whenever a hero tries a door (RB 6.6).

`kind` decides the door here: `'opens'` (the hero goes through into the next square), `'closed'` (it stays shut; the hero may use another free passage this turn), `'trap'` (the card's `effects` run and the turn ends). The door locks again behind the hero. A door that stays closed during a forced move ends the turn (plan 13 #14).

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'DOOR_001', copies: 7, status: 'draft', name: 'Example swinging door', deck: 'DOOR', kind: 'opens', gold: 0, effects: [],
    followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false },
  { id: 'DOOR_002', copies: 2, status: 'draft', name: 'Example needle lock', deck: 'DOOR', kind: 'trap', gold: 0,
    effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }],
    followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false },
];
```

### Monster cards

`monster.js`, 15 cards, ids `MONSTER_001` to `MONSTER_015`, `deck: 'MONSTER'`.

| Field | Allowed values | Meaning |
|---|---|---|
| `hp` | whole number, 1 or more | The monster's hit points (hidden from the other players). |
| `groupId` | `'S09'` to `'S12'` | The monster-group combat set it fights with. It must exist in `combat.js` with `owner: 'monster-group'`. |
| `reactions` | `{ attack, wait, flee }` | The reaction table: what the monster does for each hero choice ([how it maps](#monster-reaction-tables)). All three are required, and nothing else. |

Each reaction is `{ type, damage, effects }`:

| `type` | Means | Allowed under |
|---|---|---|
| `'combat'` | It fights: A/B/C combat starts. | attack, wait, flee |
| `'monster-flees'` | It runs off; the encounter ends and the turn ends. | attack, wait, flee |
| `'strike-then-combat'` | It strikes for `damage`, then fights. | attack, wait, flee |
| `'strike-then-flight'` | It strikes for `damage`, then the hero gets away. | flee only |
| `'flight-succeeds'` | The hero gets away unharmed. | flee only |
| `'other'` | Only the reaction's own `effects` run, then the encounter ends. | attack, wait, flee |

`damage` is a number or dice ([section 5](#dice-and-numbers)) for the two strike types, otherwise `null`. `effects` are extra steps that run before the reaction.

The hero commits before the card is revealed; the seated player to the right controls the monster, even if that player is dead or escaped, and in solo the hero reveals it (D12). Fleeing goes back to the previous tile with no room card, and that tile's effects apply again (D16); it is not offered through a red-room gate that fell behind the hero (D15).

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'MONSTER_001', copies: 2, status: 'draft', name: 'Example cellar rat swarm', text: 'Example wording: a hundred small teeth.',
    deck: 'MONSTER', hp: 3, groupId: 'S09',
    reactions: {
      attack: { type: 'combat', damage: null, effects: [] },
      wait: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, effects: [] },
      flee: { type: 'strike-then-flight', damage: 1, effects: [] },
    },
    art: null },
];
```

### Dragon cards

`dragon.js`, 8 cards, ids `DRAGON_1` to `DRAGON_8`.

| Field | Allowed values | Meaning |
|---|---|---|
| `kind` | `'sleeping'` or `'awake'` | All copies together must be 7 sleeping and 1 awake (RB 9, SP 8). This structure is the rule; names and art are yours. |

One dragon card is drawn per chamber turn without replacement, shared by all heroes, so the odds climb from 1 in 8 (RB 9.3). When the awake card comes up, every hero in the chamber loses their treasury cards, takes a full D12 of damage and is driven to an already revealed maze tile next to the chamber square, never a new one (D19); the deck resets when the chamber empties (D22).

**Example only, not real content, not authentic:**

```js
export default [
  { id: 'DRAGON_1', copies: 7, status: 'draft', name: 'Example dragon, dozing', kind: 'sleeping', art: null },
  { id: 'DRAGON_2', copies: 1, status: 'draft', name: 'Example dragon, one eye open', kind: 'awake', art: null },
];
```

## 7. How the engine reads your content

### Tile entry dot and orientation

You describe each tile once, in a reference position: `sides` as drawn, with the entry dot on `entrySide`. When a hero steps onto an unexplored square, the engine draws a tile from the bag and turns it so the entry dot faces the side the hero came from (RB 5). So a tile with `entrySide: 'S'` entered by a hero moving north (coming from the south) is placed as written; the same tile entered by a hero moving east is turned a quarter turn so its dot faces west. A revealed tile keeps its position, except a rotating room, which turns 90 degrees on every entry.

A passage between two squares is free only when both facing sides are open (RB 6.1): a wall on either side wins, then a gate, then a door.

### Copies versus unique entries

An entry describes one face. `copies` says how many identical copies of that face exist. Ten identical empty rooms are one entry with `copies: 10` and one id, not ten entries. The counts in this guide (60 room cards, 88 tiles) are totals of `copies`. You use as many ids as you have different faces; unused ids simply stay free. The checker's "Room cards 12/60" counts copies, and "copies total 91, expected 88" means the copies add up to more than exist.

Heroes, rings, combat cards, the board and the chamber are unique: `copies: 1`.

### Monster reaction tables

When a monster appears, the hero first picks Attack, Wait, Flee or Special (special weapon), in secret. Then the monster card is revealed and its controller announces the matching reaction:

| Hero chose | The engine reads |
|---|---|
| Attack | `reactions.attack` |
| Wait | `reactions.wait` (not offered in an ambush) |
| Flee | `reactions.flee` |
| Special (special weapon) | `reactions.attack`, after the weapon's effects (RB 8.1) |

That is why the table has no `special` key.

### Branch draws name a subdeck

A card with `followUpDeck` hands over to another deck once it is done: `'SEARCH'`, `'CHEST'` or `'DOOR'` draws and plays the top card of that deck, and `'MONSTER'` starts a monster encounter (RB 7.3). Inside `effects`, `DRAW_CARD` does the same mid-card and lets you choose `then: 'keep'` to put the drawn card in the hero's hand instead of playing it.

### Using kept cards

A kept card (in the hero's hand or treasury) gets a Use action only when its entry has a `use` block; the app never invents one (owner specification v3). The fields:

| Field | Allowed values | Meaning |
|---|---|---|
| `timing` | `'turn-action'`, `'encounter-special'` | `'turn-action'`: used as the hero's action at the start of their turn; the turn then ends unless the effects say `CONTINUE_MOVEMENT`. `'encounter-special'`: chosen as a special weapon before a monster is revealed (not in an ambush), so the monster answers with its Attack reaction (RB 8.1); needs `specialWeapon: true`. |
| `effects` | list of steps | What using it does, in order. |
| `afterUse` | `'keep'` (usual), `'bottom'`, `'remove'` | Where the card goes after a use: stays in hand, under its own deck, or out of the game. |
| `uses` | whole number 1 or more, or `null` | How many times it can be used while kept; `null` means no limit. |

**Example only, not real content, not authentic:** `use: { timing: 'turn-action', effects: [{ op: 'HEAL', amount: 2 }], afterUse: 'bottom', uses: 1 }`.

### Card disposition

After a card has done its work, `cardDisposition` decides where it goes:

| Value | What happens |
|---|---|
| `'UNDER_SAME_DECK'` | Back under its own deck (the usual ending, RB 7.4). |
| `'RETAIN_HELD'` | The hero keeps it in hand; its gold counts. Public (D25). |
| `'RETAIN_TREASURY'` | The hero keeps it in their private treasury. |
| `'REMOVE'` | It leaves the game. |
| `'RESHUFFLE_DECK'` | Back to its deck, which is then shuffled. |

If the turn ends early, the hero dies or the hero flees, the card goes under its deck regardless, and anything it would have led to doesn't happen. A dead hero's kept cards go back under their own decks (D28).

## 8. The workflow

1. **Write as draft.** Add entries with `status: 'draft'` (or run `node tools/keep-content.js new room`). Work deck by deck; there is no need to finish one before starting another.
2. **Run the checker.** From the repo folder: `node tools/keep-content.js check`. It lists every slot with its count and every problem by id.
3. **Fix** what it reports and check again until it says "No errors."
4. **Play-test** your drafts (below). Try the cards in play, read your `text` on screen, adjust.
5. **Mark approved.** When an entry is final, change it to `status: 'approved'`.
6. **Full game.** When every slot is filled, approved and error-free, the title screen's Start button unlocks.

### Three ways to play

| Button | Plays | Needs |
|---|---|---|
| **Start game** | Your content only: the real game. | Every slot filled, 100% approved, no errors. Until then it stays off and says why. |
| **Play-test my content** | Play-test: your content plus NON-AUTHENTIC fill-in. Every one of your entries, draft and approved, plus the made-up fixture data for each slot you have not completed. | At least one entry, and no checker errors. |
| **Test with fixtures** | Only the made-up fixture data. | Nothing. For checking the engine itself. |

In a play-test, a slot you have completed (all its copies written) plays with your entries alone. A slot you have not completed gets your entries plus the whole fixture deck, so decks are larger than the real count and the odds are not the real game's. The dragon deck is the exception: until all 8 of yours are written, the play-test uses the fixture dragon deck alone, so there is always exactly one awake card. If you have no board or chamber yet, the fixture ones are used. Fixture heroes and monsters bring their own fixture combat sets. Every screen of a play-test carries the banner "Play-test: your content plus NON-AUTHENTIC fill-in", and so does its save title.

A play-test or a saved game opens only with the content it was made with. After you change your files, start a new play-test; older play-test saves will say they can't be opened.

After you edit a file, reload the game page. If the page seems not to change, your browser may be holding the old file: do a hard reload.

## 9. The checker

Run from the repo folder (needs Node, nothing else):

| Command | What it does |
|---|---|
| `node tools/keep-content.js check` | Every slot as "Room cards 12/60 (9 approved, 3 draft)", each error under its slot by id, then a summary. Exits with an error code if anything is wrong. |
| `node tools/keep-content.js report` | The same content status the title screen shows: categories verified, every slot, whether Start and Play-test are on. |
| `node tools/keep-content.js new <slot>` | Adds a blank draft entry with the next free id, copied from the file's skeleton. `<slot>` is the file name without `.js`: `room`, `tiles`, `room-search`, `special-weapons`, and so on. For `board` and `chamber` it fills the single entry. |

Typical messages and what to do:

| Message | Meaning |
|---|---|
| `ROOM_017: followUpDeck TREASURY not one of SEARCH/CHEST/DOOR/MONSTER` | A value outside the allowed list. |
| `MONSTER_003: reaction flee missing` | The reaction table needs attack, wait and flee. |
| `TILE_034: entrySide is a door: PENDING owner ruling on door/gate entry sides (plan 13 #8)` | See [Maze tiles](#maze-tiles). |
| `Maze tiles: copies total 91, expected 88` | The copies add up to more than exist. |
| `ROOM_999: id ROOM_999 is not one of ROOM_001..ROOM_060` | Use the slot's own ids. |
| `S01: a combat set needs exactly one A, one B and one C` | Finish the set. |
| `ROOM_004: status aproved must be "draft" or "approved"` | A typo in the status. |
| `Could not read the content: door.js: Unexpected token ...` followed by a line | A notation slip (a missing comma, quote or bracket) on the line shown. |

Approved entries with errors don't count as verified. The checker uses the same validation as the game, so if it says "No errors", the game agrees.

## 10. Stored now, used later

These fields are checked and saved, but the engine does not act on them yet. Fill them in anyway; they are ready for when it does:

- tile `effects` (dot and special behaviour come from the rules, not data);
- ring `trigger` and `effects` (rings are drafted and shown by their `power` or `text`);
- hero `equipment` (shown in the hero's inventory, effect pending);
- effects printed on treasury cards, which are kept as drawn (plan section 13, M2 shortcuts);
- `turnDisposition: 'ongoing'` (use `SET_CONDITION` for lasting effects);
- `art` everywhere.
