// Ring cards: 4 rings. Your own original content, never a copy of a published game's rings.
// How to fill this in: docs/content-kit/README.md, section "Ring cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new rings
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'RING_1',                 // a free id from RING_1 to RING_4
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   power: '',                    // your own words for the ring's power, shown when drafting
//   trigger: 'passive',           // 'passive' | 'once-per-game' | 'on-test' | 'on-encounter'
//   effects: [],                  // stored; the engine does not run ring powers yet
// },
// SKELETON END

export default [
  { id: 'RING_1', copies: 1, status: 'approved', name: 'Strength Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: skip one turn to gain 5 HP; no cap is printed (2023 rules 3.1 gives none), so HP may go above the starting HP; the Strength stat is unchanged. Printed on the card: skip a turn, gain 5 HP. Owner-approved interpretation: the timing (only as the first action of the turn) and no HP cap (2026-11-20), and use at full starting HP (spec v10, 2026-11-20); plan register D47. Approved by the owner 2026-11-22.',
    trigger: 'once-per-game', effects: [], use: { timing: 'turn-action', effects: [{ op: 'HEAL', amount: 5, uncapped: true }, { op: 'END_TURN' }] } },
  { id: 'RING_2', copies: 1, status: 'approved', name: 'Opening Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: opens one door or portcullis, in place of the door card or the Strength test; no other unlocking. Timing is an owner-approved interpretation (2026-11-20; plan register D48). Approved by the owner 2026-11-22.',
    trigger: 'once-per-game', effects: [], use: { timing: 'door-or-portcullis', effects: [{ op: 'OPEN_PASSAGE' }] } },
  { id: 'RING_3', copies: 1, status: 'approved', name: 'Thunder Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: the monster flees in a normal encounter; not offered in an ambush; no protection against attacks. Printed on the card: the monster flees in a normal encounter, no protection against attacks or surprise encounters. Owner-approved interpretation: the timing (with Attack, Wait and Flee, never in an ambush; 2026-11-20), and no monster card drawn and no A/B/C combat (spec v10, 2026-11-20); plan register D49. Approved by the owner 2026-11-22.',
    trigger: 'once-per-game', effects: [], use: { timing: 'encounter-choice', effects: [{ op: 'MONSTER_FLEES' }] } },
  { id: 'RING_4', copies: 1, status: 'approved', name: 'Protection Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: ignore one trap: a drawn card whose data says kind trap; no lasting immunity. Owner spec v9 (owner-approved interpretation, not a printed rule; plan D67): also on entering a rotating room, before it turns, on every entry (reveal, re-entry, flight, the forced move after the dragon wakes): used, the room does not turn that entry; kept, it turns as usual. Printed on the card: ignore one trap. Owner-approved interpretation, the timing (spec v10, 2026-11-20; plan register D50): offered once, before any consequence of the trap; used, it is consumed and that trap is cancelled; declined, it is kept and the trap resolves normally; never offered once the trap has started. Approved by the owner 2026-11-22.',
    trigger: 'once-per-game', effects: [], use: { timing: 'trap-drawn', effects: [{ op: 'IGNORE_TRAP' }] } },
];
