// Monster encounters, reactions, flight, ambush and combat flow (system 6; RB 8, RB 10, SP 7, SP 9).
import { roll, logEvent } from './dice.js';
import { draw, toBottom, cardDef } from './decks.js';
import { damageHero, statOf } from './heroes.js';
import { canFlee, flee } from './movement.js';
import { evalExpr } from './effects.js';
import { abcExchange, targetThrow, LETTERS } from './combat.js';
import { contentIndex } from '../content/schema.js';
import { spendUse, itemLog } from './inventory.js';

// D12 (interpretation): the seated player to the right controls the monster, even if dead or
// escaped. Seats are in clockwise order, so the right-hand seat is the previous one. Solo: the hero's
// seat answers the prompts, but D37 (spec v3): the computer is the monster player and the card stays hidden.
export const controllerSeat = (g, seat) => (g.seats.length === 1 ? seat : (seat - 1 + g.seats.length) % g.seats.length);

const combatSet = (content, setId) => (content.combat || []).filter(c => c.setId === setId);
const letterCard = (content, setId, letter) => combatSet(content, setId).find(c => c.letter === letter);

export function weaponOf(g, content, seat) {
  const hero = g.heroes[seat];
  const id = contentIndex(content).heroes.get(hero.heroId).specialWeaponId;
  const def = id && (content.specialWeapons || []).find(w => w.id === id);
  return def && (def.uses === null || def.uses === undefined || hero.weaponUses < def.uses) ? def : null;
}

// RB 8.1, SP 7: the hero commits before anything about the monster exists in the state.
// RB 8.7, SP 7: an ambush first deals D12 - Luck (floored at 0, D03), then only Attack or Flee.
export function startEncounter(g, content, { ambush }) {
  const seat = g.activeSeat;
  const hero = g.heroes[seat];
  logEvent(g, { kind: 'encounter', seat, ambush });
  if (ambush) {
    const d12 = roll(g, 'D12', 'ambush');
    damageHero(g, content, seat, d12 - statOf(content, hero, 'LCK'), 'ambush (D12 - Luck)');
    if (hero.status === 'DEAD') return;
  }
  const controller = controllerSeat(g, seat);
  // D37 (spec v3): monster card and HP are private to the monster player: the controller, or in solo the
  // computer ('computer' matches no viewer seat, so only the debug view shows them).
  const priv = g.seats.length === 1 ? 'computer' : controller;
  g.encounter = { seat, ambush, controller, priv, choice: null, monster: null, reaction: null, announced: false, combat: null };
  g.phase = 'CHOOSE_MONSTER_RESPONSE';
  g.pending = { kind: 'monster-response', seat };
}

export function responseOptions(g, content) {
  const { seat, ambush } = g.encounter;
  const out = ['attack'];
  if (!ambush) out.push('wait');
  if (canFlee(g, content, seat)) out.push('flee');
  // shortcut: ambush offers Attack or Flee only (RB 8.7), so the special weapon is not offered there either.
  if (!ambush && weaponOf(g, content, seat)) out.push('special');
  return out;
}

// Commit, then the controller draws the top monster card privately and reads the matching reaction.
// RB 8.1: a special weapon reads the Attack reaction.
export function respond(g, content, choice, item = null) {
  const enc = g.encounter;
  enc.choice = choice;
  enc.item = item; // a held special weapon card (spec v3), or null for the hero's own special weapon
  logEvent(g, { kind: 'commit', seat: enc.seat, choice, ...(item ? { item } : {}) });
  const inst = draw(g, 'MONSTER', 'monster encounter', enc.priv);
  const def = cardDef(content, inst);
  enc.monster = { inst, hp: def.hp, wounds: 0, groupId: def.groupId };
  enc.reaction = def.reactions[choice === 'special' ? 'attack' : choice];
  // D37: in solo the computer reads the card and announces at once; nobody sees the card.
  if (enc.priv === 'computer') return announce(g, content);
  g.phase = 'MONSTER_REACT';
  g.pending = { kind: 'announce', seat: enc.controller };
}

// The controller announces the reaction (the hot-seat cover step). Weapon effects, then the
// reaction's own effects, then its type.
export function announce(g, content) {
  const enc = g.encounter;
  enc.announced = true;
  g.pending = null;
  logEvent(g, { kind: 'reaction', seat: enc.seat, type: enc.reaction.type });
  const effects = [];
  if (enc.choice === 'special' && enc.item) effects.push(...spendUse(g, content, enc.seat, enc.item));
  else if (enc.choice === 'special') {
    const w = weaponOf(g, content, enc.seat);
    g.heroes[enc.seat].weaponUses += 1;
    itemLog(g, enc.seat, 'use', w.id, 'equipment');
    effects.push(...(w.effects || []));
  }
  effects.push(...(enc.reaction.effects || []), { op: '_REACT' });
  g.stack.push({ effects, i: 0 });
}

export function woundMonster(g, amount) {
  const m = g.encounter?.monster;
  if (!m) throw new Error('No monster to damage');
  m.wounds += amount;
  // Spec v3: the monster player tracks damage privately; the running total is theirs alone.
  logEvent(g, { kind: 'monster-wound', amount, wounds: m.wounds, private: g.encounter.priv });
}

const monsterDead = g => g.encounter.monster.wounds >= g.encounter.monster.hp;

// RB 8.2: monster flees -> cards under their decks, turn ends. RB 8.6: strike then flight or combat.
export function applyReaction(g, content) {
  const enc = g.encounter;
  if (!enc) return; // the hero died to a weapon or reaction effect
  if (monsterDead(g)) return endEncounter(g, 'monster-killed', 'endAfter');
  const r = enc.reaction;
  const strike = () => damageHero(g, content, enc.seat, evalExpr(g, content, r.damage, g.heroes[enc.seat], 'monster strike'), 'monster strike');
  switch (r.type) {
    case 'monster-flees': return endEncounter(g, 'monster-fled', 'endNow');
    case 'combat': return startCombat(g, content);
    case 'strike-then-combat': strike(); return g.encounter && startCombat(g, content);
    case 'strike-then-flight': strike(); if (!g.encounter) return; // falls through to flight
    case 'flight-succeeds': endEncounter(g, 'hero-fled', null); return flee(g, content, enc.seat);
    default: return endEncounter(g, 'reaction-resolved', null); // 'other': its effects already ran
  }
}

function endEncounter(g, outcome, turnEffect) {
  const enc = g.encounter;
  if (enc.monster) toBottom(g, 'MONSTER', enc.monster.inst, enc.priv);
  logEvent(g, { kind: 'encounter-end', outcome });
  g.encounter = null;
  g.pending = null;
  if (turnEffect) g.turn[turnEffect] = true;
}

// D17: solo uses manual physical-target entry (original) unless the labelled digital A/B/C variant is chosen.
// Spec v3: the physical dice-target system is its own labelled mode, never the encounter choices.
export const COMBAT_LABEL = { abc: 'A/B/C combat', target: 'Dice-target combat (2023 alternative mode, physical throw entered by hand)', 'abc-digital-variant': 'A/B/C combat, DIGITAL VARIANT (not an original rule)' };
export const combatMode = g => (g.seats.length === 1 ? g.rules.soloCombat : 'abc');

function startCombat(g, content) {
  const mode = combatMode(g);
  g.encounter.combat = { mode, label: COMBAT_LABEL[mode], heroPick: null, monsterPick: null, exchanges: [], variant: mode === 'abc-digital-variant' ? 'DIGITAL VARIANT (not an original rule)' : null };
  logEvent(g, { kind: 'combat', mode });
  g.phase = 'COMBAT_SELECT';
  g.pending = { kind: 'combat', seat: g.encounter.seat };
}

export function combatActions(g) {
  const enc = g.encounter;
  const c = enc.combat;
  if (c.mode === 'target') {
    return ['inner', 'outer', 'outside', 'corner', 'corner-skull', 'unclear'].flatMap(placement =>
      ['sword', 'skull', 'other'].map(face => ({ type: 'TARGET_RESULT', seat: enc.seat, placement, face })));
  }
  const out = [];
  if (!c.heroPick) out.push(...LETTERS.map(letter => ({ type: 'COMBAT_PICK', seat: enc.seat, side: 'hero', letter })));
  if (c.mode === 'abc' && !c.monsterPick) out.push(...LETTERS.map(letter => ({ type: 'COMBAT_PICK', seat: enc.controller, side: 'monster', letter })));
  return out;
}

// RB 8.4: both sides pick in secret; the exchange resolves when both are locked in.
export function combatPick(g, content, side, letter) {
  const enc = g.encounter;
  const c = enc.combat;
  c[side === 'hero' ? 'heroPick' : 'monsterPick'] = letter;
  logEvent(g, { kind: 'combat-pick', side }); // the letter stays hidden until the reveal
  if (c.mode === 'abc-digital-variant') {
    // D17 digital variant (class 4): the computer picks the monster card uniformly with a logged D6.
    c.monsterPick = LETTERS[Math.floor((roll(g, 'D6', 'digital variant: computer monster pick') - 1) / 2)];
  }
  if (!c.heroPick || !c.monsterPick) return;
  const heroSet = contentIndex(content).heroes.get(g.heroes[enc.seat].heroId).combatSetId;
  const hCard = letterCard(content, heroSet, c.heroPick);
  const mCard = letterCard(content, enc.monster.groupId, c.monsterPick);
  const { heroDmg, monsterDmg } = abcExchange(c.heroPick, c.monsterPick, hCard.doubleAgainst || [], mCard.doubleAgainst || []);
  const ex = { hero: c.heroPick, monster: c.monsterPick, heroDmg, monsterDmg };
  c.exchanges.push(ex);
  logEvent(g, { kind: 'exchange', ...ex });
  c.heroPick = c.monsterPick = null; // RB 8.4: cards return to the hand for the next exchange
  applyCombatDamage(g, content, heroDmg, monsterDmg);
}

// RB 8.8, SP 7: manual physical-target result entry (solo original mode).
export function targetResult(g, content, placement, face) {
  const r = targetThrow(placement, face);
  const c = g.encounter.combat;
  c.exchanges.push({ placement, face, ...r });
  logEvent(g, { kind: 'throw', placement, face, ...r });
  if (!r.rethrow) applyCombatDamage(g, content, r.heroDmg, r.monsterDmg);
}

// RB 8.3, RB 8.4: monster dead when wounds reach its HP; hero dead at 0. D14: both can die at once.
function applyCombatDamage(g, content, heroDmg, monsterDmg) {
  const enc = g.encounter;
  if (monsterDmg) woundMonster(g, monsterDmg);
  const killed = monsterDead(g);
  if (killed) logEvent(g, { kind: 'monster-dead', seat: enc.seat }); // spec v3: announced, never with its HP
  if (heroDmg) damageHero(g, content, enc.seat, heroDmg, 'combat');
  if (!g.encounter) return; // hero died: killHero cleaned up the encounter
  if (killed) endEncounter(g, 'monster-killed', 'endAfter'); // RB 8.4: combat over, turn ends
}
