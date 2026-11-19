// Room cards: 60 cards. Your own original content, never a copy of a published game's room cards.
// How to fill this in: docs/content-kit/README.md, section "Room cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new room
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'ROOM_001',               // a free id from ROOM_001 to ROOM_060
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   deck: 'ROOM',                 // always 'ROOM' in this file
//   kind: 'empty',                // empty | treasure | item | monster | trap | branch | event | reshuffle
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
  { id: 'ROOM_001', copies: 1, status: 'draft', name: 'Poisonous snakes', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D12', minusStat: 'AGI' } }],
    notes: 'Owner catalogue 2026-11-19 (RM-001). Draft until the owner approves.' },
  { id: 'ROOM_002', copies: 1, status: 'draft', name: 'Small flask', text: '', deck: 'ROOM', kind: 'item', cardDisposition: 'RETAIN_HELD', use: { timing: 'free', uses: 1, afterUse: 'bottom', effects: [{ op: 'ROLL_D12', store: 'gain' }, { op: 'ROLL_D6', store: 'loss' }, { op: 'ADJUST_HP', amount: { reg: 'gain', minusReg: 'loss' } }] },
    notes: 'Owner catalogue 2026-11-19 (RM-002). Kept until the hero drinks it: roll a D12 and a D6 together, gain the D12 and lose the D6 as one net change (a gain stops at starting HP, D04); then this copy goes to the bottom of its own deck. Drinking does not use the turn (interpretation, plan D53). Draft until the owner approves.' },
  { id: 'ROOM_003', copies: 1, status: 'draft', name: 'Poisonous mist', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -3 }, store: 'mist' }, { op: 'SKIP_TURNS', turns: { reg: 'mist' }, label: 'Unconscious' }],
    notes: 'Owner catalogue 2026-11-19 (RM-003). Damage D6 minus 3; the hero then misses one turn per point of damage taken (none for 0, plan D54). Draft until the owner approves.' },
  { id: 'ROOM_004', copies: 1, status: 'draft', name: 'Torch goes out', text: '', deck: 'ROOM', kind: 'item', cardDisposition: 'RETAIN_HELD', effects: [{ op: 'SET_CONDITION', id: 'torch-out', label: 'Torch out', turns: null, onTurnStart: [{ op: 'NAME_NUMBERS', count: 3, label: 'Relight the torch', onMatch: [{ op: 'CLEAR_CONDITION', id: 'torch-out' }], onMiss: [{ op: 'END_TURN' }] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-004). Kept. On each later turn the hero names three different numbers and rolls a D6; a match relights the torch and the turn goes on, a miss ends the turn (plan D56). NEEDS OWNER CONFIRMATION: no discard is printed, so the card stays with the hero after relighting. Draft until the owner approves.' },
  { id: 'ROOM_005', copies: 1, status: 'draft', name: 'Explosion', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 4 }, { op: 'SKIP_TURNS', turns: 1 }],
    notes: 'Owner catalogue 2026-11-19 (RM-005). Lose 4 HP, then miss the next turn (plan D54). Draft until the owner approves.' },
  { id: 'ROOM_006', copies: 1, status: 'draft', name: 'Arrow trap', text: '', deck: 'ROOM', kind: 'trap', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D12', minusStat: 'ARM' } }],
    notes: 'Owner catalogue 2026-11-19 (RM-006). Called a trap by the catalogue (Protection Ring, plan D50, D63). Draft until the owner approves.' },
  { id: 'ROOM_007', copies: 1, status: 'draft', name: 'Wizard\'s curse', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'ROLL_TABLE', die: 'D6', rows: [{ min: 1, max: 2, effects: [{ op: 'ROTATE_TILES', mark: 'yellow', degrees: 90 }] }, { min: 3, max: 4, effects: [{ op: 'ROTATE_TILES', mark: 'yellow', degrees: 180 }] }, { min: 5, max: 6, effects: [{ op: 'ROTATE_TILES', mark: 'yellow', degrees: 270 }] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-007). Every placed yellow corridor turns: 1-2 a quarter clockwise, 3-4 half a turn, 5-6 a quarter counter-clockwise (plan D57). Draft until the owner approves.' },
  { id: 'ROOM_008', copies: 1, status: 'draft', name: 'Ceiling collapses', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'NAME_NUMBERS', count: 1, store: 'collapse', label: 'Ceiling collapses', onMatch: [{ op: 'KILL_HERO' }], onMiss: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { reg: 'collapse' } }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-008). NEEDS OWNER CONFIRMATION (plan D59): most literal reading of the card shorthand. The hero names one number and rolls one D6: a match is death, otherwise damage equal to that roll. The 2023 rulebook says nothing more (checked). Draft until the owner approves.' },
  { id: 'ROOM_009', copies: 3, status: 'draft', name: 'Chest', text: '', deck: 'ROOM', kind: 'branch', effects: [{ op: 'REQUEST_CHOICE', options: [{ label: 'Open the chest', effects: [{ op: 'DRAW_CARD', deck: 'CHEST', then: 'resolve' }] }, { label: 'Leave it', effects: [] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-009, 3 copies). Optional draw (plan D61; 2023 rules box after 8.1). Draft until the owner approves.' },
  { id: 'ROOM_010', copies: 1, status: 'draft', name: 'Arm ring', text: '', deck: 'ROOM', kind: 'treasure', gold: 40, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (RM-010). Treasure worth 40 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'ROOM_011', copies: 1, status: 'draft', name: 'Costume jewelry', text: '', deck: 'ROOM', kind: 'treasure', gold: 30, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (RM-011). Treasure worth 30 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'ROOM_012', copies: 1, status: 'draft', name: 'Costume jewelry', text: '', deck: 'ROOM', kind: 'treasure', gold: 25, cardDisposition: 'RETAIN_HELD',
    notes: 'Owner catalogue 2026-11-19 (RM-012). Treasure worth 25 gold, kept; no other ability. Draft until the owner approves.' },
  { id: 'ROOM_013', copies: 12, status: 'draft', name: 'Empty room', text: '', deck: 'ROOM', kind: 'empty',
    notes: 'Owner catalogue 2026-11-19 (RM-013, 12 copies). No effect. Draft until the owner approves.' },
  { id: 'ROOM_014', copies: 1, status: 'draft', name: 'Shuffle again', text: '', deck: 'ROOM', kind: 'reshuffle', cardDisposition: 'RESHUFFLE_DECK',
    notes: 'Owner catalogue 2026-11-19 (RM-014). Reshuffles its own deck, existing rule R62 (2023 rules box after 8.1). Draft until the owner approves.' },
  { id: 'ROOM_015', copies: 2, status: 'draft', name: 'Trapdoor', text: '', deck: 'ROOM', kind: 'trap', effects: [{ op: 'CHECK_STAT', stat: 'LCK', modifier: 0, onPass: [], onFail: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6' } }, { op: 'SET_CONDITION', id: 'trapdoor', label: 'In a trapdoor pit', turns: null, onTurnStart: [{ op: 'REQUEST_CHOICE', options: [{ label: 'Climb out', effects: [{ op: 'CHECK_STAT', stat: 'AGI', modifier: 0, onPass: [{ op: 'CLEAR_CONDITION', id: 'trapdoor' }], onFail: [{ op: 'END_TURN' }] }] }] }] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-015, 2 copies). Called a trap by the catalogue (plan D63). Luck test to avoid the fall; a fall is D6 damage, then on each later turn an Agility test to climb out; a pass lets the turn go on, a fail ends it. A rope frees the hero untested (plan D55). Draft until the owner approves.' },
  { id: 'ROOM_016', copies: 3, status: 'draft', name: 'Sarcophagus', text: '', deck: 'ROOM', kind: 'branch', effects: [{ op: 'REQUEST_CHOICE', options: [{ label: 'Open the sarcophagus', effects: [{ op: 'DRAW_CARD', deck: 'CHEST', then: 'resolve' }] }, { label: 'Leave it', effects: [] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-016, 3 copies). Optional draw (plan D61; 2023 rules box after 8.1). Draft until the owner approves.' },
  { id: 'ROOM_017', copies: 3, status: 'draft', name: 'Skeleton', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: false, monster: 'S11' }],
    notes: 'Owner catalogue 2026-11-19 (RM-017, 3 copies). A normal encounter: Attack, Wait or Flee, then a monster card read on this type row. Draft until the owner approves.' },
  { id: 'ROOM_018', copies: 2, status: 'draft', name: 'Ambush skeleton', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: true, monster: 'S11' }],
    notes: 'Owner catalogue 2026-11-19 (RM-018, 2 copies). Ambush: D12 minus Luck first, then Attack or Flee (existing ambush flow, R78). Draft until the owner approves.' },
  { id: 'ROOM_019', copies: 5, status: 'draft', name: 'Dark elf', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: false, monster: 'S09' }],
    notes: 'Owner catalogue 2026-11-19 (RM-019, 5 copies). A normal encounter: Attack, Wait or Flee, then a monster card read on this type row. Draft until the owner approves.' },
  { id: 'ROOM_020', copies: 4, status: 'draft', name: 'Orc', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: false, monster: 'S12' }],
    notes: 'Owner catalogue 2026-11-19 (RM-020, 4 copies). A normal encounter: Attack, Wait or Flee, then a monster card read on this type row. Draft until the owner approves.' },
  { id: 'ROOM_021', copies: 2, status: 'draft', name: 'Ambush orc', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: true, monster: 'S12' }],
    notes: 'Owner catalogue 2026-11-19 (RM-021, 2 copies). Ambush: D12 minus Luck first, then Attack or Flee (existing ambush flow, R78). Draft until the owner approves.' },
  { id: 'ROOM_022', copies: 4, status: 'draft', name: 'Fallen warrior', text: '', deck: 'ROOM', kind: 'branch', effects: [{ op: 'REQUEST_CHOICE', options: [{ label: 'Search the body', effects: [{ op: 'DRAW_CARD', deck: 'SEARCH', then: 'resolve' }] }, { label: 'Leave it', effects: [] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-022, 4 copies). Optional draw (plan D61; 2023 rules box after 8.1). Draft until the owner approves.' },
  { id: 'ROOM_023', copies: 1, status: 'draft', name: 'Vampire bats', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -2 } }],
    notes: 'Owner catalogue 2026-11-19 (RM-023). Draft until the owner approves.' },
  { id: 'ROOM_024', copies: 1, status: 'draft', name: 'Vampire bats', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -3 } }],
    notes: 'Owner catalogue 2026-11-19 (RM-024). Draft until the owner approves.' },
  { id: 'ROOM_025', copies: 2, status: 'draft', name: 'Giant spider', text: '', deck: 'ROOM', kind: 'event', effects: [{ op: 'REQUEST_CHOICE', options: [{ label: 'Fight', effects: [{ op: 'NAME_NUMBERS', count: 3, label: 'Fight the giant spider', onMatch: [], onMiss: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }, { op: 'SET_CONDITION', id: 'spider', label: 'Fighting a giant spider', turns: null, onTurnStart: [{ op: 'NAME_NUMBERS', count: 3, label: 'Fight the giant spider', onMatch: [{ op: 'CLEAR_CONDITION', id: 'spider' }, { op: 'END_TURN' }], onMiss: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }, { op: 'END_TURN' }] }] }] }] }, { label: 'Flee', requires: 'can-flee', effects: [{ op: 'ROLL_TABLE', die: 'D6', rows: [{ min: 1, max: 2, effects: [{ op: 'NAME_NUMBERS', count: 3, label: 'Fight the giant spider', onMatch: [], onMiss: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }, { op: 'SET_CONDITION', id: 'spider', label: 'Fighting a giant spider', turns: null, onTurnStart: [{ op: 'NAME_NUMBERS', count: 3, label: 'Fight the giant spider', onMatch: [{ op: 'CLEAR_CONDITION', id: 'spider' }, { op: 'END_TURN' }], onMiss: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: 1 }, { op: 'END_TURN' }] }] }] }] }, { min: 3, max: 6, effects: [{ op: 'FLEE' }] }] }] }] }],
    notes: 'Owner catalogue 2026-11-19 (RM-025, 2 copies). Its own event, not A/B/C combat. Flee (only with a way back) succeeds on a D6 of 3-6, else the fight. Fight: name three numbers and roll a D6; a match kills it, a miss costs 1 HP and the fight goes on at the start of the next turn (plan D58). Draft until the owner approves.' },
  { id: 'ROOM_026', copies: 3, status: 'draft', name: 'Mountain troll', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: false, monster: 'S10' }],
    notes: 'Owner catalogue 2026-11-19 (RM-026, 3 copies). A normal encounter: Attack, Wait or Flee, then a monster card read on this type row. Draft until the owner approves.' },
  { id: 'ROOM_027', copies: 1, status: 'draft', name: 'Ambush mountain troll', text: '', deck: 'ROOM', kind: 'monster', effects: [{ op: 'MONSTER_ENCOUNTER', ambush: true, monster: 'S10' }],
    notes: 'Owner catalogue 2026-11-19 (RM-027). Ambush: D12 minus Luck first, then Attack or Flee (existing ambush flow, R78). Draft until the owner approves.' },
];
