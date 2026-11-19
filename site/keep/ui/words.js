// Words for the screen: the event log, card summaries and action labels. Display only: every
// sentence is read from an engine event or a content definition, never decided here.
import { cardDef } from '../engine/decks.js';
import { legalActions } from '../engine/phases.js';
import { contentIndex } from '../content/schema.js';
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
      case 'SHUFFLE_DECK': return 'Shuffle the deck.';
      case 'RETAIN_CARD': case 'GRANT_TREASURE': return 'Keep this card.';
      default: return '';
    }
  }).filter(Boolean).join(' ');
}

export function cardText(def) {
  if (def.text) return def.text;
  const out = [effectWords(def.effects)];
  if (def.deck === 'DOOR') out.unshift({ opens: 'The door opens.', closed: 'The door stays shut.', trap: 'The door is trapped.' }[def.kind] || '');
  if (def.followUpDeck) out.push(def.followUpDeck === 'MONSTER' ? 'A monster.' : `Then draw a ${DECK[def.followUpDeck].toLowerCase()}.`);
  if (['RETAIN_HELD', 'RETAIN_TREASURY'].includes(def.cardDisposition)) out.push('Keep this card.');
  if (def.cardDisposition === 'RESHUFFLE_DECK') out.push('Shuffle the deck.');
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

// ctx: { content, name(seat) }. Returns null for bookkeeping events that need no line.
export function describe(e, ctx, next) {
  const { content } = ctx;
  const who = s => ctx.name(s);
  const card = inst => (inst === 'hidden' ? null : cardDef(content, inst));
  switch (e.kind) {
    case 'first-player': return `${who(e.seat)} goes first.`;
    case 'roll': {
      if (next && next.kind === 'test' && next.roll === e.value) return null; // the test line says it
      const m = /^first player, seat (\d+)$/.exec(e.reason);
      if (m) return `${who(+m[1])} rolls ${e.value} on the D12.`;
      if (e.reason === 'dark room exit' || e.reason === 'ambush' || e.reason === 'dragon fire') return null; // their own lines follow
      return `${e.die}: ${e.value} (${e.reason}).`;
    }
    case 'test': return `${STAT[e.stat]} test (${e.reason}): ${e.arithmetic || `D12 ${e.roll}${e.modifier ? ` + ${e.modifier}` : ''} against ${e.target}, ${e.pass ? 'pass' : 'fail'}`}.`;
    case 'formula': return `${capital(e.reason)}: ${e.arithmetic}.`;
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
    case 'escape': return `${who(e.seat)} escapes the keep${e.atSunset ? ' at sunset (rules config)' : ''}.`;
    case 'rotate': return 'The room turns a quarter clockwise.';
    case 'gate-falls': return `A portcullis drops behind, on ${edgeWords(e.edge)}.`;
    case 'condition': return `${who(e.seat)} ${CONDITION[e.id] || 'is under a lasting effect'}.`;
    case 'condition-cleared': return `${who(e.seat)} ${CONDITION_OFF[e.id] || 'is free of a lasting effect'}.`;
    case 'dark-exit': return `Dark room: the D6 shows ${e.roll}, the way out is ${DIR[e.dir]}.`;
    case 'dark-blocked': return 'That way is blocked. The hero stays and rolls again next turn.';
    case 'draw': {
      if (e.deck === 'TILE') return null;
      if (e.deck === 'DRAGON') return `Dragon card: ${e.card === 'awake' ? 'awake' : 'asleep'}.`;
      const def = card(e.value);
      return def ? `${DECK[e.deck]} ${e.value}: ${def.name}. ${e.deck === 'MONSTER' ? '' : cardText(def)}`.trim() : `${DECK[e.deck]} drawn, kept secret.`;
    }
    case 'retain': { const def = card(e.value); return def ? `Kept: ${def.name}.` : 'A card is kept in secret.'; }
    case 'remove-card': return `${card(e.value).name} leaves the game.`;
    case 'door': return `${{ opens: 'The door opens', closed: 'The door stays shut', trap: 'The door was trapped' }[e.result]}${e.edge ? `, on ${edgeWords(e.edge)}` : ''}${e.card && e.card !== 'hidden' ? ` (door card ${e.card})` : ''}.`;
    case 'stop': return `${who(e.seat)} stops.`;
    case 'search': return `${who(e.seat)} searches the room.`;
    case 'stay': return `${who(e.seat)} stays in the chamber.`;
    case 'forced-skip': return `${who(e.seat)} has no move and the turn passes.`;
    case 'well-discard': return `${who(e.seat)} drops a treasure chamber card.`;
    case 'encounter': return e.ambush ? 'An ambush.' : `A monster. ${who(e.seat)} chooses before it shows itself.`;
    case 'commit': return `${who(e.seat)} commits to ${CHOICE[e.choice]} before the monster shows itself.`;
    case 'reaction': return `The monster's answer: ${REACTION[e.type]}.`;
    case 'monster-wound': return `The monster takes ${e.amount}.`;
    case 'encounter-end': return e.outcome === 'hero-fled' ? 'The hero gets away.' : OUTCOME[e.outcome];
    case 'combat': return e.mode === 'target' ? 'Combat on the target.' : e.mode === 'abc' ? 'Combat begins.' : 'Combat begins (digital variant, not an original rule).';
    case 'combat-pick': return e.side === 'hero' ? 'The hero picks a card.' : 'The monster picks a card.';
    case 'exchange': return `Exchange: hero ${e.hero}, monster ${e.monster}. Hero takes ${e.heroDmg}, monster takes ${e.monsterDmg}.`;
    case 'throw': return e.rethrow ? 'Unclear throw: throw again.' : `Throw: ${PLACEMENT[e.placement].toLowerCase()}, ${FACE[e.face].toLowerCase()}. Hero takes ${e.heroDmg}, monster takes ${e.monsterDmg}.`;
    case 'damage': return `${who(e.seat)} takes ${e.amount}, ${e.reason}${e.arithmetic ? ` (${e.arithmetic})` : e.raw !== e.amount ? ` (${e.raw} counts as 0)` : ''}. ${Math.max(0, e.hp)} HP left.`;
    case 'heal': return `${who(e.seat)} heals ${e.amount}. ${e.hp} HP.`;
    case 'death': return `${who(e.seat)} dies: ${e.reason}.`;
    case 'dragon-odds': return `The dragon wakes on ${e.awake} in ${e.remaining}.`;
    case 'dragon-wakes': return `The dragon wakes. Everyone in the chamber, from ${who(e.waker)} clockwise.`;
    case 'dragon-reset': return 'The dragon sleeps again. All eight dragon cards are shuffled.';
    case 'forced-move-none': return `${who(e.seat)} has nowhere to go and stays.`;
    case 'flight': return `${who(e.seat)} flees back.`;
    case 'secret-passage': return 'A secret passage opens.';
    case 'deck-empty': return `The ${DECK[e.deck].toLowerCase()} pile is empty.`;
    case 'lost-at-sunset': return `${who(e.seat)} is inside at sunset: not escaped${e.status === 'IN_TOWER_NOT_ESCAPED' ? ', though in a tower' : ''}.`;
    case 'game-over': return 'The game is over.';
    default: return null; // shuffle, bottom, resolve-card, monster-dead, pick bookkeeping
  }
}

// The thumb-reach undo button: whose action it takes back and, where the log says, what kind. prev is the undo
// snapshot, next the game now. The actor is the seat the engine offered actions to at prev; in an A, B or C
// fight both sides may be offered at once, and the screen always asks the hero first.
const UNDO_WORD = { move: 'move', stop: 'stop', 'tower-choice': 'tower choice', commit: 'choice', 'combat-pick': 'card', 'well-discard': 'card drop', 'pick-hero': 'hero pick', 'pick-ring': 'ring pick', 'pick-tower': 'tower pick' };
export function undoLabel(prev, next, content, name) {
  const la = legalActions(prev, content);
  const seat = (la.find(a => a.side !== 'monster') ?? la[0])?.seat ?? prev.activeSeat;
  const what = next.log.slice(prev.log.length).map(e => UNDO_WORD[e.kind]).find(Boolean);
  return `Undo ${name(seat)}'s ${what || 'last action'}`;
}

// Each line with its entry, so the log can show the round and the debug log the raw fields.
export function entries(events, ctx) {
  return events.map((e, i) => ({ e, text: describe(e, ctx, events[i + 1]) })).filter(x => x.text).map(x => ({ e: x.e, text: capital(x.text) }));
}
export const lines = (events, ctx) => entries(events, ctx).map(x => x.text);
