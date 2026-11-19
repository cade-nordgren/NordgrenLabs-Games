// Effect interpreter and the resolution loop (system 5; plan 4.6; SP 6, SP 11).
// Cards carry declarative effects. Resolution runs a stack of frames (one per card or nested
// effect list); an effect that needs a player (REQUEST_CHOICE, monster response, combat, forced
// move) sets game.pending and the loop stops until the matching action arrives.
import { roll, testStat, logEvent } from './dice.js';
import { draw, toBottom, reshuffle, cardDef } from './decks.js';
import { damageHero, healHero, statOf, setCondition, clearCondition, returnTreasury, isActive, killHero } from './heroes.js';
import { enterTile, rotateTile, moveChoices, beginCarryOver, allowContinue, passBarrier, canFlee, flee } from './movement.js';
import { startEncounter, woundMonster, applyReaction, killMonster, revealReaction, endEncounter } from './monsters.js';
import { continueWake } from './treasury.js';
import { itemLog, groupOf, ringFor } from './inventory.js';
import { endTurn } from './clock.js';
import { neighbour, key } from './board.js';
import { contentIndex } from '../content/schema.js';

const active = g => g.heroes[g.activeSeat];

// Expr: an integer, or { die, plus, minusStat, plusCount, reg, minusReg } (plan 4.6). D12 - LCK, D6 - 2, D12 + treasure cards,
// the flask's D12 gain minus its D6 loss (D53).
export function evalExpr(g, content, e, hero, reason = 'formula') {
  if (Number.isInteger(e)) return e;
  const parts = [];
  let v = 0;
  const add = (label, n) => { v += n; parts.push(parts.length ? `${n < 0 ? '-' : '+'} ${label} ${Math.abs(n)}` : `${label} ${n}`); };
  if (e.die) add(e.die, roll(g, e.die, reason));
  if (e.reg) add(e.reg, g.registers[e.reg] ?? 0);
  if (e.minusReg) add(e.minusReg, -(g.registers[e.minusReg] ?? 0));
  if (e.plus) add('', e.plus);
  if (e.minusStat) add(e.minusStat, -statOf(content, hero, e.minusStat));
  if (e.plusCount === 'treasuryCards') add('treasury cards', hero.treasury.length);
  if (e.div) { v = Math.floor(v / e.div); parts.splice(0, parts.length, `floor((${parts.join(' ')}) / ${e.div})`); } // spec v5: rounded down
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
    const f = cardFrame(content, inst, extra);
    g.stack.push(f);
    // Spec v5 (interpretation): a drawn card whose kind is 'trap' first offers the Protection Ring, if the hero has it.
    if (f.kind === 'trap' && ringFor(g, content, g.activeSeat, 'trap-drawn')) {
      g.phase = 'RESOLVE_CARD';
      g.pending = { kind: 'trap-ring', seat: g.activeSeat, card: inst };
    }
  }
  return inst;
}

const OPS = {
  // A roll inside a ROLL_TABLE row is a 'table roll' (the UI shows those on the roll card).
  ROLL_D12: (g, c, e, f) => { g.registers[e.store] = roll(g, 'D12', `${f.table ? 'table' : 'card'} roll ${e.store}`); },
  ROLL_D6: (g, c, e, f) => { g.registers[e.store] = roll(g, 'D6', `${f.table ? 'table' : 'card'} roll ${e.store}`); },
  // Spec v5: roll the die, run the row its result falls in.
  ROLL_TABLE(g, c, e) {
    const v = roll(g, e.die, `table roll${e.store ? ` ${e.store}` : ''}`);
    if (e.store) g.registers[e.store] = v;
    const row = e.rows.find(r => (r.parity ? v % 2 === (r.parity === 'odd' ? 1 : 0) : v >= r.min && v <= r.max));
    logEvent(g, { kind: 'table-row', value: v, row: e.rows.indexOf(row), empty: !row.effects?.length });
    g.stack.push({ effects: row.effects || [], i: 0, table: true });
  },
  KILL_MONSTER: g => killMonster(g),
  // Ring powers (spec v5): the passage the ring was used at, the monster met, the trap just drawn.
  OPEN_PASSAGE(g, c) { const p = [...g.stack].reverse().find(x => x.passage)?.passage; if (p) passBarrier(g, c, p.dir, p.from); },
  MONSTER_FLEES: g => { if (g.encounter) endEncounter(g, 'monster-fled', 'endNow'); },
  IGNORE_TRAP(g, c, e, f) {
    const trap = [...g.stack].reverse().find(x => x !== f && x.card && x.kind === 'trap');
    if (!trap) return;
    trap.i = trap.effects.length; // only the card's effects are the trap; its disposition and outcome stay
    logEvent(g, { kind: 'trap-ignored', seat: g.activeSeat, card: trap.card });
  },
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
    else {
      const dealt = damageHero(g, c, g.activeSeat, amount, 'card');
      if (e.store) g.registers[e.store] = dealt; // the damage actually taken, after the D03 floor
    }
  },
  // D53: one net change; a gain heals (capped at starting HP unless uncapped, D04; the flask is uncapped, spec v6), a loss is damage and may kill.
  ADJUST_HP(g, c, e) {
    const v = evalExpr(g, c, e.amount, active(g), 'net HP change');
    if (v > 0) healHero(g, g.activeSeat, v, !!e.uncapped);
    else if (v < 0) damageHero(g, c, g.activeSeat, -v, 'card');
  },
  // D54: the hero's next turns pass (more turns add to any already owed); none for 0 or less.
  SKIP_TURNS(g, c, e) {
    const n = evalExpr(g, c, e.turns, active(g), 'turns skipped');
    if (n <= 0) return;
    const had = active(g).conditions.find(x => x.id === 'skip-turns');
    setCondition(g, g.activeSeat, { id: 'skip-turns', turns: n + (had?.turns || 0), label: e.label || had?.label || null, onTurnStart: [{ op: '_SKIP' }] });
  },
  // The hero picks the numbers (NAME_NUMBERS action, reducer.js); the D6 and the branch follow there.
  NAME_NUMBERS(g, c, e, f) {
    g.phase = 'RESOLVE_CARD';
    g.pending = { kind: 'name-numbers', seat: g.activeSeat, count: e.count, label: e.label || null, store: e.store || null, onMatch: e.onMatch || [], onMiss: e.onMiss || [], card: owner(g, f).card ?? null };
  },
  KILL_HERO: (g, c, e, f) => killHero(g, c, g.activeSeat, `card ${owner(g, f).card ?? ''}`.trim()),
  FLEE(g, c) {
    if (canFlee(g, c, g.activeSeat)) flee(g, c, g.activeSeat);
    else logEvent(g, { kind: 'flight-blocked', seat: g.activeSeat });
  },
  // D57: every placed maze tile with this mark turns; heroes stay on their squares, fallen portcullises stay on their edges.
  ROTATE_TILES(g, c, e) {
    const tiles = contentIndex(c).tiles;
    const turned = Object.values(g.board.tiles).filter(t => tiles.get(t.defId)?.mark === e.mark);
    for (const t of turned) { t.rotation = (t.rotation + e.degrees) % 360; logEvent(g, { kind: 'rotate', at: key(t.coord), rotation: t.rotation }); }
    logEvent(g, { kind: 'tiles-rotated', mark: e.mark, degrees: e.degrees, at: turned.map(t => key(t.coord)) });
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
  // D56 (spec v6): a kept card whose lasting effect is over (the relit torch) leaves the hero for the bottom of its own deck.
  RETURN_HELD(g, c, e) {
    const hero = active(g), inst = hero.held.find(x => x.split('#')[0] === e.card);
    if (!inst) return;
    hero.held.splice(hero.held.indexOf(inst), 1);
    const def = cardDef(c, inst);
    toBottom(g, def.deck, inst);
    itemLog(g, g.activeSeat, 'discard', inst, groupOf(def), { to: `bottom of ${def.deck}` });
  },
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
  // An option may require a way back (requires 'can-flee', D58); one the hero cannot take is not offered.
  REQUEST_CHOICE(g, c, e) {
    const open = e.options.filter(o => o.requires !== 'can-flee' || canFlee(g, c, g.activeSeat));
    g.phase = 'RESOLVE_CARD';
    g.pending = { kind: 'choice', seat: g.activeSeat, options: open.map(o => o.label), effects: open.map(o => o.effects || []) };
  },
  MONSTER_ENCOUNTER: (g, c, e) => startEncounter(g, c, { ambush: !!e.ambush, type: e.monster ?? null }),
  REQUEST_COMBAT: (g, c, e) => startEncounter(g, c, { ambush: !!e.ambush, type: e.monster ?? null }),
  // D11 (provisional): a secret passage may cross a printed wall; it lasts for this turn's move only.
  OPEN_TEMPORARY_PASSAGE(g, c, e, f) { g.turn.secret = e.side; logEvent(g, { kind: 'secret-passage', side: e.side }); allowContinue(g, 'secret-passage', { card: owner(g, f).card }); },
  ROTATE_TILE: (g, c, e) => rotateTile(g, active(g).coord),
  CONTINUE_MOVEMENT: (g, c, e, f) => allowContinue(g, 'card', { card: owner(g, f).card ?? null }),
  // Internal (not allowed in content): announce the monster's reaction if it survived, then apply it.
  _REVEAL: (g, c) => revealReaction(g, c),
  _REACT: (g, c) => applyReaction(g, c),
  _SKIP(g) {
    const left = active(g).conditions.find(x => x.id === 'skip-turns')?.turns ?? 0;
    logEvent(g, { kind: 'turn-skipped', seat: g.activeSeat, left });
    g.turn.endNow = true;
  },
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
  if (f.card && f.turnDisposition === 'continue') allowContinue(g, 'card', { card: f.card });
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
  } else if (f.kind === 'reshuffle') {
    // D62 (spec v6, 1985-supported): the card went back and the pile was shuffled above; the hero at once draws the door
    // card they were trying to get and it resolves normally (again, if it is another "shuffle again"). No extra turn.
    if (!drawAndResolve(g, content, 'DOOR', 'door', { door: f.door })) g.turn.endAfter = true; // empty pile: as in movement.js
  } else if (f.kind === 'closed') {
    g.turn.triedDoors.push(edge);
    if (noDetour) g.turn.endAfter = true; // dark-room exit or a return move: D07, stay and retry
    else allowContinue(g, 'door-stayed-closed', { edge });
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
  if (t.resume) { g.phase = t.resume; t.resume = null; return; } // D53: a free item use leaves the turn where it was
  if (t.endAfter || !t.mayContinue) return endTurn(g, content);
  g.phase = 'CHOOSE_EXIT';
}

