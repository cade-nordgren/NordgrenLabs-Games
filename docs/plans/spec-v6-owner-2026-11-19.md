# Owner specification v6 (received 2026-11-19, evidence-based directions on the pending card rulings)

The owner reviewed the card rulings left open by the catalogue audit (`audit-card-catalogue-2026-11-19.md`, section 6) against their physical cards, the official 2023 rulebook and, where the 2023 text is abbreviated, the original 1985 rules. Where this file disagrees with `spec-v5-owner-2026-11-19.md`, `spec-v4-owner-2026-11-19.md`, `spec-v3-owner-2026-11-19.md`, `spec-v2-owner-2026-11-19.md` or an earlier register ruling, this file wins. Owner text is quoted verbatim in the blocks; do not reinterpret it.

These directions are not an approval of the catalogue: every card stays `draft`. How each part is built is in the decision register (D50, D51, D53, D56, D59, D62, D63, D64 and the status column of D51-D66), section 13 of `dungeon-game-plan.md` and the audit's section 8.

## 1. Source priority and scope

> Source priority for this implementation is: 2023 physical card > official 2023 rulebook > 1985 original rules as interpretive evidence. Do not substitute Fandrake or expansion rules for Alga 2023 rules.
> These are evidence-based implementation directions, not blanket owner approval of the catalog. Keep all work on keep-engine. Do not merge, push, or deploy.

## 2. Monster FP/KP

> Monster FP/KP — KEEP mechanic / CHANGE documentation
> The four photographed Monster-card cells really print FP: card 6 Flee/Skeleton 2; card 14 Flee/Orc 2; card 15 Flee/Dark Elf 1; card 15 Flee/Skeleton 4. Preserve FP in source/transcription metadata. Mechanically normalize the number to monsterKP, because the 2023 rules define monster endurance in KP and define no FP monster statistic. Remove the mechanical uncertainty, but document these as probable card-printing errors rather than silently altering the source.

## 3. Ceiling Collapse

> Ceiling Collapse — CHANGE
> Do not use one die roll for both death and damage. The 2023 card says [death: choose a number on D6; damage: D6]; the original full rule resolves death first and then damage separately if the hero survives. Implement: choose 1–6; roll D6; matching number = immediate death; otherwise roll a second D6 and lose that many KP. Label this a 2023-card interpretation supported by the explicit original procedure.

## 4. Door "shuffle again" (Blanda igen)

> Door Blanda igen — KEEP
> Put the Shuffle Again card back into the applicable Door pile, shuffle the pile, and immediately draw the replacement Door card that the player was trying to obtain. Resolve that result normally. If Shuffle Again appears again, repeat. Do not treat Shuffle Again as "door remains closed" and do not spend an extra turn solely because it appeared. This procedure is explicit in the original rules and compatible with the 2023 recycling rules.

## 5. Torch Goes Out

> Torch Goes Out — KEEP with lifecycle clarification
> Keep the Torch card in front of the affected hero while the torch remains out. Starting next turn, name three distinct numbers from 1–6 and roll D6. If one matches, relight the torch and continue movement that turn. If not, remain unable to move and retry on later turns. After successful relighting, the effect is resolved and the card returns to the Room deck under the normal used-card rule; it does not remain permanent inventory.

## 6. Treasure Chamber cards

> Treasure Chamber cards — KEEP PROVISIONAL
> Use a 33-card Treasure Chamber deck. The 12 photographed named valuables are verified. Use coin denominations 100, 110, 120, …, 300 gm. One copy of each denomination gives 21 coin cards and reconciles exactly with the official 33-card total. Mark the one-copy-per-denomination distribution as provisional because all 21 coin faces were not individually photographed. Do not mix these with 10-gm/50-gm/60-gm coin cards from other decks.

## 7. Protection Ring

> Protection Ring — CHANGE trap scope
> Do not restrict it to only five trap categories. The original game's Room Trap classification explicitly included Trapdoor, Arrows, Poisonous Snakes, Poisonous Mist, Explosion, and Ceiling Collapse. The 2023 Door Trap cards and Chest Trap are also explicitly traps. For the current implementation, treat these as eligible Protection Ring traps: Trapdoor; Arrow Trap; Poisonous Snakes; Poisonous Mist; Explosion; Ceiling Collapse; both Door Trap variants; Chest Trap.
> Vampire bats, Giant Spider, Centipede, Scorpion, and ordinary monsters are not traps. Do not decide Vridrum/Rotating Room yet: the 2023 rulebook calls it a trap narratively, but the ring-specific applicability is not explicit. Flag Vridrum as unresolved rather than silently including or excluding it.
> A magic ring is single-use. Present the Protection Ring choice before resolving an eligible trap if the player still possesses the ring; if used, ignore that trap's effect and expend the ring. Treat the exact UI timing as an implementation mechanism for giving the player the card's choice, not as separately printed rules text.

## 8. Small Flask

> Small Flask — KEEP uncapped provisionally / CHANGE card disposal
> Roll D12 and D6 simultaneously; gain D12 KP and lose D6 KP. The 2023 Alga rules contain no stated starting-KP maximum, so do not impose a starting-HP cap unless new 2023 evidence is found. This is a literal-card interpretation, not a separately confirmed maximum-KP ruling. If final KP is zero or less, the hero dies. After use, return the Small Flask card to its source deck; do not permanently remove it from the game.
> Do not justify this using Fandrake's healing cap or the Strength Ring; those are not needed to interpret the Alga 2023 Flask.

## 9. Dragon wake

> Dragon wake — KEEP, strengthen deterministic test
> Keep the eight-card Dragon deck with seven sleeping cards and one awake card. On each chamber turn the hero receives two Treasure Chamber cards and draws a Dragon card; sleeping cards remain set aside, increasing the wake probability.
> When the dragon wakes, for every hero in the chamber, beginning with the hero who woke it: return all of that hero's Treasure Chamber cards to the bottom of the Treasure Chamber deck; roll D12 and lose that many KP; if alive, move to any adjacent maze tile without drawing a Room card. This resolution occurs outside normal turn order. When all heroes have left the chamber, the dragon sleeps again and all previously used Dragon cards are shuffled back into the Dragon deck.
> Add a deterministic browser test of that exact sequence. Also report, from the earlier 600 random simulations, the number of Treasure Chamber entries, total Dragon-card draws, and sleeping-dragon draws. "Zero wakes" has no diagnostic meaning without those exposure counts.

## 10. Final audit

> Final audit — KEEP draft status
> Do not mark the whole catalog approved. Update every NEEDS OWNER CONFIRMATION entry individually using the status categories DIRECT 2023 RULE, DIRECT 2023 CARD, 1985-SUPPORTED INTERPRETATION, PROVISIONAL/INFERRED, and OWNER DECISION REQUIRED.
> Re-run the full automated suite, content checker, and focused browser tests for the changed rules. Report what changed and what remains unresolved. The existing test-count and branch-state figures are implementation observations, not source-of-truth rules evidence.
> Keep everything on keep-engine. No merge, push, or deployment without explicit approval.

## 11. Notes on recording

- The block quotes above are the owner's message as received, split under headings only; nothing is reworded.
- The status categories in section 10 are used exactly as written, one per flagged card entry and per register row D51-D66. None of them means approved.
- "Browser test" in section 9: the repo has no in-browser test runner. The deterministic test is a Node test that drives the reducer and the UI's DOM-free helpers; the in-browser check is left to the owner (audit section 8).
