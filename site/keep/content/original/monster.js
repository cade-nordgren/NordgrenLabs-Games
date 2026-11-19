// Monster cards: 15 cards. Your own original content, never a copy of a published game's monster cards.
// How to fill this in: docs/content-kit/README.md, section "Monster cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new monster
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'MONSTER_001',            // a free id from MONSTER_001 to MONSTER_015
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   deck: 'MONSTER',              // always 'MONSTER' in this file
//   rows: {                       // one row per monster type; a type is a monster-group combat set: 'S09' | 'S10' | 'S11' | 'S12'
//     S09: {                      // what this monster type does for each hero choice (Special weapon uses attack)
//       attack: { type: 'combat', hp: 1, damage: null, effects: [] },
//       wait:   { type: 'monster-flees', damage: null, effects: [] },
//       flee:   { type: 'flight-succeeds', damage: null, effects: [] },
//     },
//     // S10: { attack: ..., wait: ..., flee: ... }, and so on for every type a room card can name
//     // type: 'monster-flees' | 'combat' | 'strike-then-combat' | 'strike-then-flight' (flee only)
//     //       | 'flight-succeeds' (flee only) | 'other'; damage: a number or dice for the strike types, else null
//     // hp: the monster's hit points in that fight, needed for 'combat' and 'strike-then-combat'
//   },
//   art: null,                    // later: a picture file, or null
// },
// SKELETON END

export default [
  { id: 'MONSTER_001', copies: 1, status: 'draft', name: 'Monster card 1', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 1, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'strike-then-combat', damage: 1, hp: 1 } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -2 }, hp: 3 } },
      S12: { attack: { type: 'monster-flees' }, wait: { type: 'combat', hp: 6 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: 0 }, hp: 5 } },
    } },
  { id: 'MONSTER_002', copies: 1, status: 'draft', name: 'Monster card 2', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 2, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 1 }, flee: { type: 'strike-then-combat', damage: 1, hp: 1 } },
      S10: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 2 }, flee: { type: 'flight-succeeds' } },
      S12: { attack: { type: 'combat', hp: 5 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -2 }, hp: 5 } },
    } },
  { id: 'MONSTER_003', copies: 1, status: 'draft', name: 'Monster card 3', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 3, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S10: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 5 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-flight', damage: { die: 'D6', plus: -3 } } },
      S12: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, hp: 4 } },
    } },
  { id: 'MONSTER_004', copies: 1, status: 'draft', name: 'Monster card 4', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 4, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, hp: 2 } },
      S10: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 5 }, flee: { type: 'strike-then-combat', damage: { die: 'D12', plus: -4 }, hp: 4 } },
      S11: { attack: { type: 'combat', hp: 5 }, wait: { type: 'combat', hp: 5 }, flee: { type: 'strike-then-combat', damage: 2, hp: 3 } },
      S12: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, hp: 5 } },
    } },
  { id: 'MONSTER_005', copies: 1, status: 'draft', name: 'Monster card 5', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 5, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'strike-then-combat', damage: 1, hp: 1 } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 5 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-flight', damage: { die: 'D6', plus: -3 } } },
      S12: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
    } },
  { id: 'MONSTER_006', copies: 1, status: 'draft', name: 'Monster card 6', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 6, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. NEEDS OWNER CONFIRMATION: the card prints FP, not KP, in the HP position of Flee/Skeleton; read here as the monster HP (plan D51). Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-combat', damage: 3, hp: 2 } },
      S12: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-flight', damage: { die: 'D6', plus: 0 } } },
    } },
  { id: 'MONSTER_007', copies: 1, status: 'draft', name: 'Monster card 7', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 7, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S10: { attack: { type: 'combat', hp: 1 }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'flight-succeeds' } },
      S12: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, hp: 3 } },
    } },
  { id: 'MONSTER_008', copies: 1, status: 'draft', name: 'Monster card 8', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 8, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'combat', hp: 1 }, wait: { type: 'combat', hp: 1 }, flee: { type: 'combat', hp: 1 } },
      S10: { attack: { type: 'combat', hp: 1 }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S12: { attack: { type: 'combat', hp: 5 }, wait: { type: 'monster-flees' }, flee: { type: 'combat', hp: 3 } },
    } },
  { id: 'MONSTER_009', copies: 1, status: 'draft', name: 'Monster card 9', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 9, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S10: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-flight', damage: { die: 'D6', plus: -3 } } },
      S12: { attack: { type: 'monster-flees' }, wait: { type: 'combat', hp: 2 }, flee: { type: 'flight-succeeds' } },
    } },
  { id: 'MONSTER_010', copies: 1, status: 'draft', name: 'Monster card 10', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 10, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'combat', hp: 1 } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 5 }, wait: { type: 'combat', hp: 5 }, flee: { type: 'strike-then-flight', damage: { die: 'D6', plus: -3 } } },
      S12: { attack: { type: 'monster-flees' }, wait: { type: 'combat', hp: 1 }, flee: { type: 'flight-succeeds' } },
    } },
  { id: 'MONSTER_011', copies: 1, status: 'draft', name: 'Monster card 11', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 11, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 2 }, flee: { type: 'strike-then-combat', damage: 1, hp: 2 } },
      S10: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-combat', damage: { die: 'D12', plus: 0 }, hp: 3 } },
      S11: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'strike-then-combat', damage: 3, hp: 4 } },
      S12: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, hp: 2 } },
    } },
  { id: 'MONSTER_012', copies: 1, status: 'draft', name: 'Monster card 12', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 12, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'combat', hp: 1 } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'flight-succeeds' } },
      S12: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 2 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -2 }, hp: 2 } },
    } },
  { id: 'MONSTER_013', copies: 1, status: 'draft', name: 'Monster card 13', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 13, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'combat', hp: 4 }, wait: { type: 'combat', hp: 2 }, flee: { type: 'flight-succeeds' } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 2 }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'flight-succeeds' } },
      S12: { attack: { type: 'combat', hp: 3 }, wait: { type: 'combat', hp: 3 }, flee: { type: 'strike-then-flight', damage: { die: 'D6', plus: -1 } } },
    } },
  { id: 'MONSTER_014', copies: 1, status: 'draft', name: 'Monster card 14', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 14, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. NEEDS OWNER CONFIRMATION: the card prints FP, not KP, in the HP position of Flee/Orc; read here as the monster HP (plan D51). Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S10: { attack: { type: 'combat', hp: 2 }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 5 }, wait: { type: 'combat', hp: 4 }, flee: { type: 'flight-succeeds' } },
      S12: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -4 }, hp: 2 } },
    } },
  { id: 'MONSTER_015', copies: 1, status: 'draft', name: 'Monster card 15', text: '',
    notes: 'Owner catalogue 2026-11-19 (card 15, photographed): every cell as catalogued. Rows: S09 Dark Elf, S10 Mountain Troll, S11 Skeleton, S12 Orc. NEEDS OWNER CONFIRMATION: the card prints FP, not KP, in the HP position of Flee/Dark Elf and Flee/Skeleton; read here as the monster HP (plan D51). Draft until the owner approves.',
    deck: 'MONSTER', art: null, rows: {
      S09: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'strike-then-combat', damage: 1, hp: 1 } },
      S10: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
      S11: { attack: { type: 'combat', hp: 2 }, wait: { type: 'combat', hp: 2 }, flee: { type: 'strike-then-combat', damage: { die: 'D6', plus: -3 }, hp: 4 } },
      S12: { attack: { type: 'monster-flees' }, wait: { type: 'monster-flees' }, flee: { type: 'flight-succeeds' } },
    } },
];
