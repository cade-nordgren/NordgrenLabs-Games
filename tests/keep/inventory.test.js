// Items and inventory, owner spec v3 section 4. Fixture cards (including the synthetic FX_ROOM_SALVE,
// FX_ROOM_SPEAR and FX_ROOM_RELIC) are NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../site/keep/engine/view.js';
import { validateContent } from '../../site/keep/content/schema.js';
import { FX, setup, act, acts, place, putHero, give, dice, assertCensus, EMPTY_ROOMS } from './helpers.js';

const items = (g, kind) => g.log.filter(e => e.kind === 'item' && (!kind || e.action === kind));

test('v3 inventory: five groups; each kept card keeps its source deck, identity, owner and use data; others see chamber cards as a count; obtaining is logged', () => {
  let g = setup({ players: 2, towers: [0, 1], heroes: ['FX_HERO_2'], deckOrders: { ROOM: ['FX_ROOM_COINS', ...EMPTY_ROOMS] } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  g = act(g, 'MOVE', { dir: 'S' }); // the room card is kept treasure (RETAIN_HELD)
  give(g, 0, 'TREASURY', 'FX_TREASURY_B');
  give(g, 0, 'ROOM', 'FX_ROOM_RELIC');
  const inv = view(g, FX, 0).heroes[0].inventory;
  assert.deepEqual(Object.keys(inv), ['equipment', 'ring', 'items', 'treasure', 'chamber']);
  assert.deepEqual(inv.equipment.map(e => [e.id, e.source, e.usesLeft, e.usable]), [['FX_XBOW_1', 'specialWeapons', 1, false]], "the hunter's own special weapon");
  assert.match(inv.equipment[0].reason, /before a monster is revealed/);
  assert.equal(inv.ring.id, g.seats[0].ringId, 'the ring from the reverse-order draft');
  assert.match(inv.ring.reason, /pending/);
  const coins = inv.treasure[0];
  assert.deepEqual([coins.inst, coins.id, coins.deck, coins.owner, coins.gold, coins.usable], ['FX_ROOM_COINS#1', 'FX_ROOM_COINS', 'ROOM', 0, 7, false]);
  assert.match(coins.reason, /gold counts if you escape/);
  const relic = inv.items[0];
  assert.deepEqual([relic.id, relic.specialWeapon, relic.pending, relic.use, relic.usable], ['FX_ROOM_RELIC', true, true, null, false], 'effect not supplied: pending, never invented');
  assert.match(relic.reason, /pending/);
  assert.deepEqual(inv.chamber.map(c => [c.inst, c.id, c.group, c.deck, c.gold]), [[g.heroes[0].treasury[0], 'FX_TREASURY_B', 'chamber', 'TREASURY', 20]]);
  // Another seat: held cards are public (D25), chamber cards a count only.
  const other = view(g, FX, 1).heroes[0].inventory;
  assert.equal(other.chamber, 1);
  assert.equal(other.treasure[0].id, 'FX_ROOM_COINS');
  assert.equal(view(g, FX, null).heroes[0].inventory.chamber, 1);
  const got = items(g, 'obtain');
  assert.deepEqual(got.map(e => [e.value, e.group, e.seat]), [['FX_ROOM_COINS#1', 'treasure', 0]], 'obtaining is logged');
});

test('v3 Use only where card data allows it now; a one-use item resolves and goes under its own deck; use and discard are logged', () => {
  let g = setup({ players: 2, towers: [0, 1] });
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,1');
  for (const id of ['FX_ROOM_SALVE', 'FX_ROOM_SPEAR', 'FX_ROOM_RELIC']) give(g, 0, 'ROOM', id);
  g.heroes[0].hp = 10;
  assert.deepEqual(acts(g).filter(a => a.type === 'USE_ITEM'), [{ type: 'USE_ITEM', seat: 0, item: 'FX_ROOM_SALVE#1' }], 'only the turn-action item');
  const inv = view(g, FX, 0).heroes[0].inventory.items;
  assert.deepEqual(inv.map(i => [i.id, i.usable]), [['FX_ROOM_SALVE', true], ['FX_ROOM_SPEAR', false], ['FX_ROOM_RELIC', false]]);
  assert.deepEqual(inv[0].actions, [{ type: 'USE_ITEM', seat: 0, item: 'FX_ROOM_SALVE#1' }]);
  assert.match(inv[1].reason, /special weapon, before a monster is revealed/);
  // Not this seat's turn: no Use, with the reason.
  const theirs = view(g, FX, 1).heroes[1];
  assert.equal(theirs.inventory.items.length, 0);
  g = act(g, 'USE_ITEM', { item: 'FX_ROOM_SALVE#1' });
  assert.equal(g.heroes[0].hp, 12, 'its own effect: heal 2');
  assert.deepEqual(g.heroes[0].held, ['FX_ROOM_SPEAR#1', 'FX_ROOM_RELIC#1']);
  assert.equal(g.decks.ROOM.order.at(-1), 'FX_ROOM_SALVE#1', 'afterUse bottom: under its own deck');
  assert.deepEqual(items(g).map(e => [e.action, e.value, e.to]), [['use', 'FX_ROOM_SALVE#1', undefined], ['discard', 'FX_ROOM_SALVE#1', 'bottom of ROOM']]);
  assert.equal(g.activeSeat, 1, "a turn-action use is the turn's action");
  assertCensus(assert, g);
});

test('v3 special weapon card: offered before the reveal only when held and allowed, reads the Attack reaction, kept when its data says keep; in an ambush too (D41, spec v4)', () => {
  const meet = (room, held) => {
    let g = setup({ players: 2, towers: [0, 1], deckOrders: { ROOM: [room, ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] }, script: [5] });
    place(g, '1,0', 'FX_CROSS');
    place(g, '1,1', 'FX_CROSS');
    putHero(g, 0, '1,0');
    for (const id of held) give(g, 0, 'ROOM', id);
    return act(g, 'MOVE', { dir: 'S' });
  };
  const responses = g => acts(g).filter(a => a.type === 'RESPOND').map(a => a.item ? `special:${a.item}` : a.choice);
  assert.deepEqual(responses(meet('FX_ROOM_MONSTER', ['FX_ROOM_RELIC'])), ['attack', 'wait', 'flee'], 'a pending weapon is not usable');
  let g = meet('FX_ROOM_MONSTER', ['FX_ROOM_SPEAR', 'FX_ROOM_RELIC']);
  assert.deepEqual(responses(g), ['attack', 'wait', 'flee', 'special:FX_ROOM_SPEAR#1']);
  assert.equal(view(g, FX, 0).heroes[0].inventory.items[0].usable, true);
  g = act(g, 'RESPOND', { choice: 'special', item: 'FX_ROOM_SPEAR#1' });
  assert.equal(g.encounter.reaction.type, 'combat', "the BRUTE's Attack reaction");
  g = act(g, 'ANNOUNCE');
  assert.equal(g.encounter.monster.wounds, 1, 'its own effect: 1 damage');
  assert.deepEqual(g.heroes[0].held, ['FX_ROOM_SPEAR#1', 'FX_ROOM_RELIC#1'], 'afterUse keep: not consumed');
  assert.deepEqual(items(g, 'use').map(e => e.value), ['FX_ROOM_SPEAR#1']);
  assert.deepEqual(responses(meet('FX_ROOM_AMBUSH', ['FX_ROOM_SPEAR'])), ['attack', 'flee', 'special:FX_ROOM_SPEAR#1'], 'ambush: Attack, Flee or the weapon, never Wait (D41)');

});

test('v3 escape scores retained treasure: ordinary loot and treasure-chamber cards both count', () => {
  let g = setup();
  place(g, '1,0', 'FX_CROSS');
  putHero(g, 0, '1,0', '1,1');
  g.heroes[0].status = 'EXPLORING';
  give(g, 0, 'ROOM', 'FX_ROOM_COINS'); // 7
  give(g, 0, 'TREASURY', 'FX_TREASURY_B'); // 20
  give(g, 0, 'ROOM', 'FX_ROOM_RELIC'); // 0
  g = act(g, 'MOVE', { dir: 'W' });
  g = act(g, 'TOWER_CHOICE', { choice: 'ESCAPE' });
  assert.equal(g.status, 'over');
  assert.deepEqual(g.result.escaped.map(e => [e.seat, e.gold]), [[0, 27]]);
});

test('v3 well: +1 per chamber card on the jump; discarding first lowers it, goes under the treasury deck, and is logged privately', () => {
  let g = setup({ players: 2, towers: [0, 1], tileOrder: [], script: [] });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_WELL');
  putHero(g, 0, '1,1', '1,0');
  give(g, 0, 'TREASURY', 'FX_TREASURY_A');
  give(g, 0, 'TREASURY', 'FX_TREASURY_C');
  give(g, 0, 'ROOM', 'FX_ROOM_COINS');
  Object.assign(g.heroes[0], { enteredFrom: 'N', conditions: [{ id: 'well-edge', turns: null }] });
  Object.assign(g, { phase: 'TURN_START', pending: { kind: 'well-edge', seat: 0 } });
  g.turn.stage = 'act';
  const v = view(g, FX, 0);
  assert.equal(v.pendingTests.find(t => t.action.type === 'WELL_JUMP').modifier, 2, 'chamber cards only; ordinary loot adds nothing');
  assert.deepEqual(v.heroes[0].inventory.chamber.map(c => c.actions.map(a => a.type)), [['WELL_DISCARD'], ['WELL_DISCARD']], 'discard offered on each chamber card');
  const drop = g.heroes[0].treasury[0];
  g = act(g, 'WELL_DISCARD', { card: drop });
  assert.equal(g.decks.TREASURY.order.at(-1), drop);
  const d = items(g, 'discard').at(-1);
  assert.deepEqual([d.value, d.group, d.to, d.private], [drop, 'chamber', 'bottom of TREASURY', 0]);
  assert.equal(view(g, FX, 1).log.find(e => e.kind === 'item').value, 'hidden', 'others do not learn which card');
  assert.equal(view(g, FX, 0).pendingTests.find(t => t.action.type === 'WELL_JUMP').modifier, 1);
  dice(g, 4);
  g = act(g, 'WELL_JUMP');
  assert.equal(g.log.filter(e => e.kind === 'test').at(-1).arithmetic, 'D12 4 + 1 (treasure chamber cards carried) = 5 > AGI 4: fail');
});

test('v3 dragon wake: chamber cards of heroes inside go to the bottom of the treasure-chamber deck; ordinary treasure, items and rings stay; heroes outside keep theirs', () => {
  let g = setup({ players: 2, towers: [0, 1], script: [3], deckOrders: { ROOM: EMPTY_ROOMS, DRAGON: [['FX_DRAGON_AWAKE']] } });
  place(g, '4,4', 'FX_CROSS');
  putHero(g, 0, '4,4');
  give(g, 0, 'ROOM', 'FX_ROOM_COINS');
  give(g, 0, 'ROOM', 'FX_ROOM_SPEAR');
  give(g, 0, 'TREASURY', 'FX_TREASURY_A');
  give(g, 1, 'TREASURY', 'FX_TREASURY_B');
  const ring = g.seats[0].ringId;
  g = act(g, 'MOVE', { dir: 'S' }); // two more chamber cards, then the awake dragon card
  assert.equal(g.phase, 'FORCED_MOVE');
  const lost = items(g, 'lose');
  assert.equal(lost.length, 3);
  assert.ok(lost.every(e => e.why === 'dragon' && e.group === 'chamber' && e.to === 'bottom of TREASURY'));
  assert.deepEqual(g.decks.TREASURY.order.slice(-3), lost.map(e => e.value), 'under the treasure-chamber deck, in order');
  assert.deepEqual(g.heroes[0].treasury, []);
  assert.deepEqual(g.heroes[0].held, ['FX_ROOM_COINS#1', 'FX_ROOM_SPEAR#1'], 'ordinary treasure and items are not removed');
  assert.equal(g.seats[0].ringId, ring);
  assert.ok(g.heroes[1].treasury.length === 1 && g.heroes[1].treasury[0].startsWith('FX_TREASURY_B#'), 'a hero outside the chamber keeps theirs');
  assertCensus(assert, g);
});

test('v3 content: a card use block is validated; a special weapon use needs specialWeapon: true', () => {
  const withRoom = over => ({ ...FX, room: [...FX.room, { ...FX.room[0], id: 'FX_BAD_USE', ...over }] });
  const errs = c => validateContent(c).errors.map(e => e.message).join(' | ');
  assert.match(errs(withRoom({ use: { timing: 'any-time', effects: [] } })), /FX_BAD_USE: use timing any-time/);
  assert.match(errs(withRoom({ use: { timing: 'encounter-special', effects: [] } })), /FX_BAD_USE: use timing encounter-special needs specialWeapon: true/);
  assert.match(errs(withRoom({ use: { timing: 'turn-action', effects: [{ op: 'NOPE' }], afterUse: 'burn', uses: 0 } })), /afterUse burn.*uses must be.*use: unknown effect op NOPE/);
  assert.deepEqual(validateContent(FX).errors, []);
});
