// Words for the screen: the event log, card summaries and action labels. Display only: every
// sentence is read from an engine event or a content definition, never decided here.
import { cardDef } from '../engine/decks.js';
import { legalActions } from '../engine/phases.js';
import { contentIndex } from '../content/schema.js';
import { mechanicsText } from '../engine/describe.js';
import { tileWords, place, DIR, towerAt, MARK_WORD } from './board.js';

export { DIR };
export const STAT = { STR: 'Strength', AGI: 'Agility', ARM: 'Armour', LCK: 'Luck' };
export const CHOICE = { attack: 'Attack', wait: 'Wait', flee: 'Flee', special: 'Special weapon' };
export const REACTION = {
  'monster-flees': 'it flees', combat: 'it fights', 'strike-then-flight': 'it strikes, then you get away',
  'strike-then-combat': 'it strikes, then fights', 'flight-succeeds': 'you get away', other: 'something else happens',
};
export const DECK = { ROOM: 'Room card', SEARCH: 'Search card', ROOM_SEARCH: 'Room search card', CHEST: 'Chest card', DOOR: 'Door card', MONSTER: 'Monster card', TREASURY: 'Treasure chamber card', DRAGON: 'Dragon card' };
export const PLACEMENT = { inner: 'Inner circle', outer: 'Outer circle', outside: 'Outside the circles', corner: 'Corner', 'corner-skull': 'Skull corner', unclear: 'Unclear, throw again' };
export const FACE = { sword: 'Sword', skull: 'Skull', other: 'Other face' };
const OUTCOME = { 'monster-killed': 'The monster is defeated.', 'monster-fled': 'The monster flees.', 'reaction-resolved': 'The encounter is over.' };
const CONDITION = { dark: 'is in the dark', 'well-edge': 'clings to the edge of the well', rubble: 'is stuck in the rubble' };
const CONDITION_OFF = { dark: 'leaves the dark', 'well-edge': 'is across the well', rubble: 'is free of the rubble' };

export function expr(e) {
  if (Number.isInteger(e)) return String(e);
  if (!e) return '';
  const parts = [e.die || (e.reg ? 'the roll' : '')];
  if (e.plus) parts.push(e.plus > 0 ? `+ ${e.plus}` : `- ${-e.plus}`);
  if (e.minusStat) parts.push(`- ${STAT[e.minusStat]}`);
  if (e.plusCount === 'treasuryCards') parts.push('+ treasure chamber cards held');
  return parts.filter(Boolean).join(' ');
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

// A test entry as two plain lines: what was rolled (with each modifier and where it comes from) and what was needed.
export function testWords(e) {
  const mods = Array.isArray(e.modifiers) ? e.modifiers.filter(m => m.value) : e.modifier ? [{ source: 'modifier', value: e.modifier }] : [];
  const total = e.roll + mods.reduce((s, m) => s + m.value, 0);
  const terms = mods.map(m => ` ${m.value < 0 ? '-' : '+'} ${Math.abs(m.value)}${m.source && m.source !== 'modifier' ? ` (${m.source})` : ''}`).join('');
  return [mods.length ? `Roll ${e.roll}${terms} = ${total}.` : `You rolled ${e.roll}.`, `You needed ${e.target} or less (${STAT[e.stat] || e.stat} ${e.target}).`];
}

// A plain summary of a card's effects, used when the content has no text of its own (plan 13 #21: the owner's
// optional `text` field replaces it wherever it is set).
function effectWords(list) {
  return (list || []).map(e => {
    switch (e.op) {
      case 'DEAL_DAMAGE': return e.target === 'monster' ? `The monster takes ${expr(e.amount)}.` : `Take ${expr(e.amount)} damage.`;
      case 'HEAL': return `Heal ${expr(e.amount)}.`;
      case 'CHECK_STAT': {
        const fail = effectWords(e.onFail), pass = effectWords(e.onPass);
        return `${STAT[e.stat]} test${e.modifier ? ` (${expr(e.modifier)})` : ''}.${pass ? ` Pass: ${pass}` : ''}${fail ? ` Fail: ${fail}` : ''}`;
      }
      case 'MONSTER_ENCOUNTER': case 'REQUEST_COMBAT': return e.ambush ? 'An ambush.' : 'A monster.';
      case 'DRAW_CARD': return `Draw a ${DECK[e.deck].toLowerCase()}${e.then === 'keep' ? ' and keep it' : ''}.`;
      case 'REQUEST_CHOICE': return `Choose: ${e.options.map(o => o.label).join(' or ')}.`;
      case 'MOVE_HERO': return e.to === 'prev' ? 'You are pushed back.' : e.to === 'adjacent-choice' ? 'Move to a neighbouring square.' : `You are moved ${DIR[e.to]}.`;
      case 'SET_CONDITION': return `A lasting effect${e.turns ? ` for ${e.turns} turns` : ''}${e.onTurnStart?.length ? `: ${effectWords(e.onTurnStart)}` : '.'}`;
      case 'CLEAR_CONDITION': return 'A lasting effect ends.';
      case 'CONTINUE_MOVEMENT': return 'You may keep moving.';
      case 'END_TURN': return 'Your turn ends.';
      case 'OPEN_TEMPORARY_PASSAGE': return 'A secret passage opens.';
      case 'REMOVE_TREASURY_CARDS': return 'Lose your treasure chamber cards.';
      case 'ROTATE_TILE': return 'The room turns.';
      case 'RETAIN_CARD': case 'GRANT_TREASURE': return 'Keep this card.';
      default: return '';
    }
  }).filter(Boolean).join(' ');
}

// What an item or card does, in the content's own words: effectText (engine, plain words) or the owner's text.
export const itemText = def => def?.effectText || def?.text || null;

// One A, B or C exchange (x: { hero, monster, heroDmg, monsterDmg }) as a sentence: who played what and who took it.
export function exchangeWords(x, hero) {
  const head = `${hero} played ${x.hero}, the monster played ${x.monster}`;
  if (!x.heroDmg && x.monsterDmg) return `${head}: ${x.hero} beats ${x.monster}, the monster takes ${x.monsterDmg}`;
  if (x.heroDmg && !x.monsterDmg) return `${head}: ${x.monster} beats ${x.hero}, ${hero} takes ${x.heroDmg}`;
  return `${head}: same letter, both take ${x.heroDmg}`;
}

// One exchange in a few words, for a fight panel's "Last:" line (owner, 2026-11-19). hero: the hero's name, or 'you'.
export function lastWords(x, hero) {
  if (x.placement) return x.rethrow ? 'unclear, thrown again.' : `${PLACEMENT[x.placement].toLowerCase()}, ${FACE[x.face].toLowerCase()}. ${takesWords(x, hero)}`;
  return `${hero} ${x.hero}, monster ${x.monster}. ${takesWords(x, hero)}`;
}
function takesWords(x, hero) {
  if (x.heroDmg && x.heroDmg === x.monsterDmg) return `Both take ${x.heroDmg}.`;
  const out = [];
  if (x.heroDmg) out.push(`${capital(hero)} ${hero === 'you' ? 'take' : 'takes'} ${x.heroDmg}`);
  if (x.monsterDmg) out.push(`${out.length ? 'the monster' : 'Monster'} takes ${x.monsterDmg}`);
  return out.length ? `${out.join(', ')}.` : 'Nobody is hurt.';
}
// The one result sentence of the Reveal panel.
export function revealWords(x, hero) {
  if (x.hero === x.monster) return `Same letter: both take ${x.heroDmg}.`;
  return x.monsterDmg ? `${x.hero} beats ${x.monster}: the monster takes ${x.monsterDmg}.` : `${x.monster} beats ${x.hero}: ${hero} takes ${x.heroDmg}.`;
}

// effectText: the engine's line for this card (a log entry's or inventory item's), used when the card has no text.
export function cardText(def, effectText = null) {
  if (def.text) return def.text;
  if (effectText || def.effectText) return effectText || def.effectText;
  const out = [effectWords(def.effects)];
  if (def.deck === 'DOOR') out.unshift({ opens: 'The door opens.', closed: 'The door stays shut.', trap: 'The door is trapped.' }[def.kind] || '');
  if (def.followUpDeck) out.push(def.followUpDeck === 'MONSTER' ? 'A monster.' : `Then draw a ${DECK[def.followUpDeck].toLowerCase()}.`);
  if (['RETAIN_HELD', 'RETAIN_TREASURY'].includes(def.cardDisposition)) out.push('Keep this card.');
  if (def.turnDisposition === 'continue') out.push('You may keep moving.');
  if (def.gold) out.push(`Worth ${def.gold} gold.`);
  return out.filter(Boolean).join(' ') || 'Nothing happens.';
}

export function monsterText(def) {
  if (def.text) return def.text;
  return ['attack', 'wait', 'flee'].map(k => {
    const r = def.reactions[k];
    return `${CHOICE[k]}: ${REACTION[r.type]}${r.damage ? ` (${expr(r.damage)} damage)` : ''}.`;
  }).join(' ');
}

export const towerName = (content, i) => towerAt(content.board.towers[i]);
const xy = at => { const [x, y] = at.split(',').map(Number); return { x, y }; };
// 'x,y|S' (one key per shared edge) as words.
export const edgeWords = e => { const [at, side] = e.split('|'); return `the ${DIR[side]} side of ${place(xy(at))}`; };
const markWords = (m, at) => (m === 'tower' ? towerAt(xy(at)) : m === 'center' ? 'the treasure chamber' : MARK_WORD[m] ? `${MARK_WORD[m]}, ${m} mark` : 'no mark');
const TOWER_CHOICE = { ESCAPE: 'chooses Escape', STAY: 'stays in the tower', CONTINUE: 'continues through the tower' };
// Why the engine let the hero keep moving (its 'may-continue' reasons); 'card' adds the card's name.
const MAY_CONTINUE = {
  'yellow-corridor': 'a corridor has no card', 'door-stayed-closed': 'the door stayed shut, so another way may be used',
  'secret-passage': 'a secret passage was found', card: 'the card says so', 'tower-transit': 'passing through the tower', 'rubble-forced': 'the rubble forces a move',
};

// ctx: { content, name(seat) }. Returns null for bookkeeping events that need no line, a string, or
// [text, detail, mechanics]: detail is the dice arithmetic shown small under the line, mechanics the deck bookkeeping
// (where a card went, shuffles) that only the debug event log shows (owner, 2026-11-19).
export function describe(e, ctx, next) {
  const { content } = ctx;
  const who = s => ctx.name(s);
  const card = inst => (typeof inst !== 'string' || inst === 'hidden' ? null : cardDef(content, inst));
  switch (e.kind) {
    case 'first-player': return `${who(e.seat)} goes first.`;
    case 'roll': {
      if (next && next.kind === 'test' && next.roll === e.value) return null; // the test line says it
      const m = /^first player, seat (\d+)$/.exec(e.reason);
      if (m) return `${who(+m[1])} rolls ${e.value} on the D12.`;
      if (e.reason === 'dark room exit') return null; // its own line follows
      if (e.reason === 'ambush' || e.reason === 'dragon fire') return [null, `${e.die} ${e.value}`]; // the damage line carries it
      const card = /^card roll /.test(e.reason);
      if (card && next?.kind === 'formula') return null; // the formula's arithmetic shows the roll
      return [`${e.seat !== undefined ? who(e.seat) : 'The hero'} rolls ${e.value} on the ${e.die}${card ? ' for the card' : ''}.`, card ? '' : e.reason];
    }
    case 'test':
      return [`${e.seat !== undefined ? who(e.seat) : 'The hero'} ${e.pass ? 'passes' : 'fails'} the ${STAT[e.stat]} test ${TEST_WHY[e.reason] || `(${e.reason})`}.`, testWords(e).join(' ')];
    case 'formula':
      if (next && ['damage', 'heal', 'monster-wound'].includes(next.kind)) return [null, e.arithmetic]; // carried onto that line
      return [`${capital(e.reason)} works out to ${e.value}.`, e.arithmetic];
    case 'gate': return `Portcullis on ${edgeWords(e.edge)}: ${e.pass ? 'lifted' : 'it holds'}.`;
    case 'tower-choice': return `${who(e.seat)} ${TOWER_CHOICE[e.choice]} at ${place(xy(e.at))}.`;
    case 'pick-hero': return `${who(e.seat)} takes ${contentIndex(content).heroes.get(e.heroId).name}.`;
    case 'pick-ring': return `${who(e.seat)} takes ${contentIndex(content).rings.get(e.ringId).name}.`;
    case 'pick-tower': return `${who(e.seat)} starts in the ${towerName(content, e.tower)}.`;
    case 'turn': return `Sun ${e.sun}: ${who(e.seat)}'s turn.`;
    case 'sun': return `The sun moves to ${e.sun}.`;
    case 'reveal': {
      const [x, y] = e.at.split(',').map(Number);
      return `Revealed: ${tileWords(contentIndex(content).tiles.get(e.defId))} at ${place({ x, y })}, turned ${e.rotation} degrees.`;
    }
    case 'place-chamber': return 'The treasure chamber is entered for the first time.';
    case 'move': {
      const how = { door: ' through the door', gate: ' under the portcullis', flight: ' in flight', forced: ', driven out by the dragon', secret: ' through a secret passage', card: '' }[e.via] || '';
      return `${who(e.seat)} goes ${DIR[e.dir]}${how}, from ${place(xy(e.from))} to ${place(xy(e.to))} (${markWords(e.mark, e.to)}).`;
    }
    case 'escape': return `${who(e.seat)} escapes the keep${e.atSunset ? ' at sunset (rules config)' : Number.isInteger(e.sun) ? ` on sun ${e.sun}` : ''}.`;
    case 'may-continue': {
      const def = e.reason === 'card' && typeof e.card === 'string' && e.card !== 'hidden' && card(e.card);
      return `${who(e.seat)} may keep moving: ${MAY_CONTINUE[e.reason] || 'the rules allow it'}${def && def.deck !== 'TREASURY' ? ` (${def.name})` : ''}.`;
    }
    case 'rotate': return 'The room turns a quarter clockwise.';
    case 'gate-falls': return `A portcullis drops behind, on ${edgeWords(e.edge)}.`;
    case 'condition': return `${who(e.seat)} ${CONDITION[e.id] || 'is under a lasting effect'}.`;
    case 'condition-cleared': return `${who(e.seat)} ${CONDITION_OFF[e.id] || 'is free of a lasting effect'}.`;
    case 'dark-exit': return [`Dark room: the way out is ${DIR[e.dir]}.`, `D6 ${e.roll}`];
    case 'dark-blocked': return 'That way is blocked. The hero stays and rolls again next turn.';
    case 'draw': {
      if (e.deck === 'TILE') return null;
      if (e.deck === 'DRAGON') return `Dragon card: ${e.card === 'awake' ? 'awake' : 'asleep'}.`;
      const def = card(e.value);
      return def ? [`${DECK[e.deck]}: ${e.cardName || def.name}. ${e.deck === 'MONSTER' ? '' : cardText(def, e.effectText)}`.trim(), '', e.deck === 'MONSTER' ? '' : mechanicsText(def)] : `${DECK[e.deck]} drawn, kept secret.`;
    }
    case 'retain': return null; // the 'item' obtain entry beside it says it
    case 'item': return itemWords(e, ctx);
    case 'remove-card': return [null, '', `${card(e.value)?.name || 'A card'} leaves the game.`];
    case 'bottom': return [null, '', `${card(e.value)?.name || 'A card'} goes to the bottom of the ${TO_DECK[e.deck] || e.deck} pile.`];
    case 'shuffle': return [null, '', `The ${TO_DECK[e.deck] || String(e.deck).toLowerCase()} pile is shuffled.`];
    case 'door': return `${{ opens: 'The door opens', closed: 'The door stays shut', trap: 'The door was trapped' }[e.result]}${e.edge ? `, on ${edgeWords(e.edge)}` : ''}${e.card && e.card !== 'hidden' ? ` (door card: ${card(e.card).name})` : ''}.`;
    case 'stop': return `${who(e.seat)} stops.`;
    case 'search': return `${who(e.seat)} searches the room.`;
    case 'stay': return `${who(e.seat)} stays in the chamber.`;
    case 'forced-skip': return `${who(e.seat)} has no move and the turn passes.`;
    case 'well-discard': return null; // the 'item' discard entry beside it says it
    case 'encounter': return e.ambush ? 'An ambush.' : `A monster. ${who(e.seat)} chooses before it shows itself.`;
    case 'commit': return `${who(e.seat)} commits to ${e.item ? `using ${card(e.item).name}` : CHOICE[e.choice]} before the monster shows itself.`;
    case 'reaction': return `The monster's answer: ${REACTION[e.type]}.`;
    case 'monster-wound': return `The monster takes ${e.amount}.`;
    case 'monster-dead': return 'The monster is dead.'; // spec v3: announced, never with its HP
    case 'encounter-end': return e.outcome === 'hero-fled' ? 'The hero gets away.' : OUTCOME[e.outcome];
    case 'combat': return e.mode === 'target' ? 'Combat on the target.' : e.mode === 'abc' ? 'Combat begins.' : 'Combat begins (digital variant, not an original rule).';
    case 'combat-pick': return e.side === 'hero' ? 'The hero picks a card.' : 'The monster picks a card.';
    case 'exchange': return `${exchangeWords(e, e.seat !== undefined ? who(e.seat) : 'The hero')}.`;
    case 'throw': return e.rethrow ? 'Unclear throw: throw again.' : `Throw: ${PLACEMENT[e.placement].toLowerCase()}, ${FACE[e.face].toLowerCase()}. Hero takes ${e.heroDmg}, monster takes ${e.monsterDmg}.`;
    case 'damage': return [`${who(e.seat)} takes ${e.amount} damage${e.reason === 'card' ? ' from the card' : `, ${e.reason}`}. ${Math.max(0, e.hp)} HP left.`, e.raw !== e.amount ? `${e.raw} counts as 0` : ''];
    case 'heal': return `${who(e.seat)} heals ${e.amount}. ${e.hp} HP.`;
    case 'death': return `${who(e.seat)} dies: ${e.reason}.`;
    case 'dragon-odds': return `The dragon wakes on ${e.awake} in ${e.remaining}.`;
    case 'dragon-wakes': return `The dragon wakes. Everyone in the chamber, from ${who(e.waker)} clockwise.`;
    case 'dragon-reset': return ['The dragon sleeps again.', '', 'All eight dragon cards are shuffled.'];
    case 'forced-move-none': return `${who(e.seat)} has nowhere to go and stays.`;
    case 'flight': return `${who(e.seat)} flees back.`;
    case 'secret-passage': return 'A secret passage opens.';
    case 'deck-empty': return `The ${DECK[e.deck].toLowerCase()} pile is empty.`;
    case 'lost-at-sunset': return `${who(e.seat)} is inside at sunset: not escaped${e.status === 'IN_TOWER_NOT_ESCAPED' ? ', though in a tower' : ''}.`;
    case 'game-over': return 'The game is over.';
    default: return null; // resolve-card, pick bookkeeping
  }
}

// Spec v3 section 4: obtained, used, discarded or lost. Another seat's chamber card reads 'hidden'.
const TO_DECK = { ROOM: 'room', SEARCH: 'search', ROOM_SEARCH: 'room search', CHEST: 'chest', DOOR: 'door', MONSTER: 'monster', TREASURY: 'treasure chamber' };
const LOST_WHY = { dragon: ' when the dragon wakes', card: ' to a card', death: ' on death' };
export function itemName(e, content) {
  if (e.value === 'hidden') return 'a chamber card';
  if (e.group === 'equipment') return (content.specialWeapons || []).find(w => w.id === e.value)?.name || 'a special weapon';
  const def = cardDef(content, e.value);
  return e.group === 'chamber' ? `${def.name} (treasure chamber card)` : def.name;
}
function itemWords(e, ctx) {
  const who = ctx.name(e.seat), what = itemName(e, ctx.content);
  const m = /^bottom of (\w+)$/.exec(e.to || '');
  const dest = m ? `the bottom of the ${TO_DECK[m[1]] || m[1].toLowerCase()} pile` : e.to || '';
  const to = dest ? `It goes ${m ? 'to ' : ''}${dest}.` : '';
  switch (e.action) {
    case 'obtain': return `${who} gains ${what}.`;
    case 'use': return `${who} uses ${what}.`;
    case 'discard': return [`${who} discards ${what}.`, '', to];
    case 'lose': return [`${who} loses ${what}${LOST_WHY[e.why] || ''}.`, '', to];
    default: return null;
  }
}

// The thumb-reach undo button: whose action it takes back and, where the log says, what kind. prev is the undo
// snapshot, next the game now. The actor is the seat the engine offered actions to at prev; in an A, B or C
// fight both sides may be offered at once, and the screen always asks the hero first.
const UNDO_WORD = { item: 'item use', move: 'move', stop: 'stop', 'tower-choice': 'tower choice', commit: 'choice', 'combat-pick': 'card', 'well-discard': 'card drop', 'pick-hero': 'hero pick', 'pick-ring': 'ring pick', 'pick-tower': 'tower pick' };
export function undoLabel(prev, next, content, name) {
  const la = legalActions(prev, content);
  const seat = (la.find(a => a.side !== 'monster') ?? la[0])?.seat ?? prev.activeSeat;
  const what = next.log.slice(prev.log.length).map(e => UNDO_WORD[e.kind]).find(Boolean);
  return `Undo ${name(seat)}'s ${what || 'last action'}`;
}

// Each line with its entry, so the log can show the round and the debug log the raw fields. text is the plain
// sentence; detail the dice arithmetic behind it, shown smaller (a dropped roll or formula line hands its
// arithmetic to the next line); mech the deck bookkeeping. Card registers and stat codes read as the die and the
// stat's name. With debug, entries that are bookkeeping only come back too, with an empty text.
export function entries(events, ctx, { debug = false } = {}) {
  const regs = {}, out = [];
  let carry = [], dead = false;
  events.forEach((e, i) => {
    if (e.kind === 'monster-dead') dead = true;
    else if (e.kind === 'encounter-end' && dead && e.outcome === 'monster-killed') { dead = false; return; } // said already
    else if (e.kind === 'encounter-end') dead = false;
    const m = e.kind === 'roll' && /^card roll (\S+)$/.exec(e.reason);
    if (m) regs[m[1]] = e.die;
    const r = describe(e, ctx, events[i + 1]);
    let [text, detail, mech = ''] = Array.isArray(r) ? r : [r, ''];
    if (detail) detail = detail.replace(/[A-Za-z_]\w*/g, w => (Object.hasOwn(regs, w) ? regs[w] : Object.hasOwn(STAT, w) ? STAT[w] : w)).replace(/ {2,}/g, ' ');
    if (!text) {
      if (detail) carry.push(detail);
      if (debug && mech) out.push({ e, text: '', detail: '', mech });
      return;
    }
    out.push({ e, text: capital(text), detail: [...carry, detail].filter(Boolean).join('; '), mech });
    carry = [];
  });
  return out;
}
// Why a test is rolled, after "passes the Strength test".
export const TEST_WHY = { portcullis: 'to lift the portcullis', 'well entry': 'on entering the well', 'well jump': 'to jump the well', 'force rubble': 'to force through the rubble', 'card test': 'for the card' };
export const lines = (events, ctx) => entries(events, ctx).map(x => x.text);
