// Hidden-information projection and undo commit points (system 1/10; plan 4.3, 4.9; SP 9, SP 11).
// view(game, viewer) is what a given seat may see; the full state never goes to the screen.
import { wakeOdds } from './treasury.js';

// viewer: a seat number, or null for a public screen (nobody's private cards).
export function view(game, content, viewer = null) {
  const v = structuredClone(game);
  const solo = game.seats.length === 1;
  delete v.rng; // seed, PRNG state and any scripted dice or orders are the future
  if (v.board) v.board.tileBag = game.board.tileBag.length;
  if (v.decks) for (const cat of Object.keys(v.decks)) v.decks[cat] = { count: game.decks[cat].order.length, shuffles: game.decks[cat].shuffles };
  if (v.dragon) v.dragon = { remaining: game.dragon.remaining.length, aside: game.dragon.aside, resets: game.dragon.resets, odds: wakeOdds(game, content) };
  // RB 9.1, SP 9, D25: treasure-chamber cards are private to the holder; held loot stays public.
  v.heroes = v.heroes.map(h => (h && h.seat !== viewer ? { ...h, treasury: h.treasury.length } : h));
  const enc = v.encounter;
  if (enc) {
    const isController = viewer === enc.controller;
    // RB 8.1, RB 8.3: only the controller reads the card; the hero hears the announced reaction.
    // RB 10, SP 9: in solo the hero is the controller, so HP is visible.
    if (enc.monster && !isController) {
      enc.monster = { wounds: enc.monster.wounds, groupId: enc.monster.groupId };
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
  v.log = v.log.map(e => (e.private !== undefined && e.private !== viewer ? { ...e, value: 'hidden' } : e));
  // Hidden choices in pending effects are fine to show: they are labels of the active hero's options.
  return v;
}

// D21 (application-only): reduce() counts commit points (an action that rolled, drew, shuffled or
// revealed). Undo may go back from `current` to `earlier` only if no commit happened in between.
export const canUndoTo = (earlier, current) => earlier.commits === current.commits;
