// Inventory: the five groups, per-item use state and item use (system 7; spec v3 section 4).
// The state keeps card instance ids ("ID#n"): hero.held for kept cards from the room-side decks (useful
// items and ordinary treasure) and hero.treasury for treasure-chamber cards. A card's source deck,
// identity, effect and use restrictions come from its definition by id, its owner from whose list holds
// it, and uses spent from hero.itemUses. Nothing is usable unless its card data has a `use` block:
// spec v3 forbids inventing item effects, so a special weapon card without one shows as pending.
import { logEvent } from './dice.js';
import { toBottom, cardDef } from './decks.js';
import { contentIndex, chamberName, chamberCards, capital } from '../content/schema.js';
import { shownEffectText } from './describe.js';

export const groupOf = def => (def.kind === 'treasure' ? 'treasure' : 'items');
export const usesLeft = (hero, def, inst) => (def.use?.uses == null ? null : def.use.uses - (hero.itemUses?.[inst] || 0));

// Held cards whose card data lets the hero use them with this timing ('turn-action' | 'encounter-special').
export function usableHeld(g, content, seat, timing) {
  const hero = g.heroes[seat];
  return hero.held.filter(inst => {
    const def = cardDef(content, inst);
    const left = usesLeft(hero, def, inst);
    return def.use?.timing === timing && (left === null || left > 0);
  });
}

// Spec v5: the seat's ring when it is unused and its card data allows a use with this timing, else null.
export function ringFor(g, content, seat, timing) {
  const id = g.seats[seat]?.ringId, hero = g.heroes[seat];
  const r = id && !hero?.ringUsed && contentIndex(content).rings.get(id);
  return r && r.use?.timing === timing ? r : null;
}

// Spec v5: every ring is single-use. Its use consumes it: out of the hero's usable inventory, removed from play.
export function consumeRing(g, content, seat) {
  const id = g.seats[seat].ringId;
  g.heroes[seat].ringUsed = true;
  itemLog(g, seat, 'use', id, 'ring');
  itemLog(g, seat, 'discard', id, 'ring', { to: 'out of the game' });
  return contentIndex(content).rings.get(id).use.effects || [];
}

// Spec v3: obtain, use, discard and lose each leave a log entry. Chamber cards stay private to the holder.
export function itemLog(g, seat, action, inst, group, extra = {}) {
  logEvent(g, { kind: 'item', action, seat, value: inst, group, ...extra, ...(group === 'chamber' ? { private: seat } : {}) });
}

// Spend one use; afterUse decides where the card goes ('keep', 'bottom' of its own deck, 'remove').
// Returns the card's use effects for the caller to resolve.
export function spendUse(g, content, seat, inst) {
  const hero = g.heroes[seat];
  const def = cardDef(content, inst);
  hero.itemUses[inst] = (hero.itemUses[inst] || 0) + 1;
  itemLog(g, seat, 'use', inst, groupOf(def));
  const after = def.use.afterUse || 'keep';
  if (after !== 'keep') {
    hero.held.splice(hero.held.indexOf(inst), 1);
    delete hero.itemUses[inst];
    if (after === 'bottom') toBottom(g, def.deck, inst);
    else logEvent(g, { kind: 'remove-card', value: inst });
    itemLog(g, seat, 'discard', inst, groupOf(def), { to: after === 'bottom' ? `bottom of ${def.deck}` : 'out of the game' });
  }
  return def.use.effects || [];
}

const TIMING_REASON = {
  'turn-action': 'Only as your action at the start of your turn',
  'encounter-special': 'Only as a special weapon, before a monster is revealed',
  free: 'Only on your own turn, when choosing a move or whether to keep moving',
};
const RING_REASON = {
  'turn-action': 'Only at the start of your turn, in place of your turn',
  'door-or-portcullis': 'Only when you are about to go through a door or under a portcullis',
  'encounter-choice': 'Only when a monster appears, before it shows itself; never in an ambush',
  'trap-drawn': 'Only when a card you have just drawn is a trap',
};
// A weapon's unit word: 'shot' for the crossbow (its data says so), else 'use'.
export const unitWord = (w, n) => `${w.unit || 'use'}${n === 1 ? '' : 's'}`;
function cardReason(def, left, group, content) {
  if (group === 'chamber') return `${capital(chamberCards(content, 1))}: no use; its gold counts if you escape, and each one adds 1 to a well jump`;
  if (def.specialWeapon && !def.use) return 'Special weapon: its card effect is pending (not yet supplied)';
  if (!def.use && def.frees?.length) return 'Kept: it works by itself when it applies, no action needed';
  if (!def.use) return group === 'treasure' ? 'Treasure: no use; its gold counts if you escape' : 'Kept: no use of its own';
  if (left === 0) return 'No uses left';
  return TIMING_REASON[def.use.timing];
}

// One seat's inventory as `viewer` may see it. legal: the current legal actions, so `usable` and `actions`
// say what can be done with each item right now; `reason` says why not. Others see chamber cards as a count.
export function inventoryView(g, content, seat, viewer, legal) {
  const hero = g.heroes[seat];
  const hdef = contentIndex(content).heroes.get(hero.heroId);
  const mine = pred => legal.filter(a => a.seat === seat && pred(a));
  const card = group => inst => {
    const def = cardDef(content, inst);
    const left = usesLeft(hero, def, inst);
    const actions = mine(a => a.item === inst || a.card === inst);
    const usable = actions.some(a => a.type !== 'WELL_DISCARD');
    return {
      inst, id: def.id, name: def.name, effectText: shownEffectText(def, chamberName(content)), deck: def.deck, group, owner: seat, kind: def.kind, gold: def.gold || 0,
      specialWeapon: !!def.specialWeapon, use: def.use ? { timing: def.use.timing, afterUse: def.use.afterUse || 'keep', uses: def.use.uses ?? null } : null,
      usesLeft: left, pending: !!def.specialWeapon && !def.use, usable, reason: usable ? null : cardReason(def, left, group, content), actions,
    };
  };
  const w = hdef.specialWeaponId && (content.specialWeapons || []).find(x => x.id === hdef.specialWeaponId);
  // Spec v5: starting equipment is words only, with no rules of its own. The word naming the hero's special weapon
  // card (the crossbow) is shown once, as that card.
  const words = (Array.isArray(hdef.equipment) ? hdef.equipment : []).filter(name => !w || name.trim().toLowerCase() !== String(w.name).trim().toLowerCase());
  const equipment = words.map(name => ({ name, group: 'equipment', source: 'hero', owner: seat, pending: false, usable: false, reason: 'Starting equipment: it has no rules of its own' }));
  if (w) {
    const left = w.uses == null ? null : w.uses - hero.weaponUses;
    const actions = mine(a => a.type === 'RESPOND' && a.choice === 'special' && !a.item);
    const out = left === 0 ? `No ${unitWord(w, 2)} left: all ${w.uses} are used, and it cannot be used again` : TIMING_REASON['encounter-special'];
    equipment.push({ id: w.id, name: w.name, verb: w.verb || null, unit: w.unit || 'use', effectText: shownEffectText(w, chamberName(content)), group: 'equipment', source: 'specialWeapons', owner: seat, uses: w.uses ?? null, usesLeft: left, pending: false, usable: actions.length > 0, reason: actions.length ? null : out, actions });
  }
  const ringId = g.seats[seat].ringId;
  const r = ringId && contentIndex(content).rings.get(ringId);
  const ringActions = mine(a => a.type === 'USE_RING');
  // A used ring is gone from the inventory (spec v5); hero.ringUsed says it was used.
  const ring = r && !hero.ringUsed ? { id: r.id, name: r.name, effectText: shownEffectText(r, chamberName(content)), group: 'ring', owner: seat, trigger: r.trigger, timing: r.use?.timing ?? null, pending: !r.use, usable: ringActions.length > 0, actions: ringActions,
    reason: ringActions.length ? null : r.use ? RING_REASON[r.use.timing] : 'Ring power pending: this ring has no use in its card data yet' } : null;
  const held = hero.held.map(inst => card(groupOf(cardDef(content, inst)))(inst));
  return {
    equipment, ring,
    items: held.filter(x => x.group === 'items'),
    treasure: held.filter(x => x.group === 'treasure'),
    chamber: viewer === seat ? hero.treasury.map(card('chamber')) : hero.treasury.length,
  };
}
