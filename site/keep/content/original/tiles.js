// Maze tiles: 88 tiles. Your own original content, never a copy of a published game's tiles.
// How to fill this in: docs/content-kit/README.md, section "Maze tiles".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new tiles
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'TILE_001',               // a free id from TILE_001 to TILE_088
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' }, // each 'wall' | 'open' | 'door' | 'gate', with the dot side as you say below
//   entrySide: 'S',               // the side with the entry dot: 'N' | 'E' | 'S' | 'W'; must be 'open' (see the guide)
//   mark: 'black',                // dot type: 'black' | 'red' | 'yellow' | 'blue' | 'none'
//   special: 'none',              // 'none' | 'well' | 'rotating' | 'rubble'
//   effects: [],                  // extra printed effects (stored; the engine does not run tile effects yet)
//   art: null,                    // later: a picture file, or null
// },
// SKELETON END

export default [
  { id: 'TILE_001', copies: 3, status: 'approved', name: 'black corner WOOW',
    notes: 'From gametable file names: black_corner_none_WOOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_002', copies: 5, status: 'approved', name: 'black corner WWOO',
    notes: 'From gametable file names: black_corner_none_WWOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'wall', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_003', copies: 3, status: 'approved', name: 'black deadend WWOW',
    notes: 'From gametable file names: black_deadend_none_WWOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_004', copies: 2, status: 'approved', name: 'black fourway DDOD',
    notes: 'From gametable file names: black_fourway_none_DDOD_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'door', E: 'door', S: 'open', W: 'door' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_005', copies: 4, status: 'approved', name: 'black fourway DOOO',
    notes: 'From gametable file names: black_fourway_none_DOOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'door', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_006', copies: 15, status: 'approved', name: 'black fourway OOOO',
    notes: 'From gametable file names: black_fourway_none_OOOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_007', copies: 7, status: 'approved', name: 'black straight OWOW',
    notes: 'From gametable file names: black_straight_none_OWOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_008', copies: 2, status: 'approved', name: 'black threeway DOOW',
    notes: 'From gametable file names: black_threeway_none_DOOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'door', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_009', copies: 2, status: 'approved', name: 'black threeway DWOO',
    notes: 'From gametable file names: black_threeway_none_DWOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'door', E: 'wall', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_010', copies: 5, status: 'approved', name: 'black threeway OOOW',
    notes: 'From gametable file names: black_threeway_none_OOOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_011', copies: 7, status: 'approved', name: 'black threeway OWOO',
    notes: 'From gametable file names: black_threeway_none_OWOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_012', copies: 9, status: 'approved', name: 'black threeway WOOO',
    notes: 'From gametable file names: black_threeway_none_WOOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'black', special: 'none', effects: [], art: null },
  { id: 'TILE_013', copies: 2, status: 'approved', name: 'blue dark room threeway WOOO',
    notes: 'From gametable file names: blue_threeway_dark_WOOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'blue', special: 'none', effects: [], art: null },
  { id: 'TILE_014', copies: 1, status: 'approved', name: 'rotating room deadend WWOW',
    notes: 'From gametable file names: none_deadend_rotate_WWOW_none (sides listed top, right, bottom, left). No entry dot in the source; the open bottom side is used.',
    sides: { N: 'wall', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'none', special: 'rotating', effects: [], art: null },
  { id: 'TILE_015', copies: 1, status: 'approved', name: 'rubble fourway OOOO',
    notes: 'From gametable file names: none_fourway_debris_OOOO_none (sides listed top, right, bottom, left). No entry dot in the source; the open bottom side is used.',
    sides: { N: 'open', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'none', special: 'rubble', effects: [], art: null },
  { id: 'TILE_016', copies: 1, status: 'approved', name: 'rubble straight OWOW',
    notes: 'From gametable file names: none_straight_debris_OWOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'none', special: 'rubble', effects: [], art: null },
  { id: 'TILE_017', copies: 1, status: 'approved', name: 'well straight OWOW',
    notes: 'From gametable file names: none_straight_pit_OWOW_none (sides listed top, right, bottom, left). No entry dot in the source; the open bottom side is used.',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'none', special: 'well', effects: [], art: null },
  { id: 'TILE_018', copies: 1, status: 'approved', name: 'red corner WOGW',
    notes: 'From gametable file names: red_corner_none_WOGW_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_019', copies: 1, status: 'approved', name: 'red corner WWGO',
    notes: 'From gametable file names: red_corner_none_WWGO_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'wall', E: 'wall', S: 'open', W: 'open' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_020', copies: 1, status: 'approved', name: 'red deadend WWGW',
    notes: 'From gametable file names: red_deadend_none_WWGW_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'wall', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_021', copies: 1, status: 'approved', name: 'red fourway OOGO',
    notes: 'From gametable file names: red_fourway_none_OOGO_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'open', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_022', copies: 2, status: 'approved', name: 'red straight DWGW',
    notes: 'From gametable file names: red_straight_none_DWGW_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'door', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_023', copies: 1, status: 'approved', name: 'red straight OWGW',
    notes: 'From gametable file names: red_straight_none_OWGW_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_024', copies: 1, status: 'approved', name: 'red threeway WOGO',
    notes: 'From gametable file names: red_threeway_none_WOGO_bottom (sides listed top, right, bottom, left). The G on the entry side is the portcullis that falls behind the hero; the engine adds it for a red mark.',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'red', special: 'none', effects: [], art: null },
  { id: 'TILE_025', copies: 1, status: 'approved', name: 'yellow corner WOOW',
    notes: 'From gametable file names: yellow_corner_none_WOOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
  { id: 'TILE_026', copies: 2, status: 'approved', name: 'yellow corner WWOO',
    notes: 'From gametable file names: yellow_corner_none_WWOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'wall', S: 'open', W: 'open' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
  { id: 'TILE_027', copies: 1, status: 'approved', name: 'yellow fourway OOOO',
    notes: 'From gametable file names: yellow_fourway_none_OOOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
  { id: 'TILE_028', copies: 2, status: 'approved', name: 'yellow straight OWOW',
    notes: 'From gametable file names: yellow_straight_none_OWOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
  { id: 'TILE_029', copies: 1, status: 'approved', name: 'yellow threeway OOOW',
    notes: 'From gametable file names: yellow_threeway_none_OOOW_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'open', S: 'open', W: 'wall' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
  { id: 'TILE_030', copies: 1, status: 'approved', name: 'yellow threeway OWOO',
    notes: 'From gametable file names: yellow_threeway_none_OWOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'open', E: 'wall', S: 'open', W: 'open' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
  { id: 'TILE_031', copies: 2, status: 'approved', name: 'yellow threeway WOOO',
    notes: 'From gametable file names: yellow_threeway_none_WOOO_bottom (sides listed top, right, bottom, left).',
    sides: { N: 'wall', E: 'open', S: 'open', W: 'open' }, entrySide: 'S', mark: 'yellow', special: 'none', effects: [], art: null },
];
