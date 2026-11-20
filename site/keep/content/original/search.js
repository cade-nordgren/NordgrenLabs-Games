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
  { id: 'SEARCH_001', copies: 1, status: 'draft', name: 'Shuffle again', text: '', deck: 'SEARCH', kind: 'reshuffle', cardDisposition: 'RESHUFFLE_DECK',
    notes: 'Owner catalogue 2026-11-19 (SR-001). Goes back into the search deck, which is shuffled without the cards heroes hold (R62); the hero then at once draws another search card, which resolves normally as the result of the search, again if it is this card; no extra turn, no cancelled action, no extra card. Status: 1985-SUPPORTED INTERPRETATION (original-rule-supported interpretation consistent with Alga 2023: 1985 rules section 24; owner decision spec v7, plan D62). Draft until the owner approves.' },
  { id: 'SEARCH_002', copies: 2, status: 'draft', name: 'Scorpion', text: '', deck: 'SEARCH', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -2 } }],
    notes: 'Owner catalogue 2026-11-19 (SR-002, 2 copies). Draft until the owner approves.' },
  { id: 'SEARCH_003', copies: 1, status: 'draft', name: 'Necklace', text: '', deck: 'SEARCH', kind: 'treasure', gold: 150, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (SR-003). Treasure worth 150 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'SEARCH_004', copies: 5, status: 'draft', name: 'Nothing', text: '', deck: 'SEARCH', kind: 'empty',
    notes: 'Owner catalogue 2026-11-19 (SR-004, 5 copies). No effect. Draft until the owner approves.' },
  { id: 'SEARCH_005', copies: 3, status: 'draft', name: 'Rope', text: '', deck: 'SEARCH', kind: 'item', cardDisposition: 'RETAIN_HELD', frees: ['trapdoor'],
    notes: 'Owner catalogue 2026-11-19 (SR-005, 3 copies). Kept, never used up (none is printed). After a fall through a trapdoor the hero climbs out at the start of the next turn without the Agility test and plays on (plan D55). Draft until the owner approves.' },
  { id: 'SEARCH_006', copies: 2, status: 'draft', name: 'Coins', text: '', deck: 'SEARCH', kind: 'treasure', gold: 60, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (SR-006, 2 copies). Treasure worth 60 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'SEARCH_007', copies: 1, status: 'draft', name: 'Small flask', text: '', deck: 'SEARCH', kind: 'item', cardDisposition: 'RETAIN_HELD', use: { timing: 'free', uses: 1, afterUse: 'bottom', effects: [{ op: 'ROLL_D12', store: 'gain' }, { op: 'ROLL_D6', store: 'loss' }, { op: 'ADJUST_HP', amount: { reg: 'gain', minusReg: 'loss' }, uncapped: true }] },
    notes: 'Owner catalogue 2026-11-19 (SR-007). Kept until the hero drinks it: roll a D12 and a D6 together, gain the D12 and lose the D6 as one net change, with no cap at starting HP (the 2023 rules print no maximum); final HP 0 or less is death; then this copy goes to the bottom of its own deck, never out of the game. Drinking does not use the turn. Status: PROVISIONAL/INFERRED (literal 2023 card reading, provisional; spec v6, plan D53). Draft until the owner approves.' },
];
