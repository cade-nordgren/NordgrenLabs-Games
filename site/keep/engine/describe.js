// Plain words for what a card does, generated from the same structured data the engine executes, so the
// wording cannot drift from the behaviour (owner play-test 2026-11-19). Fixture cards carry this as their `text`
// with a "Made-up test ..." prefix; the view gives it as `effectText` on inventory items and drawn cards.
// Players never read deck bookkeeping (owner, 2026-11-19): where a card goes afterwards and shuffles are left out
// of these lines and said by mechanicsText instead, which only the debug event log shows.
// ch: the chamber's display name (chamberName in content/schema.js), for the cards collected there.
const STAT = { STR: 'Strength', AGI: 'Agility', ARM: 'Armour', LCK: 'Luck' };
const DECK = { ROOM: 'room', SEARCH: 'search', ROOM_SEARCH: 'room search', CHEST: 'chest', DOOR: 'door', MONSTER: 'monster', TREASURY: 'treasure chamber' };
const DIR = { N: 'north', E: 'east', S: 'south', W: 'west' };
const REACTION = { 'monster-flees': 'it flees', combat: 'a fight', 'strike-then-flight': 'it strikes, then you get away', 'strike-then-combat': 'it strikes, then a fight', 'flight-succeeds': 'you get away', other: 'something else happens' };
const TIMING = { 'turn-action': "as your turn's action", 'encounter-special': 'as a special weapon before a monster is revealed', free: 'on your turn, before or between moves, without using your turn' };
const RING_TIMING = { 'turn-action': 'at the start of your turn, in place of your turn', 'door-or-portcullis': 'at a door or portcullis, in place of the door card or the Strength test', 'encounter-choice': 'when a monster appears, before it shows itself, never in an ambush', 'trap-drawn': 'when a card you draw is a trap, or as you enter a rotating room, before it turns' }; // spec v9: the room (D67)
// Spec v12 follow-up (owner, 2026-11-20): the same timings in a few words, for the short line every screen shows.
const TIMING_SHORT = { 'turn-action': "as your turn's action", 'encounter-special': 'before a monster shows itself', free: 'on your turn, without using your turn' };
const RING_TIMING_SHORT = { 'turn-action': 'at the start of your turn, in place of it', 'door-or-portcullis': 'at a door or portcullis', 'encounter-choice': 'when a monster appears, never in an ambush', 'trap-drawn': 'against a trap card, or before a rotating room turns' };
const AFTER = { bottom: 'goes to the bottom of its deck', remove: 'is removed from the game' };
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

// An amount: an integer, or { die, reg, plus, minusStat, plusCount } (plan 4.6).
export function amountWords(x, ch = 'treasure chamber') {
  if (Number.isInteger(x)) return String(x);
  const parts = [];
  if (x.die) parts.push(`a ${x.die}`);
  if (x.reg) parts.push(x.minusReg ? `the ${x.reg} roll` : 'the roll');
  if (x.minusReg) parts.push(`minus the ${x.minusReg} roll`);
  if (x.plus) parts.push(`${x.plus < 0 ? 'minus' : 'plus'} ${Math.abs(x.plus)}`);
  if (x.minusStat) parts.push(`minus your ${STAT[x.minusStat]}`);
  if (x.plusCount === 'treasuryCards') parts.push(`plus your ${ch} cards`);
  if (x.div) return `${x.div === 2 ? 'half' : `1/${x.div} of`} ${parts.join(' ')}, rounded down`;
  return parts.join(' ');
}

const nothing = (list, ch, short) => describeEffects(list, ch, short) || 'nothing happens';
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

// One clause per effect, joined with commas. short (spec v12 follow-up): the few words every screen shows for a card;
// a choice gives its options, a lasting effect its name, and a stored roll reads as its die (the prompt has the steps).
export function describeEffects(list = [], ch = 'treasure chamber', short = false) {
  const end = list.findIndex(e => e.op === 'END_TURN'); // END_TURN aborts the rest of the card (effects.run)
  const die = Object.fromEntries(list.filter(e => e.store && /^ROLL_D/.test(e.op)).map(e => [e.store, `the ${e.op.slice(5)}`])); // a stored roll by its die
  const used = new Set(list.flatMap(e => [e.amount?.reg, e.amount?.minusReg]).filter(Boolean)); // stored rolls an amount reads
  return (end < 0 ? list : list.slice(0, end + 1)).map(e => {
    switch (e.op) {
      case 'DEAL_DAMAGE': {
        const x = short && e.amount?.reg && die[e.amount.reg] && !e.amount.die ? { ...e.amount, reg: null, die: die[e.amount.reg].slice(4) } : e.amount;
        const reg = !Number.isInteger(x) && x?.reg && !x.die && !x.plus && !x.minusStat && !x.minusReg;
        const n = x?.div || reg ? `damage equal to ${amountWords(x, ch)}` : `${amountWords(x, ch)} damage`;
        return e.target === 'monster' ? `the monster takes ${n}` : `you take ${n}`;
      }
      case 'HEAL': return `heals ${amountWords(e.amount, ch)} HP${e.uncapped ? ', even above starting HP' : ''}`;
      case 'ADJUST_HP': return short && e.amount?.reg && e.amount.minusReg && die[e.amount.reg] && die[e.amount.minusReg]
        ? `you gain a ${die[e.amount.reg].slice(4)} in HP and lose a ${die[e.amount.minusReg].slice(4)}`
        : e.amount?.reg && e.amount.minusReg && die[e.amount.reg] && die[e.amount.minusReg]
        ? `you gain ${die[e.amount.reg]} in HP and lose ${die[e.amount.minusReg]} at the same time${e.uncapped ? '' : ' (a gain stops at your starting HP)'}`
        : `your HP changes by ${amountWords(e.amount, ch)}${e.uncapped ? '' : ' (a gain stops at your starting HP)'}`;
      case 'SKIP_TURNS': return Number.isInteger(e.turns) ? `you miss your next ${e.turns === 1 ? 'turn' : `${e.turns} turns`}${e.label ? ` (${e.label.toLowerCase()})` : ''}` : `you miss one turn for each point of damage taken${e.label ? ` (${e.label.toLowerCase()})` : ''}`;
      // An empty match is the success (the spider beaten): never "nothing happens" (owner, spec v12).
      case 'NAME_NUMBERS': return `name ${e.count === 1 ? 'a number' : `${e.count} different numbers`}${short ? '' : ' from 1 to 6'} and roll a D6: if it shows ${e.count === 1 ? 'that number' : 'one of them'}, ${describeEffects(e.onMatch, ch, short) || 'you succeed'}; if not, ${nothing(e.onMiss, ch, short)}`;
      case 'KILL_HERO': return 'you die';
      case 'FLEE': return 'you flee back the way you came';
      case 'ROTATE_TILES': return `every ${e.mark} corridor on the board turns ${e.degrees === 90 ? 'a quarter clockwise' : e.degrees === 180 ? 'half a turn' : 'a quarter counter-clockwise'}`;
      case 'CHECK_STAT': {
        const head = `${STAT[e.stat]} test${e.modifier ? ` (${amountWords(e.modifier, ch)})` : ''}`;
        if (short) return `${head}: ${[e.onPass?.length && `on a pass, ${describeEffects(e.onPass, ch, true)}`, e.onFail?.length && `on a fail, ${describeEffects(e.onFail, ch, true)}`].filter(Boolean).join('; ') || 'no effect'}`;
        return `${head}: on a pass ${nothing(e.onPass, ch)}, on a fail ${nothing(e.onFail, ch)}`;
      }
      case 'ROLL_D6': return short && used.has(e.store) ? '' : die[e.store] && list.some(x => x.op === 'ADJUST_HP') ? '' : 'roll a D6';
      case 'ROLL_D12': return short && used.has(e.store) ? '' : die[e.store] && list.some(x => x.op === 'ADJUST_HP') ? 'roll a D12 and a D6 together' : 'roll a D12';
      case 'MONSTER_ENCOUNTER': case 'REQUEST_COMBAT': return e.ambush ? 'a monster ambushes you' : 'a monster appears';
      case 'DRAW_CARD': return `draw a ${e.deck === 'TREASURY' ? ch : DECK[e.deck]} card${e.then === 'keep' ? ' and keep it' : ''}`;
      case 'RETAIN_CARD': case 'GRANT_TREASURE': return 'you keep it';
      case 'REMOVE_TREASURY_CARDS': return `you lose your ${ch} cards`;
      case 'MOVE_HERO': return `${e.to === 'prev' ? 'you are pushed back to the square you came from' : e.to === 'adjacent-choice' ? 'you must move to a neighbouring square' : `you are moved ${DIR[e.to]}`}${e.drawRoom === false ? ' (no room card there)' : ''}`;
      case 'END_TURN': return 'your turn ends at once';
      case 'CONTINUE_MOVEMENT': return 'you may keep moving this turn';
      case 'SET_CONDITION': if (short) return `you are ${(e.label || 'under a lasting effect').toLowerCase()}`;
        return `${e.label ? e.label.toLowerCase() : 'a lasting effect'}${e.turns ? ` for ${e.turns} turns` : ''}${e.onTurnStart?.length ? `: at the start of each of your turns ${describeEffects(e.onTurnStart, ch)}` : ''}`;
      case 'CLEAR_CONDITION': return 'it is over';
      case 'REQUEST_CHOICE': if (short && e.options.length > 1) return `${e.options[0].label} or ${e.options.slice(1).map(o => lower(o.label)).join(' or ')}`;
        return e.options.length === 1 ? `${e.options[0].label}: ${nothing(e.options[0].effects, ch, short)}` : `choose ${e.options.map(o => { const d = describeEffects(o.effects, ch); return `${d ? `${o.label} (${d})` : o.label}${o.requires === 'can-flee' ? ' when there is a way back' : ''}`; }).join(' or ')}`;
      case 'OPEN_TEMPORARY_PASSAGE': return e.side === 'any-orthogonal' ? 'a secret passage: you may move to any neighbouring square this turn, even through a wall' : `a secret passage on the ${DIR[e.side]} side, this turn`;
      case 'ROTATE_TILE': return 'the room turns a quarter clockwise';
      case 'ROLL_TABLE': {
        const rows = short ? e.rows.filter(r => r.effects?.length) : e.rows; // short: only the numbers that do something
        const one = rows.length > 1 && rows.every(r => r.effects?.length === 1 && r.effects[0].op === 'ROTATE_TILES' && r.effects[0].mark === rows[0].effects[0].mark);
        if (short && one) return `roll a ${e.die}: every ${rows[0].effects[0].mark} corridor on the board turns, the roll decides how far`;
        return `roll a ${e.die}: ${rows.map(r => `${r.parity ? `on an ${r.parity} number` : r.min === r.max ? `on ${r.min}` : `on ${r.min} to ${r.max}`}, ${describeEffects(r.effects, ch, short) || (e.rows.some(x => x.effects?.some(y => y.op === 'DEAL_DAMAGE' && y.target === 'monster')) ? 'a miss' : 'nothing happens')}`).join('; ')}`;
      }
      case 'KILL_MONSTER': return 'the monster dies at once';
      case 'OPEN_PASSAGE': return 'the door opens, or the portcullis lifts, and you go through';
      case 'MONSTER_FLEES': return 'the monster flees';
      case 'IGNORE_TRAP': return 'the trap does not affect you';
      default: return '';
    }
  }).filter(Boolean).join(', ');
}

// What a definition does, as short sentences (the short wording: at most about 140 characters for an owner card, spec
// v12 follow-up; a prompt's steps come from ui/words.js namedSteps and choiceSteps). Monster HP is never part of it (D37: the hero must not see it).
export function effectText(def, ch) {
  if (!def) return '';
  const said = effectClauses(def, ch).filter(Boolean).map(capital).join('. ');
  return `${said || 'Nothing happens'}.`;
}
function effectClauses(def, ch) {
  const table = t => ['attack', 'wait', 'flee'].map(k => { const r = t[k]; return `on ${k}, ${REACTION[r.type]}${r.damage ? ` (${amountWords(r.damage, ch)} damage)` : ''}`; }).join('; ');
  if (def.reactions) return [table(def.reactions)];
  if (def.rows) return Object.entries(def.rows).map(([type, row]) => `monster type ${type}: ${table(row)}`);
  if (def.letter) return [def.doubleAgainst?.length ? `card ${def.letter}, hits ${def.doubleAgainst.join(', ')} twice` : `card ${def.letter}, no double hit`];
  if (def.trigger) return def.use ? [`once only, ${RING_TIMING_SHORT[def.use.timing]}: ${nothing(def.use.effects, ch, true)}`, 'then the ring is gone'] : [`${describeEffects(def.effects, ch, true) || 'no effect'} (this ring's use is not written yet)`];
  if (def.heroIds) return [`${def.verb ? `${def.verb}: ` : ''}${describeEffects(def.effects, ch, true) || 'no effect'}${def.uses ? `, ${def.uses} ${def.unit || 'use'}${def.uses === 1 ? '' : 's'}` : ''}`];
  if (def.kind === 'sleeping') return ['the dragon sleeps'];
  if (def.kind === 'awake') return ['the dragon wakes'];
  const out = [];
  if (def.deck === 'DOOR') out.push({ opens: 'the door opens', closed: 'the door stays shut', trap: 'the door is trapped', reshuffle: 'try the door again: draw another door card at once' }[def.kind]);
  else if (def.kind === 'reshuffle') out.push(`draw another ${DECK[def.deck]} card at once`); // spec v7, worded as the door's
  const only = def.effects?.length === 1 && def.effects[0];
  out.push(only?.op === 'SET_CONDITION' ? lasting(only, ch) : describeEffects(def.effects, ch, true));
  if (def.followUpDeck) out.push(def.followUpDeck === 'MONSTER' ? 'a monster appears' : `draw a ${DECK[def.followUpDeck]} card next`);
  if (def.cardDisposition === 'RETAIN_HELD' || def.cardDisposition === 'RETAIN_TREASURY') out.push('you keep it');
  if (def.turnDisposition === 'continue') out.push('you may keep moving this turn');
  if (def.frees?.length) out.push(`while you carry it, ${def.frees.map(id => id.replace(/-/g, ' ')).join(' or ')} cannot hold you: at the start of your next turn you are out and play on`);
  if (def.use) {
    const u = def.use;
    out.push(`when used ${TIMING_SHORT[u.timing]}: ${nothing(u.effects, ch, true)}${u.uses ? ` (${u.uses} use${u.uses === 1 ? '' : 's'})` : ''}`);
  } else if (def.specialWeapon) out.push('a special weapon whose effect is not written yet');
  if (def.gold) out.push(`worth ${def.gold} gold`);
  return out;
}

// A card that is one lasting effect (the torch): its name, and what each turn asks, in a few words.
function lasting(e, ch) {
  const x = e.onTurnStart?.[0];
  const ask = !x ? '' : x.op === 'NAME_NUMBERS' && x.label ? `${lower(x.label)}: name ${x.count === 1 ? 'a number' : `${x.count} numbers`} and roll a D6`
    : x.op === 'REQUEST_CHOICE' && x.options.length === 1 ? lower(x.options[0].label) : describeEffects(e.onTurnStart, ch, true);
  return `${e.label || 'a lasting effect'}${e.turns ? ` for ${e.turns} turns` : ''}${ask ? `: at the start of each of your turns, ${ask}` : ''}`;
}

// The deck bookkeeping a card does (where it goes afterwards, shuffles), for the debug event log only; '' if none.
function mechanics(list = [], where = '') {
  return list.flatMap(e => {
    if (e.op === 'RETURN_CARD_TO_BOTTOM') return [`${where}the card goes to the bottom of its deck`];
    if (e.op === 'RETURN_HELD') return [`${where}the kept card goes to the bottom of its deck`];
    if (e.op === 'SET_CONDITION') return mechanics(e.onTurnStart, where);
    if (e.op === 'NAME_NUMBERS') return [...mechanics(e.onMatch, 'on a match, '), ...mechanics(e.onMiss, 'on a miss, ')];
    if (e.op === 'SHUFFLE_DECK') return [`${where}${e.deck ? `the ${DECK[e.deck]} deck` : 'its deck'} is shuffled`];
    if (e.op === 'REQUEST_CHOICE') return e.options.flatMap(o => mechanics(o.effects, `${o.label}: `));
    if (e.op === 'CHECK_STAT') return [...mechanics(e.onPass, 'on a pass, '), ...mechanics(e.onFail, 'on a fail, ')];
    return [];
  });
}
export function mechanicsText(def) {
  if (!def) return '';
  const out = mechanics(def.effects);
  if (def.cardDisposition === 'RESHUFFLE_DECK') out.push('its deck is shuffled afterwards');
  if (AFTER[def.use?.afterUse]) out.push(`after use it ${AFTER[def.use.afterUse]}`);
  if (def.use) out.push(...mechanics(def.use.effects, 'when used, '));
  return out.length ? `${out.map(capital).join('. ')}.` : '';
}

const NOUN = def => (def.reactions || def.rows ? 'monster' : def.letter ? 'combat card' : def.trigger ? 'ring' : def.heroIds ? 'weapon' : 'card');
// The line shown for a definition: fixture entries say they are made up.
export const shownEffectText = (def, ch) => (def?.status === 'FIXTURE' ? `Made-up test ${NOUN(def)}. ${effectText(def, ch)}` : effectText(def, ch));
