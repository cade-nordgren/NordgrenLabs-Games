// Tile orientation and side resolution (system 3, placement part; RB 5, RB 6.9, SP 4, SP 5).
// Dot behaviour and special rooms (yellow, red, blue, well, rotating, rubble),
// doors and gates are M2; they hook in where the reducer resolves tile entry.

export const SIDES = ['N', 'E', 'S', 'W'];
export const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' };
const idx = s => SIDES.indexOf(s);

// Clockwise rotation (0/90/180/270) that puts the reference entrySide on boardSide.
export const rotationFor = (entrySide, boardSide) => ((idx(boardSide) - idx(entrySide) + 4) % 4) * 90;

// The feature a placed tile shows on a board side, given its rotation.
export const sideOnBoard = (def, rotation, side) => def.sides[SIDES[(idx(side) - rotation / 90 + 4) % 4]];

// One slot per physical tile: definitions expand by copies into TILE_001..TILE_nnn.
export function tileSlots(tiles) {
  const slots = [];
  for (const def of tiles) for (let i = 0; i < def.copies; i++) slots.push({ slotId: `TILE_${String(slots.length + 1).padStart(3, '0')}`, defId: def.id });
  return slots;
}
