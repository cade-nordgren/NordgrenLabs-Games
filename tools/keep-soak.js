// Dusk Keep soak exposure counts: random legal play on the owner content (play-test mode), the same seeds and
// action picker as the catalogue soak in tests/keep/catalogue.test.js, counting how often the treasure chamber and
// the dragon deck were actually reached. Developer script, outside the published site. Run from the repo root:
//   node tools/keep-soak.js [games]        (default 600)
import ORIGINAL from '../site/keep/content/original/index.js';
import FX from '../site/keep/content/fixtures/fixtures.js';
import { mixContent } from '../site/keep/content/schema.js';
import { createGame, reduce } from '../site/keep/engine/reducer.js';
import { legalActions } from '../site/keep/engine/phases.js';
import { inChamber } from '../site/keep/engine/treasury.js';

const M = mixContent(ORIGINAL, FX);
const picker = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function soak(games) {
  const n = { games, lairEntries: 0, heroesWhoCollected: 0, collections: 0, dragonDraws: 0, sleepingDraws: 0, wakes: 0, resets: 0 };
  for (let i = 0; i < games; i++) {
    const players = [1, 2, 4][i % 3], pick = picker(5000 + i);
    let g = createGame({ players: Array.from({ length: players }, (_, s) => `P${s + 1}`), seed: 5000 + i, content: M });
    let inside = new Set();
    for (let step = 0; g.status !== 'over' && step < 6000; step++) {
      const la = legalActions(g, M);
      g = reduce(g, la[Math.floor(pick() * la.length)], M);
      const now = new Set(g.status === 'playing' ? inChamber(g, M).map(h => h.seat) : []);
      for (const s of now) if (!inside.has(s)) n.lairEntries++;
      inside = now;
    }
    const collectors = new Set();
    for (const e of g.log) {
      if (e.kind === 'dragon-odds') { n.collections++; collectors.add(e.seat); }
      if (e.kind === 'draw' && e.deck === 'DRAGON') { n.dragonDraws++; if (e.card === 'sleeping') n.sleepingDraws++; }
      if (e.kind === 'dragon-wakes') n.wakes++;
      if (e.kind === 'dragon-reset') n.resets++;
    }
    n.heroesWhoCollected += collectors.size;
  }
  return n;
}

if (process.argv[1]?.endsWith('keep-soak.js')) {
  console.log(soak(+process.argv[2] || 600));
}
