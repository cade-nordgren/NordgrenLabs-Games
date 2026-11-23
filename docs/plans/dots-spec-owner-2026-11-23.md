# Dots and Boxes: owner spec, 2026-11-23

The owner's specification, recorded as given (lightly condensed only in formatting), plus the rulings made in the session.

## Owner rulings in session (2026-11-23)

- **Online play: local first, online later.** Games has no room or live-sync infrastructure (the Worker only stores saves). Build the full local two-player game now. Keep the engine a pure serialisable reducer so online rooms can replay and validate the same actions on the server later; online rooms are a separate follow-up with its own plan. Do not build any online UI that does nothing; the menu and setup must not offer online yet.
- **Move the line until Next Turn (owner, 2026-11-23):** "Let the active user click to move their line until Next Turn is done. Keep the dotted options while the user is choosing." This replaces the lock in 5.2 and 5.8: after a line, tapping another open line moves it there (boxes and score follow the new line), the dotted guides stay, and Next Turn confirms. The last line of the game still goes straight to the results.
- Dots and Boxes is a folk game (public domain rules), like Bank. Name "Dots and Boxes" is the generic name.

## Implementation constraints from the repo (docs/BUILD-GUIDE.md wins where it conflicts)

- Static, vanilla JS, no build, no dependencies. Module layout like Crossix: `site/dots/engine/*.js`, `site/dots/ui/*.js`, tests in `tests/dots/*.test.js` run with `node --test "tests/dots/*.test.js"`.
- Shared code only in `site/style.css` and `site/platform.js`. "Reuse the Crossix component" means copy and adapt its code and CSS into `site/dots/` (do not import across game folders, do not add a third shared file).
- Storage keys: autosave `nl-dots-v1` (carries `owner: NL.person()`), settings `nl-dots-settings`, saved custom layouts `nl-dots-layouts`, remembered player identities in settings. Saves via `NL.saves` with game `"dots"`.
- Own `manifest.webmanifest` and `sw.js` (scope `/dots/`, cache name `dots-vN`) for offline play, copied from Crossix's pattern.
- Never alert/confirm/prompt; sheets only. User text via textContent.

---

## Owner spec (verbatim)

Build a complete, polished, two-player version of **Dots and Boxes** for NordgrenLabs.

Reference for traditional rules: https://en.wikipedia.org/wiki/Dots_and_boxes

This must feel like it belongs in the exact same game collection as **Bank** and **Crossix**.

**Important: Before writing code, inspect the existing Bank and Crossix implementations.** Reuse their existing architecture, navigation, hamburger menu, screens, styling, multiplayer conventions, shared components, buttons, dialogs, results animations, and visual patterns wherever possible.

Do not create an unrelated standalone interface or reinvent components we already have.

I want this implementation to be as complete as possible in one development pass. Treat everything below as functional requirements, not just design suggestions.

### 1. Core game identity

**Name:** Dots and Boxes. **Players:** Exactly two human players. **Objective:** Claim more boxes than your opponent by drawing lines between adjacent dots and completing enclosed shapes.

Easy to understand immediately, significant strategic depth through different board sizes, shapes, and layouts.

Must support: two-player local play on one device; two-player online play on separate devices (DEFERRED, see rulings); iPhone, Android, tablet, desktop; portrait and landscape; light and dark; offline local games; custom player usernames, initials, and colors; many predefined board sizes and shapes; a D6 starting-player roll; optional hidden or visible box counts; Crossix-style Next Turn interaction; Crossix-style animated endgame results.

**Do not add computer opponents, third players, or unnecessary game mechanics.**

### 2. Reuse Bank and Crossix

Reuse the actual existing components wherever feasible. Preserve:

**Hamburger navigation:** same menu implementation, icon, animation, placement, backdrop, interactions, responsive behavior. Expose the appropriate destinations: Home / Games, New Game, Resume Game if available, How to Play, Settings, Results / Game History if supported. Follow the Bank/Crossix navigation structure.

**Shared screens:** reuse or extend for home/landing, player setup, game configuration, starting-player selection, active game, settings, how to play, pause/resume/exit, completion, results and rematch. Same button styles, typography, spacing, icons, transitions, cards, light/dark.

**Next Turn button:** reuse the Crossix turn button component and styling, with the behavior in Section 5.

**Final results:** reuse Crossix's scoring animation, number counting, rank transitions, final winner highlight, adapted to the row-by-row count in Section 12. Must unmistakably feel like the Crossix result screen.

### 3. Player configuration

Each player: username, color, box marker.

**Usernames:** editable fields, defaults "Player 1" / "Player 2". Spaces allowed. Trim, reasonable length limit, display properly on narrow screens. Store chosen usernames for future games on this device.

**Colors:** at least 10 clearly distinguishable options including blue, red, green, orange, purple, teal, pink, yellow/gold, cyan, indigo. Selected indicators in the house design language. Players cannot choose identical or indistinguishable colors: show a clear inline indication and require another selection. Recognizable in both themes. Color affects: identity cards, active-turn indicator, lines drawn, claimed box fill, box initials, score indicators, results screen, winner accents. Never rely on color alone to identify ownership.

**Box initials:** every claimed box shows the claiming player's letter, centered, in a fill of their color. Default marker = first character of the username, customizable to a single displayable character. If both start with the same letter, prompt for or auto-suggest distinct markers. Markers: centered precisely, visible at every zoom where practical, sufficient contrast against the fill, scale for small and large boards, stay attached through resize/rotation, never overlap border lines, visible even when live counts are hidden. A claimed box's ownership never changes.

### 4. Choosing who goes first: D6

Use Bank/Crossix dice presentation. **Digital:** show both players; Player 1 presses Roll, die animates, result 1-6 recorded and shown; Player 2 rolls likewise; higher goes first. **Ties:** show a tie, both reroll until there is a winner; never resolve by position or name. **Physical dice option:** players enter each result 1-6, same rules. **After rolling:** brief announcement with winner's name and color, then Start Game. Winner is active on the empty board. The roll must be completed before a new game can begin. **Rematch:** offer reroll or keep the same first player; default reroll.

### 5. Exact turn-by-turn gameplay

No house rules.

**5.1 Initial board:** every playable vertex shown as a dot; no edges drawn; no boxes claimed; scores 0; D6 winner active; Next Turn disabled; board immediately interactive.

**5.2 Drawing a line:** active player selects one available edge between two adjacent dots, part of the playable board. Cannot: draw diagonals on square boards, skip dots, connect nonadjacent dots, redraw an existing edge, draw multiple edges per gesture, select outside geometry, draw while waiting for Next Turn. On a valid edge: draw immediately in the player's color, mark occupied, check completed regions, award them immediately, determine whether the same player goes again, lock selection until Next Turn (unless the game ended). No visual delay.

**5.3 No box:** line in mover's color, 0 boxes, opponent becomes pending next player, mover cannot draw again, Next Turn enabled, clear indication who is next. Next Turn makes them active and unlocks the board.

**5.4 One box:** fourth side drawn: line in mover's color, box fills with mover's color, letter centered, +1, mover gets another turn, Next Turn enabled, mover stays active after pressing it. Completing a box never transfers the turn.

**5.5 Two boxes with one line:** the shared edge drawn once; two distinct boxes detected and claimed; both filled and lettered; score +2; **one** additional turn, not two; Next Turn enabled; mover stays active. Extra turns never queue. A line completing one or more boxes: same player next. Zero boxes: opponent next.

**5.6 Consecutive captures:** no limit on consecutive turns.

**5.7 Line colors:** whoever draws an edge owns that edge visually; whoever completes the box owns the box. A box can contain both players' edges. Lines keep their original colors.

**5.8 Next Turn:** before drawing: button disabled, board enabled. After a non-scoring line: board locked, button enabled, next is opponent. After a scoring line: board locked, button enabled, next is the same player. After pressing: apply next player, clear the temporary status, disable button, enable edges. Button may always read "Next Turn". Above it a message such as "Brooke is up next", "Alex claimed 1 box. Alex plays again", "Alex claimed 2 boxes. Alex plays again" (house copy rules: no em dashes). No intrusive pop-ups.

**5.9 Last line:** apply, award, save final board, detect no legal moves, disable board, hide/disable Next Turn, go to results. No extra Next Turn press.

### 6. Large variety of boards

A board-selection screen with categories, preview thumbnails, dimensions, total boxes. Every preset fully playable.

**6.1 Classic square:** 2x2 (tutorial), 3x3, 4x4, 5x5, 6x6, 8x8, 10x10 (extra large). Dimensions count boxes, not dots (4x4 = 16 boxes, 5x5 dots).

**6.2 Rectangles:** 3x5, 3x7, 4x6, 4x8, 5x8, 6x10, tall-narrow and wide-short configurations.

**6.3 Irregular square-cell shapes:** at least Diamond, Pyramid, Inverted Pyramid, Staircase, Cross/Plus, X, L, T, U, H, Hourglass, Ring/Donut, Heart, Zigzag, Snake/Winding Path, Lightning Bolt, Random Connected Shape. Genuinely formed from playable square cells. Ring has a central hole. Empty spaces and holes are not claimable, do not score, never create phantom boxes.

**6.4 Triangle and hexagon grids:** Triangle Grid: triangular faces, claimed when all 3 edges drawn. Hexagon Grid: hexagonal faces, claimed when all 6 edges drawn. Every completed face = 1 point and the same player plays again; one edge may claim every adjacent face it completes (normally at most two). Multiple sizes and silhouettes for each. Score label is "boxes" for all variants.

**6.5 Custom board builder (square cells):** configurable grid; tap cells to include/exclude; show resulting outline; live playable-box count; validate a useful number of cells; name and save; select saved layouts for future games; edit and delete. Same engine; no broken geometry or orphaned edges.

**6.6 Board engine:** graph-based: vertices, unique edges, playable faces, each face's edge list, each edge's adjacent faces. Masked square boards derive edges from included faces and dedupe shared edges. Only dots and edges belonging to playable faces appear. Edges around holes are playable. All edges start undrawn. A face is complete when all its edges are drawn. Same capture logic for every geometry. Game ends when every playable edge is occupied; never use rectangular formulas on irregular boards.

### 7. Board selection experience

Consistent with Bank/Crossix. Categories: Classic, Rectangles, Shapes, Triangles, Hexagons, Custom. Each card: miniature preview of the actual geometry, name, number of boxes, size/complexity indication. Tapping selects and shows a larger preview. Remember the last selected board. No board controls on the game screen once started.

### 8. Main game screen

Board is the visual center. Header: hamburger, title as fits existing layouts, optional compact board name. Player info: both names, colors, markers, active highlight, box counts if enabled. Board: centered responsive, dots, available edges, drawn edges, captured regions, centered initials, immediate feedback. Turn controls: current-turn indicator, Next Turn button, short message after a move. Game controls: pause/resume as the existing games do, settings, restart/new game with confirmation, resume after leaving. Uncluttered, no toasts or modal interruptions during play.

### 9. Responsive layouts

**Portrait** (iPhone first): compact header and menu, two compact player panels, board centered below, turn info, Next Turn consistently near the bottom. Safe areas respected. No vertical scrolling in ordinary play on standard boards; large boards may use controlled zoom/pan.

**Landscape:** purpose-built: board centered or left, player info and turn controls in a right panel, Next Turn visible without scrolling, menu accessible, nothing clipped. A saved game survives rotation.

**Desktop:** use width well, board sized sensibly with an adjacent info panel; not stretched.

**Touch:** generous edge hit targets though lines are thin. Taps, clicks and keyboard. Subtle preview when a pointer nears an available edge. Never require dragging dot to dot. No accidental browser zoom/scroll/gestures drawing edges. Very large boards: controlled zoom/pan with precise selection.

### 10. Light and dark

Same theme infrastructure (System, Light, Dark). Light: light neutral background, dark visible dots, subtle available-edge guides, strong colored lines, soft player fills, high-contrast initials. Dark: same ideas adjusted. Same game in both modes.

### 11. Box Count Display setting

Options **Count as You Go** (default) and **Hide Until the End** (house copy: sentence case, e.g. "Count as you go", "Hide until the end"). Live: totals update immediately (+1, +2, no change). Hidden: no running totals anywhere (no progress rings, accessibility labels, tooltips, alternate widgets, winner predictions); show a neutral "–"-style indicator; claimed boxes still show fills and letters. Results reveal via the full counting animation either way. Persists between games; may change mid-game without corrupting the match.

### 12. Endgame results: match Crossix

Reuse the Crossix animated results as much as possible: counting numbers, ranking changes, player reordering, pacing and typography, winner highlight, transitions. No generic modal.

**12.1** On the last line: store final state, go to results, show both names and colors, show the completed board, counters at 0, start counting. Do not reveal the winner before counting finishes.

**12.2 Row by row:** playable rows top to bottom, boxes left to right within a row. For each box: indicate it, read its owner, +1 to that player's animated score. At the end of each row: finish the tally, update rankings with the Crossix reorder animation, next row. Example 4x4 with rows AABA / BBBA / AAAB / BABA: after row 1 Alex 3 Brooke 1; row 2 4-4 tied; row 3 7-5 Alex first; row 4 9-7 Alex wins. Rankings update after every row including ties and lead changes.

**12.3 Irregular:** count only playable faces. Triangles/hexagons: logical rows from face-center vertical positions, top to bottom, left to right. Deterministic, independent of screen. Every face counted once.

**12.4** Ticking numbers like Crossix, engaging but reasonably fast; same skip as Crossix; skip shows correct finals and ranking immediately.

**12.5** After the last row: finish counts, final ranking, Crossix winner highlight on name, color and score, winner announcement, rematch and navigation controls. Ties: clearly tied, both treated equally, never invent a winner.

**12.6** Scores always sum to the number of playable faces. No bonuses, penalties, multipliers or tie-breakers.

### 13. Multiplayer

**Local:** one device, both identities configured, D6 decides, Next Turn advances, no login or network required, offline playable, refresh never erases an unfinished game.

**Online:** DEFERRED (see rulings). For later: private rooms, invite/join, synced board and dice (authoritative rolls), only the active player moves, exactly two seats, reconnection, server-side validation of every move and turn advance, duplicate/stale request safety.

### 14. Save, resume, rematch

Persist: game id, mode, board preset or custom geometry, names, markers, colors, D6 results and starting player, all edges and owners, all claimed faces and owners, scores, active player, pending Next Turn state, status, presentation settings. Restore exactly; never reroll on resume, never double-award, never lose a pending Next Turn on refresh. **Restart** needs confirmation; cancel preserves state exactly. **Rematch** (Crossix conventions): keep players, names, colors, markers, same board by default, clear edges and boxes, reset scores and turn state, new D6 roll unless players choose to keep the starting order. **New Game:** separate path to choose a different board and change identities.

### 15. How to Play and tutorial

Reuse the instructions screen design. Short text with visual examples for: Drawing lines; Claiming boxes; Extra turns; Double boxes (two points, one extra turn); Next Turn; Winning; Different shapes; Hidden scores. An optional short interactive tutorial on a very small board, never forced on experienced players.

### 16. Rules engine

Logic independent of presentation; explicit state transitions. A legal move: validate player, validate edge, ensure available, mark owner, inspect adjacent faces, find newly complete ones, claim each, count them, add to score, next player = same if ≥1 else opponent, set pending Next Turn unless the board is complete, detect end by remaining playable edges, save, publish. Must not assume rectangular boards, 4-sided faces, equal rows, every edge touching two faces, at most one face per line, extra turns per face, or that most edges means most boxes.

Invariants: each edge has no owner or one; each face no owner or one; a claimed face is fully enclosed; never claimed twice; sum of scores = claimed faces; only valid geometry selectable; exactly one active player in play; pending Next Turn never permits an extra move; completion from actual playable edges. Same logic local and (later) online.

### 17. Tests

**Core rules:** valid line; reject duplicate; reject invalid; reject diagonal on square; prevent a second line before Next Turn; switch after non-scoring; keep after one box; keep after two boxes; two points but one extra turn on a double; repeated scoring turns; final box; end detection; totals; tie detection.

**Boards:** every preset: valid geometry, every required edge exists, no duplicated shared edges, missing cells not claimable, holes correct, no orphaned edges, every edge selectable, every face completable, every preset finishes without getting stuck, triangles 3 edges and hexagons 6, custom boards validate.

**Players and settings:** custom names, custom initials, identical first initials, color conflicts, both themes, live and hidden scores, settings persistence, resume after refresh, resume with Next Turn pending, D6 ties and rerolls, physical dice values, rematch reset.

**Results:** every geometry: each face counted once, intended row order, correct owner, animated totals, rankings after each row, temporary ties, leader changes, correct finals, winner highlight, final ties, skip without corrupting.

**Browser checks:** small iPhone portrait, larger iPhone portrait, phone landscape, tablet portrait and landscape, desktop, light and dark; all main screens and menus. No horizontal overflow, overlapping controls, inaccessible edges, clipped letters, unreadable scoreboards, hidden Next Turn. Largest boards and unusual shapes especially.

**Online tests:** DEFERRED.

### 18. Delivery

Existing infrastructure first; no new dependencies, duplicated UI systems or unrelated architecture changes. Cohesive and complete. Do not silently remove features: if a constraint makes something hard, explain it and implement the most compatible solution. Do not deploy or make destructive infrastructure changes without approval.

**Acceptance:** open Dots and Boxes from Games, enter two names, choose distinct colors and initials, pick from many unusual boards, roll a D6, play a full game on a phone in portrait or landscape; every line immediate and accurate; every box filled with the right color and letter; a double capture gives two boxes and one extra turn; the familiar turn button controls transitions; the box-count setting shows live totals or hides them; at the end, row-by-row counting with ticking scores, rankings after every row, and the Crossix winner highlight; light and dark; feels native to the collection.
