// EXAMPLE ONLY, NOT REAL CONTENT, NOT AUTHENTIC. Test sample for tests/keep/kit.test.js.
const card = over => ({ copies: 1, status: 'draft', name: '', deck: 'ROOM', kind: 'empty', gold: 0, effects: [], followUpDeck: null, turnDisposition: 'end-turn', cardDisposition: 'UNDER_SAME_DECK', privacy: 'public', specialWeapon: false, ...over });
export default [
  card({ id: 'ROOM_001', copies: 2, status: 'approved', name: 'Example dusty hall', text: 'Example wording: dust, and nothing else.' }),
  card({ id: 'ROOM_002', name: 'Example loose stone', kind: 'trap', effects: [{ op: 'CHECK_STAT', stat: 'AGI', modifier: 0, onPass: [], onFail: [{ op: 'DEAL_DAMAGE', target: 'hero', amount: { die: 'D6', plus: -2 } }] }] }),
];
