# Owner specification v3 (received 2026-11-19, after play-testing on a phone)

The owner's later instructions. Where this file disagrees with `spec-v2-owner-2026-11-19.md` or an earlier register ruling, this file wins. Owner text is quoted verbatim in the blocks; do not reinterpret it. Card and tile content is still not supplied: do not invent effects, mark them pending.

## 1. Chamber (reverses spec v2 item 1's "two centre cells")

> The chamber is one cell and can be moved out of to any adjacent cell. Not two cells.

Together with D35 (open on every side): the treasure chamber is a single cell, enterable from and exitable to every orthogonally adjacent cell.

## 2. Monster encounters

> Implement monster encounters according to sections 9.1–9.6 of the 2023 Swedish Drakborgen rulebook.
> Monster HP is hidden information. The monster player or computer knows the monster's HP and privately tracks damage. The hero must never see the monster's starting HP, remaining HP, percentage, or an HP bar. Announce when the monster dies; do not automatically reveal its exact HP.
> Encounter choices, before the monster card is revealed:
>
> 1. Attack
> 2. Wait
> 3. Flee, only if the previous room is reachable
> 4. Use special weapon, only if the hero has an applicable weapon; this uses the monster's Attack reaction
>
> The monster card determines the result of the selected encounter action. Do not assume choosing Attack always starts combat.
> Once A/B/C combat starts:
>
> * Hero and monster secretly select A, B, or C each exchange.
> * Reveal both choices simultaneously.
> * A beats B; B beats C; C beats A.
> * Matching letters cause 1 HP damage to both.
> * A winning card causes 1 HP damage, or 2 HP if its verified card effect specifies a double hit against that matchup.
> * Cards remain available for reuse in subsequent exchanges.
> * Continue until the hero or monster dies.
> * No ordinary Wait or Flee option exists during an ongoing combat exchange.
>
> Keep monster-card details hidden from the active hero. In local pass-and-play, use a privacy handoff before displaying monster information to the designated monster player.
> The 2023 physical dice-target combat system is an alternative combat mode. Do not confuse it with encounter choices or silently replace it with random A/B/C selection.

## 3. Portcullis

> Portcullis implementation — 2023 Drakborgen rules, sections 5.3 and 6.3
> A red-dot maze room triggers a portcullis that falls behind the hero across the passage they just used to enter.
>
> 1. Entering a red-dot room through an otherwise free passage does not require a Strength test. The portcullis drops behind the hero after entry.
> 2. Draw and resolve the normal room card for the red-dot room.
> 3. Store the portcullis on the exact passage/edge it blocks, not as a generic room-wide movement restriction.
> 4. To cross a passage blocked by a portcullis, test Strength with D12. Success is roll ≤ hero Strength.
> 5. On success, the hero crosses, and the portcullis immediately drops again behind them. The passage is not permanently opened.
> 6. On failure, the hero remains where they are and the current turn ends. On the next turn, they may retry or choose another legal exit.
> 7. Other unblocked exits remain usable.
> 8. A monster encounter cannot offer ordinary Flee when the required retreat passage is blocked by the fallen portcullis. This is the approved D15 interpretation.
> 9. Do not confuse portcullises with ordinary doors. They have different rules.
> 10. Add tests for entering a red-dot room, drawing its room card, recording the blocked entrance, successful and failed Strength tests, repeated crossings, and monster retreat restrictions.
>
> Critical: Do not make the hero roll Strength merely because the destination is a red-dot room. Roll only when the passage being crossed is already blocked by a portcullis.

## 4. Items and inventory

> Implement the item and inventory system according to the 2023 Swedish Drakborgen rules.
> Obtaining items
>
> 1. Each hero begins with the equipment and properties specified by their hero definition.
> 2. Each hero receives one magic ring during setup using the official reverse-selection order.
> 3. Entering a black-dot or red-dot room draws one room card. If the card grants treasure or a useful item that may be kept, add it to that hero's inventory.
> 4. Searching a black-dot or red-dot room uses the room-search deck, not the ordinary room deck. Additional draws from other decks occur only when the resolved card instructs them.
> 5. Entering the treasure chamber, or remaining there for another collection turn, grants two treasure-chamber cards and requires a dragon-card draw.
> 6. Do not automatically award treasure for killing a monster. Only award items when a verified rule or card instructs it.
>
> Inventory
> Track these separately:
>
> * Hero starting equipment
> * Magic ring
> * Retained weapons and useful items
> * Ordinary treasure cards and their gold values
> * Treasure-chamber cards and their gold values
>
> Each retained card must preserve its source deck, identity, effect, ownership, and relevant use restrictions.
> Using items
>
> 1. The player's inventory must be visible and accessible from the hero panel.
> 2. Show a Use action only when the item's actual card effect permits use in the current game state.
> 3. Special weapons can be selected during the pre-combat monster encounter decision. Their use triggers the monster's Attack reaction.
> 4. Do not assume all weapons, rings, or other objects are consumable. Follow their individual card instructions.
> 5. Do not invent healing potions, equipment slots, inventory capacity, item shops, crafting, trading, or universal item-use actions.
> 6. A card that is consumed or discarded must go to the correct deck or destination according to its instructions.
>
> Treasure-specific behavior
>
> 1. Count retained treasure's gold value when a hero escapes.
> 2. Keep ordinary room treasure distinct from treasure-chamber treasure.
> 3. At the bottomless well, apply +1 to the jump roll per treasure-chamber card carried. Permit discarding those cards before the jump.
> 4. When the dragon awakens, remove all treasure-chamber cards from every hero currently inside the chamber and return them to the bottom of the treasure-chamber deck.
> 5. Do not automatically remove ordinary treasure, weapons, or rings during dragon awakening.
>
> Content integration
> The engine must support card-specific effects, timing, conditions, and inventory changes through structured card data.
> Because the complete individual card definitions have not yet been supplied, do not invent their effects. Mark those effects as pending and keep them modular.
> Required interface behavior
> A player must always be able to see what they are carrying, which items are usable, which are currently unavailable, and why.
> When an item is obtained, used, discarded, or lost, display the outcome in the event log.
> Add tests covering item acquisition, retained cards, conditional special-weapon use, treasure scoring, well discards, dragon treasure loss, and correct deck returns.

## 5. UI (owner's words)

- "show dice rolling animations from bank on the who goes first screen. Help the users feel like they are playing"
- "edges of map scroll area can cut off the ability to select a tile"
- "when stats need to be rolled, show dice over the board and the number needed to beat. have a button to roll the dice. Maybe even grey out the whole board for a second. when trying against something like a closed portcullis, confirm if the user wants to test, what attribute is tested, what modifiers the player has, etc. And then show the user a pass or fail."
- "The final event log is not optimised for the screen."
- "this is not optimized for horizontal as well as vertical"
