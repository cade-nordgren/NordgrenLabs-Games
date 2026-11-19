// Hidden-information view, undo commit points, save/resume mid-encounter. T29 (engine part), T29b, T29c (SP 9, SP 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, serialize, restore } from '../../site/keep/engine/reducer.js';
import { view, canUndoTo, screenOwner } from '../../site/keep/engine/view.js';
import { FX, setup, act, acts, place, putHero, give, slotsOf, EMPTY_ROOMS } from './helpers.js';

function combatGame() {
  let g = setup({ players: 2, towers: [0, 1], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  place(g, '1,0', 'FX_CROSS');
  place(g, '1,1', 'FX_CROSS');
  putHero(g, 0, '1,0');
  give(g, 0, 'TREASURY', 'FX_TREASURY_B');
  give(g, 1, 'TREASURY', 'FX_TREASURY_A');
  give(g, 1, 'ROOM', 'FX_ROOM_COINS');
  g = act(g, 'MOVE', { dir: 'S' });
  return act(act(g, 'RESPOND', { choice: 'attack' }), 'ANNOUNCE');
}

test('T29b view hides tile bag and deck order, other heroes\' treasure-chamber cards, monster HP, the unrevealed pick; held loot stays public (SP 9, D25)', () => {
  let g = combatGame();
  g = act(g, 'COMBAT_PICK', { side: 'hero', letter: 'C' });
  const hero = view(g, FX, 0), ctrl = view(g, FX, 1), pub = view(g, FX, null);
  assert.equal(hero.rng, undefined, 'no seed, PRNG state or scripted future');
  assert.equal(typeof hero.board.tileBag, 'number');
  assert.deepEqual(Object.keys(hero.decks.ROOM), ['count', 'shuffles']);
  assert.equal(typeof hero.dragon.remaining, 'number');
  assert.deepEqual(hero.dragon.odds, { awake: 1, remaining: 8 });
  assert.equal(hero.heroes[0].treasury.length, 1, 'own chamber cards visible');
  assert.equal(hero.heroes[1].treasury, 1, 'another hero\'s are a count only');
  assert.deepEqual(hero.heroes[1].held, ['FX_ROOM_COINS#1'], 'D25: held loot is public');
  assert.equal(pub.heroes[0].treasury, 1);
  assert.equal(hero.encounter.monster.hp, undefined);
  assert.equal(hero.encounter.monster.wounds, undefined, 'spec v3: the damage tally belongs to the monster player (D37)');
  assert.equal(ctrl.encounter.monster.wounds, 0);
  assert.equal(ctrl.encounter.monster.hp, 4);
  assert.equal(hero.encounter.combat.heroPick, 'C');
  assert.equal(ctrl.encounter.combat.heroPick, 'hidden', 'the controller cannot see the hero\'s face-down card');
  const monsterDraw = hero.log.find(e => e.kind === 'draw' && e.deck === 'MONSTER');
  assert.equal(monsterDraw.value, 'hidden', 'the monster card is the controller\'s to read');
  assert.equal(ctrl.log.find(e => e.kind === 'draw' && e.deck === 'MONSTER').value, 'FX_MON_BRUTE#1');
  // Reverse order: the controller picks first.
  let h = act(combatGame(), 'COMBAT_PICK', { side: 'monster', letter: 'A' });
  assert.equal(view(h, FX, 0).encounter.combat.monsterPick, 'hidden');
  assert.equal(view(h, FX, 1).encounter.combat.monsterPick, 'A');
  // Treasure-chamber draws by another hero are blanked in the log.
  let c = setup({ players: 2, towers: [0, 1] });
  place(c, '2,1', 'FX_CROSS');
  putHero(c, 0, '2,1');
  c = act(c, 'MOVE', { dir: 'S' });
  assert.ok(view(c, FX, 1).log.filter(e => e.deck === 'TREASURY' && e.kind === 'draw').every(e => e.value === 'hidden'));
  assert.ok(view(c, FX, 0).log.filter(e => e.deck === 'TREASURY' && e.kind === 'draw').every(e => e.value !== 'hidden'));
});

test('T29c undo may only go back over uncommitted actions: no reroll, no redraw, no undoing a revealed exchange (D21)', () => {
  let g = setup({ tileOrder: slotsOf('FX_STRAIGHT').slice(0, 2) });
  const start = g;
  g = act(g, 'MOVE', { dir: 'S' }); // reveals a tile: commit
  assert.equal(canUndoTo(start, g), false, 'a revealed tile cannot be taken back');
  // A move into an already-revealed corridor rolls and draws nothing: undoable.
  let s = setup();
  place(s, '1,0', 'FX_STRAIGHT');
  place(s, '1,1', 'FX_STRAIGHT');
  putHero(s, 0, '1,0');
  const s1 = act(s, 'MOVE', { dir: 'S' });
  assert.equal(canUndoTo(s, s1), true, 'nothing hidden was revealed');
  // A hidden combat pick is undoable until the other side locks in and the exchange is revealed.
  const c0 = combatGame();
  const c1 = act(c0, 'COMBAT_PICK', { side: 'hero', letter: 'B' });
  assert.equal(canUndoTo(c0, c1), true);
  const c2 = act(c1, 'COMBAT_PICK', { side: 'monster', letter: 'C' });
  assert.equal(canUndoTo(c1, c2), false);
  assert.equal(canUndoTo(c0, c2), false);
  // A die roll is a commit too.
  let w = setup({ tileOrder: slotsOf('FX_DARK').slice(0, 1), script: [4] });
  w = act(w, 'MOVE', { dir: 'S' });
  const rolled = act(w, 'ROLL_DARK_EXIT');
  assert.equal(canUndoTo(w, rolled), false);
});

test('T29 engine part: save mid-combat with a hidden pick, restore, continue identically (SP 11, SP 12 #29)', () => {
  const g = act(combatGame(), 'COMBAT_PICK', { side: 'hero', letter: 'A' });
  const restored = restore(serialize(g), FX);
  assert.deepEqual(restored, g);
  assert.equal(restored.encounter.combat.heroPick, 'A');
  const next = a => reduce(a, acts(a).find(x => x.side === 'monster' && x.letter === 'C'), FX);
  assert.equal(serialize(next(restored)), serialize(next(g)));
  assert.throws(() => reduce(g, { type: 'COMBAT_PICK', seat: 0, side: 'hero', letter: 'B' }, FX), /Illegal/, 'no second pick by refresh or double click');
});

test('view gold: the holder sees the full total, everyone else only the public held loot (RB 1, D25)', () => {
  const g = setup({ players: 2, towers: [0, 1] });
  give(g, 0, 'TREASURY', 'FX_TREASURY_B'); // 20, private
  give(g, 0, 'ROOM', 'FX_ROOM_COINS');     // 7, public
  assert.equal(view(g, FX, 0).heroes[0].gold, 27);
  assert.equal(view(g, FX, 1).heroes[0].gold, 7);
  assert.equal(view(g, FX, null).heroes[0].gold, 7);
});

test('screenOwner: the controller reads the card, A/B/C picks one side at a time, solo always the player (RB 8.1, RB 8.4, plan 4.9)', () => {
  let g = combatGame();
  assert.equal(screenOwner(g), 0, 'the hero picks first');
  g = act(g, 'COMBAT_PICK', { side: 'hero', letter: 'A' });
  assert.equal(screenOwner(g), 1, 'then the controller');
  let r = setup({ players: 2, towers: [0, 1], deckOrders: { ROOM: ['FX_ROOM_MONSTER', ...EMPTY_ROOMS], MONSTER: ['FX_MON_BRUTE'] } });
  place(r, '1,0', 'FX_CROSS');
  place(r, '1,1', 'FX_CROSS');
  putHero(r, 0, '1,0');
  r = act(r, 'MOVE', { dir: 'S' });
  assert.equal(screenOwner(r), null, 'the commit is made at the shared table');
  r = act(r, 'RESPOND', { choice: 'attack' });
  assert.equal(screenOwner(r), 1, 'the right-hand player reads the card');
  assert.equal(screenOwner(setup()), 0);
});
