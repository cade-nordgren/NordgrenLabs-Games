// Owner spec v12 (2026-11-20): the five browser-audit UI fixes, checked on their DOM-free parts, and the owner's ruling
// on the dragon's forced move (trapped heroes keep their tile's rules; no rescue). Positions come from the developer
// scenario tool (tools/keep-scenario.js), on the owner content "Play-test my content" uses; nothing here changes a rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reduce } from '../../site/keep/engine/reducer.js';
import { legalActions } from '../../site/keep/engine/phases.js';
import { view } from '../../site/keep/engine/view.js';
import { cardDef } from '../../site/keep/engine/decks.js';
import { actionCards, resultCards, cardQueue, cardSpeech, latestTurn, OUTCOME_TAG } from '../../site/keep/ui/results.js';
import { rollKind, rollWords, ROLL_KINDS, namedSteps, choiceSteps, formulaWords } from '../../site/keep/ui/words.js';
import { SCENARIOS, build, CONTENT } from '../../tools/keep-scenario.js';

const C = CONTENT;
const src = f => readFileSync(new URL(`../../site/keep/${f}`, import.meta.url), 'utf8');
const nameOf = g => s => g.seats[s].name;
const pick = (g, want) => legalActions(g, C).find(x => Object.entries(want).every(([k, v]) => x[k] === v));
// One action from prev, with the cards the table sees (the solo player's view, or the public view in multiplayer).
function step(prev, want) {
  const a = pick(prev, want);
  assert.ok(a, `legal: ${JSON.stringify(want)} in ${prev.phase}`);
  const next = reduce(prev, a, C);
  return { prev, next, cards: actionCards(prev, next, C, nameOf(next), next.seats.length === 1 ? 0 : null) };
}
// A scenario's hinted actions plus any more; every step's cards.
function run(name, more = []) {
  let g = build(name).game;
  const out = [];
  for (const want of [...SCENARIOS[name].then, ...more]) { const s = step(g, want); out.push(s); g = s.next; }
  return out;
}
const last = steps => steps.at(-1);
const text = cards => cards.map(cardSpeech).join(' | ');
// A named-number roll made to match or to miss: the D6 is the seed's, whatever is named, so name it, or avoid it.
function named(prev, match) {
  const p = prev.pending, probe = reduce(prev, pick(prev, { type: 'NAME_NUMBERS' }), C);
  const r = probe.log.findLast(e => e.kind === 'named-roll').value;
  const pool = match ? [r, ...[1, 2, 3, 4, 5, 6].filter(n => n !== r)] : [1, 2, 3, 4, 5, 6].filter(n => n !== r);
  return step(prev, { type: 'NAME_NUMBERS', numbers: pool.slice(0, p.count).sort((a, b) => a - b).join(',') });
}
const tags = card => [...card.dice.map(d => d.tag), ...card.results.map(r => r.tag)];

// ---- Fix 1: a result card for every card drawn and every automatic event.
test('spec v12 fix 1: poisonous mist shows its card, the D6 arithmetic, the damage with HP before and after, and the skipped turns on one card', () => {
  const { cards, next } = last(run('mist'));
  assert.equal(cards.length, 1, text(cards));
  const [c] = cards;
  assert.equal(c.title, 'Poisonous mist');
  assert.equal(c.what[0], 'Room card');
  assert.equal(c.dice.length, 1);
  assert.match(c.dice[0].text, /^Rolled \d, minus 3: \d damage\.$/);
  const dmg = c.results.find(r => r.tag === 'damage');
  assert.match(dmg.text, /^Player 1 takes \d damage\. HP 17 to \d+\.$/);
  assert.match(c.results.find(r => r.tag === 'skipped').text, /^Player 1 misses the next (turn|\d turns) \(unconscious\)\.$/);
  // Solo: the turns pass inside the same action, so they are said on the same card, not as another to acknowledge.
  assert.match(c.results.at(-1).text, /turns? (is|are) missed/);
  assert.equal(next.heroes[0].hp, +dmg.text.match(/to (\d+)/)[1]);
});

test('spec v12 fix 1: the explosion: 4 damage and the next turn missed, no dice', () => {
  const [c] = last(run('explosion')).cards;
  assert.equal(c.title, 'Explosion');
  assert.deepEqual(c.dice, []);
  assert.deepEqual(c.results.map(r => r.tag), ['damage', 'skipped', 'skipped']);
  assert.match(c.results[0].text, /takes 4 damage\. HP 17 to 13\./);
});

test('spec v12 fix 1 and 2: the trapdoor: the Luck test fails, then the fall: its D6 and the damage, then the pit', () => {
  const [c] = last(run('trapdoor')).cards;
  assert.equal(c.title, 'Trapdoor');
  assert.equal(c.dice.length, 2);
  assert.equal(c.dice[0].tag, 'failure');
  assert.match(c.dice[0].text, /You needed \d+ or less \(Luck \d+\)\. Fail\./);
  assert.equal(c.dice[0].die, 'D12');
  assert.equal(c.dice[1].die, 'D6');
  assert.match(c.dice[1].text, /^Rolled \d: \d damage\.$/);
  assert.ok(c.results.some(r => r.tag === 'status' && /trapdoor pit/.test(r.text)));
  assert.equal(c.results.at(-1).tag, 'action', 'the climb-out choice follows');
});

test('spec v12 fix 1: a chest that draws "Shuffle again": one card says the cards were shuffled, then the replacement has its own card', () => {
  const [first, open] = run('chest-shuffle');
  assert.equal(first.cards.length, 1);
  assert.match(first.cards[0].what[1], /^Choose: Open the chest or Leave it\.$/);
  assert.equal(first.cards[0].results.at(-1).tag, 'action');
  assert.equal(open.cards.length, 2, text(open.cards));
  assert.equal(open.cards[0].title, 'Shuffle again');
  assert.match(open.cards[0].results[0].text, /chest cards are shuffled and another is drawn/);
  const rep = open.next.log.filter(e => e.kind === 'draw' && e.deck === 'CHEST').at(-1);
  assert.equal(open.cards[1].title, cardDef(C, rep.value).name, 'the replacement, in order');
});

test('spec v12 fix 1: a door, then the room card drawn right after passing it: one card each, in order, the empty room included', () => {
  const { cards } = last(run('door-shuffle'));
  assert.deepEqual(cards.map(c => c.title), ['Shuffle again', 'Door opens', 'Empty room']);
  assert.match(cards[1].results[0].text, /^The door opens: you go through\.$/);
  assert.deepEqual(cards[2].results, [{ tag: 'none', text: 'The room is empty.' }]);
});

test('spec v12 fix 1: a door that stays shut says another way may be tried this turn', () => {
  const [c] = last(run('door-closed')).cards;
  assert.equal(c.title, 'Door stays shut');
  assert.deepEqual(c.results[0], { tag: 'action', text: 'The door stays shut. You may try another way this turn.' });
});

test('spec v12 fix 1: a kept treasure names the item and its gold', () => {
  const [c] = last(run('treasure-kept')).cards;
  assert.equal(c.title, 'Arm ring');
  assert.deepEqual(c.results, [{ tag: 'item', text: 'Player 1 keeps it: Arm ring, 40 gold.' }]);
});

test('spec v12 fix 1 and 2: bones: an even D12 says no monster appears (no effect); an odd one says a skeleton must be faced (action)', () => {
  const even = last(run('bones-even')).cards.at(-1), odd = last(run('bones-odd')).cards.at(-1);
  assert.equal(even.title, 'Bones');
  assert.equal(even.dice[0].tag, 'none');
  assert.match(even.dice[0].text, /^D12: \d+, even\. Nothing stirs: no monster appears\.$/);
  assert.equal(odd.dice[0].tag, 'action');
  assert.match(odd.dice[0].text, /^D12: \d+, odd\. A monster appears: you must face it\.$/);
  assert.equal(odd.results.at(-1).tag, 'action');
});

test('spec v12 fix 1, 2 and 3: the giant spider: a match says the spider is defeated (never "nothing happens"); a miss gives the damage and that the fight goes on', () => {
  const [, fight] = run('spider', [{ type: 'CHOOSE', option: 0 }]);
  assert.equal(fight.cards.length, 0, 'choosing Fight only brings the number picker');
  const win = named(fight.next, true).cards, lose = named(fight.next, false).cards;
  assert.equal(win[0].title, 'Fight the giant spider');
  assert.equal(win[0].dice[0].tag, 'success');
  assert.match(win[0].dice[0].text, /a match\. The spider is defeated\.$/);
  assert.doesNotMatch(text(win), /nothing happens/i);
  assert.equal(lose[0].dice[0].tag, 'damage');
  assert.match(lose[0].dice[0].text, /no match\. You take 1 damage and the fight goes on next turn\.$/);
  assert.ok(lose[0].results.some(r => r.tag === 'damage' && /takes 1 damage\. HP 17 to 16\./.test(r.text)));
  // The fight on a later turn: a match ends the turn as well; a miss costs 1 HP and the turn.
  const later = named(named(fight.next, false).next, true).cards;
  assert.match(later[0].dice[0].text, /The spider is defeated\. Your turn ends\.$/);
});

test('spec v12 fix 1 and 2: the torch: a miss keeps it out, a match relights it', () => {
  const s = last(run('torch-out'));
  assert.equal(s.cards[0].title, 'Torch goes out');
  assert.ok(!s.cards[0].results.some(r => r.tag === 'item'), 'the kept marker card is not an item gained');
  assert.equal(named(s.next, false).cards[0].dice[0].tag, 'failure');
  assert.match(named(s.next, true).cards[0].dice[0].text, /The torch is lit again\.$/);
});

test('spec v12 fix 1 and 2: the ceiling collapse: the named number is death; otherwise the second D6 is the damage', () => {
  const s = last(run('ceiling'));
  const dead = named(s.next, true).cards[0], hurt = named(s.next, false).cards[0];
  assert.equal(dead.dice[0].tag, 'death');
  assert.ok(dead.results.some(r => r.tag === 'death'));
  assert.equal(hurt.dice.length, 2);
  assert.match(hurt.dice[0].text, /no match\. A second D6 is rolled for the damage\.$/);
  assert.match(hurt.dice[1].text, /^Rolled \d: \d damage\.$/);
});

test('spec v12 fix 1 and 2: the small flask: both dice, the net change, the HP before and after', () => {
  const [c] = last(run('flask', [{ type: 'USE_ITEM' }])).cards;
  assert.equal(c.title, 'Small flask');
  assert.deepEqual(c.dice.map(d => d.die), ['D12', 'D6']);
  assert.match(c.dice[1].text, /^D6: \d, the HP lost\. D12 \d+, minus the D6 \d: -?\d+\. (You gain \d+ HP|You lose \d+ HP|No change)\.$/);
  assert.match(c.results[0].text, /HP 17 to \d+\./);
});

test('spec v12 fix 1 and 2: the ambush: D12 minus Luck explained; the crossbow shot: its own card with a hit, a miss or a kill', () => {
  const [amb, shot] = run('ambush-crossbow', [{ type: 'RESPOND', choice: 'special' }]);
  assert.match(amb.cards[0].dice[0].text, /^Rolled \d+, minus Luck \d+: -?\d+(, which counts as 0\. No damage\.| damage\.|\. No damage\.)/);
  assert.equal(shot.cards[0].title, 'Shoot');
  assert.match(shot.cards[0].dice[0].text, /^D6: \d\. (Miss\.|Roll a D6, the monster takes damage equal to half the roll, rounded down\.|The monster is killed outright\.)$/);
});

test('spec v12 fix 4: the dragon wakes with two heroes: one public card first, then each hero\'s fire, then the lair empties and the dragon sleeps', () => {
  const steps = run('dragon-wake-2p', [{ type: 'FORCED_MOVE', to: '4,4' }, { type: 'FORCED_MOVE', to: '5,4' }]);
  const [wake] = steps[0].cards;
  assert.equal(steps[0].cards.length, 1);
  assert.equal(wake.title, 'The dragon wakes!');
  assert.match(wake.what[0], /^Player 1 took two Dragon's Lair cards and drew the dragon card that wakes it/);
  assert.match(wake.what[1], /Player 1 and Player 2\. In turn, from Player 1, each loses their Dragon's Lair cards, takes dragon fire \(a D12 of damage\) and is driven out to a room next to the lair\. No room card is drawn\./);
  assert.equal(wake.dice[0].die, 'D12');
  assert.match(wake.dice[0].text, /^Rolled \d+: \d+ damage\./);
  assert.ok(wake.results.some(r => r.text === "Player 1 loses their Dragon's Lair cards to the dragon (2 cards)."));
  assert.ok(wake.results.some(r => /^Player 1 takes \d+ damage\. HP 17 to \d+\.$/.test(r.text)));
  assert.ok(wake.results.some(r => r.tag === 'action' && /Player 1 is driven out next/.test(r.text)));
  assert.equal(wake.results.at(-1).text, "The dragon stays awake until the Dragon's Lair is empty.");
  const fire = steps[1].cards.at(-1);
  assert.equal(fire.title, 'Dragon fire');
  assert.ok(fire.results.some(r => /^Player 2 /.test(r.text)));
  const sleep = steps[2].cards.at(-1);
  assert.equal(sleep.title, 'The dragon sleeps');
  assert.equal(sleep.results[0].text, "The Dragon's Lair is empty: the dragon sleeps again. It wakes on 1 in 8.");
  // Hidden information: the public card never names the chamber cards drawn and lost.
  const secret = steps[0].next.log.filter(e => e.kind === 'draw' && e.deck === 'TREASURY').map(e => cardDef(C, e.value).name);
  for (const n of secret) assert.ok(!text(steps[0].cards).includes(n), `${n} stays secret`);
  assert.ok(steps[0].cards[0].results.some(r => r.text === "Player 1 takes two Dragon's Lair cards, kept secret."));
});

test('spec v12 fix 4: a hero who cannot leave keeps the dragon awake, said publicly; a hero with no cards is told so', () => {
  const steps = run('dragon-stuck');
  const fire = steps[1].cards.at(-1);
  assert.ok(fire.results.some(r => r.text === "Player 2 has no Dragon's Lair cards to lose."));
  assert.ok(fire.results.some(r => r.text === "Player 2 has nowhere to go and stays in the Dragon's Lair."));
  assert.equal(fire.results.at(-1).text, "The dragon stays awake: Player 2 is still in the Dragon's Lair.");
});

test('spec v12 fix 4: app.js skips the private card screen after a wake (the lost cards are said on the public card)', () => {
  const app = src('ui/app.js');
  assert.match(app, /const woke = added\.some\(e => e\.kind === 'dragon-wakes'\);/);
  assert.match(app, /S\.peek = multi && !woke && /);
});

test('spec v12 fix 1: skipped turns in multiplayer are an acknowledged notice on the turn they pass, not a toast', () => {
  const app = src('ui/app.js');
  assert.doesNotMatch(app, /misses this turn/, 'the toast is gone');
  // Player 1 was caught in the mist on an earlier turn; player 2 stops now, and player 1's missed turn passes in that action.
  const cards = resultCards([
    { seq: 3, kind: 'stop', seat: 1 }, { seq: 4, kind: 'turn', seat: 0 },
    { seq: 5, kind: 'turn-skipped', seat: 0, left: 1 }, { seq: 6, kind: 'turn', seat: 1 },
  ], { content: C, name: s => `Player ${s + 1}`, log: [{ seq: 1, kind: 'condition', seat: 0, id: 'skip-turns', turns: 2, label: 'Unconscious' }] });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, 'Player 1 misses a turn');
  assert.deepEqual(cards[0].what, ['Player 1 is unconscious.']);
  assert.deepEqual(cards[0].results, [{ tag: 'skipped', text: 'This turn is missed, 1 more to miss.' }]);
});

test('spec v12 fix 1: "What just happened" keeps the whole last turn, read by seq (a view drops shuffles, so an index skips lines)', () => {
  const { prev, next } = last(run('mist'));
  const v = view(next, C, 0);
  const latest = latestTurn(v.log, prev.log.length);
  assert.equal(latest[0].kind, 'turn');
  assert.ok(latest.some(e => e.kind === 'move'), 'the move that began it');
  assert.ok(latest.some(e => e.kind === 'draw' && e.deck === 'ROOM'), 'the mist card');
  assert.ok(latest.some(e => e.kind === 'turn-skipped'), 'and the turns it cost');
  assert.ok(!v.log.slice(prev.log.length).some(e => e.kind === 'move'), 'the old index slice missed the move (the audit defect)');
  assert.deepEqual(latestTurn(v.log, 0), []);
});

// ---- Fix 2: every die explained, with an outcome tag.
test('spec v12 fix 2: every roll reason in the engine source maps to a roll kind with an explanation (a new roll fails here until worded)', () => {
  const engine = ['dice', 'effects', 'monsters', 'movement', 'reducer', 'treasury'].map(f => src(`engine/${f}.js`)).join('\n');
  // Each roll() call site, by its reason argument, with the reasons it can produce.
  const SITES = {
    'reason': ['portcullis', 'well entry', 'well jump', 'force rubble', 'card test'], // testStat(game, ..., reason): its callers below
    "`${f.table ? 'table' : 'card'} roll ${e.store}`": ['table roll x', 'card roll x'],
    "`table roll${e.store ? ` ${e.store}` : ''}`": ['table roll', 'table roll x'],
    "'ambush'": ['ambush'], "'digital variant: computer monster pick'": ['digital variant: computer monster pick'], "'dark room exit'": ['dark room exit'],
    '`first player, seat ${seat}`': ['first player, seat 0'], "`named roll${p.label ? ` (${p.label})` : ''}`": ['named roll', 'named roll (Fight the giant spider)'], "'dragon fire'": ['dragon fire'],
  };
  const calls = engine.split('\n').filter(l => /\broll\(g(?:ame)?, /.test(l) && !/export function roll/.test(l));
  assert.equal(calls.length, 11, `roll() call sites:\n${calls.join('\n')}`);
  for (const c of calls) assert.ok(Object.keys(SITES).some(k => c.includes(`, ${k})`)), `a new roll reason: give it a kind and words: ${c}`);
  const tests = [...engine.matchAll(/testStat\(g, [^;]*?'([a-z ]+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(tests)].sort(), ['card test', 'force rubble', 'portcullis', 'well entry', 'well jump']);
  const formulas = [...engine.matchAll(/evalExpr\([^;]*?, '([A-Za-z ]+)'\)/g)].map(m => m[1]);
  for (const r of [...Object.values(SITES).flat(), ...tests, ...formulas, 'formula']) assert.ok(ROLL_KINDS.includes(rollKind(r)), `${r}: ${rollKind(r)}`);
});

test('spec v12 fix 2: each roll kind reads as a consequence with a tag, never the bare number', () => {
  const spider = C.room.find(c => c.id === 'ROOM_025'), bones = C.chest.find(c => c.id === 'CHEST_007');
  const nn = spider.effects[0].options[0].effects[0];
  const r = (reason, die, value) => ({ kind: 'roll', reason, die, value });
  const SAMPLES = {
    test: [r('portcullis', 'D12', 5), { kind: 'test', reason: 'portcullis', stat: 'STR', target: 7, roll: 5, pass: true, modifiers: [] }],
    'dark-exit': [r('dark room exit', 'D6', 2), { kind: 'dark-exit', dir: 'N', roll: 2 }],
    card: [r('card roll collapse', 'D6', 4), { kind: 'formula', reason: 'damage formula', arithmetic: 'collapse 4 = 4', value: 4 }, { kind: 'damage', seat: 0, raw: 4, amount: 4, hp: 13 }],
    table: [r('table roll', 'D12', 7), { kind: 'table-row', value: 7, row: 0, empty: false }],
    named: [r('named roll (Fight the giant spider)', 'D6', 2), { kind: 'named-roll', seat: 0, numbers: [1, 2, 3], value: 2, match: true, label: nn.label }],
    ambush: [r('ambush', 'D12', 9), { kind: 'damage', seat: 0, raw: 5, amount: 5, hp: 12 }],
    'dragon-fire': [r('dragon fire', 'D12', 7), { kind: 'damage', seat: 0, raw: 7, amount: 7, hp: 9 }],
    damage: [r('damage formula', 'D6', 5), { kind: 'formula', reason: 'damage formula', arithmetic: 'D6 5 - 3 = 2', value: 2 }, { kind: 'damage', seat: 0, raw: 2, amount: 2, hp: 15 }],
    strike: [r('monster strike', 'D6', 3), { kind: 'formula', reason: 'monster strike', arithmetic: 'D6 3 = 3', value: 3 }, { kind: 'damage', seat: 0, raw: 3, amount: 3, hp: 14 }],
    formula: [r('formula', 'D6', 4), { kind: 'formula', reason: 'formula', arithmetic: 'D6 4 = 4', value: 4 }, { kind: 'heal', seat: 0, amount: 4, hp: 17 }],
    turns: [r('turns skipped', 'D6', 2), { kind: 'formula', reason: 'turns skipped', arithmetic: 'D6 2 = 2', value: 2 }, { kind: 'condition', seat: 0, id: 'skip-turns', turns: 2 }],
    'first-player': [r('first player, seat 0', 'D12', 9)],
    'monster-pick': [r('digital variant: computer monster pick', 'D6', 4)],
  };
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...ROLL_KINDS].sort(), 'a sample for every kind');
  const ctx = { content: C, name: s => `Player ${s + 1}`, regs: { collapse: 'D6' }, pending: { kind: 'name-numbers', ...nn }, def: bones };
  for (const [kind, [e, ...rest]] of Object.entries(SAMPLES)) {
    assert.equal(rollKind(e.reason), kind);
    const w = rollWords(e, rest, ctx);
    assert.ok(OUTCOME_TAG[w.tag], `${kind}: tag ${w.tag}`);
    assert.notEqual(w.text, `${e.die}: ${e.value}.`, `${kind} is explained`);
    assert.doesNotMatch(w.text, /undefined|NaN|\[object Object\]/);
  }
  assert.equal(formulaWords('D12 7 - LCK 4 = 3'), 'Rolled 7, minus your Luck 4: 3');
  assert.equal(formulaWords('D12 9 - 3 - ARM 2 = 4'), 'Rolled 9, minus 3, minus your Armour 2: 4');
  assert.equal(formulaWords('floor((second 4) / 2) = 2', { second: 'D6' }), 'Half of D6 4, rounded down: 2');
});

// ---- Fix 5: rendering after an acknowledgement never waits for a frame.
test('spec v12 fix 5: the card queue draws each card and finishes inside the same call (no frame, animation or timer)', () => {
  assert.equal(typeof globalThis.requestAnimationFrame, 'undefined', 'Node has no frames at all');
  const seen = [];
  let done = 0;
  const q = cardQueue((c, i, n) => seen.push(`${c.title} ${i + 1}/${n}`), () => { done += 1; });
  assert.equal(q.start([{ title: 'A' }, { title: 'B' }]), true);
  assert.deepEqual(seen, ['A 1/2']);
  assert.equal(q.pending, true);
  q.next();
  assert.deepEqual(seen, ['A 1/2', 'B 2/2']);
  assert.equal(done, 0);
  q.next();
  assert.equal(done, 1, 'the table is released synchronously by the last acknowledgement');
  assert.equal(q.pending, false);
  assert.equal(q.start([]), false);
  assert.equal(done, 2, 'no cards: released at once');
});

test('spec v12 fix 5: the UI never gates state on frames or animation events; Continue releases the table in its own handler', () => {
  for (const f of ['ui/app.js', 'ui/board.js', 'ui/dice.js', 'ui/words.js', 'ui/results.js', 'ui/daylight.js', 'ui/undo.js']) {
    assert.doesNotMatch(src(f), /requestAnimationFrame|animationend|transitionend|onanimationend|ontransitionend/, f);
  }
  const app = src('ui/app.js');
  assert.match(app, /ok\.onclick = \(\) => queue\.next\(\);/, 'Continue goes straight to the next card or cardsDone');
  assert.match(app, /function cardsDone\(\) \{[\s\S]*?if \(d\.open\) d\.close\(\);[\s\S]*?if \(!\$\('outcome'\)\.open\) release\(\);/, 'cardsDone closes and releases synchronously');
  assert.match(app, /\$\('outcome'\)\.onclick = outcomeDone;/);
  assert.match(app, /if \(held\) \{ release\(\); return; \}/, 'a stale control dispatches nothing');
  assert.match(app, /board\.settle\(\);/, 'the map is framed without waiting for a ResizeObserver frame');
  assert.match(app, /document\.addEventListener\('visibilitychange'[\s\S]*?else if \(S\.game && !held\) render\(\);/, 'back in view: drawn again');
  assert.match(src('ui/dice.js'), /return new Promise\(done => setTimeout\(/, 'the dice settle on a timer');
  assert.match(src('ui/dice.js'), /still\(\) \|\| document\.hidden/, 'no tumble while hidden');
});
