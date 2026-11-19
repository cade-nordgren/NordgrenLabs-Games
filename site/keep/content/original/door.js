// Door cards: 15 cards. Your own original content, never a copy of a published game's door cards.
// How to fill this in: docs/content-kit/README.md, section "Door cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new door
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'DOOR_001',               // a free id from DOOR_001 to DOOR_015
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   deck: 'DOOR',                 // always 'DOOR' in this file
//   kind: 'opens',                // opens | closed | trap
//   gold: 0,                      // coins this card is worth if the hero keeps it
//   effects: [],                  // what happens, in order: see "Effects" in the guide
//   followUpDeck: null,           // null, or 'SEARCH' | 'CHEST' | 'DOOR' | 'MONSTER': draw from that deck next
//   turnDisposition: 'end-turn',  // 'end-turn' | 'continue' (hero may keep moving) | 'ongoing'
//   cardDisposition: 'UNDER_SAME_DECK', // 'UNDER_SAME_DECK' | 'RETAIN_HELD' | 'RETAIN_TREASURY' | 'REMOVE' | 'RESHUFFLE_DECK'
//   privacy: 'public',            // 'public' | 'private-to-holder'
//   specialWeapon: false,         // true if a hero may use it as a special weapon (stored, not used by the engine yet)
// },
// SKELETON END

export default [
  { id: 'DOOR_001', copies: 7, status: 'draft', name: 'Door opens', text: '', deck: 'DOOR', kind: 'opens',
    notes: 'Owner catalogue 2026-11-19 (DR-001, 7 copies). The hero goes through; it relocks behind them (R47, R50). Draft until the owner approves.' },
  { id: 'DOOR_002', copies: 5, status: 'draft', name: 'Door stays shut', text: '', deck: 'DOOR', kind: 'closed',
    notes: 'Owner catalogue 2026-11-19 (DR-002, 5 copies). The hero may try another way this turn (R48). Draft until the owner approves.' },
  { id: 'DOOR_003', copies: 1, status: 'draft', name: 'Door trap', text: '', deck: 'DOOR', kind: 'trap', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D12', minusStat: 'LCK' } }],
    notes: 'Owner catalogue 2026-11-19 (DR-003). Called a trap by the catalogue: D12 minus Luck; the door stays shut and the turn ends (R49). Draft until the owner approves.' },
  { id: 'DOOR_004', copies: 1, status: 'draft', name: 'Door trap', text: '', deck: 'DOOR', kind: 'trap', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6' } }],
    notes: 'Owner catalogue 2026-11-19 (DR-004). Called a trap by the catalogue: D6; the door stays shut and the turn ends (R49). Draft until the owner approves.' },
  { id: 'DOOR_005', copies: 1, status: 'draft', name: 'Shuffle again', text: '', deck: 'DOOR', kind: 'reshuffle', cardDisposition: 'RESHUFFLE_DECK',
    notes: 'Owner catalogue 2026-11-19 (DR-005). Reshuffles its own deck, existing rule R62 (2023 rules box after 8.1). NEEDS OWNER CONFIRMATION: the door does not open and is handled as stays shut (plan D62). Draft until the owner approves.' },
];
