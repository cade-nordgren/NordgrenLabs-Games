// Combat cards: 36 cards in 12 sets of A, B and C. Your own original content, never a copy of a published game's combat cards.
// How to fill this in: docs/content-kit/README.md, section "Combat cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new combat
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'COMBAT_S01_A',           // a free id from COMBAT_S01_A to COMBAT_S12_C
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   setId: 'S01',                 // 'S01' to 'S08' are hero sets, 'S09' to 'S12' monster groups
//   owner: 'hero',                // 'hero' for S01-S08, 'monster-group' for S09-S12
//   letter: 'A',                  // 'A' | 'B' | 'C'; each set has exactly one of each
//   doubleAgainst: [],            // [] or the one letter this card beats, to hit it twice: A beats B, B beats C, C beats A
//   art: null,                    // later: a picture file, or null
// },
// SKELETON END

export default [
  { id: 'COMBAT_S01_A', copies: 1, status: 'draft', name: 'Sir Edric Vale, card A', setId: 'S01', owner: 'hero', letter: 'A', doubleAgainst: ['B'], art: null },
  { id: 'COMBAT_S01_B', copies: 1, status: 'draft', name: 'Sir Edric Vale, card B', setId: 'S01', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S01_C', copies: 1, status: 'draft', name: 'Sir Edric Vale, card C', setId: 'S01', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
  { id: 'COMBAT_S02_A', copies: 1, status: 'draft', name: 'Dame Elira Voss, card A', setId: 'S02', owner: 'hero', letter: 'A', doubleAgainst: ['B'], art: null },
  { id: 'COMBAT_S02_B', copies: 1, status: 'draft', name: 'Dame Elira Voss, card B', setId: 'S02', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S02_C', copies: 1, status: 'draft', name: 'Dame Elira Voss, card C', setId: 'S02', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
  { id: 'COMBAT_S03_A', copies: 1, status: 'draft', name: 'Halvar Ironfall, card A', setId: 'S03', owner: 'hero', letter: 'A', doubleAgainst: [], art: null },
  { id: 'COMBAT_S03_B', copies: 1, status: 'draft', name: 'Halvar Ironfall, card B', setId: 'S03', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S03_C', copies: 1, status: 'draft', name: 'Halvar Ironfall, card C', setId: 'S03', owner: 'hero', letter: 'C', doubleAgainst: ['A'], art: null },
  { id: 'COMBAT_S04_A', copies: 1, status: 'draft', name: 'Brynja Stonehand, card A', setId: 'S04', owner: 'hero', letter: 'A', doubleAgainst: [], art: null },
  { id: 'COMBAT_S04_B', copies: 1, status: 'draft', name: 'Brynja Stonehand, card B', setId: 'S04', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S04_C', copies: 1, status: 'draft', name: 'Brynja Stonehand, card C', setId: 'S04', owner: 'hero', letter: 'C', doubleAgainst: ['A'], art: null },
  { id: 'COMBAT_S05_A', copies: 1, status: 'draft', name: 'Rowan Fenmark, card A', setId: 'S05', owner: 'hero', letter: 'A', doubleAgainst: ['B'], art: null },
  { id: 'COMBAT_S05_B', copies: 1, status: 'draft', name: 'Rowan Fenmark, card B', setId: 'S05', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S05_C', copies: 1, status: 'draft', name: 'Rowan Fenmark, card C', setId: 'S05', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
  { id: 'COMBAT_S06_A', copies: 1, status: 'draft', name: 'Mira Quickthorn, card A', setId: 'S06', owner: 'hero', letter: 'A', doubleAgainst: ['B'], art: null },
  { id: 'COMBAT_S06_B', copies: 1, status: 'draft', name: 'Mira Quickthorn, card B', setId: 'S06', owner: 'hero', letter: 'B', doubleAgainst: [], art: null },
  { id: 'COMBAT_S06_C', copies: 1, status: 'draft', name: 'Mira Quickthorn, card C', setId: 'S06', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
  { id: 'COMBAT_S07_A', copies: 1, status: 'draft', name: 'Corin Ashveil, card A', setId: 'S07', owner: 'hero', letter: 'A', doubleAgainst: [], art: null },
  { id: 'COMBAT_S07_B', copies: 1, status: 'draft', name: 'Corin Ashveil, card B', setId: 'S07', owner: 'hero', letter: 'B', doubleAgainst: ['C'], art: null },
  { id: 'COMBAT_S07_C', copies: 1, status: 'draft', name: 'Corin Ashveil, card C', setId: 'S07', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
  { id: 'COMBAT_S08_A', copies: 1, status: 'draft', name: 'Talia Greyveil, card A', setId: 'S08', owner: 'hero', letter: 'A', doubleAgainst: [], art: null },
  { id: 'COMBAT_S08_B', copies: 1, status: 'draft', name: 'Talia Greyveil, card B', setId: 'S08', owner: 'hero', letter: 'B', doubleAgainst: ['C'], art: null },
  { id: 'COMBAT_S08_C', copies: 1, status: 'draft', name: 'Talia Greyveil, card C', setId: 'S08', owner: 'hero', letter: 'C', doubleAgainst: [], art: null },
];
