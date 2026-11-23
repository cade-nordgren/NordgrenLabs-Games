// The solo strip's model (soloStripModel in ui/words.js, drawn by soloStrip in ui/app.js): the one hero's HP, stats and
// ordinary gold; null for 2 to 4 players. Fixture content is NON-AUTHENTIC TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view } from '../../site/keep/engine/view.js';
import { contentIndex } from '../../site/keep/content/schema.js';
import { soloStripModel } from '../../site/keep/ui/words.js';
import { FX, setup, give } from './helpers.js';

const names = s => `P${s + 1}`;
const strip = g => soloStripModel(view(g, FX, 0), FX, names);

test("solo strip: the hero's own HP, four stats and ordinary gold; HP follows damage; multiplayer gets none", () => {
  const g = setup({ players: 1 }), h = g.heroes[0], def = contentIndex(FX).heroes.get(h.heroId);
  let m = strip(g);
  assert.deepEqual(m.hp, { left: h.hpStart, max: h.hpStart });
  assert.deepEqual(m.stats.map(s => `${s.short} ${s.value}`), [`Str ${def.stats.STR}`, `Agi ${def.stats.AGI}`, `Arm ${def.stats.ARM}`, `Luck ${def.stats.LCK}`]);
  assert.equal(m.gold, 0);
  assert.match(m.label, new RegExp(`^P1, ${def.name}: ${h.hpStart} of ${h.hpStart} HP, Strength ${def.stats.STR}, Agility ${def.stats.AGI}, Armour ${def.stats.ARM}, Luck ${def.stats.LCK}, gold 0`));
  give(g, 0, 'ROOM', 'FX_ROOM_COINS');
  give(g, 0, 'TREASURY', 'FX_TREASURY_B');
  assert.equal(strip(g).gold, 7, 'ordinary gold only, as the public view counts it; chamber cards stay out');
  h.hp -= 3;
  assert.deepEqual(strip(g).hp, { left: h.hpStart - 3, max: h.hpStart });
  h.hp = -2;
  assert.equal(strip(g).hp.left, 0, 'never below 0');
  assert.equal(soloStripModel(view(setup({ players: 2 }), FX, 0), FX, names), null);
  assert.equal(soloStripModel(view(setup({ players: 4 }), FX, null), FX, names), null);
});
