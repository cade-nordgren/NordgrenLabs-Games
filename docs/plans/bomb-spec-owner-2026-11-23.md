# Bomb: owner spec, 2026-11-23

Recorded verbatim. Part 1 is the owner's first spec (local two-player). Part 2 is the owner's follow-up the same evening, which widens it (online play on separate phones, more players, several decks, draw cards for first turn, card styles). Where they differ, Part 2 wins. How the two are reconciled is in `bomb-plan.md`.

## Part 1 (verbatim)

# NordgrenLabs Games — BOMB
## Complete One-Shot Development Specification — Local Two-Player Edition

Build a complete, polished, mobile-first card game called **Bomb** for NordgrenLabs Games.

Bomb is our version of the traditional Palace-style shedding card game, with specific rules that must be followed exactly.

**This is exclusively a local two-player game.**

Both players share a single device, taking turns and passing it back and forth. Do not implement online multiplayer, game rooms, invite links, multiplayer synchronization, remote accounts, or matchmaking.

The application must work completely offline after installation.

The goal is a fully playable, beautifully designed game that feels like a native addition to Bank and Crossix.

---

# 1. Reuse Bank and Crossix

Before implementing Bomb, inspect the existing Bank and Crossix applications.

Reuse the actual existing components wherever practical:

- Hamburger navigation menu.
- Game landing and setup screens.
- Player name and color selection.
- Next Turn button.
- Light and dark themes.
- Responsive navigation.
- Settings screens.
- Game instructions.
- Dice rolling components.
- Winner animations.
- Results presentation.
- Rematch and New Game functionality.
- PWA conventions.
- Save/resume behavior.

The game should feel visually and functionally consistent with both existing applications.

Do not unnecessarily modify or break Bank or Crossix.

Any online-specific navigation or controls inherited from shared components must be hidden or disabled for Bomb.

---

# 2. Game Overview

**Name:** Bomb

**Number of players:** Exactly 2.

**Mode:** Local pass-and-play only.

**Deck:** Standard 52-card deck, no Jokers.

**Ranking:** 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A.

Ace is high.

Players take turns placing cards of equal or higher rank onto a shared discard pile.

Multiple cards of the same rank may be played simultaneously.

The first player to get rid of every personal card wins.

## Special rules

**2 — Reset**

- Can be played on any rank.
- Resets the pile's rank restriction.
- The next player can play any rank.
- Does not clear the discard pile.
- Does not grant an extra turn.

**10 — Bomb**

- Can be played on any rank.
- Immediately clears the entire discard pile.
- Cards are removed from the round.
- The player who played the 10 gets another turn.

**Four of a kind — Bomb**

- Four consecutive cards of the same rank at the top of the discard pile trigger a bomb.
- They may be played together or across multiple players' turns.
- Clear the entire discard pile.
- The person completing the fourth matching card receives another turn.
- Only one extra turn is awarded, regardless of how the four cards were played.

**7 and 8 are ordinary cards.**

No special abilities for these cards.

Do not add wildcards, skip effects, reverses, or other mechanics.

---

# 3. Starting Setup

Shuffle one standard 52-card deck.

Each player receives:

- 4 face-down cards.
- 9 additional cards.

Each player selects four of those nine additional cards and places them face up over their face-down cards.

The remaining five form their starting hand.

Therefore, each player starts with:

| Card zone | Count |
|---|---:|
| Face down | 4 |
| Face up | 4 |
| Hand | 5 |
| **Total** | **13** |

The remaining 26 cards become the shared draw deck.

## Face-up selection

This must be interactive.

1. Player 1 privately sees their nine selectable cards.
2. They choose exactly four cards to leave face up.
3. Selected cards appear above the four face-down cards.
4. They press Confirm.
5. The application hides their private cards.
6. A handoff screen appears for Player 2.
7. Player 2 privately selects their four face-up cards.
8. Once confirmed, both players' face-up cards become publicly visible.

Players should be able to rearrange which selected card occupies each of the four table positions.

Do not reveal the values of the face-down cards.

Do not automatically select the face-up cards.

---

# 4. Player Customization

Reuse the Bank/Crossix player setup experience.

Each player chooses:

- Username.
- Player color.
- Optional initial/avatar if supported.

Provide at least ten attractive colors.

The two players should have different colors.

Remember preferred usernames and colors between games.

Use colors consistently for turn indicators, player panels, results, and highlights.

---

# 5. Starting Player — D6

Use the existing dice interface from Bank or Crossix.

Each player rolls a D6.

The higher roll starts.

If tied, both roll again.

Allow digital rolling and optional physical dice input.

After the winner is determined, show the starting player and provide a Start Game button.

Do not reshuffle or redeal after this roll.

---

# 6. Normal Card Play

A player can play a card equal to or higher than the current required rank.

Example:

Pile top: 6

Legal ordinary ranks are 6, 7, 8, 9, J, Q, K, A.

A 2 is also legal because it resets the pile.

A 10 is legal because it bombs the pile.

### Multiple cards

Players may select and play multiple cards of exactly the same rank.

Examples:

- Two Queens.
- Three 5s.
- Four Jacks.

They cannot play different ranks in the same action.

### Empty pile

When the discard pile is empty, any rank may be played.

### After a reset

If a 2 was played, the next player may play any rank.

After that ordinary play, its rank becomes the new required minimum.

### Normal turn behavior

Once a player confirms a valid ordinary play:

1. Move the selected cards into the discard pile.
2. Update the required rank.
3. Refill the player's hand where applicable.
4. Check for a four-of-a-kind bomb.
5. Check whether the player has won.
6. Otherwise, lock card selection.
7. Enable Next Turn.
8. Make the opponent the pending next player.

The state must update immediately after confirming the play.

---

# 7. Bombing the Pile

## Bomb with a 10

When a player plays a 10:

1. Immediately recognize the bomb.
2. Show a brief BOMB animation.
3. Move the entire discard pile into the removed-card collection.
4. Clear the visible pile.
5. Reset the required rank.
6. Refill the hand if applicable.
7. Allow the same player to play again after pressing Next Turn.

A 10 bombs regardless of the previous pile rank.

## Four-of-a-kind bomb

Track consecutive matching ranks at the top of the discard pile.

Example:

Alex plays one 8.

Brooke plays one 8.

Alex plays two 8s.

Four consecutive 8s are now present.

The pile bombs.

Alex plays again.

If a different rank interrupts the consecutive sequence, the streak resets.

A reset 2 is still a card in the pile and can contribute to a consecutive sequence of four 2s.

A 10 always bombs immediately.

## Extra-turn behavior

A bomb grants exactly one additional play.

After pressing Next Turn, the bombing player remains active.

Do not create a queue of extra turns.

Repeated bombs may allow the same player to continue repeatedly.

---

# 8. Drawing Cards

Players keep five cards in hand while the shared deck has enough cards available.

After successfully playing from their hand:

1. Count the remaining hand cards.
2. Draw enough to return to five.
3. Stop drawing if the deck becomes empty.

Example:

Alex has five cards.

Alex plays three Kings.

Alex draws three cards.

Alex again has five cards.

If only one card remains in the deck, draw that one card and stop.

Once the draw deck is empty, no additional replacement cards are drawn.

The game must correctly transition players from hand cards to their face-up and face-down cards.

---

# 9. Picking Up the Pile

Players may voluntarily pick up the discard pile instead of making a play.

If they cannot make a legal play from their hand or face-up cards, they must pick it up.

Provide a dedicated **Pick Up Pile** button.

When pressed:

1. Transfer the entire discard pile into the active player's hand.
2. Clear the discard pile.
3. Reset the required rank.
4. Reset the consecutive-rank tracker.
5. Update the hand count.
6. End the player's turn.
7. Enable Next Turn.

The opponent then leads on an empty pile.

Picking up the pile does not automatically draw additional cards.

A player cannot pick up an empty pile.

---

# 10. Three Phases of Play

Each player progresses through three phases.

## Phase 1 — Hand cards

Players must play from their hand while they have hand cards.

They cannot access their face-up cards while holding hand cards.

Once the shared deck is empty and their hand is empty, they advance to Phase 2.

## Phase 2 — Face-up cards

Players can select any of their remaining face-up cards.

They must follow normal card ranking rules.

Multiple matching-rank face-up cards may be played together.

If they cannot make a valid play, they pick up the pile.

Their face-up cards remain untouched.

They return to the hand phase until they have emptied their hand again.

Once all face-up cards have been played and no hand cards remain, Phase 3 begins.

## Phase 3 — Face-down cards

Players now select one face-down card blindly.

The card is revealed only after selection.

### Legal card

If the card is legal:
- Move it to the discard pile.
- Apply its ordinary or special-card effect.
- Remove it permanently from its face-down position.
- Continue normal turn handling.

### Illegal card

If the revealed card is too low:

1. Reveal the card.
2. Add it to the discard pile.
3. Transfer the entire discard pile, including the revealed card, to the player's hand.
4. Leave the selected face-down position empty.
5. End the turn.
6. Return that player to the hand phase.

Do not put the revealed card back face down.

### Important

When playing face down, reveal exactly one card per line of play.

Do not allow simultaneous selection of multiple unknown cards.

---

# 11. Winning

The first player who has:

- Zero cards in hand.
- Zero face-up cards.
- Zero face-down cards.

wins immediately after their final legal play has resolved.

The shared draw deck must also be empty.

Do not award victory merely because a player's hand is empty while table cards remain.

Winning can occur through a normal card, 2, 10, or a four-of-a-kind bomb.

The final move should complete normally before displaying the results.

No additional Next Turn button press is required.

---

# 12. Next Turn Button

**Reuse the same Next Turn button and presentation from Crossix.**

This is mandatory.

### Before playing

- The active player can interact with their cards.
- Next Turn is disabled.

### After playing ordinary cards

- Card interactions lock.
- Next Turn becomes enabled.
- The opponent is next.

### After bombing

- Card interactions lock.
- Next Turn becomes enabled.
- The bombing player remains next.

### After picking up

- Card interactions lock.
- Next Turn becomes enabled.
- The opponent is next.

### On pressing Next Turn

If the next turn belongs to the opponent, activate the privacy handoff screen.

If the same player earned another turn, keep their private hand available and begin the next play.

Do not show the handoff screen unnecessarily when the same player continues.

The button should remain visually and behaviorally consistent with Crossix.

---

# 13. Local Pass-and-Play Privacy

This game is played on a single shared device.

It must protect each player's hand from casual viewing by the opponent.

Implement a deliberate privacy handoff.

### When turns switch

1. Hide the current player's hand immediately.
2. Show a neutral handoff screen.
3. Display the next player's username and color.
4. Display "Pass the device to [username]."
5. Provide a **Ready to Play** button.
6. Only reveal the next player's hand once Ready to Play is pressed.

Never display the next player's private cards during the transition.

### During gameplay

The active player sees:
- Their own hand.
- Their own face-up cards.
- Their own face-down card backs.
- The opponent's visible face-up cards.
- The opponent's face-down card backs.
- The opponent's hand count.
- The central discard pile.
- The shared draw deck count.

The inactive player's private hand must never appear in the active interface.

On app refresh, show the neutral handoff screen before revealing any private hand.

### Offline privacy limitations

Because the game is intentionally local-only, the device must store enough information to resume the full game.

Keep stored state out of the visible UI and avoid accidental disclosures.

Do not make false claims that local game data is impossible to inspect using browser developer tools or device-level access.

---

# 14. Main Game Screen

Reuse the Bank/Crossix design language.

Create a clean, polished digital card-table interface.

### Header

- Existing hamburger menu.
- Bomb title.
- Game settings.
- Pause, resume, and restart controls.

### Opponent area

Show:
- Username.
- Color.
- Hand card count.
- Four table positions.
- Face-up cards and remaining face-down cards.
- Turn status.

### Center area

Show:
- Shared draw deck.
- Remaining deck count.
- Discard pile.
- Top card or top matching-rank group.
- Number of cards currently in the pile.
- Required minimum rank.
- Reset status where applicable.

### Current player area

Show:
- Username.
- Color.
- Private hand.
- Four table positions.
- Selected cards.
- Active card phase.

### Main actions

- Play Cards.
- Pick Up Pile.
- Next Turn.

Only show or enable actions appropriate to the current state.

Make hand selection clear.

For a valid selected group, enable Play Cards.

Invalid mixed-rank selections must not be playable.

---

# 15. Card Design and Animations

Cards should resemble attractive, high-quality physical playing cards.

Use:
- Red hearts and diamonds.
- Dark spades and clubs.
- Clear card ranks.
- Rounded corners.
- Subtle shadows.
- Original card-back artwork.
- Smooth selection effects.
- Natural-looking stacks.
- Crisp typography.

### Card selection

Selected cards should lift slightly from the hand.

Tapping them again deselects them.

Multiple cards of the same rank can be selected together.

### Playing cards

Animate cards moving from the hand or table to the central pile.

### Reset

Playing a 2 should briefly emphasize the reset.

### Bomb

Playing a 10 or completing four of a kind should produce a satisfying but quick clearing animation.

Show "BOMB!" and visually remove the discard pile.

### Picking up

Animate the pile collapsing into the active player's hand.

### Face-down reveal

Flip the selected face-down card.

If valid, play it.

If invalid, clearly show the failed card before collecting the pile.

All animations should be brief and should respect reduced-motion preferences.

Avoid unnecessary toast notifications.

---

# 16. Portrait and Landscape Layouts

Support:
- iPhone portrait.
- iPhone landscape.
- Android phones.
- Tablet portrait.
- Tablet landscape.
- Desktop.

## Portrait

Use a compact layout:

1. Navigation/header.
2. Opponent information and table cards.
3. Central draw deck and discard pile.
4. Current player's table cards.
5. Current player's hand.
6. Action buttons.

Keep the most important interactions visible.

Respect safe areas and PWA navigation.

## Landscape

Build a genuine landscape layout rather than just stretching the portrait version.

Use the additional horizontal space for card groups, player information, and controls.

All important controls must remain visible.

## Large hands

Picking up the pile can produce unusually large hands.

Support a horizontal hand tray, card fanning, or another reliable way to browse dozens of cards.

Players must be able to inspect and select any card without accidental actions.

Do not shrink cards until they become unreadable.

Rotating the device must preserve the game and current turn.

---

# 17. Light and Dark Modes

Reuse the existing theme infrastructure.

Support:
- Light.
- Dark.
- Follow System.

All cards, controls, and player colors must maintain appropriate contrast.

Card suits should remain legible.

Do not create a separate or inconsistent theme system.

---

# 18. Save and Resume

Local games must survive:

- Refresh.
- Browser navigation.
- Closing and reopening the PWA.
- Device rotation.
- Temporary interruption.

Persist the complete game state locally.

Save:
- Player identities.
- Deck and card order.
- Every hand.
- Face-up and face-down positions.
- Discard pile.
- Removed/bombed cards.
- Current player.
- Turn phase.
- Pending Next Turn state.
- Required rank.
- Four-of-a-kind tracker.
- Bomb and pickup statistics.
- Game status.

Use established local persistence patterns from Bank and Crossix where suitable.

If their storage mechanisms are inadequate for larger game states, use IndexedDB.

When resuming, restore the exact same cards and state.

Do not reshuffle, redeal, or accidentally reveal private hands.

After reopening the app, begin from a privacy-safe screen.

---

# 19. Results Screen

Use Crossix's existing results screen and winner-highlight styling.

Bomb is a card-shedding game rather than a point-scoring game.

The first player to empty all their cards wins.

Display:

- Winner.
- Both usernames and colors.
- Remaining cards held by the losing player.
- Number of turns.
- Bombs triggered by each player.
- Pile pickups by each player.
- Optional game duration.

Reuse Crossix's ticking-number animations for appropriate statistics.

Use the same final winner highlight.

Do not invent a scoring system that changes how Bomb is won.

### Rematch

Provide Rematch.

Preserve:
- Usernames.
- Colors.
- Game preferences.

Shuffle and deal a fresh deck.

Repeat face-up-card selection and starting-player selection.

### New Game

Provide a separate path back to player configuration.

---

# 20. Game Engine Architecture

Implement a deterministic rules engine independent of the visual components.

The engine should explicitly model:

- All 52 uniquely identified cards.
- The shuffled draw deck.
- Each player's hand.
- Each player's face-up cards.
- Each player's face-down cards.
- Active discard pile.
- Bombed/removed cards.
- Current required rank.
- Consecutive same-rank streak.
- Active player.
- Pending turn transition.
- Player card phases.
- Game completion.

Each card must belong to exactly one zone at all times.

Use atomic game-state transitions.

### Required actions

At minimum:

- CREATE_GAME
- SHUFFLE_AND_DEAL
- SELECT_FACE_UP_CARDS
- CONFIRM_FACE_UP_SELECTION
- ROLL_STARTING_DICE
- START_GAME
- SELECT_CARDS
- PLAY_CARDS
- PLAY_FACE_DOWN_CARD
- PICK_UP_PILE
- REFILL_HAND
- RESOLVE_BOMB
- ADVANCE_TURN
- SAVE_GAME
- RESUME_GAME
- COMPLETE_GAME
- RESTART_GAME
- REMATCH

These may be implemented using existing architectural conventions; the precise function names are illustrative.

Do not scatter rules across unrelated UI components.

Keep the rules engine independently testable.

### Essential invariants

- Exactly 52 cards always exist across all zones.
- No card exists in more than one location.
- No card is accidentally lost.
- A player's face-up phase cannot begin before their hand is empty and the draw deck is exhausted.
- A face-down card cannot be played before the face-up zone is exhausted.
- Only legal card groups can be played.
- A 2 resets but does not bomb.
- A 10 bombs.
- Four consecutive equal ranks bomb.
- Bombs retain the current player.
- Ordinary plays and pickups pass control to the opponent.
- No additional play is permitted before the required Next Turn confirmation.
- Only a player with zero remaining personal cards can win.

---

# 21. Automated Test Coverage

Create comprehensive tests before considering the game finished.

## Dealing
- 52 cards accounted for.
- No Jokers.
- Correct ranks and suits.
- Four face-down cards per player.
- Nine cards available for initial selection.
- Four face-up selections.
- Five-card starting hands.
- 26-card draw deck.

## Normal play
- Legal higher cards.
- Legal equal cards.
- Multiple matching cards.
- Invalid lower cards.
- Invalid mixed-rank groups.
- Ace high.
- Ordinary 7s and 8s.

## Special cards
- 2 resets on any rank.
- 2 does not clear the pile.
- 10 bombs on any rank.
- Four of a kind across multiple turns.
- Four matching cards played at once.
- Interruption of a consecutive-rank streak.
- Correct extra turn after bombing.

## Drawing
- Refill to five.
- Partial refill near an empty deck.
- No refill after depletion.

## Picking up
- Voluntary pickup.
- Mandatory pickup.
- Correct transfer of all pile cards.
- Correct phase restoration.
- Correct turn transition.

## Face-up phase
- Legal selection.
- Multiple matching cards.
- Invalid play handling.
- Pickup and return to hand phase.

## Face-down phase
- Blind selection.
- Valid card.
- Invalid card.
- Special 2.
- Special 10.
- Four-of-a-kind completion.
- Pickup including the revealed card.
- Winning from the final card.

## Turn management
- Normal turn transitions.
- Bomb extra turns.
- Next Turn button.
- No duplicate actions.
- Privacy handoffs.
- Same-player continuation.

## Persistence
- Refresh during hand selection.
- Refresh during normal play.
- Refresh with Next Turn pending.
- Refresh after a bomb.
- Refresh after pickup.
- Resume during face-down play.
- No duplicate or missing cards.

## Responsive browser acceptance
- Small phone portrait.
- Phone landscape.
- Tablet.
- Desktop.
- Light theme.
- Dark theme.
- Large hands.
- Long usernames.
- Card selection near screen edges.
- Handoff screen privacy.
- All menu and results interactions.

Run actual browser checks rather than relying exclusively on unit tests.

---

# 22. Development Scope and Priorities

**Do not implement:**

- Online multiplayer.
- Remote game servers.
- Room codes.
- Invite links.
- Matchmaking.
- Player accounts.
- Leaderboards requiring internet access.
- Computer opponents.
- Additional players.
- Unrequested house rules.
- Special 7 or 8 abilities.

Focus entirely on making the local two-player experience excellent.

Implementation sequence:

1. Inspect Bank and Crossix.
2. Reuse existing shared components.
3. Implement and test Bomb rules.
4. Implement card dealing and initial setup.
5. Build private face-up selection.
6. Implement hand and table-card gameplay.
7. Implement bombs, resets, and picking up.
8. Implement deliberate Next Turn transitions.
9. Build privacy-safe device handoffs.
10. Add portrait and landscape layouts.
11. Integrate light and dark modes.
12. Add animations and sound settings if supported by existing games.
13. Implement local save/resume.
14. Adapt Crossix results and rematch screens.
15. Complete automated and browser acceptance tests.
16. Fix all critical issues before reporting completion.

Do not deploy or make destructive infrastructure changes without authorization.

## Final Definition of Done

I should be able to open Bomb from NordgrenLabs Games, choose two usernames and colors, deal a 52-card deck, privately configure each player's four face-up cards, roll to choose the starting player, and play an entire game by passing one device back and forth.

All regular cards, 2 resets, 10 bombs, four-of-a-kind bombs, refilling, picking up, face-up cards, and blind face-down cards must function correctly.

The privacy handoff must make it easy to share one device without revealing the opponent's hand.

The app must work offline, retain unfinished games, support portrait and landscape, offer light and dark modes, and finish with the familiar Crossix results design.

**Do not stop at a prototype. Deliver a complete, tested local two-player Bomb game using our existing NordgrenLabs Games architecture and design system.**

Owner's closing line: "begin only by building an artifact for this with screens like we did for Drakborgen"

## Part 2 (verbatim, later the same day)

I do also want this to be playable by multiple people on different phones but sharing a gameboard. It should be lgiht and fast so there is not a lot of waiting. I am on cloudflare free verison. Make a plan and design what the different player screens will look like. Draw cards to see who goes first. cards of different suits but same value tie and draw again to see who goes first. high number wins.

Users will not be using thier own cards, this will be digital cards only.

the game should be playable with multiple decks, so have that in the set up screen. 

Use the add user like Bank with the + sign and boxes from bank. Those are clean.

have a light and a dark mode and check contrast on each.

check the game can easily be played in landscape or portrait mode.

Allow users to also pick their own style of cards. Based on the color or design on the back of the Cards, switch the color of the player but ensure ike in dots and boxes that color contrasts are compatible.

i am going to bed. Get as much of this project done as possible, designed, tested, and built to my website as possible. I authorise pushes to deploy to my website.

## Part 3 (verbatim, 2026-11-23)

For who goes first, it actually depends on the cards dealt. After cards are dealt and all players have onyl 5 cards in their hand, the player with a 3 goes first. if more than one perosn ahs a 3, the player with mroe 3's goes first. if tied then whoever has a 3 and a 4. both have a three and four then whoever has more fours. If both have a three or two but no four, then whoever has a five. The rule continues. Does that make sense?

Also on the picking your face up cards, when you tap one of the four cards and then another one (both not in your hand) have an animation that shows them swapping places.

Also have an animation for drawing new cards from the deck until the deck is gone.

If you play a 2 or 10 or bomb the pile by playing the 4th card in a row, you get to go again immedately. If you pick up cards, you lose your turn. After playing a 2 or 10 or bombing, you must draw cards so your hand is full if possible as you may draw cards you would like to immedately use.

Have a setting for each player where they can change the order of cards in their hand, low to high or high to low. Cards should always be organized in your hand.

When the next turn is the player's again, do not make them press a button to keep going. For example, a 2 or 10 or bomb.

## Part 4 (verbatim, 2026-11-25)

For the player who goes first, they MUST play their lowest card value even if the tie was broken on a higher card. Disregarding 2s and 10s.
