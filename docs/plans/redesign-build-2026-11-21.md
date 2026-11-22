# Redesign build, 2026-11-20 to 21 (overnight)

The approved design canvas ("Start screen redesign", private Claude artifact WBAZsXc9BgrwvdTb3pyBh2) built into `site/keep`
on `keep-engine`. Visual and flow changes only: no rule, die, card, deck, turn order, save key or saved-game format was
changed. Nothing is committed, pushed, merged or deployed.

## What changed

Files: `site/keep/index.html`, `site/keep/ui/app.js`. The owner's own uncommitted title edits in the same two files
(and in `site/index.html`, the tools and `HANDOFF.md`) are untouched and still uncommitted alongside.

- **Start screen** (canvas "Proposal: Red dusk"): the keep scene at dusk, the title in MedievalSharp, a collapsible
  Saved games section, Play-test as the brass main button, Start game shown only once every category is approved (the
  real reason line shows until then), How to play / Settings / Builder tools links. Builder tools holds Test with
  fixtures, the play-test note, the app label and the content status. Side-by-side layout on desktop and phone
  landscape.
- **Player names** (canvas "Player names"): a step of its own after choosing how to play; 1 to 4 tokens, wax-seal
  numbered name fields, Back, a Play-test or Test data tag, Continue. Not saved: a reload starts on the start screen.
- **Solo combat** moved into Settings (agreed design point), with "Applies to new games".
- **Who goes first** (canvas): the game's own 3D dice on parchment, gold result face, the per-player roll line removed
  from the screen (readers still hear every roll), tie note, order of play as chips, Pick heroes.
- **Hero picker** (canvas "Pick your hero"): the chosen hero's card (emblem portrait until art exists, HP, the four
  stats with 12-notch bars, equipment, special weapon), the eight heroes as a two-column list, taken heroes dashed,
  then Choose. Pick then confirm (the old screen picked on tap).
- **Ring picker** (canvas): the game's ring text split into when and what, gem colour per ring, pick then Take.
- **Starting tower** (canvas): the real board in a brass frame, four tower buttons (who starts where), pick then Start.
  Tapping a tower on the board selects it.
- **In-game skin** (canvas Game board, Event card, Combat, Items, Settings): the shared colour and font tokens set to
  the canvas palette in a second `<style id="keep-skin">`, so every existing screen follows: stone board with ink
  walls and gold move squares, crimson banner, gold sun track, parchment sheets and result cards with a brass Continue,
  parchment A/B/C combat cards, Attack red / Wait gold / Flee stone, bone dice with a gold face. Layout, the dock and
  the landscape grid are unchanged, so spec v12's dock order and the landscape budget tests still hold.
- **Results** (canvas "Results"): the keep scene over the outcome (darker and redder when the keep wins), a gold
  MedievalSharp title, winners on gold plates, the dead dashed, those inside at sunset in crimson.
- **Lair tile on the board** (`site/keep/ui/board.js`, 5 lines): the new green and red sleeping dragon on its hoard
  (canvas "Dragon art, draft", tile version) drawn inside the chamber, decoration only; the room's name reads over it
  in pale gold, and the chest still marks a placed chamber.
- **The owner's own art** (2026-11-21), in `site/keep/art/` (784 KB, new): the Set A heroes cut along their sticker
  outlines (`heroes/hero_1.webp` … `hero_8.webp`, the owner's mapping) and the two dragon scene drafts as drawn
  (`dragon-awake.webp`, `dragon-asleep.webp`). Heroes show on the hero picker (card portrait and list faces) and stand
  on the board as figures on their numbered seal. A figure's pose comes from what the last action logged: walk (move),
  flee (flight), jump (well or rubble test), hurt (damage), fight (an encounter in progress, after any of those), lying
  down (dead); reduced motion turns the animation off. The awake scene heads the wake and dragon fire cards, the asleep
  scene the lair card when the dragon sleeps. Test data shows none of it. Display only: nothing in the engine changed.
  The figures sit on their own top layer of the board (no wall, mark or fog line crosses them) and ignore taps, so a
  tap on a figure reaches the square underneath. Off their turn a figure fits inside its square; the active hero
  stands taller. A Figures button beside zoom switches all figures between full size and small (kept per device).
- Line endings: `app.js` and `board.js` are LF as committed (`.gitattributes`: `* -text`).

## Checked

- `node --test "tests/keep/*.test.js"`: 391 passed, 0 failed, after every screen.
- `node tools/keep-content.js check`: No errors.
- Browser, `http://127.0.0.1:8766/keep/`: start screen (phone, phone landscape, desktop), player names (phone,
  desktop), a three-player setup through Who goes first (a real tie and reroll), heroes, rings and towers, the board,
  a room card, the ambush scenario (roll card, encounter choices), Settings mid-game, and the co-winners results
  scenario; the desktop board after a two-player test-data setup.

## Not checked

A real iPhone, a screen reader, every scenario at every size, Start game with approved content, the saves list with
real saves in it, signed-in saves on the deployed site.

## Open for the owner

- Fonts load from Google Fonts. Self-hosting them (all three are open licences) needs the font files downloaded.
- The new look is dark in both themes; the Appearance switch in Settings now changes little. Decide: drop it, or ask
  for a parchment-light version.
- Art drafts on the canvas (row "Art drafts"): "Dragon art, draft" (lair scene asleep and awake, and the board tile,
  now in the game) and "Hero portraits, draft" (three original options per hero, 24 in all). Pick one per hero; the
  portrait then goes in that hero's `art` field and replaces the emblem on the hero picker. The standalone SVGs and the
  scripts that generated them are in the session's scratch folder (`art/`, `art-src/`), not in the repo yet. Known weak
  spots: the faces share one construction, hoods are simple, Talia option B's club reads like a plank, the dragon's
  thigh is round.
- The "What just happened" panel is now hidden on a phone held upright (owner, 2026-11-21: the event log lives in the
  menu); it still shows on desktop and phone landscape. Spec v12's dock order rules are unchanged.
- Board (2026-11-21, owner: "match the artifact more faithfully"): stone-brick floors, heavier ink walls, gold dashed
  move squares that pulse (steady under reduced motion), torchlight round the active hero, round stone map buttons,
  the sun row without a box, the hero bar's HP in crimson and gold in gold. Drawing only.
- Cards and combat (2026-11-21, canvas "Event card" and "Combat"): a result card from a deck shows the deck as a label,
  the kind as a tag (Trap, Treasure, Item, Monster, Room), a picture of the kind, the gold on a plate, and its edge in
  the kind's colour (treasure glows gold, a monster card is dark stone). The kind is read from the card's own result
  lines (`cardKind` in `ui/app.js`); a card with none of those keeps the plain face. The fight panel opens with a
  monster banner (a shape in the dark, the public monster name, "Its HP is secret" unless the engine shows it), the
  hero's HP in crimson, and the reveal flips two cards (the hero's parchment, the monster's dark). Picking a card still
  plays it at once (the canvas showed a separate Play button: not adopted, it would change the flow).
- Lair and items (2026-11-21, canvas "Dragon's Lair" and "Items"): the lair prompt opens on the owner's dragon scene
  (asleep, or awake while it stays awake) with the chamber's name and the wake odds; test data shows none of it. The
  items sheet has a pack icon, the gold carried on a gold plate (the listed treasure's gold), coloured group headings,
  each item as a card (a usable one ringed in green), starting equipment as name pills, a spent ring dashed and struck,
  and the treasure as a ledger. Lines hidden by the design (equipment notes, "not usable" on treasure) stay for screen
  readers.
- Lair tile on the board (2026-11-21, owner): the owner's own dragon scene replaces the drawn draft, asleep, or awake
  while the dragon is awake (`lairArt` passed to `mountBoard`); test data keeps the draft drawing.
- Move panel (2026-11-21, canvas "Game board"): Search the room, Stop here (or Stop in the tower, No way on) and Items
  are small dark buttons two across under the buttons that need words (rings, items, collect, escape, jumps); their
  longer lines stay for screen readers, and Items still shows "1 usable" when something can be used. The map buttons
  are round icon buttons at every size, desktop included (they were text there).
- Settings and results (2026-11-21, canvas "Settings" and "Results"): Settings has a ruled title row, section names in
  the display face, Rules in play and the debug log (under Builder tools) folded away, and a brass Done. Results rows
  show the seat's seal, the player and hero, what became of them and the gold large on the right; the title and its
  line are centred over the keep; See the event log is an outlined button.
- Setup wizard (2026-11-21, owner): a five-step progress bar replaces "Setting up · n of 5", and every step has Back.
  Back takes back the last pick where the undo rules allow it (it replaces the separate undo buttons on setup); with no
  pick to take back, the hero step goes back to the first-player result, and that (or the roll) back to the player
  names, which starts the setup over with the same names. Continue and the brass buttons are Next.
- Starting tower (owner: "I like the artifact one better", then "the towers seem offset"): its own map, built to the
  canvas, in place of the game board: a cream frame round a plain 32px grid, the four towers as buttons in the corners,
  walled on their outer sides, a gold beacon until picked and gold when picked, a red seal per player starting there,
  and the lair tile with the owner's sleeping dragon. The map is for the pointer; the tower buttons below stay the
  keyboard and screen reader way. Setup titles are 26px and the gold Next buttons carry the canvas's arrow.
- Drawers (owner: "all drawer screens should be pulldown/swipe awayable"): on a phone held upright every sheet is a
  full-width bottom sheet with a grab bar, and a swipe down from the top of its content closes it. A swipe does what Esc
  does, so each sheet's own handling decides: a result card ignores it until its dice land, then it acts as Continue.
- The Dragon's Lair prompt stays as built (owner: better than the canvas).
- The owner's creature drawings (2026-11-21, "Enemy Redesigns, Option Set A"), in `site/keep/art/monsters/` (about
  390 KB): the four fight monsters by type (`s09` dark elf, `s10` mountain troll, `s11` skeleton, `s12` orc) and the
  giant spider, vampire bats and fallen warrior cards. Cropped as rectangles from inside each drawing (the pale ones
  share the parchment's colour, so no cut-out), without the sheet's name labels; the game keeps its own names. They head
  the fight panel's monster banner and the creature's result card (Bones uses the skeleton), matched by the card's or
  fight's public name (`CREATURE_ART` in `ui/app.js`), each with its own focus point. Test data shows none of them.
  Display only. The crop script is `cut_monsters.py` in the session scratch folder.
  Owner, same day: "use the whole image for each character". Nothing is cropped further: on a card the drawing runs
  the card's width at its own shape (drawers on an upright phone may now reach 12px from the top, and scroll), in a
  fight it stands whole at the banner's right with the name at the left, and in phone landscape a picture card goes
  side by side, the drawing on the left at the drawer's height.
- Press to roll (owner, 2026-11-20: "Let the user press a button to roll the dice. Then have it say # - 4 (Agility) =
  #"): a result card with dice shows them unrolled with "Roll the D12" (or D6, or "the dice") in place of Continue;
  pressed, they tumble to what the engine already rolled and a sum line shows in large type ("10 − 7 (Luck) = 3
  damage"), read from the card's own dice line. A card right after a press of Roll elsewhere (the roll card for a
  test, the giant spider's number picker) tumbles at once instead of asking twice. Esc and a swipe do nothing until the
  dice land. Display only: no roll moved or changed.
- Hero bar for every game (2026-11-22, canvas "Game board"): under the status bar, the solo hero or, with 2 to 4
  players, whoever's turn it is: their seal, name (with the player's name in a shared game), gold, HP bar, the four
  stats, and an Items button for that hero. The same public facts as the Heroes panel (D25). Map buttons on phones are
  the design's 40px, and on a map too short for all five they wrap into a second column instead of being cut off.
- Heroes panel and map key (2026-11-22): each hero a stone card with the owner's portrait in a circle and a red seal
  (gold-ringed, with a gold edge on the card, for the hero whose turn it is), stats as chips, crimson HP, muted detail
  lines, dark buttons. The map key and other folds on the table open with the Settings chevron, the key in two columns.
- Smaller sheets (2026-11-22): secondary buttons in every drawer are outlined (Close, Keep playing, Back); the event log
  shows each turn as a headed group (player and hero, round on the right); a square's sides are chips in two columns;
  How to play has gold bullets and Builder tools an outlined button. Swipe-away fix: a drag inside a list that has
  scrolled (the event log) scrolls it; only from the top does a swipe close the drawer.
- Rare moments (2026-11-22): the wake and dragon fire cards glow red and show the damage in large type; the fight-end
  card is a bottom drawer like the others; the pass-the-phone cover is the design's hand-off screen (a card back with
  gold borders, the name large, a gold button); the number picker (torch, spider, ceiling) has stone buttons that turn
  gold when picked, with plain numerals; an empty card's tag reads "Empty". The tower choice, sunset and results
  already matched and were left.
- The original solo fight, the target throw (2026-11-22): a shorter monster banner, the six landing places and three
  faces as compact buttons three across that turn gold when picked, so they fit the phone's dock; the Items and
  History buttons under a fight are dark like the others. The crossbow shot already uses the Roll button.
- Wide desktop (2026-11-22, canvas "Game board, desktop"): at 1100px wide and up, three columns: the Heroes panel on the
  left (it stands in for the hero bar there), the board in the middle, sized so the whole board fits the window's
  height, and the prompt with what just happened on the right. The page may now be up to 1480px wide in a game.
  Narrower screens keep the two-column layout; phones are unchanged.
- Event log only in the menu (owner, 2026-11-22: "all event logs in an event log button in the hamburger menu"): the
  "What just happened" panel is gone at every size (it was already hidden on an upright phone); the menu's Event log
  button opens the whole log. The results screen keeps its "See the event log" shortcut to the same sheet. Spec v12's
  dock-order CSS for #latest stays and simply matches nothing.
- Creature drawings checked in play (2026-11-22): dark elf, orc, mountain troll, vampire bats and fallen warrior each
  drawn from a test game (the card put on top of the room deck in a copy of a scenario save). All show whole and
  matched to the right card; the troll and fallen warrior crops were trimmed of a sliver of the sheet's border and the
  bat's wing.
- Results scene (2026-11-22, canvas "Results"): the keep at nightfall in place of the start screen's keep at dusk, with
  the title and its line up in the sky. Someone escaped: a night sky with stars, a gold glow and a small figure carrying
  gold away. The keep wins: a blood-red sky and two lit red windows. A shared win's longer title is set smaller.
- Items sheet details (2026-11-22, canvas "Items"): the groups in the design's order (useful items, ring, equipment,
  treasure, the chamber's cards), the ring's own picture (its gem as on the ring picker), uses left as a green corner
  tag (outlined when none are left), a coin on the gold plate, a gold Close; a special weapon with rules text (the
  hunters' crossbow) shows as a card among the equipment pills.
