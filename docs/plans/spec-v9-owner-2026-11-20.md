# Owner specification v9 (received 2026-11-20, rotating room and Protection Ring approved)

The owner's decision on `proposal-rotating-room-ring-2026-11-19.md` (asked for by `spec-v8-owner-2026-11-19.md`). Where this file disagrees with an earlier spec or register ruling, this file wins. Owner text is quoted verbatim in the block; do not reinterpret it.

This is not an approval of the catalogue or the game: every card stays `draft`. What was done with it: the rules flag `rotatingRoomRing` now defaults to `'every-entry'` (D67; `'first-reveal'` and `'never'` stay settable), with a prompt before the room turns, on every entry, to the entering or driven hero's seat; plan section 13 #41a resolved; the status label OWNER_APPROVED_INTERPRETATION added (the ring's part, D10, D50, D63, D67; the wizard's curse, ROOM_007, section 13 #47); MECHANICS_VERSION v10; tests in `tests/keep/spec-v9.test.js`.

> Owner decision: APPROVED — Rotating Room and Protection Ring
>
> I approve the rotating-room proposal described in docs/plans/proposal-rotating-room-ring-2026-11-19.md, including the recommended gameplay behavior and proposed regression tests.
>
> Implement these decisions:
>
> 1. Protection Ring effect
>
> When a hero enters a Rotating Room while carrying an unused Protection Ring, offer: Use Protection Ring / Keep Protection Ring.
>
> If the hero uses the ring: Consume the ring. Cancel that entry's rotation completely. Preserve the room's existing orientation. Do not grant any additional immunity or permanent protection.
>
> If the hero keeps the ring: Do not consume it. Resolve the normal 90° clockwise rotation immediately.
>
> 2. Trigger on every entry
>
> Offer the ring on every eligible entry, including: The initial reveal of the Rotating Room. Subsequent entries into an existing Rotating Room. Successful fleeing into the room. Forced entry after the dragon wakes.
>
> Do not offer the ring merely because a hero remains inside the room.
>
> 3. Timing
>
> On first reveal, show the newly discovered room before presenting the choice.
>
> Present the ring decision after the hero has entered but before applying rotation.
>
> After the player decides, resolve the entry normally. Do not invent extra turns or movement opportunities.
>
> 4. Classification
>
> The official 2023 rulebook, §5.7, directly confirms that the Rotating Room is a trap and rotates clockwise on every entry.
>
> The Protection Ring's ability to cancel that rotation, its prompt timing and its availability during forced movement are OWNER-APPROVED INTERPRETATIONS.
>
> Do not describe those interpretations as explicitly printed rules.
>
> If needed, add OWNER_APPROVED_INTERPRETATION to the status register rather than leaving approved behavior permanently marked provisional.
>
> 5. Scope
>
> Keep Wizard's Curse excluded from Protection Ring eligibility under the existing interpretation.
>
> Do not change the rotating room's physical geometry, normal rotation behavior without a ring, or the existing maze tile catalog.
>
> Do not modify dragon forced-exit movement. The official §10.1 does not explicitly require a free passage for that forced movement, so its current behavior is not established as defective.
>
> 6. Verification
>
> Implement the 19 proposed test cases, including all four entry directions, first reveal, re-entry, fleeing, dragon forced exit, ring consumption and declining the ring.
>
> Run the complete test suite and content checker.
>
> Browser-test both choices, particularly the case where rotation would otherwise leave the hero trapped.
>
> Report all results and any discrepancies. Do not mark the entire game or card catalog approved automatically.
>
> Keep everything on keep-engine. Do not merge into main, push or deploy without my explicit approval.
