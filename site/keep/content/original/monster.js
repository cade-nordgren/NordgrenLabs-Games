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
//   hp: 1,                        // hit points, 1 or more
//   groupId: 'S09',               // the monster-group combat set it fights with: 'S09' | 'S10' | 'S11' | 'S12'
//   reactions: {                  // what the monster does for each hero choice (Special weapon uses attack)
//     attack: { type: 'combat', damage: null, effects: [] },
//     wait:   { type: 'combat', damage: null, effects: [] },
//     flee:   { type: 'flight-succeeds', damage: null, effects: [] },
//     // type: 'monster-flees' | 'combat' | 'strike-then-combat' | 'strike-then-flight' (flee only)
//     //       | 'flight-succeeds' (flee only) | 'other'; damage: a number or dice for the strike types, else null
//   },
//   art: null,                    // later: a picture file, or null
// },
// SKELETON END

export default [
];
