// Dice and randomness (system 4). The PRNG state lives in game.rng, so a saved
// game, a replay and an undo snapshot all carry the exact future of the dice.
// Every roll, test, draw and shuffle is appended to game.log.

export const DIE_SIDES = { D6: 6, D12: 12 };

// script: null for seeded dice, or an array of predetermined dice values (tests).
// A scripted game never falls back to the PRNG for dice: an empty script throws.
export function newRng(seed, script = null) {
  const s = seed >>> 0;
  return { seed: s, state: s, script: script ? [...script] : null };
}

// mulberry32, as Tidevault. Returns a float in [0, 1) and advances rng.state.
function next(rng) {
  const a = (rng.state + 0x6d2b79f5) | 0;
  rng.state = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function logEvent(game, event) {
  game.log.push({ seq: game.log.length + 1, ...event });
}

export function roll(game, die, reason) {
  const sides = DIE_SIDES[die];
  if (!sides) throw new Error(`Unknown die ${die}`);
  let value;
  if (game.rng.script) {
    if (!game.rng.script.length) throw new Error(`Dice script exhausted (${die}, ${reason})`);
    value = game.rng.script.shift();
    if (!Number.isInteger(value) || value < 1 || value > sides) throw new Error(`Scripted ${die} value ${value} out of range`);
  } else {
    value = 1 + Math.floor(next(game.rng) * sides);
  }
  logEvent(game, { kind: 'roll', die, value, reason });
  return value;
}

// RB 3, RB 5.1: roll D12, success when roll (+ modifier) <= stat.
export const statPasses = (d12, stat, modifier = 0) => d12 + modifier <= stat;

export function testStat(game, statName, stat, reason, modifier = 0) {
  const d12 = roll(game, 'D12', reason);
  const pass = statPasses(d12, stat, modifier);
  logEvent(game, { kind: 'test', stat: statName, target: stat, roll: d12, modifier, pass, reason });
  return { roll: d12, pass };
}

// Fisher-Yates on a copy. Shuffles always use the seeded PRNG (scripted games
// give deck and tile orders explicitly instead).
export function shuffle(game, items, deck) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next(game.rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  logEvent(game, { kind: 'shuffle', deck, count: a.length });
  return a;
}
