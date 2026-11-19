// Effect interpreter and the resolution loop (system 5; plan 4.6; SP 6, SP 11).
// Cards carry declarative effects. Resolution runs a stack of frames (one per card or nested
// effect list); an effect that needs a player (REQUEST_CHOICE, monster response, combat, forced
// move) sets game.pending and the loop stops until the matching action arrives.
import { roll, testStat, logEvent } from './dice.js';
import { draw, toBottom, reshuffle, cardDef } from './decks.js';
import { damageHero, healHero, statOf, setCondition, clearCondition, returnTreasury, isActive } from './heroes.js';
import { enterTile, rotateTile, moveChoices, beginCarryOver } from './movement.js';
import { startEncounter, woundMonster, applyReaction } from './monsters.js';
import { continueWake } from './treasury.js';
import { itemLog, groupOf } from './inventory.js';
import { endTurn } from './clock.js';
import { neighbour } from './board.js';

const active = g => g.heroes[g.activeSeat];

// Expr: an integer, or { die, plus, minusStat, plusCount, reg } (plan 4.6). D12 - LCK, D6 - 2, D12 + treasure cards.
export function evalExpr(g, content, e, hero, reason = 'formula') {
  if (Number.isInteger(e)) return e;
  const parts = [];
  let v = 0;
  const add = (label, n) => { v += n; parts.push(parts.length ? `${n < 0 ? '-' : '+'} ${label} ${Math.abs(n)}` : `${label} ${n}`); };
  if (e.die) add(e.die, roll(g, e.die, reason));
  if (e.reg) add(e.reg, g.registers[e.reg] ?? 0);
  if (e.plus) add('', e.plus);
  if (e.minusStat) add(e.minusStat, -statOf(content, hero, e.minusStat));
  if (e.plusCount === 'treasuryCards') add('treasury cards', hero.treasury.length);
  logEvent(g, { kind: 'formula', reason, value: v, arithmetic: `${parts.join(' ').replace(/ {2,}/g, ' ')} = ${v}` });
  return v;
}

// A frame for one drawn card: its effects, then disposition, follow-up deck and turn effect.
export function cardFrame(content, inst, extra = {}) {
  const def = cardDef(content, inst);
  return {
    effects: def.effects || [], i: 0, card: inst, deck: def.deck, kind: def.kind,
    disposition: def.cardDisposition || 'UNDER_SAME_DECK', followUp: def.followUpDeck || null,
    turnDisposition: def.turnDisposition || 'end-turn', kept: false, reshuffle: false, ...extra,
  };
}

export function drawAndResolve(g, content, cat, reason, extra = {}) {
  const inst = draw(g, cat, reason);
  if (inst) {
    logEvent(g, { kind: 'resolve-card', deck: cat, value: inst });
    g.stack.push(cardFrame(content, inst, extra));
  }
  return inst;
}

const OPS = {
  ROLL_D12: (g, c, e) => { g.registers[e.store] = roll(g, 'D12', `card roll ${e.store}`); },
  ROLL_D6: (g, c, e) => { g.registers[e.store] = roll(g, 'D6', `card roll ${e.store}`); },
  // RB 5.1: D12 (+ modifier) <= stat passes.
  CHECK_STAT(g, c, e) {
    const hero = active(g);
    const mod = evalExpr(g, c, e.modifier ?? 0, hero);
    const { pass } = testStat(g, e.stat, statOf(c, hero, e.stat), 'card test', [{ source: 'card', value: mod }]);
    g.stack.push({ effects: (pass ? e.onPass : e.onFail) || [], i: 0 });
  },
  DEAL_DAMAGE(g, c, e) {
    const amount = evalExpr(g, c, e.amount, active(g), 'damage formula');
    if (e.target === 'monster') woundMonster(g, Math.max(0, amount)); // D03 floor
    else damageHero(g, c, g.activeSeat, amount, 'card');
  },
  HEAL: (g, c, e) => healHero(g, g.activeSeat, evalExpr(g, c, e.amount, active(g)), !!e.uncapped),
  DRAW_CARD(g, c, e) {
    if (e.then === 'keep') {
      const inst = draw(g, e.deck, 'card draw (keep)', e.deck === 'TREASURY' ? g.activeSeat : null);
      if (inst) {
        active(g)[e.deck === 'TREASURY' ? 'treasury' : 'held'].push(inst);
        itemLog(g, g.activeSeat, 'obtain', inst, e.deck === 'TREASURY' ? 'chamber' : groupOf(cardDef(c, inst)));
      }
    } else drawAndResolve(g, c, e.deck, 'card branch');
  },
  RETAIN_CARD(g, c, e, f) { retain(g, owner(g, f), e.into); },
  GRANT_TREASURE(g, c, e, f) { retain(g, owner(g, f), 'held'); }, // the kept card's printed gold counts (RB 7.2)
  RETURN_CARD_TO_BOTTOM(g, c, e, f) {
    const o = owner(g, f);
    if (o.card && !o.kept) { o.kept = true; toBottom(g, o.deck, o.card); }
  },
  SHUFFLE_DECK(g, c, e, f) {
    const o = owner(g, f);
    if (!e.deck || e.deck === o.deck) o.reshuffle = true; else reshuffle(g, e.deck);
  },
  REMOVE_TREASURY_CARDS: g => returnTreasury(g, g.activeSeat, undefined, 'card'),
  MOVE_HERO(g, c, e) {
    const opts = { drawRoom: e.drawRoom !== false, applyTile: e.applyTile !== false, via: 'card' };
    const hero = active(g);
    if (e.to === 'adjacent-choice') {
      const dirs = moveChoices(g, c, g.activeSeat);
      if (dirs.length) { g.phase = 'RESOLVE_CARD'; g.pending = { kind: 'move-choice', seat: g.activeSeat, options: dirs, opts }; }
      return;
    }
    const dir = e.to === 'prev' ? dirTo(hero.coord, hero.prevCoord) : e.to;
    if (dir) enterTile(g, c, g.activeSeat, neighbour(hero.coord, dir), { ...opts, dir });
  },
  END_TURN: g => { g.turn.endNow = true; },
  SET_CONDITION: (g, c, e) => setCondition(g, g.activeSeat, { id: e.id, turns: e.turns ?? null, onTurnStart: e.onTurnStart || [] }),
  CLEAR_CONDITION: (g, c, e) => clearCondition(g, g.activeSeat, e.id),
  REQUEST_CHOICE(g, c, e) {
    g.phase = 'RESOLVE_CARD';
    g.pending = { kind: 'choice', seat: g.activeSeat, options: e.options.map(o => o.label), effects: e.options.map(o => o.effects || []) };
  },
  MONSTER_ENCOUNTER: (g, c, e) => startEncounter(g, c, { ambush: !!e.ambush }),
  REQUEST_COMBAT: (g, c, e) => startEncounter(g, c, { ambush: !!e.ambush }),
  // D11 (provisional): a secret passage may cross a printed wall; it lasts for this turn's move only.
  OPEN_TEMPORARY_PASSAGE(g, c, e) { g.turn.secret = e.side; g.turn.mayContinue = true; logEvent(g, { kind: 'secret-passage', side: e.side }); },
  ROTATE_TILE: (g, c, e) => rotateTile(g, active(g).coord),
  CONTINUE_MOVEMENT: g => { g.turn.mayContinue = true; },
  // Internal (not allowed in content): apply the announced monster reaction.
  _REACT: (g, c) => applyReaction(g, c),
};
export const EFFECT_OPS = Object.keys(OPS).filter(k => !k.startsWith('_'));

// The card an effect belongs to: its own frame, or for a nested list (a test branch, a chosen
// option) the nearest card frame below it on the stack.
const owner = (g, f) => (f.card ? f : [...g.stack].reverse().find(x => x.card) || f);

function retain(g, f, into) {
  if (!f.card || f.kept) return;
  f.kept = true;
  active(g)[into === 'treasury' ? 'treasury' : 'held'].push(f.card);
  logEvent(g, { kind: 'retain', value: f.card, into, ...(into === 'treasury' ? { private: g.activeSeat } : {}) });
  itemLog(g, g.activeSeat, 'obtain', f.card, into === 'treasury' ? 'chamber' : groupOf(f));
}

function dirTo(from, to) {
  if (!to) return null;
  const dx = to.x - from.x, dy = to.y - from.y;
  return dx === 1 && !dy ? 'E' : dx === -1 && !dy ? 'W' : dy === 1 && !dx ? 'S' : dy === -1 && !dx ? 'N' : null;
}

// A finished (or aborted) frame. Aborted: the turn ended early, the hero died or fled; the card
// goes back under its deck and nothing it would have led to happens (RB 8.2, RB 8.5).
function finishFrame(g, content, f, aborted) {
  if (f.card && !f.kept) {
    const d = f.disposition;
    if (!aborted && d === 'RETAIN_HELD') retain(g, f, 'held');
    else if (!aborted && d === 'RETAIN_TREASURY') retain(g, f, 'treasury');
    else if (!aborted && d === 'REMOVE') logEvent(g, { kind: 'remove-card', value: f.card });
    else toBottom(g, f.deck, f.card); // RB 7.4, SP 6: default lifecycle
    if (!aborted && (d === 'RESHUFFLE_DECK' || f.reshuffle)) reshuffle(g, f.deck);
  } else if (f.card && f.reshuffle && !aborted) reshuffle(g, f.deck);
  if (aborted) return;
  if (f.card && f.turnDisposition === 'continue') g.turn.mayContinue = true;
  if (f.door) return doorOutcome(g, content, f);
  // RB 7.3, SP 6: a branch draws from the named sub-deck; a monster branch is an encounter.
  if (f.followUp === 'MONSTER') startEncounter(g, content, { ambush: false });
  else if (f.followUp) drawAndResolve(g, content, f.followUp, `branch from ${f.card}`);
}

// RB 6.6, SP 5: opens -> cross now; closed -> another free passage may be used this turn;
// trap -> its effects ran, the turn ends.
function doorOutcome(g, content, f) {
  const { dir, edge, noDetour } = f.door;
  logEvent(g, { kind: 'door', result: f.kind, edge, card: f.card });
  if (f.kind === 'opens') {
    g.turn.openedDoor = edge; // RB 6.6: same-turn flight back may still pass before it relocks
    enterTile(g, content, g.activeSeat, neighbour(active(g).coord, dir), { dir, via: 'door' });
  } else if (f.kind === 'closed') {
    g.turn.triedDoors.push(edge);
    if (noDetour) g.turn.endAfter = true; // dark-room exit or a return move: D07, stay and retry
    else g.turn.mayContinue = true;
  } else g.turn.endAfter = true;
}

// Run frames until the stack is empty or a player decision is pending.
export function run(g, content) {
  for (;;) {
    if (g.status !== 'playing' || g.pending) return;
    if (!g.stack.length) return afterResolution(g, content);
    const f = g.stack[g.stack.length - 1];
    if (g.turn.endNow || f.i >= f.effects.length) {
      g.stack.pop();
      finishFrame(g, content, f, g.turn.endNow);
      continue;
    }
    const e = f.effects[f.i++];
    OPS[e.op](g, content, e, f);
  }
}

// Everything resolved: continue a dragon wake, finish turn-start carry-overs, offer further
// movement (yellow corridor, door stayed closed, secret door, card), or end the turn.
function afterResolution(g, content) {
  if (g.wake) return continueWake(g, content);
  const t = g.turn;
  if (!isActive(active(g)) || t.endNow) return endTurn(g, content);
  if (t.stage === 'start') { t.stage = 'act'; return beginCarryOver(g, content); }
  if (t.endAfter || !t.mayContinue) return endTurn(g, content);
  g.phase = 'CHOOSE_EXIT';
}

