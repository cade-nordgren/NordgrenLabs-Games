// Board: exactly one. Your own original layout, never a copy of a published game's board.
// How to fill this in: docs/content-kit/README.md, section "Board".
// Check it with:  node tools/keep-content.js check
// This file holds one entry or null. To start, run  node tools/keep-content.js new board
// (or replace null below with a copy of the skeleton, without the // marks).
//
// SKELETON START (a commented-out entry showing every field)
// {
//   id: 'BOARD_01',               // always 'BOARD_01'
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // optional
//   text: '',                     // optional: your own wording
//   notes: '',                    // optional: notes to yourself, never shown
//   width: 10, height: 11,        // squares across and down: 110 in all, 10 x 11 or 11 x 10
//   towers: [                     // the four corners, x from 0 (west) and y from 0 (north)
//     { x: 0, y: 0, sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' } },
//     { x: 9, y: 0, sides: { N: 'wall', E: 'wall', S: 'open', W: 'open' } },
//     { x: 0, y: 10, sides: { N: 'open', E: 'open', S: 'wall', W: 'wall' } },
//     { x: 9, y: 10, sides: { N: 'open', E: 'wall', S: 'wall', W: 'open' } },
//   ],
//   center: [{ x: 4, y: 5 }, { x: 5, y: 5 }], // the chamber: one room over the two middle squares (open on every outer side)
//   walls: [],                    // printed walls between squares, as 'x,y|SIDE', for example '3,2|E'
//   edges: {},                    // other fixed edges printed on the board, { 'x,y|SIDE': 'wall' | 'door' | 'gate' }
// }
// SKELETON END

export default null;
