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
  { id: 'RING_1', copies: 1, status: 'draft', name: 'Strength Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: skip one turn to gain 5 HP; no cap is printed (2023 rules 3.1 gives none), so HP may go above the starting HP; the Strength stat is unchanged. Timing is an interpretation to confirm (plan register D47-D50). Draft until the owner approves.',
    trigger: 'once-per-game', effects: [], use: { timing: 'turn-action', effects: [{ op: 'HEAL', amount: 5, uncapped: true }, { op: 'END_TURN' }] } },
  { id: 'RING_2', copies: 1, status: 'draft', name: 'Opening Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: opens one door or portcullis, in place of the door card or the Strength test; no other unlocking. Timing is an interpretation to confirm (plan register D47-D50). Draft until the owner approves.',
    trigger: 'once-per-game', effects: [], use: { timing: 'door-or-portcullis', effects: [{ op: 'OPEN_PASSAGE' }] } },
  { id: 'RING_3', copies: 1, status: 'draft', name: 'Thunder Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: the monster flees in a normal encounter; not offered in an ambush; no protection against attacks. Timing is an interpretation to confirm (plan register D47-D50). Draft until the owner approves.',
    trigger: 'once-per-game', effects: [], use: { timing: 'encounter-choice', effects: [{ op: 'MONSTER_FLEES' }] } },
  { id: 'RING_4', copies: 1, status: 'draft', name: 'Protection Ring', text: '', power: '',
    notes: 'Owner rules, 2026-11-19 (spec v5): single use, consumed by its use: ignore one trap: a drawn card whose data says kind trap; no lasting immunity. Timing is an interpretation to confirm (plan register D47-D50). Draft until the owner approves.',
    trigger: 'once-per-game', effects: [], use: { timing: 'trap-drawn', effects: [{ op: 'IGNORE_TRAP' }] } },
];
