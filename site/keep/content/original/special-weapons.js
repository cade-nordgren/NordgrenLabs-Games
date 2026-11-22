// Special weapon cards: 2 cards. Your own original content, never a copy of a published game's special weapon cards.
// How to fill this in: docs/content-kit/README.md, section "Special weapon cards".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new special-weapons
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'XBOW_1',                 // a free id from XBOW_1 to XBOW_2
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   heroIds: ['HERO_1'],          // the heroes who may use it (they must exist in heroes.js)
//   effects: [],                  // what happens when the hero declares the special weapon
//   uses: null,                   // null for no limit, or how many times per game
//   art: null,                    // later: a picture file, or null
// },
// SKELETON END

export default [
  { id: 'XBOW_1', copies: 1, status: 'draft', name: 'Crossbow', text: '',
    notes: 'Owner-verified rules, 2026-11-19 (spec v5): 4 shots, one per firing; D6 1-3 miss, 4-5 a second D6 and floor(second / 2) damage, 6 kills; a surviving monster answers with its Attack reaction. No reload. Draft until the owner approves.',
    heroIds: ['HERO_5'], verb: 'Shoot', unit: 'shot', uses: 4, art: null,
    effects: [{ op: 'ROLL_TABLE', die: 'D6', rows: [
      { min: 1, max: 3, effects: [] },
      { min: 4, max: 5, effects: [{ op: 'ROLL_D6', store: 'second' }, { op: 'DEAL_DAMAGE', target: 'monster', amount: { reg: 'second', div: 2 } }] },
      { min: 6, max: 6, effects: [{ op: 'KILL_MONSTER' }] },
    ] }] },
  { id: 'XBOW_2', copies: 1, status: 'draft', name: 'Crossbow', text: '',
    notes: 'Owner-verified rules, 2026-11-19 (spec v5): 4 shots, one per firing; D6 1-3 miss, 4-5 a second D6 and floor(second / 2) damage, 6 kills; a surviving monster answers with its Attack reaction. No reload. Draft until the owner approves.',
    heroIds: ['HERO_6'], verb: 'Shoot', unit: 'shot', uses: 4, art: null,
    effects: [{ op: 'ROLL_TABLE', die: 'D6', rows: [
      { min: 1, max: 3, effects: [] },
      { min: 4, max: 5, effects: [{ op: 'ROLL_D6', store: 'second' }, { op: 'DEAL_DAMAGE', target: 'monster', amount: { reg: 'second', div: 2 } }] },
      { min: 6, max: 6, effects: [{ op: 'KILL_MONSTER' }] },
    ] }] },
];
