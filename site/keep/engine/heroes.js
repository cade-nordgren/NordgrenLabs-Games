// Health, conditions, inventory and gold (system 7; RB 3, RB 5.1, SP 7, SP 10).
// held: ordinary loot and items (public gold, D25). treasury: treasure-chamber cards (private).
import { logEvent } from './dice.js';
import { toBottom, cardDef } from './decks.js';
import { contentIndex } from '../content/schema.js';

export const TILE_CONDITIONS = ['dark', 'well-edge', 'rubble'];

// Spec v2 hero statuses. A hero at setup is never escaped; escape is an explicit choice on tower entry.
export const READY = 'READY_IN_START_TOWER', EXPLORING = 'EXPLORING', IN_TOWER = 'IN_TOWER_NOT_ESCAPED', ESCAPED = 'ESCAPED', DEAD = 'DEAD';
// Active heroes take turns (RB 5): everyone not escaped and not dead, towers included.
export const isActive = h => !!h && (h.status === READY || h.status === EXPLORING || h.status === IN_TOWER);

export const statOf = (content, hero, stat) => contentIndex(content).heroes.get(hero.heroId).stats[stat];

// RB 1, SP 10: gold is the sum of the gold values printed on held loot and treasure-chamber cards.
export function heroGold(hero, content) {
  return [...hero.held, ...hero.treasury].reduce((sum, inst) => sum + (cardDef(content, inst).gold || 0), 0);
}

// D03 (legacySupported, spec v2): a negative damage result is 0 and never heals. RB 3, SP 7: 0 HP is death.
export function damageHero(g, content, seat, amount, reason) {
  const hero = g.heroes[seat];
  const dmg = Math.max(0, amount);
  hero.hp -= dmg;
  logEvent(g, { kind: 'damage', seat, raw: amount, amount: dmg, hp: hero.hp, reason, arithmetic: `max(0, ${amount}) = ${dmg}; HP ${hero.hp + dmg} - ${dmg} = ${hero.hp}` });
  if (hero.hp <= 0) killHero(g, content, seat, reason);
  return dmg;
}

// D04 (house rule): healing stops at starting HP unless the card says otherwise (uncapped).
export function healHero(g, seat, amount, uncapped = false) {
  const hero = g.heroes[seat];
  const before = hero.hp;
  hero.hp = uncapped ? hero.hp + Math.max(0, amount) : Math.min(hero.hpStart, hero.hp + Math.max(0, amount));
  logEvent(g, { kind: 'heal', seat, amount: hero.hp - before, hp: hero.hp });
}

// Treasure-chamber cards back to the bottom of the treasury deck (well discard D09, dragon wake RB 9.2).
export function returnTreasury(g, seat, insts = g.heroes[seat].treasury) {
  const hero = g.heroes[seat];
  for (const inst of [...insts]) {
    hero.treasury.splice(hero.treasury.indexOf(inst), 1);
    toBottom(g, 'TREASURY', inst, seat);
  }
}

// D28 (house rule): a dead hero's acquired held and treasure-chamber cards go to the bottom of
// their own decks. Hero, combat and ring cards are never in held, so they never become loot.
export function killHero(g, content, seat, reason) {
  const hero = g.heroes[seat];
  hero.status = DEAD;
  hero.hp = Math.min(hero.hp, 0);
  logEvent(g, { kind: 'death', seat, reason });
  for (const inst of hero.held) toBottom(g, cardDef(content, inst).deck, inst);
  hero.held = [];
  returnTreasury(g, seat);
  hero.conditions = [];
  if (g.encounter && g.encounter.seat === seat) {
    if (g.encounter.monster) toBottom(g, 'MONSTER', g.encounter.monster.inst, g.encounter.controller);
    g.encounter = null;
  }
  if (seat === g.activeSeat && g.turn) {
    g.turn.endNow = true;
    g.pending = null;
  }
}

export function setCondition(g, seat, cond) {
  const hero = g.heroes[seat];
  hero.conditions = hero.conditions.filter(c => c.id !== cond.id).concat(cond);
  logEvent(g, { kind: 'condition', seat, id: cond.id });
}

export function clearCondition(g, seat, id) {
  const hero = g.heroes[seat];
  if (!hero.conditions.some(c => c.id === id)) return;
  hero.conditions = hero.conditions.filter(c => c.id !== id);
  logEvent(g, { kind: 'condition-cleared', seat, id });
}

export const hasCondition = (hero, id) => hero.conditions.some(c => c.id === id);
