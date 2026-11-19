// Chest cards: 14 cards. Your own original content, never a copy of a published game's chest cards.
// How to fill this in: docs/content-kit/README.md, section "Search, room-search, chest and treasury cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new chest
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'CHEST_001',              // a free id from CHEST_001 to CHEST_014
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   deck: 'CHEST',                // always 'CHEST' in this file
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
  { id: 'CHEST_001', copies: 4, status: 'draft', name: 'Empty', text: '', deck: 'CHEST', kind: 'empty',
    notes: 'Owner catalogue 2026-11-19 (CH-001, 4 copies). No effect. Draft until the owner approves.' },
  { id: 'CHEST_002', copies: 1, status: 'draft', name: 'Jewelry', text: '', deck: 'CHEST', kind: 'treasure', gold: 100, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (CH-002). Treasure worth 100 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'CHEST_003', copies: 1, status: 'draft', name: 'Arm ring', text: '', deck: 'CHEST', kind: 'treasure', gold: 120, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (CH-003). Treasure worth 120 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'CHEST_004', copies: 1, status: 'draft', name: 'Coins', text: '', deck: 'CHEST', kind: 'treasure', gold: 50, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (CH-004). Treasure worth 50 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'CHEST_005', copies: 1, status: 'draft', name: 'Dagger', text: '', deck: 'CHEST', kind: 'treasure', gold: 250, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (CH-005). Treasure worth 250 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'CHEST_006', copies: 2, status: 'draft', name: 'Small flask', text: '', deck: 'CHEST', kind: 'item', cardDisposition: 'RETAIN_HELD', use: { timing: 'free', uses: 1, afterUse: 'bottom', effects: [{ op: 'ROLL_D12', store: 'gain' }, { op: 'ROLL_D6', store: 'loss' }, { op: 'ADJUST_HP', amount: { reg: 'gain', minusReg: 'loss' } }] },
    notes: 'Owner catalogue 2026-11-19 (CH-006, 2 copies). Kept until the hero drinks it: roll a D12 and a D6 together, gain the D12 and lose the D6 as one net change (a gain stops at starting HP, D04); then this copy goes to the bottom of its own deck. Drinking does not use the turn (interpretation, plan D53). Two copies, each its own card. Draft until the owner approves.' },
  { id: 'CHEST_007', copies: 1, status: 'draft', name: 'Bones', text: '', deck: 'CHEST', kind: 'event', effects: [{ op: 'ROLL_TABLE', die: 'D12', rows: [{ parity: 'odd', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: false, monster: 'S11' }] }, { parity: 'even', effects: [] }] }],
    notes: 'Owner catalogue 2026-11-19 (CH-007). Roll a D12: odd, the skeleton wakes: a normal Skeleton encounter with a monster card draw, no fixed HP (plan D60). Draft until the owner approves.' },
  { id: 'CHEST_008', copies: 2, status: 'draft', name: 'Trap', text: '', deck: 'CHEST', kind: 'trap', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D12', plus: -3, minusStat: 'ARM' } }],
    notes: 'Owner catalogue 2026-11-19 (CH-008, 2 copies). Called a trap by the catalogue: exactly D12 minus 3 minus Armour. Draft until the owner approves.' },
  { id: 'CHEST_009', copies: 1, status: 'draft', name: 'Shuffle again', text: '', deck: 'CHEST', kind: 'reshuffle', cardDisposition: 'RESHUFFLE_DECK',
    notes: 'Owner catalogue 2026-11-19 (CH-009). Reshuffles its own deck, existing rule R62 (2023 rules box after 8.1). Draft until the owner approves.' },
];
