# Owner specification v4 (received 2026-11-19, rulings on the open edge cases)

The owner's rulings on section 13 open points #37 (solo monster HP), #38 (dragon reset after a stay-put), #12 (special weapon in an ambush) and #10 / #26 (position after a well jump), plus a rule on hero stats. Where this file disagrees with `spec-v3-owner-2026-11-19.md`, `spec-v2-owner-2026-11-19.md` or an earlier register ruling, this file wins. Owner text is quoted verbatim in the blocks; do not reinterpret it. Card and tile content is still not supplied: do not invent effects, mark them pending.

How each ruling is built, and the interpretations it needed, is in the decision register (D37 amended, D40 to D44) and section 13 of `dungeon-game-plan.md`.

## 1. Solo monster HP (reverses the solo part of D37)

> Show the monster's HP in solo play, as the printed rulebook specifies.
>
> The implementation should work as follows:
>
> * Solo play: Display the monster's current HP once the monster is revealed, updating it as damage is dealt.
> * Multiplayer: Keep monster HP hidden from the hero player and visible to the player controlling the monster.
> * Combat decisions: Keep the monster's unrevealed combat choices hidden in both modes.
> * Optional variant: Hidden monster HP in solo play can be offered later as an explicitly labeled house rule, but it should not be the default.
>
> Please update the documented ruling and add a UI test confirming that solo monster HP is visible.

## 2. Edge cases

> I've reviewed the remaining edge cases. Please use these decisions on `keep-engine`:
>
> **1. Dragon reset — follow the printed condition.**
>
> Do not reset the dragon deck until every surviving hero has actually left the Dragon's Lair. If a hero cannot complete the forced exit because no legal adjacent tile is available, leave them in the chamber with the dragon awake. They may attempt to leave when an exit becomes available, but cannot draw more treasure while the dragon is awake. Reset the dragon deck only when the chamber is empty.
>
> The blocked-exit behavior is an owner interpretation; the requirement to wait until everyone leaves is printed in §10.1.
>
> **2. Special weapons during an ambush — allow them.**
>
> Resolve the initial ambush damage first, using the hero's Luck factor (TF). Then offer Attack, Flee, or Use Special Weapon if the hero has an applicable weapon.
>
> Treat Use Special Weapon as an alternative to Attack, following the weapon card's instructions and the monster's Attack reaction column. This is our interpretation of §§9.1 and 9.5, not an explicitly stated ambush rule.
>
> **3. Successful well jump — remain on the well tile.**
>
> Use the hero's Agility factor (VF), including the printed +1 roll penalty per carried treasure-chamber card. On success, update the hero's position to the opposite edge of the same well tile. The jump ends that turn. The hero can move out from that side on a later turn. Do not automatically move the hero into the adjacent room.
>
> This positioning is an owner ruling because §5.6 does not explicitly specify the final tile position.
>
> **4. Use hero stats directly.**
>
> All attribute checks must reference the selected hero's actual SF, VF, RF, and TF values. Hero HP comes from the hero card. Monster HP must still come from the matching monster-type row of the drawn monster card. Do not substitute hero stats for monster HP or A/B/C combat-card results.
>
> Please update the owner-rulings documentation and add regression tests for these edge cases.

Stat names: SF is Strength (`STR`), VF Agility (`AGI`), RF Armour (`ARM`), TF Luck (`LCK`) in the code.
