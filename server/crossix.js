// Crossix online rooms: rooms.js with this adapter (docs/plans/crossix-online-contract.md). The engine in
// site/crossix/engine owns every rule; here: who may act, the server's roll, picks hidden until the roll resolves, Skip.
// Tentative picks stay on the phone: a player sends their final picks once, with Done, and the engine checks them.
import { newGame, reduce, validState, rand, rollOff, rollWinner } from '../site/crossix/engine/reducer.js';
import { noPicks } from '../site/crossix/engine/moves.js';
import { MAX_ONLINE } from '../site/crossix/engine/lanes.js';
import { isInt, seed } from './rooms.js';

const lane = v => isInt(v, 0, 3);
const turn = v => isInt(v, 1, 1e6);

// The action as the server will use it, or null when its shape is wrong. Fields not listed are dropped.
function parse(a) {
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return null;
  switch (a.type) {
    case 'START': case 'LEAVE': case 'REMATCH': case 'roll': return { type: a.type };
    case 'reopen': return turn(a.n) ? { type: a.type, n: a.n } : null;
    case 'skip': return isInt(a.seat, 0, MAX_ONLINE - 1) ? { type: a.type, seat: a.seat } : null;
    case 'done': {
      const k = a.picks;
      if (!turn(a.n) || !k || typeof k !== 'object' || typeof k.penalty !== 'boolean') return null;
      const c = k.colour;
      if (!(k.white === null || lane(k.white))) return null;
      if (!(c === null || (c && typeof c === 'object' && lane(c.lane) && (c.die === 0 || c.die === 1)))) return null;
      if (k.penalty && (k.white !== null || c !== null)) return null;
      return { type: a.type, n: a.n, picks: { white: k.white, colour: c && { lane: c.lane, die: c.die }, penalty: k.penalty } };
    }
    default: return null;
  }
}

// Player p's final picks for this roll through the engine's own actions (white, colour, penalty), then their Done.
// Null when the engine refuses any of them.
function finish(g, p, k) {
  if (g.turn.phase !== 'choose' || g.turn.done[p]) return null;
  let s = structuredClone(g);
  s.turn.picks[p] = noPicks(); // what they send replaces any picks kept from before a reopen
  const steps = [
    k.white !== null && { type: 'pick', player: p, kind: 'white', lane: k.white },
    k.colour && { type: 'pick', player: p, kind: 'colour', lane: k.colour.lane, die: k.colour.die },
    k.penalty && { type: 'penalty', player: p, add: true },
    { type: 'done', player: p },
  ];
  for (const a of steps.filter(Boolean)) {
    const n = reduce(s, a);
    if (n === s) return null;
    s = n;
  }
  return s;
}

function apply(room, next, seat, a, cur) {
  const g = room.game, t = g?.turn;
  if (!g) return 'not_started';
  let game = null;
  switch (a.type) {
    case 'roll':
      if (seat !== t.active) return 'not_your_turn';
      game = reduce(g, a);
      break;
    // Done and reopen name the roll they are for, so a late one never lands on the next roll.
    case 'done': case 'reopen':
      if (a.n !== t.n || t.phase !== 'choose') return 'stale';
      game = a.type === 'done' ? finish(g, seat, a.picks) : reduce(g, { type: 'done', player: seat, value: false });
      break;
    // Any player moves the game on past a phone that has not polled for a minute (not only the host, whose phone can die
    // too): rolls for them, or ends their choice with nothing picked (the roller then takes the penalty, as the rules give
    // for marking nothing).
    case 'skip': {
      const k = a.seat;
      if (k === seat || !room.seats[k]) return 'illegal';
      if (cur.view.room.seats[k].connected) return 'not_away';
      if (t.phase === 'roll') game = k === t.active ? reduce(g, { type: 'roll' }) : null;
      else game = finish(g, k, k === t.active ? { ...noPicks(), penalty: true } : noPicks());
      break;
    }
    default: return 'illegal';
  }
  if (!game || game === g) return 'illegal';
  next.game = game;
  if (game.status === 'over') next.endedAt = Date.now();
  return next;
}

export const CROSSIX = {
  kind: 'crossix', max: MAX_ONLINE,
  // A seat is a name and an id never reused in the room, so phones can tell which of two same-named players left.
  seat: (_, room) => ({ id: room ? Math.max(-1, ...room.seats.map(s => s.id ?? -1)) + 1 : 0 }),
  settings: () => ({}),
  roomView: () => ({}),
  seatView: s => ({ id: s.id }),
  parse,
  anyVersion: new Set(['done', 'reopen']), // a player's own picks do not depend on anyone else's Done
  // Online always rolls on screen. The seed comes from crypto here and never leaves the server. Who goes first is the
  // server's roll too (a seed of its own, so it tells nothing about the game's dice); rematches roll again.
  start(room) {
    const n = room.seats.length, r = { rng: seed() }, rolls = rollOff(n, () => 1 + Math.floor(rand(r) * 6));
    return newGame({ mode: 'digital', names: room.seats.map(s => s.name), seed: seed(), first: rollWinner(rolls, n), rolls });
  },
  apply,
  // Everything is public but the seed, the dice to come (rng) and other players' picks before the roll resolves.
  view(g, seat) {
    const { seed: _s, rng: _r, ...v } = g;
    if (v.turn?.phase === 'choose') v.turn = { ...v.turn, picks: v.turn.picks.map((k, i) => i === seat ? k : null) };
    return v;
  },
  check(g) { if (!validState(g) || g.mode !== 'digital') throw new Error('bad crossix state'); },
  over: g => g.status === 'over',
  presence: true,
};
