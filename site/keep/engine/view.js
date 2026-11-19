// Hidden-information projection and undo commit points (system 1/10; plan 4.3, 4.9; SP 9, SP 11).
// view(game, viewer) is what a given seat may see; the full state never goes to the screen.
import { wakeOdds } from './treasury.js';
import { heroGold } from './heroes.js';
import { cardDef } from './decks.js';
import { legalActions, searchUnavailable } from './phases.js';
import { actionTests } from './movement.js';
import { inventoryView } from './inventory.js';

// viewer: a seat number, or null for a public screen (nobody's private cards).
// debug (spec v2 #11, developer only): the full state, with deck orders, the RNG and every hidden card.
export function view(game, content, viewer = null, { debug = false } = {}) {
  if (debug) return { ...structuredClone(game), debug: true };
  const v = structuredClone(game);
  const solo = game.seats.length === 1;
  delete v.rng; // seed, PRNG state and any scripted dice or orders are the future
  if (v.board) v.board.tileBag = game.board.tileBag.length;
  if (v.decks) for (const cat of Object.keys(v.decks)) v.decks[cat] = { count: game.decks[cat].order.length, shuffles: game.decks[cat].shuffles };
  if (v.dragon) v.dragon = { remaining: game.dragon.remaining.length, aside: game.dragon.aside, resets: game.dragon.resets, odds: wakeOdds(game, content) };
  // RB 9.1, SP 9, D25: treasure-chamber cards are private to the holder; held loot stays public.
  // gold: what this viewer may know, the holder's full total, or only the public held loot for others.
  const heldGold = h => h.held.reduce((sum, inst) => sum + (cardDef(content, inst).gold || 0), 0);
  v.heroes = v.heroes.map(h => (!h ? h : h.seat !== viewer ? { ...h, treasury: h.treasury.length, gold: heldGold(h) } : { ...h, gold: heroGold(h, content) }));
  // Spec v3 section 4: each hero's inventory in five groups, with usable / reason per item.
  const legal = game.status === 'playing' ? legalActions(game, content) : [];
  // D39: the chamber is one room over two squares. Draw one outline around `bounds` (board squares) and put
  // the tokens of `seats` inside it, whichever half a hero's coord records.
  const cells = content.board.center;
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
  v.chamber = {
    cells: cells.map(c => ({ x: c.x, y: c.y })),
    bounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 },
    seats: game.heroes.filter(h => h?.coord && cells.some(c => c.x === h.coord.x && c.y === h.coord.y) && h.status !== 'DEAD' && h.status !== 'ESCAPED').map(h => h.seat),
  };
  v.heroes.forEach((h, seat) => { if (h) h.inventory = inventoryView(game, content, seat, viewer, legal); });
  const enc = v.encounter;
  if (enc) {
    // RB 8.1, RB 8.3: only the controller reads the card; the hero hears the announced reaction.
    // D37 (spec v3): the hero never sees the monster's card, HP or damage tally, solo included (there the
    // computer is the monster player). groupId stays: the monster's A/B/C cards are revealed in play.
    const isController = viewer === enc.controller && viewer !== enc.seat;
    if (enc.monster && !isController) {
      enc.monster = { groupId: enc.monster.groupId };
      if (!enc.announced) enc.reaction = null;
      else enc.reaction = { type: enc.reaction.type };
    }
    // RB 8.4: the other side's pick stays hidden until both are locked in.
    if (enc.combat) {
      const c = enc.combat;
      if (c.heroPick && viewer !== enc.seat) c.heroPick = 'hidden';
      if (c.monsterPick && !isController) c.monsterPick = 'hidden';
    }
  }
  // Drawn cards marked private (treasure-chamber cards, the monster card) are blanked for others.
  // Normal mode also drops the RNG calls (shuffles); debug mode keeps them.
  v.log = v.log.filter(e => e.kind !== 'shuffle').map(e => (e.private !== undefined && e.private !== viewer ? redact(e) : e));
  // Hidden choices in pending effects are fine to show: they are labels of the active hero's options.
  // Spec v3: every attribute test a legal action may roll, for a confirmation first (the shape of dice.testPreview).
  v.pendingTests = legal.flatMap(action => actionTests(game, content, action).map(t => ({ action, ...t })));
  // RB 7.1 (R55-R57): when the active hero is not offered SEARCH, a short reason why; null when it is offered.
  v.searchUnavailable = legal.some(a => a.type === 'SEARCH') ? null : searchUnavailable(game, content);
  return v;
}

// A private entry seen by someone else: the card and any running total are blanked.
const SECRET_FIELDS = ['wounds', 'hp', 'card', 'defId', 'gold'];
function redact(e) {
  const out = { ...e, value: 'hidden' };
  for (const k of SECRET_FIELDS) delete out[k];
  return out;
}

// Plan 4.9: the seat that must be the only one looking at the screen right now, or null for the
// shared table. RB 8.1: the controller reads the monster card and announces. RB 8.4: A/B/C picks
// are made one side at a time behind a cover. Solo: the one player always looks (RB 10, SP 9).
export function screenOwner(game) {
  if (game.seats.length === 1) return 0;
  const enc = game.encounter;
  if (game.phase === 'MONSTER_REACT' && enc) return enc.controller;
  if (game.phase === 'COMBAT_SELECT' && enc?.combat?.mode === 'abc') return enc.combat.heroPick ? enc.controller : enc.seat;
  return null;
}

// D21 (application-only): reduce() counts commit points (an action that rolled, drew, shuffled or
// revealed). Undo may go back from `current` to `earlier` only if no commit happened in between.
export const canUndoTo = (earlier, current) => earlier.commits === current.commits;
