# Canadian Salad: owner spec, 2026-11-23

Recorded verbatim. Part 1 is the owner's message; Part 2 is the specification pasted with it. Where they differ, Part 1 wins ("only use whole decks of cards" overrides the card-removal table in section 6). How they are reconciled is in `salad-plan.md`.

## Part 1 (verbatim)

i am going to bed. Get as much of this project done as possible, designed, tested, and built to my website as possible. I authorise pushes to deploy to my website.
Also only use whole decks of cards,

## Part 2 (verbatim)

# NordgrenLabs Games — Canadian Salad
## Complete One-Shot Development Specification
### Six Rounds • Multiple Decks • Real-Time Multiplayer • Custom Cards

# 1. Project Overview

Build a complete, polished, multiplayer card game called **Canadian Salad** for the existing NordgrenLabs Games collection.

The game must use the traditional **six-round Canadian Salad rules**, not the extended 12-round variation.

Official rules reference:
https://www.pagat.com/compendium/canadian_salad.html

Multiple-deck variation reference:
https://www.pagat.com/invented/canadian_salad.html

**The primary goal is a lightweight, fast, beautifully animated multiplayer experience where every player uses their own device but everyone shares the same synchronized virtual card table.**

Players should be able to open a link, enter a username, choose a color, and begin playing with friends without creating an account.

Support:
- 2–8 human players, optimized for 3–8.
- Four-player classic mode as the default.
- One, two, or three standard decks where a configuration is valid.
- Six fixed scoring rounds.
- Live multiplayer on separate devices.
- Private individual hands.
- One synchronized shared game board.
- Custom card faces, card backs, and table themes.
- Usernames and player colors.
- Light and dark mode.
- Portrait and landscape support.
- Fun, polished, short animations.
- Automatic scoring and standings.
- Crossix-style animated results.
- Reconnection and game resumption.
- Rematches without creating another room.
- Mobile-first PWA functionality.

No bots, AI opponents, payment systems, advertisements, or unnecessary account requirements.

## Core priorities

1. Correct rules.
2. Fast, reliable multiplayer.
3. Privacy of player hands.
4. Immediate visual feedback.
5. Excellent mobile usability.
6. Attractive, satisfying animations.
7. Reuse of NordgrenLabs components.
8. Reliable scoring and game restoration.

The entire game should feel responsive and effortless.

---

# 2. Inspect Bank, Crossix, Bomb, and Existing Games Infrastructure

Before implementing Canadian Salad, inspect the existing games and shared architecture.

**Do not start by building a completely new UI system.**

Reuse wherever appropriate:

- Bank's multiplayer, dice, and player setup patterns.
- Crossix's scoreboards and animated number counting.
- Bomb's card rendering, hands, and card interaction components.
- Existing hamburger navigation.
- Game landing pages.
- Player identity and color selection.
- Settings pages.
- Dark/light theme provider.
- Button styling.
- Dialogs and overlays.
- Navigation transitions.
- Results screens.
- Winner highlights.
- Sound and animation preferences.
- PWA infrastructure.
- Room or session infrastructure, if present.

Inspect the actual implementation, not just screenshots.

If the existing games use a shared library, extend that library rather than copy components.

Any changes to shared code must preserve existing game functionality.

Canadian Salad should have its own visual personality while clearly belonging to NordgrenLabs Games.

---

# 3. The Six Official Game Rounds

Every complete game contains six hands, played in this exact order.

The individual card-playing rules stay the same across all six hands.

Only the scoring objectives change.

## Round 1 — No Tricks

Objective: Avoid winning tricks.

Every trick captured awards 10 penalty points to the player who won it.

Example:

Alex takes three tricks.

Alex earns 30 penalty points.

No special cards score in this round.

## Round 2 — No Hearts

Objective: Avoid capturing hearts.

Each heart in a captured trick awards 10 penalty points to the trick winner.

Example:

Brooke wins a trick containing three hearts.

Brooke earns 30 penalty points.

A trick containing no hearts awards zero points.

Hearts may be led at any time. Do not import the "hearts must be broken" rule from the separate game Hearts.

## Round 3 — No Queens

Objective: Avoid capturing queens.

Every queen captured awards 25 penalty points.

Example:

A player wins a trick containing two queens.

They earn 50 penalty points.

All suits of queens count.

With multiple decks, every physical queen counts independently.

## Round 4 — No King of Spades

Objective: Avoid capturing the King of Spades.

Capturing a King of Spades awards 100 penalty points.

In a one-deck game, there is exactly one King of Spades.

In a multiple-deck game, there may be multiple Kings of Spades.

Each captured King of Spades awards 100 points.

If a player captures two Kings of Spades within the same trick, they receive 200 points.

Do not arbitrarily limit this round to one penalty event when multiple decks are enabled.

## Round 5 — No Last Trick

Objective: Avoid winning the final trick.

All earlier tricks award zero penalty points.

The winner of the last trick receives 100 penalty points.

The last trick is defined as the final trick after every player has played their final card for that hand.

This must use the actual number of tricks in the chosen deck configuration, not a hardcoded 13.

## Round 6 — Canadian Salad

This is the final combined round.

All five penalties apply simultaneously:

- 10 points for each trick won.
- 10 points for each heart captured.
- 25 points for each queen captured.
- 100 points for each King of Spades captured.
- 100 points for winning the final trick.

These penalties stack.

Example:

A player wins the final trick containing:
- One queen.
- Two hearts.
- One King of Spades.

Their penalties are:
- Winning the trick: 10.
- Two hearts: 20.
- One queen: 25.
- One King of Spades: 100.
- Last trick: 100.

**Total: 255 penalty points.**

If a card matches more than one scoring category, both applicable penalties count.

For example, the Queen of Hearts counts as both a heart and a queen in Round 6.

Do not remove overlapping penalties.

---

# 4. Game Victory

The objective across all six rounds is to earn the fewest penalty points.

At the end of each round:
- Calculate each player's round penalty score.
- Add it to their cumulative score.
- Update standings.
- Save the results.
- Prepare the next round.

After Round 6:
- Display all final cumulative totals.
- Rank players from lowest to highest.
- Highlight the player with the fewest points as the winner.

If multiple players share the lowest score, declare them tied winners.

Do not invent a tiebreaker.

For the classic four-player, single-deck format, the total of all penalties across all players and all six rounds must equal 1,120.

For other deck/player configurations, compute the expected total dynamically.

---

# 5. Standard Trick-Taking Rules

These rules apply during every round.

## Card ranks

Standard ranking, highest to lowest:

A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2.

Ace is always high.

There are no Jokers.

No wildcards.

No trump suit.

No special powers attached to individual card ranks.

## Leading a trick

The player who leads chooses any card from their hand.

That card establishes the lead suit.

Example:

Alex plays 9 of Hearts.

Hearts is the lead suit.

Every other player must play a heart if they have one.

## Following suit

Players take turns clockwise.

If a player has at least one card matching the lead suit, they must play a card of that suit.

The interface must prevent illegal off-suit selections.

If the player has no cards of the lead suit, they may play any card in their hand.

They cannot claim to be out of a suit when their hand contains that suit.

## Determining the trick winner

When everyone has played one card:

1. Identify the lead suit.
2. Ignore off-suit cards for determining the winner.
3. Find the highest-ranked card of the lead suit.
4. Award the entire trick to the player who played that card.

There are no trumps.

Example:

Player 1: 9 of Hearts.  
Player 2: King of Clubs.  
Player 3: Jack of Hearts.  
Player 4: Ace of Diamonds.

Player 3 wins with the Jack of Hearts because Hearts was led.

Even though an Ace and a King were played, they belong to different suits and cannot win this trick.

## Next trick

After the trick is awarded:

- Capture the completed trick in the winning player's trick collection.
- Apply applicable penalties.
- Display a brief winner animation.
- Clear the center playing area.
- Make that player the leader of the next trick.

The trick winner may lead any card.

The round finishes only after all player hands are empty.

---

# 6. Player Counts and Multiple Decks

A major requirement is allowing larger groups to play using multiple decks.

Support 2–8 players.

Four-player single-deck Canadian Salad is the default classic setup.

Provide tested, recommended deck configurations.

## Default deck configurations

| Players | Deck setup | Cards per player |
|---|---|---|
| 2 | 1 complete deck | 26 |
| 3 | 1 deck, remove 2♣ | 17 |
| 4 | 1 complete deck | 13 |
| 5 | 1 deck, remove 2♣ and 2♦ | 10 |
| 6 | 2 decks, remove one entire Clubs suit and one entire Diamonds suit from the second deck | 13 |
| 7 | 2 decks, remove one entire Clubs suit from the second deck | 13 |
| 8 | 2 complete decks | 13 |

These are recommended variations rather than the only valid ways to construct a game.

The two-player format is supported, but label it as a longer game when using the full deck.

For six through eight players, prioritize the multiple-deck configurations above.

## Custom deck selection

Let the host choose:

- Recommended deck configuration.
- One deck.
- Two decks.
- Three decks where practical.
- Custom game length.

For custom configurations, the application must:

1. Calculate how many cards are available.
2. Determine how many cards each player can receive.
3. Ensure every player receives the same number.
4. Explicitly identify any removed cards.
5. Preserve meaningful representation of all four suits.
6. Preserve at least one King of Spades.
7. Calculate all actual penalty opportunities.
8. Warn about unusually short or long configurations.
9. Show the number of tricks per round.
10. Reject configurations that would break the rules.

Never silently leave random leftover cards in an undealt pile.

Use a documented, deterministic card-removal policy that favors removing lower, non-penalty cards.

Exclude removed cards from the entire hand before shuffling.

The same exact configured deck composition should be rebuilt and reshuffled at the beginning of each of the six rounds.

## Duplicate cards in multiple decks

Every card needs a unique internal ID including its deck instance.

For example:

Deck 1 — Ace of Spades.  
Deck 2 — Ace of Spades.

These are separate physical cards even though their displayed ranks and suits are identical.

If two identical highest-ranked cards of the lead suit are played in the same trick, **the last identical highest card played wins that trick**.

This is the selected multi-deck house rule.

Example:

Alex plays Ace of Spades from Deck 1.

Brooke later plays Ace of Spades from Deck 2.

If Spades was led and no higher card is possible, Brooke wins.

The engine must use actual chronological play order to resolve identical-card ties.

This rule applies only when identical highest winning cards exist.

## Scoring with multiple decks

Do not assume:
- There are only 13 hearts.
- There are only four queens.
- There is only one King of Spades.
- There are always 13 tricks.
- Total penalties always equal 1,120.

Derive all scoring counts from the actual cards included in that round.

This is essential for multiple-deck accuracy.

---

# 7. Multiplayer — Everyone on Their Own Device

Canadian Salad must support simultaneous real-time multiplayer.

Each player uses their own:
- iPhone.
- Android phone.
- Tablet.
- Laptop.
- Desktop browser.

Everyone shares the same live game table.

No player account should be required.

## Creating a room

From the Canadian Salad home screen, show:

**Create Game**  
**Join Game**  
**How to Play**  
**Settings**

When creating a room:

1. Let the host enter their username.
2. Let them select a player color.
3. Choose a table theme and optional card style.
4. Choose the number of players or allow a configurable lobby capacity.
5. Choose the deck configuration.
6. Create a private game room.
7. Display a shareable link and short join code.

Provide:
- Copy Invite Link.
- Copy Room Code.
- Native Share when available.
- Optional QR code.

A room link should automatically open the correct game lobby.

Guests should not need to navigate through unrelated screens.

## Joining a room

A guest opens the link or enters the code.

They:
1. Choose their username.
2. Choose their color.
3. Join the lobby.
4. See the other participants.
5. Wait for the host to begin.

No email verification or account setup.

## Lobby

Display:
- Room code.
- Host.
- Joined players.
- Player usernames.
- Player colors.
- Seats/order.
- Selected deck configuration.
- Number of cards per player.
- Estimated game length.
- Selected card/table theme.
- Ready status.

The host may adjust settings before starting.

Players should be able to change their username or color before the match.

The host chooses Start Game once the setup is valid and the players are ready.

Lock the player count and deck configuration after the game begins.

Do not allow a late participant to be silently inserted into an ongoing hand.

---

# 8. Private Hands and Shared Public Table

This is a critical multiplayer requirement.

Every player must see their own private hand.

They must not see the cards in another player's hand.

## Information visible to everyone

- All player usernames.
- Player colors.
- Current round.
- Current scoring objective.
- Current trick cards.
- Turn order.
- Current player.
- Number of cards in each opponent's hand.
- Completed trick winners.
- Scores and standings according to settings.
- Connection status.

## Private information

A player can see only the identities of the cards dealt to them.

Do not send all player hands to every client.

Do not store other players' card identities in the browser and hide them using CSS.

The authoritative server must deal and hold the hands and send each player a private view of only their own cards.

This must remain true even when clients inspect network messages or application state.

Each player must have a reconnectable, private player-session credential separate from the public room code.

The room code allows joining an available seat; it must not grant access to an existing player's private hand.

---

# 9. The Shared Game Board

All participants view the same shared tabletop state.

The board must be optimized for both portrait and landscape.

## Central trick area

The central table shows the cards currently played in the active trick.

Place cards in an arrangement that clearly identifies which player played each card.

Each card should have an associated player indicator or nearby username.

The lead card should be identifiable.

The highest currently winning card may be subtly highlighted.

This highlight is provisional until every player has played.

## Player positions

For four players, visually arrange player panels around the table where space permits.

For six to eight players, use a responsive seating layout, compact table ring, or adaptable player list.

Do not force eight full-size player panels around a tiny phone screen.

The viewer's own hand should remain the most prominent interaction area.

Different viewers may see their own position at the bottom of the screen, but the canonical clockwise seat order must stay consistent.

## Current player

Clearly highlight whose turn it is.

Show:
- Username.
- Player color.
- Subtle turn glow or ring.
- Optional "Your Turn" prompt.

Do not depend on color alone.

Players who are waiting should still see their opponents' moves appear as they happen.

## Hand display

Display the viewer's private hand near the bottom.

Cards may overlap or fan, but must remain easy to select.

Sort cards by suit and rank.

Allow the user to choose sorting preferences:
- Suit, then rank.
- Rank, then suit.
- Manual arrangement.

Manual sorting changes only visual order, never the underlying card identity or game rules.

When a player must follow suit, clearly identify the playable cards.

Illegal cards should remain visible but cannot be submitted.

---

# 10. Exact Card-Play Interaction

Prioritize speed and clarity.

## On the active player's turn

1. Highlight their panel.
2. Show the current lead suit if one exists.
3. Identify playable cards.
4. Allow tapping one card to select it.
5. Display a subtle lifted-card selection state.
6. Enable a Play Card button.
7. Submit the move when Play Card is pressed.

Only one card may be played per trick by each player.

Do not permit selecting multiple cards for one turn.

## On a valid play

Immediately:
- Remove the card from the player's hand.
- Animate it into the center of the shared table.
- Update hand counts.
- Highlight the next player.
- Synchronize the new state to every connected device.

The card movement should feel smooth and physical.

The player should not need to press a separate Next Turn button after every normal card play.

For speed, advance automatically after the move is accepted by the authoritative game state.

Reuse Crossix's visual style for turn indicators and action buttons, but do not introduce unnecessary extra taps.

## Resolving a completed trick

Once every player has played a card:

1. Determine the winning card.
2. Highlight that card.
3. Briefly show the winner.
4. Display any penalty earned.
5. Animate the cards gathering into the winner's captured-trick collection.
6. Update scores.
7. Make that player the next leader.

Provide an optional Next Trick / Continue control using Crossix's shared button styling.

Default behavior should automatically advance after a short, readable animation.

Players can tap Continue to skip the remainder of the animation and proceed immediately.

Do not require all players to confirm a completed trick.

The server, not the animation, determines when the trick is resolved and who acts next.

Animations must not create a risk of lost, late, or duplicated card plays.

---

# 11. Dealer and Round Sequence

The first dealer is selected at the beginning of the game.

Use an existing Bank/Crossix selection component where appropriate.

A simple fair option is an automatically shuffled card cut; the highest rank becomes dealer, with ties resolved by another cut.

Once the dealer is determined:

- Display the dealer.
- Shuffle the configured deck.
- Deal evenly to all players.
- The player immediately clockwise from the dealer leads the first trick.

After each complete round:
- Record scores.
- Move the dealer position one seat clockwise.
- Rebuild and shuffle the configured deck.
- Deal a new hand to every player.
- Start the next scoring objective.
- The player immediately clockwise from the new dealer leads.

The six rounds must progress in the fixed order.

Do not use dice to decide who leads every trick.

The winner of a trick leads the next trick.

---

# 12. Round Transitions and Scoring

After the final trick of a round, display a results screen.

Reuse Crossix's animated scoring components.

## Round results

Show:
- Round name.
- Each player's username and color.
- Their penalty points from that round.
- Their previous cumulative score.
- Their new cumulative total.
- Their current rank.

Animate numerical totals ticking upward.

Ranking should update as scores change.

The person with the lowest penalty score ranks first.

## Category breakdown

Depending on the round, show the appropriate scoring categories.

Examples:

Round 1:
- Tricks won.
- Penalty points.

Round 2:
- Hearts captured.
- Penalty points.

Round 3:
- Queens captured.
- Penalty points.

Round 4:
- Kings of Spades captured.
- Penalty points.

Round 5:
- Whether the player won the last trick.
- Penalty points.

Round 6:
- Tricks.
- Hearts.
- Queens.
- Kings of Spades.
- Last-trick penalty.
- Combined penalty total.

For the final combined round, count and animate each scoring category separately before showing the round total.

## Moving to the next round

Show a clear **Next Round** button.

The host controls advancing the game after the round results.

Other players see the same results and wait for the next round.

Do not allow anyone to submit card plays while the round results are being presented.

When the next round starts, synchronize the transition to all devices.

---

# 13. Final Results — Crossix Style

After Round 6, display the final results experience.

Reuse Crossix's:
- Layout.
- Animated counting numbers.
- Ranking transitions.
- Winner highlighting.
- Visual emphasis.
- Rematch controls.
- Overall design language.

## Animated final scoring

Start with the scores from the beginning of the game.

Progress through all six rounds.

For each round:

1. Display the round name.
2. Tick each player's cumulative score upward by that round's penalty.
3. Recalculate the standings.
4. Animate any changes in ranking.
5. Briefly highlight the current leader.
6. Continue to the next round.

After the sixth round:
- Display final cumulative scores.
- Rank every player.
- Highlight the lowest-scoring player.
- Show the winner announcement.
- Display an optional breakdown of all six rounds.

The result should feel like Crossix's familiar final scoreboard, adapted to a game where **lower is better**.

Handle tied rankings correctly.

A player should not be unfairly placed ahead of another player with the same score.

## Results controls

Provide:
- Rematch.
- View Detailed Scorecard.
- New Game.
- Return to Games.

Rematch retains usernames, player colors, room membership, and selected preferences.

A rematch resets scores and begins a newly shuffled six-round game.

For online rooms, use a simple ready-up process to ensure that everyone intends to play again.

---

# 14. Card Designs and Customization

This is a major visual feature.

Cards should look beautiful and feel like physical playing cards.

Do not use crude rectangles with plain text labels.

Build an original card rendering system with:

- Rounded corners.
- Crisp ranks and suit symbols.
- Familiar red and dark suits.
- Attractive face-card artwork or a tasteful minimalist face-card design.
- Subtle shadows.
- Responsive sizing.
- Smooth flips and movement.
- High legibility.

## Built-in card themes

Offer at least:

1. Classic Playing Cards.
2. Minimal Modern.
3. Dark Luxury.
4. Vintage.
5. Nordic / Scandinavian.
6. NordgrenLabs Signature.

Themes may change:
- Card-face decoration.
- Court-card artwork.
- Card backs.
- Border styling.
- Typography.
- Shadows and textures.

However, every face must remain easy to recognize by rank and suit.

## Custom card backs

Allow players to choose a card-back design.

Provide:
- Preset designs.
- Color variations.
- Simple pattern customization.
- Optional upload of an image for a custom card back.

Keep custom image files optimized and appropriately sized.

Support safe common image formats.

Use an image-size limit, validate file content, and prevent unsafe SVG or executable markup from being rendered.

Provide a preview before applying the design.

## Custom card faces

Allow selection of card-face styles.

Provide a card-face design customization panel where appropriate.

Allow changes to:
- Background.
- Card border.
- Accent colors.
- Court-card artwork style.
- Suit design where clearly identifiable.
- Card-back pattern.

Do not permit cosmetic choices to alter ranks, suits, or scoring.

A custom card must still visibly communicate whether it is the Queen of Hearts, King of Spades, and so forth.

## Shared versus personal themes

Separate game mechanics from presentation.

The host may choose a shared table appearance.

Each player may independently choose a preferred local card design.

Changing one's visual theme must not change any other player's cards or game state.

Do not synchronize large image files with every move.

Load or cache approved visual assets separately from the live card data.

---

# 15. Table Themes

Provide multiple virtual table themes.

Suggestions:

- Classic Green Felt.
- Dark Charcoal.
- Navy Blue.
- Warm Wood.
- Minimal Light.
- Minimal Dark.
- NordgrenLabs Signature.

Use tasteful textures and colors.

Avoid heavy effects or textures that make cards difficult to read.

Provide sufficient contrast between the table, card faces, card backs, and player colors.

Allow the host to select the default table theme and players to choose local appearance overrides if practical.

---

# 16. Animations and Sound

Animations are important to the experience, but the app must remain fast.

Use animations that feel physically satisfying without interrupting gameplay.

## Dealing

At the beginning of a round:
- Briefly display the shuffled deck.
- Animate cards moving toward player positions.
- Transition into the player's private hand.
- Avoid rendering dozens of heavy individual 3D objects.

## Playing a card

When a card is played:
- The card lifts slightly.
- Moves toward the central table.
- Settles smoothly into the trick.
- The next player becomes highlighted.

Suggested duration: approximately 150–300 milliseconds.

## Winning a trick

When everyone has played:
- Briefly highlight the winning card.
- Show the winning player's name.
- Display penalty points if any.
- Sweep the cards toward the winner's collection.

Suggested duration: approximately 400–800 milliseconds total.

## Penalty animation

Examples:

**No Hearts:** Captured hearts receive a subtle red emphasis.

**No Queens:** Captured queens briefly highlight.

**King of Spades:** Use a more dramatic but tasteful highlight for the 100-point penalty.

**Last Trick:** Show the final-trick penalty with a distinct visual flourish.

**Canadian Salad:** Show all applicable penalty categories counting together.

Avoid exaggerated explosions or effects that make the game feel slow.

## Sound

Provide an optional sound-effects toggle.

Possible effects:
- Soft shuffle.
- Card placement.
- Trick collection.
- Round completion.
- Final winner.

Muted by default if that matches the other games' conventions.

Respect browser audio restrictions.

## Accessibility

Respect reduced-motion settings.

Offer a reduced-animation mode.

All important states must remain understandable without animation or sound.

Do not rely on vibration, sound, or color alone.

---

# 17. Portrait and Landscape Layout

The entire app must be responsive.

## Portrait

Optimize for iPhones first.

Suggested layout:
- Compact shared navigation.
- Current round and scoring objective.
- Other players in compact panels.
- Center trick area.
- Viewer hand near the bottom.
- Play Card action in thumb reach.

Avoid unnecessary scrolling during active gameplay.

Use safe-area padding.

## Landscape

Build a genuinely different landscape arrangement.

Use the additional horizontal space to show:
- More of the table.
- Larger cards.
- More player panels.
- Full hand.
- Compact score information.

All important actions should remain visible.

## Tablets and desktop

Use larger card-table layouts.

Show more detailed player positions and round information where space permits.

Do not simply stretch a phone design to fill a monitor.

## Large hands

With multiple decks, some players may have more than 13 cards.

Support:
- Smooth card fanning.
- Smart overlap.
- Horizontal scrolling or hand expansion.
- Sorting.
- Accurate tap targets.
- Easy access to every card.

Cards must remain readable.

Device rotation must not alter game state or cause card loss.

---

# 18. Live Scoreboard and Game Information

During gameplay, provide a compact scoreboard.

Show:
- Player names.
- Player colors.
- Cumulative penalties.
- Current round.
- Round scoring rule.
- Current trick number.
- Remaining hand counts.

Optional setting:

**Live Scores**
- Display penalty totals as the game progresses.

**Round-End Scores**
- Keep current-round penalties hidden until the results screen.

Even when totals are hidden, trick winners and captured cards remain public information.

Players should always understand the current objective.

Do not show speculative scoring predictions as confirmed results.

---

# 19. Online Architecture

Inspect the existing NordgrenLabs deployment and game architecture before selecting infrastructure.

Prefer the existing Cloudflare-based application stack and shared services if available.

If there is no suitable multiplayer room implementation, evaluate Cloudflare Durable Objects for authoritative per-room coordination and real-time synchronization.

Avoid introducing an entirely separate backend ecosystem unnecessarily.

## Authoritative server

The server must own:
- Room membership.
- Player seats.
- Deck construction.
- Secure shuffling.
- Dealing.
- Private hands.
- Current trick.
- Turn order.
- Legal move validation.
- Trick winners.
- Captured cards.
- Penalty calculations.
- Round progression.
- Final results.

The client is responsible for presentation and submitting requested moves.

Clients must not determine official card outcomes independently.

## Communication

Use an appropriate real-time transport, preferably WebSockets or the existing game synchronization mechanism.

Support:
- Immediate card-play events.
- Room updates.
- Player ready status.
- Game start.
- Round transitions.
- Reconnection.
- Game completion.

Use small, structured messages.

Do not transfer full deck images or oversized game-state objects on every card play.

## Move validation

Every submitted action must be validated:

- Correct room.
- Valid player session.
- Correct player turn.
- Card actually held by that player.
- Required suit followed.
- Card not previously played.
- Round still active.
- Trick not already complete.
- Action not duplicated.

Use atomic transitions.

Do not trust only the browser's disabled controls.

## Concurrency

A repeated click or delayed packet must not:
- Play a card twice.
- Give two players the same card.
- Award a trick twice.
- Advance the round twice.
- Duplicate penalty points.

Provide versioned state changes or idempotent action identifiers.

---

# 20. Disconnects and Reconnection

Players should be able to refresh or temporarily lose connection without losing the match.

If a player disconnects:
- Preserve their seat.
- Preserve their private hand.
- Preserve the shared table.
- Preserve scores.
- Preserve the current trick.
- Preserve pending turn order.

Show the remaining players a subtle disconnected status.

Do not automatically play cards on behalf of disconnected players.

Do not skip their turns.

The match should pause at the necessary decision point until the player returns.

## Reconnection

When a player reconnects:
- Verify their private session credential.
- Restore their player identity.
- Restore their private hand.
- Restore current public game state.
- Resume from the correct turn.

Do not force a rematch after a network interruption.

## Abandoned rooms

Use sensible room expiration and cleanup rules.

Avoid retaining abandoned game sessions indefinitely.

If a game has been completed, preserve enough information for result review and rematch according to the existing NordgrenLabs conventions.

---

# 21. Performance Requirements

The game must feel lightweight.

Prioritize:
- Quick initial loading.
- Small JavaScript bundles.
- Lightweight animations.
- Efficient card rendering.
- Minimal server messages.
- Fast local selection feedback.
- Stable connections.
- No unnecessary reloads.
- Good behavior on ordinary smartphones.

Avoid:
- Heavy game engines for simple card movements.
- Unnecessary 3D libraries.
- Huge images.
- Unoptimized full-screen animations.
- Frequent entire-page rerenders.
- Loading spinners after every card.
- Extraneous popups.

Use existing browser capabilities and shared components wherever possible.

A player should feel that tapping a card is instantaneous, even if the authoritative confirmation arrives shortly afterward.

Provide clear state reconciliation if a move is rejected.

---

# 22. Game Settings

Provide a settings screen consistent with Bank and Crossix.

Include:

**Appearance**
- Light.
- Dark.
- Follow System.

**Cards**
- Card-face theme.
- Card-back theme.
- Card size or spacing where useful.

**Table**
- Table theme.

**Gameplay**
- Live or round-end score display.
- Card sorting preference.
- Animation speed.
- Automatic next-trick advancement.
- Optional confirmation before playing a card.

**Audio**
- Sound effects on/off.

**Accessibility**
- Reduced motion.
- High-contrast cards.
- Readable card sizing.

**Room Settings — host only, before starting**
- Player capacity.
- Deck configuration.
- Game length profile.
- Shared visual defaults.

Do not allow changing game-defining deck settings in the middle of an active match.

---

# 23. How to Play

Reuse the existing Games instructions layout.

Explain Canadian Salad with simple visual examples.

Required topics:

1. The objective: lowest penalty score wins.
2. The six rounds.
3. Leading a suit.
4. Following suit.
5. Winning a trick.
6. No trump suits.
7. Capturing penalty cards.
8. The King of Spades penalty.
9. The last-trick penalty.
10. Combined scoring.
11. Multiple decks.
12. Duplicate-card tie rules.
13. Final scoring and rankings.

For each scoring round, show a short example.

Include a short interactive tutorial that demonstrates following suit and winning a trick.

Do not force the tutorial on returning players.

---

# 24. Rules Engine and Data Model

Implement the game as a deterministic rules engine separate from UI rendering.

Model at minimum:

### Game
- Game ID.
- Game configuration.
- Status.
- Host.
- Players.
- Canonical seat order.
- Current round.
- Dealer.
- Current leader.
- Current actor.
- Current trick.
- Completed tricks.
- Score history.
- Total standings.

### Cards
- Unique card instance ID.
- Rank.
- Suit.
- Source deck number.
- Current owner or zone.
- Visibility status.

### Player
- Player ID.
- Username.
- Color.
- Seat.
- Session credentials.
- Private hand.
- Connection status.
- Round score.
- Cumulative score.
- Captured tricks.

### Trick
- Trick number.
- Lead player.
- Lead suit.
- Ordered card plays.
- Winning player.
- Winning card.
- Penalty breakdown.
- Completion status.

### Round
- Round number.
- Objective.
- Configured deck composition.
- Number of tricks.
- Dealer.
- Winner of each trick.
- Per-player penalties.
- Completed status.

### Critical invariants

- No card is duplicated.
- No card disappears.
- Each card has one authoritative location.
- Only the active player may play.
- Players must follow suit.
- Exactly one card is played by each player per trick.
- Every completed trick has exactly one winner.
- Every completed trick contains exactly one card per active player.
- Every player receives the same number of cards at the start of a round.
- Every card in a round is either held or belongs to a completed/current trick.
- Every penalty is applied exactly once.
- Combined scoring counts all applicable categories.
- A completed round contains the expected number of tricks.
- The final total equals the sum of all player penalties.
- All clients receive consistent public information.
- Private hands are never exposed to opponents.

---

# 25. Testing Requirements

Create meaningful automated tests and perform real browser checks.

## Standard rules

Test:
- Correct rank ordering.
- Ace high.
- No trumps.
- Leading any suit.
- Mandatory following suit.
- Off-suit play only when void.
- Highest lead-suit card wins.
- Trick winner leads the next trick.
- Correct last-trick detection.

## Six scoring rounds

Test each penalty type independently.

Test:
- Zero-penalty tricks.
- Multiple hearts.
- Multiple queens.
- King of Spades.
- Last trick.
- Combined penalties.
- Queen of Hearts counting twice in Round 6.
- Final trick containing multiple penalty categories.
- Exact score totals.
- Lowest-score winner.
- Tied final results.

## Multiple decks

Test:
- Two identical cards have unique IDs.
- Three-deck card identities.
- Equal deal sizes.
- Correct card removal.
- Duplicate winning cards.
- Last matching highest card wins.
- Multiple Kings of Spades.
- Multiple queens and hearts.
- Dynamic trick counts.
- Correct total penalties for every supported deck preset.

## Multiplayer

Test with simulated separate clients:
- Room creation.
- Joining from invite link.
- Joining via code.
- Guest usernames and colors.
- Host controls.
- Correct player seating.
- Private hand isolation.
- Turn enforcement.
- Real-time card updates.
- Duplicate action rejection.
- Stale state handling.
- Simultaneous client submissions.
- Disconnect and reconnect.
- Game resumption.
- Round transitions.
- Results synchronization.
- Rematches.

## User interface

Test:
- Phone portrait.
- Phone landscape.
- Tablet.
- Desktop.
- Light theme.
- Dark theme.
- All supported player counts.
- Large hands.
- Multiple-deck tricks.
- Custom card themes.
- Long usernames.
- Reduced motion.
- Score animations.
- Hamburger menu.
- Results screens.

Test the game through all six complete rounds in at least one full integration test.

Also run end-to-end checks using a real browser with multiple connected clients.

---

# 26. Final Implementation Expectations

Build the complete application in the existing NordgrenLabs Games environment.

Do not replace the existing navigation or rewrite working shared systems unnecessarily.

Work through the following implementation sequence:

1. Inspect Bank, Crossix, Bomb, and the existing Games infrastructure.
2. Identify reusable components.
3. Create the complete Canadian Salad rules engine.
4. Implement six-round scoring.
5. Implement deck configuration and duplicate-card logic.
6. Build multiplayer rooms and private player sessions.
7. Build the shared card table.
8. Implement trick-taking and authoritative move validation.
9. Add player usernames and colors.
10. Add card designs, card backs, and table themes.
11. Implement lightweight animations.
12. Implement round results and final Crossix-style scoring.
13. Add settings and instructions.
14. Add reconnection and resume behavior.
15. Test different player counts and multiple decks.
16. Verify portrait and landscape layouts.
17. Run complete browser and integration testing.
18. Fix critical issues before considering the work complete.

Use existing NordgrenLabs infrastructure when possible.

Do not deploy to production or make irreversible infrastructure changes without explicit authorization.

## Definition of Done

Canadian Salad is complete when a group of friends can open the game on their individual devices, join a shared private room, choose usernames and colors, select a deck configuration, and play all six rounds without manually calculating scores.

Each player must see only their private hand while everyone sees the same central table.

Cards must play smoothly and synchronize immediately.

The rules must enforce following suit, determine trick winners correctly, resolve duplicate cards in multiple-deck games, and calculate every penalty accurately.

The game must work well on phones in portrait and landscape, support attractive custom card designs, and preserve existing room sessions during disconnections.

Every round must produce accurate animated results.

The final six-round results must use the familiar Crossix-style counting and winner highlighting, with the lowest-scoring player winning.

**The goal is a polished, complete, lightweight multiplayer card game that belongs naturally alongside Bank, Crossix, Bomb, and Dots and Boxes. Do not stop at a prototype or leave essential gameplay features unimplemented.**
