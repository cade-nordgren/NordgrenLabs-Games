// Treasury cards: 33 cards. Your own original content, never a copy of a published game's treasury cards.
// How to fill this in: docs/content-kit/README.md, section "Search, room-search, chest and treasury cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new treasury
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'TREASURY_001',           // a free id from TREASURY_001 to TREASURY_033
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   deck: 'TREASURY',             // always 'TREASURY' in this file
//   kind: 'treasure',             // treasure | item | trap | secret-door | empty | branch | reshuffle
//   gold: 0,                      // coins this card is worth if the hero keeps it
//   effects: [],                  // what happens, in order: see "Effects" in the guide
//   followUpDeck: null,           // null, or 'SEARCH' | 'CHEST' | 'DOOR' | 'MONSTER': draw from that deck next
//   turnDisposition: 'end-turn',  // 'end-turn' | 'continue' (hero may keep moving) | 'ongoing'
//   cardDisposition: 'RETAIN_TREASURY', // 'UNDER_SAME_DECK' | 'RETAIN_HELD' | 'RETAIN_TREASURY' | 'REMOVE' | 'RESHUFFLE_DECK'
//   privacy: 'private-to-holder', // 'public' | 'private-to-holder'
//   specialWeapon: false,         // true if a hero may use it as a special weapon (stored, not used by the engine yet)
// },
// SKELETON END

export default [
  { id: 'TREASURY_001', copies: 1, status: 'draft', name: 'Pearl necklace', text: '', deck: 'TREASURY', kind: 'treasure', gold: 1800, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-001): 1800 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_002', copies: 1, status: 'draft', name: 'Gemstones', text: '', deck: 'TREASURY', kind: 'treasure', gold: 3800, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-002): 3800 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_003', copies: 1, status: 'draft', name: 'Scepter', text: '', deck: 'TREASURY', kind: 'treasure', gold: 1100, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-003): 1100 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_004', copies: 1, status: 'draft', name: 'Gold chain', text: '', deck: 'TREASURY', kind: 'treasure', gold: 500, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-004): 500 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_005', copies: 1, status: 'draft', name: 'Arm ring', text: '', deck: 'TREASURY', kind: 'treasure', gold: 800, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-005): 800 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_006', copies: 1, status: 'draft', name: 'Giant ruby', text: '', deck: 'TREASURY', kind: 'treasure', gold: 4500, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-006): 4500 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_007', copies: 1, status: 'draft', name: 'Gold chain', text: '', deck: 'TREASURY', kind: 'treasure', gold: 700, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-007): 700 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_008', copies: 1, status: 'draft', name: 'Crown', text: '', deck: 'TREASURY', kind: 'treasure', gold: 4000, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-008): 4000 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_009', copies: 1, status: 'draft', name: 'Jewels', text: '', deck: 'TREASURY', kind: 'treasure', gold: 3200, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-009): 3200 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_010', copies: 1, status: 'draft', name: 'Goblet', text: '', deck: 'TREASURY', kind: 'treasure', gold: 1500, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-010): 1500 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_011', copies: 1, status: 'draft', name: 'Pitcher', text: '', deck: 'TREASURY', kind: 'treasure', gold: 2000, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-011): 2000 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_012', copies: 1, status: 'draft', name: 'Golden apple', text: '', deck: 'TREASURY', kind: 'treasure', gold: 2200, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-012): 2200 gold. Pictured card. Draft until the owner approves.' },
  { id: 'TREASURY_013', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 100, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-013): 100 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_014', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 110, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-014): 110 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_015', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 120, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-015): 120 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_016', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 130, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-016): 130 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_017', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 140, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-017): 140 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_018', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 150, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-018): 150 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_019', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 160, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-019): 160 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_020', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 170, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-020): 170 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_021', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 180, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-021): 180 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_022', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 190, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-022): 190 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_023', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 200, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-023): 200 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_024', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 210, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-024): 210 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_025', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 220, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-025): 220 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_026', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 230, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-026): 230 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_027', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 240, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-027): 240 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_028', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 250, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-028): 250 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_029', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 260, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-029): 260 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_030', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 270, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-030): 270 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_031', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 280, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-031): 280 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_032', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 290, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-032): 290 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
  { id: 'TREASURY_033', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'TREASURY', kind: 'treasure', gold: 300, cardDisposition: 'RETAIN_TREASURY', privacy: 'private-to-holder',
    notes: 'Owner catalogue 2026-11-19 (TR-033): 300 gold. NEEDS OWNER CONFIRMATION: one card of each coin value 100 to 300 is inferred from the deck total of 33 (plan D64). Draft until the owner approves.' },
];
