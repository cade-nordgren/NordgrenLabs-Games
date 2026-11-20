// Result cards (owner spec v12, fix 1): what one action did, as an ordered list of cards the table acknowledges one by
// one (ui/app.js shows them in the roll card). DOM-free, so tests build the same model the screen shows. Display only:
// every line is read from the log entries the action added, in the order the engine resolved them, from the view of
// whoever is looking (the public view in multiplayer), so a card never says more than that view holds.
// A card: { title, what: [lines], dice: [{ die, value, text, tag }], results: [{ tag, text }] }; tags are OUTCOME_TAG keys.
import { cardDef } from '../engine/decks.js';
import { view } from '../engine/view.js';
import { contentIndex } from '../content/schema.js';
import { chamberName, theChamber, chamberCards } from '../content/schema.js';
import { effectText } from '../engine/describe.js';
import { rollKind, rollWords, deckWord, itemName, itemText, STAT, OUTCOME_TAG, CONDITION, CONDITION_OFF } from './words.js';

export { OUTCOME_TAG };
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
const CARD_DECKS = new Set(['ROOM', 'SEARCH', 'ROOM_SEARCH', 'CHEST', 'DOOR']);
const TEST_TITLE = { portcullis: 'Lift the portcullis', 'well entry': 'Enter the well room', 'well jump': 'Jump the well', 'force rubble': 'Force through the rubble' };
const EMPTY = { ROOM: 'The room is empty.', CHEST: 'The chest is empty.', SEARCH: 'Nothing is found.', ROOM_SEARCH: 'Nothing is found.' };
const DOOR = {
  opens: ['success', 'The door opens: you go through.'],
  trap: ['failure', 'The door was trapped: it stays shut and your turn ends.'],
  reshuffle: ['none', 'The door cards are shuffled and another door card is drawn for the same door.'],
};
const REACTION_TAG = { 'strike-then-flight': ['success', 'It strikes, then you get away.'], 'strike-then-combat': ['action', 'It strikes, then a fight begins.'] };
const n2 = n => (n === 2 ? 'two' : String(n));

// What a drawn card is, in one short line: the owner's text, a choice it asks, or its effects in plain words.
function cardSummary(def, content) {
  if (def.text) return def.text;
  if (def.kind === 'reshuffle' && def.deck !== 'DOOR') return `Shuffle the ${deckWord(def.deck, content)} back and draw another.`;
  const first = def.effects?.[0];
  if (first?.op === 'REQUEST_CHOICE') return `Choose: ${first.options.map(o => o.label).join(' or ')}.`;
  if (first?.op === 'NAME_NUMBERS') return `Name ${first.count === 1 ? 'a number' : `${first.count} numbers`}, then roll a D6.`;
  const said = effectText(def, chamberName(content));
  if (said.length <= 140) return said;
  // A long chain of effects: what kind of thing it is; the dice and result lines below say what came of it.
  if (first?.op === 'CHECK_STAT') return `A ${STAT[first.stat]} test decides what happens.`;
  if (first?.op === 'ROLL_TABLE') return `Roll a ${first.die}: the number decides what happens.`;
  if (first?.op === 'SET_CONDITION') return `${first.label || 'A lasting effect'}: it lasts into your next turns.`;
  return said;
}

// events: the entries one action added, from the viewer's view (seq order). ctx: { content, name(seat), pending (the
// prompt the action answered, or null), nextPending (the prompt after it), odds ({ awake, remaining } after it),
// wasAwake (the dragon before it), weapon (the acting hero's special weapon definition, for a table it rolls) }.
export function resultCards(events, ctx) {
  const { content } = ctx, who = s => ctx.name(s);
  const cards = [], regs = {}, skipHost = {};
  let cur = null, fight = false;
  const open = (title, what = [], extra = {}) => { cur = { title, what: what.filter(Boolean), dice: [], results: [], ...extra }; cards.push(cur); fight = false; return cur; };
  // An effect with no card drawn in this action belongs to the card still resolving (a choice or a ring prompt before it).
  const held = typeof ctx.card === 'string' ? cardDef(content, ctx.card) : null;
  const significant = (title = null) => cur || open(title || held?.name || 'What happened', [], { def: held });
  const res = (tag, text) => { significant().results.push({ tag, text }); };
  events.forEach((e, i) => {
    const rest = events.slice(i + 1);
    switch (e.kind) {
      case 'draw': {
        if (e.deck === 'TREASURY') {
          if (e.reason === 'chamber collect' && cur?.kind !== 'collect') open(capital(chamberName(content)), [`${who(e.seat)} takes two ${chamberCards(content)}, then a dragon card.`], { kind: 'collect', seat: e.seat });
          return;
        }
        if (e.deck === 'DRAGON') {
          if (cur?.kind !== 'collect') open(capital(chamberName(content)), [], { kind: 'collect', seat: e.seat });
          const odds = [...events.slice(0, i)].reverse().find(x => x.kind === 'dragon-odds');
          if (e.card === 'awake') {
            Object.assign(cur, { kind: 'wake', title: 'The dragon wakes!' });
            cur.what = [`${who(e.seat)} took two ${chamberCards(content)} and drew the dragon card that wakes it${odds ? ` (it woke on ${odds.awake} in ${odds.remaining})` : ''}.`];
          } else res('none', `Dragon card: asleep. The dragon sleeps on${odds ? `; next time it wakes on ${odds.awake} in ${odds.remaining - 1}` : ''}. Your turn ends.`);
          return;
        }
        if (!CARD_DECKS.has(e.deck)) return; // tiles, and the monster card (the fight's own panels)
        const def = typeof e.value === 'string' && e.value !== 'hidden' ? cardDef(content, e.value) : null;
        if (!def) { open(capital(deckWord(e.deck, content)), ['Drawn and kept secret.']); return; }
        open(e.cardName || def.name, [capital(deckWord(e.deck, content)), cardSummary(def, content)], { def, deck: e.deck, seat: e.seat });
        if (def.kind === 'reshuffle' && e.deck !== 'DOOR') res('none', `No effect: the ${deckWord(e.deck, content)} are shuffled and another is drawn at once.`.replace(/card are/, 'cards are'));
        return;
      }
      case 'roll': {
        const kind = rollKind(e.reason);
        if (kind === 'first-player' || kind === 'monster-pick') return; // the setup screen; the computer's secret pick
        const m = /^(?:card|table) roll (\S+)$/.exec(e.reason);
        if (m) regs[m[1]] = e.die;
        if (kind === 'test' && (e.reason !== 'card test' || !cur)) {
          const t = rest.find(x => x.kind === 'test');
          open(TEST_TITLE[e.reason] || `${STAT[t?.stat] || 'Attribute'} test`);
        } else if (kind === 'dark-exit') open('Find the way out');
        else if (kind === 'named') open(/\((.*)\)$/.exec(e.reason)?.[1] || 'Name numbers', [], { def: held });
        else if (kind === 'dragon-fire' && !['wake', 'fire'].includes(cur?.kind)) open('Dragon fire', ['The dragon is awake and breathes fire.'], { kind: 'fire' });
        else if (kind === 'table' && ctx.weapon && rest[0]?.kind === 'table-row' && !cur?.weapon) open(ctx.weapon.verb || ctx.weapon.name, [], { def: ctx.weapon, weapon: true });
        else if (fight && kind !== 'strike') return;
        else significant();
        cur.dice.push({ die: e.die, value: e.value, ...rollWords(e, rest, { content, name: ctx.name, regs, def: cur.def, pending: ctx.pending, weapon: !!cur.weapon }) });
        return;
      }
      case 'item': {
        if (e.action === 'obtain') {
          if (e.group === 'chamber') {
            if (e.value === 'hidden') {
              const last = cur?.results.at(-1);
              if (last?.secret === e.seat) { last.count += 1; last.text = `${who(e.seat)} takes ${n2(last.count)} ${chamberCards(content, last.count)}, kept secret.`; return; }
              significant().results.push({ tag: 'item', text: `${who(e.seat)} takes a ${chamberCards(content, 1)}, kept secret.`, secret: e.seat, count: 1 });
              return;
            }
            const def = cardDef(content, e.value);
            return res('item', `${who(e.seat)} takes ${def.name}, ${def.gold || 0} gold (${chamberCards(content, 1)}).`);
          }
          const def = e.group === 'equipment' || e.group === 'ring' ? null : cardDef(content, e.value);
          if (def && !def.gold && !def.use && (def.effects || []).some(x => x.op === 'SET_CONDITION')) return; // a kept marker (the torch): its condition line says it
          return res('item', `${who(e.seat)} keeps it: ${itemName(e, content)}${def?.gold ? `, ${def.gold} gold` : ''}.`);
        }
        if (e.action === 'lose' && e.group === 'chamber') {
          if (e.why === 'dragon' && !['wake', 'fire'].includes(cur?.kind)) open('Dragon fire', ['The dragon is awake and breathes fire.'], { kind: 'fire' });
          const last = cur?.results.at(-1);
          const say = c => (e.why === 'dragon' ? `${who(e.seat)} loses their ${chamberCards(content)} to the dragon (${c} ${c === 1 ? 'card' : 'cards'}).` : `${who(e.seat)} loses ${c} ${chamberCards(content, c)}.`);
          if (last?.lost === `${e.seat}${e.why}`) { last.count += 1; last.text = say(last.count); return; }
          significant().results.push({ tag: 'status', text: say(1), lost: `${e.seat}${e.why}`, count: 1 });
          return;
        }
        if (e.action === 'lose') return res('status', `${who(e.seat)} loses ${itemName(e, content)}.`);
        if (e.action === 'use' && e.group !== 'chamber') {
          const def = e.group === 'equipment' ? (content.specialWeapons || []).find(w => w.id === e.value) : e.group === 'ring' ? null : cardDef(content, e.value);
          if (e.group === 'equipment') open(def?.verb || def?.name || 'Special weapon', [], { def, weapon: true });
          else if (e.group !== 'ring') open(itemName(e, content), [itemText(def) || ''], { def: def && def.use ? { effects: def.use.effects } : def });
        }
        return;
      }
      case 'damage':
        if (fight && !cur) return; // a fight's exchange: its Reveal and fight row say it
        if (/^dragon fire/.test(e.reason) && !cur?.results.some(r => r.lost === `${e.seat}dragon`)) significant().results.push({ tag: 'none', text: `${who(e.seat)} has no ${chamberCards(content)} to lose.` });
        return res(e.amount ? 'damage' : 'none', e.amount ? `${who(e.seat)} takes ${e.amount} damage. HP ${Math.max(0, e.hp + e.amount)} to ${Math.max(0, e.hp)}.` : `${who(e.seat)} takes no damage.`);
      case 'heal': return res(e.amount ? 'healed' : 'none', e.amount ? `${who(e.seat)} gains ${e.amount} HP. HP ${e.hp - e.amount} to ${e.hp}.` : `${who(e.seat)} gains no HP.`);
      case 'death': return fight && !cur ? undefined : res('death', `${who(e.seat)} dies.`);
      case 'condition': {
        if (e.id === 'skip-turns') {
          skipHost[e.seat] = significant();
          return res('skipped', `${who(e.seat)} misses the next ${e.turns === 1 ? 'turn' : `${e.turns} turns`}${e.label ? ` (${e.label.toLowerCase()})` : ''}.`);
        }
        if (!cur || e.id === 'well-edge' || e.id === 'dark' || cur.dice.some(d => /^You named/.test(d.text))) return; // a tile's own prompt says these
        return res('status', `${who(e.seat)} ${CONDITION[e.id] || `is affected: ${(e.label || 'a lasting effect').toLowerCase()}`}.`);
      }
      case 'condition-cleared':
        if (!cur || e.id === 'skip-turns' || e.id === 'well-edge' || e.id === 'dark' || cur.dice.some(d => /^You named/.test(d.text))) return;
        return res('success', `${who(e.seat)} ${CONDITION_OFF[e.id] || 'is free of a lasting effect'}.`);
      case 'turn-skipped': {
        const host = skipHost[e.seat];
        if (!host || cards.at(-1) !== host) {
          const label = [...(ctx.log || events.slice(0, i))].reverse().find(x => x.kind === 'condition' && x.id === 'skip-turns' && x.seat === e.seat && x.seq < e.seq)?.label;
          open(`${who(e.seat)} misses a turn`, [label ? `${who(e.seat)} is ${label.toLowerCase()}.` : '']);
          skipHost[e.seat] = cur;
        }
        cur = skipHost[e.seat];
        const last = cur.results.at(-1);
        const say = c => `${c === 1 ? 'This turn is missed' : `${capital(n2(c))} turns are missed now`}${e.left ? `, ${e.left} more to miss` : ''}.`;
        if (last?.skips === e.seat) { last.count += 1; last.text = say(last.count); return; }
        cur.results.push({ tag: 'skipped', text: say(1), skips: e.seat, count: 1 });
        return;
      }
      case 'turn': if (cur && cur !== skipHost[e.seat]) cur = null; return;
      case 'encounter':
        res('action', e.ambush ? 'An ambush: the monster strikes first, then you choose what to do (no waiting).' : 'A monster appears. Choose what to do before it shows itself.');
        return;
      case 'commit': case 'combat-pick': case 'exchange': case 'throw': fight = true; cur = null; return;
      case 'combat': if (cur) res('action', 'A fight begins.'); fight = true; cur = null; return;
      case 'reaction': {
        const r = REACTION_TAG[e.type];
        if (!r) { fight = true; cur = null; return; } // no die and no damage: the fight's panels and end card say it
        open("The monster's answer");
        return res(...r);
      }
      case 'monster-dead': if (cur?.weapon) res('success', 'The monster is dead.'); return;
      case 'encounter-end': if (cur?.weapon && e.outcome === 'monster-killed' && !cur.results.some(x => x.text === 'The monster is dead.')) res('success', 'The monster is dead.'); cur = null; fight = false; return;
      case 'door': {
        if (e.result === 'closed') {
          const detour = rest.some(x => x.kind === 'may-continue' && x.reason === 'door-stayed-closed');
          return res(detour ? 'action' : 'failure', detour ? 'The door stays shut. You may try another way this turn.' : 'The door stays shut: your turn ends here.');
        }
        return DOOR[e.result] ? res(...DOOR[e.result]) : undefined;
      }
      case 'may-continue': if (cur && e.reason === 'card') res('action', 'You may keep moving this turn.'); return;
      case 'secret-passage': return res('action', e.side === 'any-orthogonal' ? 'A secret passage: you may move to any neighbouring square this turn, even through a wall.' : `A secret passage on the ${{ N: 'north', E: 'east', S: 'south', W: 'west' }[e.side]} side, this turn.`);
      case 'flight-blocked': if (cur && !cur.dice.length) res('failure', 'There is no way back.'); return;
      case 'trap-ignored': {
        if (!cur && typeof e.card === 'string' && e.card !== 'hidden') open(cardDef(content, e.card).name, ['Protection Ring']);
        return res('none', `The trap does not affect ${who(e.seat)}.`);
      }
      case 'freed': {
        const name = typeof e.item === 'string' ? cardDef(content, e.item)?.name : null;
        if (!cur) open(name || 'Free');
        return res('success', `${who(e.seat)} is out at once, with the ${name?.toLowerCase() || 'item'}.`);
      }
      case 'dragon-wakes': {
        const names = e.queue.map(who);
        cur = cur?.kind === 'wake' ? cur : open('The dragon wakes!', [], { kind: 'wake' });
        cur.what.push(`In ${theChamber(content)}: ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}. In turn${names.length > 1 ? `, from ${names[0]}` : ''}, each loses their ${chamberCards(content)}, takes dragon fire (a D12 of damage) and is driven out to a room next to the lair. No room card is drawn.`);
        return;
      }
      case 'forced-move-none': return res('status', `${who(e.seat)} has nowhere to go and stays in ${theChamber(content)}.`);
      case 'dragon-stays-awake': {
        if (!['wake', 'fire'].includes(cur?.kind)) open('The dragon stays awake');
        const names = e.seats.map(who);
        return res('status', `The dragon stays awake: ${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} still in ${theChamber(content)}.`);
      }
      case 'dragon-reset': {
        const awake = ctx.wasAwake || ['wake', 'fire'].includes(cur?.kind);
        if (!['wake', 'fire'].includes(cur?.kind)) open(awake ? 'The dragon sleeps' : capital(chamberName(content)));
        const odds = ctx.odds ? ` It wakes on ${ctx.odds.awake} in ${ctx.odds.remaining}.` : '';
        return res('status', awake ? `${capital(theChamber(content))} is empty: the dragon sleeps again.${odds}` : `${capital(theChamber(content))} is empty: the dragon cards are shuffled back.${odds}`);
      }
      case 'dragon-awake-no-collect':
        open(capital(chamberName(content)));
        return res('none', `The dragon is awake: no ${chamberCards(content)} can be taken until ${theChamber(content)} is empty.`);
      case 'deck-empty': if (CARD_DECKS.has(e.deck) || e.deck === 'TREASURY') res('none', `The ${deckWord(e.deck, content)} pile is empty: nothing is drawn.`); return;
      default: return;
    }
  });
  // A card that only named its effect still says what came of it: an empty room, a choice to make, a forced move.
  for (const c of cards) {
    if (c.def && CARD_DECKS.has(c.deck) && !c.results.length && !c.dice.length) {
      if (c.def.kind === 'empty' || !(c.def.effects || []).length) c.results.push({ tag: 'none', text: EMPTY[c.deck] || 'Nothing happens.' });
    }
  }
  const last = cards.at(-1), np = ctx.nextPending;
  if (last && np) {
    const say = np.kind === 'choice' ? 'Your choice comes next.' : np.kind === 'name-numbers' ? 'Name your numbers next.' : np.kind === 'trap-ring' ? 'A trap: you may use the Protection Ring first.'
      : np.kind === 'forced-move' ? `${who(np.seat)} is driven out next: pick a room next to ${theChamber(content)}. No room card is drawn.` : np.kind === 'move-choice' ? 'Pick a neighbouring square next.' : null;
    if (say && !last.results.some(r => r.tag === 'action' && r.text === say)) last.results.push({ tag: 'action', text: say });
  }
  if (last?.kind === 'wake' || last?.kind === 'fire') {
    if (np?.kind === 'forced-move' && !last.results.some(r => /stays awake|sleeps again/.test(r.text))) last.results.push({ tag: 'status', text: `The dragon stays awake until ${theChamber(content)} is empty.` });
  }
  return cards.filter(c => c.results.length || c.dice.length).map(({ title, what, dice, results }) => ({ title, what, dice, results: results.map(({ tag, text }) => ({ tag, text })) }));
}

// The cards for one action (prev -> next), from what viewer may see (null: the public view). name: seat -> player name.
export function actionCards(prev, next, content, name, viewer = null) {
  const v = view(next, content, viewer);
  const hero = prev.heroes?.[prev.activeSeat], wid = hero && contentIndex(content).heroes.get(hero.heroId)?.specialWeaponId;
  const frame = [...(prev.stack || [])].reverse().find(f => f.card && f.deck !== 'TREASURY' && f.deck !== 'MONSTER');
  return resultCards(v.log.filter(e => e.seq > prev.log.length), {
    content, name, pending: prev.pending, card: frame?.card ?? null, nextPending: next.status === 'playing' ? next.pending : null, odds: v.dragon?.odds, wasAwake: !!prev.dragon?.awake, log: v.log,
    weapon: wid ? (content.specialWeapons || []).find(w => w.id === wid) : null,
  });
}

// The "What just happened" panel (spec v12 fix 1): the whole turn the latest action was taken in, from its turn line,
// through everything that action set off. seen: the log length before that action, compared by seq (a view drops the
// shuffles, so an index into it is not a position in the log).
export function latestTurn(log, seen) {
  if (!seen) return [];
  const from = log.findLast(e => e.kind === 'turn' && e.seq <= seen)?.seq ?? 1;
  return log.filter(e => e.seq >= from);
}

// The cards as one sentence each, for the live region and tests.
export const cardSpeech = c => [c.title, ...c.what, ...c.dice.map(d => `${OUTCOME_TAG[d.tag]}. ${d.text}`), ...c.results.map(r => `${OUTCOME_TAG[r.tag]}: ${r.text}`)].join(' ');

// The card sequence after an action, DOM-free: show(card, i, n) draws one card; done() runs once the last is acknowledged.
// Both run synchronously inside start() and next() (spec v12 fix 5: no frame, animation or timer gates the table).
export function cardQueue(show, done) {
  let list = [], i = 0;
  return {
    start(cards) { list = cards; i = 0; if (list.length) show(list[0], 0, list.length); else done(); return list.length > 0; },
    next() { if (i + 1 < list.length) { i += 1; show(list[i], i, list.length); return true; } list = []; i = 0; done(); return false; },
    get pending() { return list.length > 0; },
  };
}
