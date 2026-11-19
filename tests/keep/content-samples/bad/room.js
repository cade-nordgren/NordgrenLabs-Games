// EXAMPLE ONLY, NOT REAL CONTENT, NOT AUTHENTIC. Test sample for tests/keep/kit.test.js. Every entry here is wrong on purpose.
const card = over => ({ copies: 1, status: 'draft', name: '', deck: 'ROOM', kind: 'empty', gold: 0, effects: [], followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false, ...over });
export default [
  card({ id: 'ROOM_001', kind: 'gold' }),
  card({ id: 'ROOM_017', followUpDeck: 'TREASURY' }),
  card({ id: 'ROOM_999' }),
  card({ id: 'ROOM_003', text: 5 }),
  card({ id: 'ROOM_004', status: 'aproved' }),
  card({ id: 'ROOM_005', effects: [{ op: 'DEAL_DAMAGE', target: 'hero' }] }),
];
