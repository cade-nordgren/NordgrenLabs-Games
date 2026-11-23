# Owner specification v7 (received 2026-11-19, "Shuffle again" in every deck)

The owner decided the question left open as section 13 #51 of `dungeon-game-plan.md`: what the "shuffle again" cards of the room, search, room search and chest decks do. Where this file disagrees with `spec-v6-owner-2026-11-19.md` or an earlier register ruling, this file wins. Owner text is quoted verbatim in the block; do not reinterpret it.

This decision is not an approval of the catalogue: every card stays `draft`. How it is built is in the decision register (R62, D62), section 13 #51 of `dungeon-game-plan.md` and the audit's status table. The rule is labelled an original-rule-supported interpretation consistent with Alga 2023, status **1985-SUPPORTED INTERPRETATION** for the five shuffle cards (ROOM_014, SEARCH_001, RSEARCH_008, CHEST_009, DOOR_005).

## 1. Shuffle Again behavior

> Owner decision: APPROVED — Shuffle Again behavior
> I want all five applicable card decks to follow the same reshuffle procedure established in section 24 of the original Alga Drakborgen rulebook, consistent with the 2023 edition.
> When a "Shuffle Again" card is drawn:
> 1. Return the Shuffle Again card to its source deck.
> 2. Shuffle that deck, including cards already returned to it. Do not include cards still legitimately held by heroes.
> 3. Immediately draw a replacement card from the same deck.
> 4. Resolve the replacement normally, as part of the original action.
> 5. If another Shuffle Again card is drawn, repeat the procedure until a substantive card result is obtained.
> 6. Do not consume an additional turn, cancel the action, or generate an extra card reward because of a reshuffle.
> Apply this to: Room deck; Search deck; Room Search deck; Chest deck; Door deck (already correct; preserve its behavior).
> Use one shared, tested reshuffle-and-redraw mechanism where practical, while maintaining each deck's independent contents and state.
> Add regression tests confirming all five decks produce replacement outcomes, retain correct card counts, and do not accidentally duplicate or permanently remove cards.
> Document this as an original-rule-supported interpretation consistent with Alga 2023, rather than an invented house rule.
> Do not modify unrelated mechanics.
> Keep everything on keep-engine. No merge, push, or deployment without explicit approval.
