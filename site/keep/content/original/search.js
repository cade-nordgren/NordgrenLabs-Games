// Search cards: 15 cards. Your own original content, never a copy of a published game's search cards.
// How to fill this in: docs/content-kit/README.md, section "Search, room-search, chest and treasury cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new search
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'SEARCH_001',             // a free id from SEARCH_001 to SEARCH_015
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   deck: 'SEARCH',               // always 'SEARCH' in this file
//   kind: 'treasure',             // treasure | item | trap | secret-door | empty | branch | reshuffle
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
  { id: 'SEARCH_001', copies: 1, status: 'approved', name: 'Shuffle again', text: '', deck: 'SEARCH', kind: 'reshuffle', cardDisposition: 'RESHUFFLE_DECK',
    notes: 'Owner catalogue 2026-11-19 (SR-001). Goes back into the search deck, which is shuffled without the cards heroes hold (R62); the hero then at once draws another search card, which resolves normally as the result of the search, again if it is this card; no extra turn, no cancelled action, no extra card. Status: 1985-SUPPORTED INTERPRETATION (original-rule-supported interpretation consistent with Alga 2023: 1985 rules section 24; owner decision spec v7, plan D62). Approved by the owner 2026-11-22.' },
  { id: 'SEARCH_002', copies: 2, status: 'approved', name: 'Scorpion', text: '', deck: 'SEARCH', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -2 } }],
    notes: 'Owner catalogue 2026-11-19 (SR-002, 2 copies). Approved by the owner 2026-11-22.' },
  { id: 'SEARCH_003', copies: 1, status: 'approved', name: 'Necklace', text: '', deck: 'SEARCH', kind: 'treasure', gold: 150, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (SR-003). Treasure worth 150 gold, kept; no other ability. Approved by the owner 2026-11-22.' },
  { id: 'SEARCH_004', copies: 5, status: 'approved', name: 'Nothing', text: '', deck: 'SEARCH', kind: 'empty',
    notes: 'Owner catalogue 2026-11-19 (SR-004, 5 copies). No effect. Approved by the owner 2026-11-22.' },
  { id: 'SEARCH_005', copies: 3, status: 'approved', name: 'Rope', text: '', deck: 'SEARCH', kind: 'item', cardDisposition: 'RETAIN_HELD', frees: ['trapdoor'],
    notes: 'Owner catalogue 2026-11-19 (SR-005, 3 copies). Kept, never used up (none is printed). After a fall through a trapdoor the hero climbs out at the start of the next turn without the Agility test and plays on (plan D55). Climbing without the test and never consumed: an owner-approved interpretation (owner spec v11, 2026-11-20). Approved by the owner 2026-11-22.' },
  { id: 'SEARCH_006', copies: 2, status: 'approved', name: 'Coins', text: '', deck: 'SEARCH', kind: 'treasure', gold: 60, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (SR-006, 2 copies). Treasure worth 60 gold, kept; no other ability. Approved by the owner 2026-11-22.' },
  { id: 'SEARCH_007', copies: 1, status: 'approved', name: 'Small flask', text: '', deck: 'SEARCH', kind: 'item', cardDisposition: 'RETAIN_HELD', use: { timing: 'free', uses: 1, afterUse: 'bottom', effects: [{ op: 'ROLL_D12', store: 'gain' }, { op: 'ROLL_D6', store: 'loss' }, { op: 'ADJUST_HP', amount: { reg: 'gain', minusReg: 'loss' }, uncapped: true }] },
    notes: 'Owner catalogue 2026-11-19 (SR-007). Kept until the hero drinks it: roll a D12 and a D6 together, gain the D12 and lose the D6 as one net change, with no cap at starting HP (the 2023 rules print no maximum); final HP 0 or less is death; then this copy goes to the bottom of its own deck, never out of the game. Drinking does not use the turn. Status: OWNER_APPROVED_INTERPRETATION (a literal 2023 card reading with no stated maximum, approved by the owner on 2026-11-20 as an interpretation; printed on the card: roll a D12 and a D6, gain one and lose the other; the free-use timing, a free action in the normal action window of the hero that never interrupts an unresolved event, is also an owner-approved interpretation, spec v10, 2026-11-20; plan D53). Approved by the owner 2026-11-22.' },
];
