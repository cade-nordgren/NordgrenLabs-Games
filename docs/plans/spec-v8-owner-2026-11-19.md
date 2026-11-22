# Owner specification v8 (received 2026-11-19, rotating room, wizard's curse, multiplayer reshuffle check)

The owner's follow-up to `spec-v7-owner-2026-11-19.md`. Where this file disagrees with an earlier spec or register ruling, this file wins. Owner text is quoted verbatim in the block; do not reinterpret it.

This is not an approval of the catalogue: every card stays `draft`. What was done with it: the rotating room question is reopened and investigated only, with no behaviour change, in `proposal-rotating-room-ring-2026-11-19.md` (plan section 13 #41a, OWNER DECISION REQUIRED); the wizard's curse keeps no Protection Ring offer, now recorded as an owner interpretation (ROOM_007, plan section 13 #47); the multiplayer reshuffle regression is `tests/keep/spec-v8.test.js`.

> The five-deck reshuffle implementation is accepted for continued testing, but the full card catalog is not yet approved.
>
> I found one important distinction in the official 2023 rulebook:
>
> Rotating Room — reopen the Protection Ring ruling
> Section 5.7 explicitly describes the Rotating Room as a trap. Our current exclusion may therefore be inconsistent with the printed rules.
> Please investigate allowing the Protection Ring to negate the room's rotation on entry. Do not change it until you've documented the exact timing, positioning consequences and proposed test cases for my approval.
>
> Wizard's Curse — keep excluded for now
> The card does not explicitly classify the corridor-rotation effect as a trap. Keep the Protection Ring unavailable for Wizard's Curse, but document this as an interpretation rather than an expressly stated rule.
>
> Additional validation
> Add a multiplayer regression test confirming that Shuffle Again replacement draws preserve the correct active player, turn order, prompts and hidden information.
>
> Do not alter the Dragon exit, trapdoor climb, curse positioning or spider flee mechanics without presenting a specific discrepancy.
>
> Keep all work on keep-engine. No merge, push or deployment.
