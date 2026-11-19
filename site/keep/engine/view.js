// Hidden-information projection and undo commit points (system 1/10; plan 4.3, 4.9; SP 9, SP 11).
// view(game, viewer) is what a given seat may see; the full state never goes to the screen.
import { wakeOdds } from './treasury.js';
import { heroGold } from './heroes.js';
import { cardDef } from './decks.js';

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
