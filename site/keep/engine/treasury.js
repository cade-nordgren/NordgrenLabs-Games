// Central treasure chamber and the shared dragon deck (system 8; RB 9, SP 8).
import { roll, shuffle, logEvent } from './dice.js';
import { draw } from './decks.js';
import { damageHero, returnTreasury } from './heroes.js';
import { key, squareKind, neighbour, occupiedBy } from './board.js';
import { SIDES } from './tiles.js';
import { enterTile } from './movement.js';
import { run } from './effects.js';
import { contentIndex } from '../content/schema.js';

const isAwake = (content, inst) => contentIndex(content).cards.get(inst.split('#')[0]).kind === 'awake';
export const inChamber = (g, content) => g.heroes.filter(h => h && h.status === 'inside' && squareKind(content.board, h.coord) === 'center');

// RB 9.3, SP 8: odds from the cards actually remaining, "1 in N".
export function wakeOdds(g, content) {
  return { awake: g.dragon.remaining.filter(i => isAwake(content, i)).length, remaining: g.dragon.remaining.length };
}

// RB 9.1, SP 8: two private treasure-chamber cards, then one dragon card from the shared deck.
// D18: also on the entry turn. Sleeping: set aside without replacement, turn ends. Awake: the wake.
// shortcut: treasure-chamber cards are kept as drawn; card effects on them run once that content exists (M4).
export function collect(g, content, seat) {
  const hero = g.heroes[seat];
  g.phase = 'TREASURY_COLLECT';
  for (let k = 0; k < 2; k++) {
    const inst = draw(g, 'TREASURY', 'chamber collect', seat);
    if (inst) hero.treasury.push(inst);
  }
  g.phase = 'DRAGON_DRAW';
  const odds = wakeOdds(g, content);
  logEvent(g, { kind: 'dragon-odds', ...odds });
  const inst = g.dragon.remaining.shift();
  g.dragon.aside.push(inst);
  logEvent(g, { kind: 'draw', deck: 'DRAGON', value: inst, card: isAwake(content, inst) ? 'awake' : 'sleeping' });
  if (!isAwake(content, inst)) { g.turn.endAfter = true; return; }
  // RB 9.2: everyone in the chamber, the waker first, then clockwise.
  const n = g.seats.length;
  const here = new Set(inChamber(g, content).map(h => h.seat));
  const queue = Array.from({ length: n }, (_, k) => (seat + k) % n).filter(s => here.has(s));
  g.wake = { waker: seat, queue, burned: false };
  logEvent(g, { kind: 'dragon-wakes', waker: seat, queue });
  g.phase = 'DRAGON_WAKES';
}

// D19 (interpretation; plan 13 #2): an already revealed ordinary maze tile orthogonally adjacent to the
// chamber (either square: it is one double room), free under single occupancy; no open passage needed.
export function forcedMoveTargets(g, content) {
  const out = [];
  for (const c of content.board.center) for (const dir of SIDES) {
    const to = neighbour(c, dir);
    if (squareKind(content.board, to) !== 'maze' || !g.board.tiles[key(to)] || occupiedBy(g, to)) continue;
    if (!out.some(t => t.to === key(to))) out.push({ to: key(to), from: c, dir });
  }
  return out.sort((a, b) => (a.to < b.to ? -1 : 1));
}

// RB 9.2, SP 8, per hero in the queue: treasure-chamber cards to the bottom of their deck, a straight
// D12 of damage (no Luck), then a forced move outside turn order. D19: no legal tile -> stays put.
export function continueWake(g, content) {
  const w = g.wake;
  while (w.queue.length) {
    if (g.pending) return;
    const seat = w.queue[0];
    const hero = g.heroes[seat];
    if (!w.burned && hero.status === 'inside') {
      w.burned = true;
      returnTreasury(g, seat);
      damageHero(g, content, seat, roll(g, 'D12', 'dragon fire'), 'dragon fire (D12)');
    }
    if (hero.status !== 'inside') { w.queue.shift(); w.burned = false; continue; }
    const targets = forcedMoveTargets(g, content);
    if (!targets.length) {
      logEvent(g, { kind: 'forced-move-none', seat }); // D19 stay-put exception (house rule, provisional)
      w.queue.shift(); w.burned = false;
      continue;
    }
    g.phase = 'FORCED_MOVE';
    g.pending = { kind: 'forced-move', seat, targets: targets.map(t => t.to) };
    return;
  }
  // RB 9.2: after the evacuation the dragon sleeps and all eight cards are reshuffled.
  g.wake = null;
  resetDragon(g);
  g.turn.endAfter = true;
  run(g, content);
}

export function forcedMove(g, content, seat, to) {
  const t = forcedMoveTargets(g, content).find(x => x.to === to);
  g.pending = null;
  g.wake.queue.shift();
  g.wake.burned = false;
  const hero = g.heroes[seat];
  hero.coord = { ...t.from }; // leave from the chamber square next to the target
  enterTile(g, content, seat, neighbour(t.from, t.dir), { dir: t.dir, via: 'forced', drawRoom: false });
  continueWake(g, content);
}

export function resetDragon(g) {
  const all = [...g.dragon.remaining, ...g.dragon.aside];
  g.dragon.remaining = shuffle(g, all.sort(), 'DRAGON');
  g.dragon.aside = [];
  g.dragon.resets += 1;
  logEvent(g, { kind: 'dragon-reset' });
}

// D22 (interpretation): the deck also resets when the chamber empties after voluntary exits.
export function checkDragonReset(g, content) {
  if (g.status !== 'playing' || g.wake || !g.dragon.aside.length || inChamber(g, content).length) return;
  resetDragon(g);
}
