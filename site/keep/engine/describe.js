// Plain words for what a card does, generated from the same structured data the engine executes, so the
// wording cannot drift from the behaviour (owner play-test 2026-11-19). Fixture cards carry this as their `text`
// with a "Made-up test ..." prefix; the view gives it as `effectText` on inventory items and drawn cards.
const STAT = { STR: 'Strength', AGI: 'Agility', ARM: 'Armour', LCK: 'Luck' };
const DECK = { ROOM: 'room', SEARCH: 'search', ROOM_SEARCH: 'room search', CHEST: 'chest', DOOR: 'door', MONSTER: 'monster', TREASURY: 'treasure chamber' };
const DIR = { N: 'north', E: 'east', S: 'south', W: 'west' };
const REACTION = { 'monster-flees': 'it flees', combat: 'a fight', 'strike-then-flight': 'it strikes, then you get away', 'strike-then-combat': 'it strikes, then a fight', 'flight-succeeds': 'you get away', other: 'something else happens' };
const TIMING = { 'turn-action': "as your turn's action", 'encounter-special': 'as a special weapon before a monster is revealed' };
const AFTER = { keep: 'is kept', bottom: 'goes to the bottom of its deck', remove: 'is removed from the game' };

// An amount: an integer, or { die, reg, plus, minusStat, plusCount } (plan 4.6).
export function amountWords(x) {
  if (Number.isInteger(x)) return String(x);
  const parts = [];
  if (x.die) parts.push(`a ${x.die}`);
  if (x.reg) parts.push('the roll');
  if (x.plus) parts.push(`${x.plus < 0 ? 'minus' : 'plus'} ${Math.abs(x.plus)}`);
  if (x.minusStat) parts.push(`minus your ${STAT[x.minusStat]}`);
  if (x.plusCount === 'treasuryCards') parts.push('plus your treasure chamber cards');
  return parts.join(' ');
}

const nothing = list => describeEffects(list) || 'nothing happens';

// One clause per effect, joined with commas.
export function describeEffects(list = []) {
  const end = list.findIndex(e => e.op === 'END_TURN'); // END_TURN aborts the rest of the card (effects.run)
  return (end < 0 ? list : list.slice(0, end + 1)).map(e => {
    switch (e.op) {
      case 'DEAL_DAMAGE': return e.target === 'monster' ? `the monster takes ${amountWords(e.amount)} damage` : `you take ${amountWords(e.amount)} damage`;
      case 'HEAL': return `heals ${amountWords(e.amount)} HP${e.uncapped ? ', even above starting HP' : ''}`;
      case 'CHECK_STAT': return `${STAT[e.stat]} test${e.modifier ? ` (${amountWords(e.modifier)})` : ''}: on a pass ${nothing(e.onPass)}, on a fail ${nothing(e.onFail)}`;
      case 'ROLL_D6': return 'roll a D6';
      case 'ROLL_D12': return 'roll a D12';
      case 'MONSTER_ENCOUNTER': case 'REQUEST_COMBAT': return e.ambush ? 'a monster ambushes you' : 'a monster appears';
      case 'DRAW_CARD': return `draw a ${DECK[e.deck]} card${e.then === 'keep' ? ' and keep it' : ''}`;
      case 'RETAIN_CARD': case 'GRANT_TREASURE': return 'you keep this card';
      case 'RETURN_CARD_TO_BOTTOM': return 'this card goes to the bottom of its deck';
      case 'SHUFFLE_DECK': return e.deck ? `the ${DECK[e.deck]} deck is shuffled` : 'its deck is shuffled';
      case 'REMOVE_TREASURY_CARDS': return 'you lose your treasure chamber cards';
      case 'MOVE_HERO': return `${e.to === 'prev' ? 'you are pushed back to the square you came from' : e.to === 'adjacent-choice' ? 'you must move to a neighbouring square' : `you are moved ${DIR[e.to]}`}${e.drawRoom === false ? ' (no room card there)' : ''}`;
      case 'END_TURN': return 'your turn ends at once';
      case 'CONTINUE_MOVEMENT': return 'you may keep moving this turn';
      case 'SET_CONDITION': return `a lasting effect${e.turns ? ` for ${e.turns} turns` : ''}${e.onTurnStart?.length ? `: at the start of each turn ${describeEffects(e.onTurnStart)}` : ''}`;
      case 'CLEAR_CONDITION': return 'a lasting effect ends';
      case 'REQUEST_CHOICE': return `choose: ${e.options.map(o => `${o.label} (${nothing(o.effects)})`).join(' or ')}`;
      case 'OPEN_TEMPORARY_PASSAGE': return e.side === 'any-orthogonal' ? 'a secret passage: you may move to any neighbouring square this turn, even through a wall' : `a secret passage on the ${DIR[e.side]} side, this turn`;
      case 'ROTATE_TILE': return 'the room turns a quarter clockwise';
      default: return '';
    }
  }).filter(Boolean).join(', ');
}

// What a definition does, in one line. Monster HP is never part of it (D37: the hero must not see it).
export function effectText(def) {
  if (!def) return '';
  if (def.reactions) return ['attack', 'wait', 'flee'].map(k => { const r = def.reactions[k]; return `on ${k}, ${REACTION[r.type]}${r.damage ? ` (${amountWords(r.damage)} damage)` : ''}`; }).join('; ');
  if (def.letter) return def.doubleAgainst?.length ? `card ${def.letter}, hits ${def.doubleAgainst.join(', ')} twice` : `card ${def.letter}, no double hit`;
  if (def.trigger) return `${describeEffects(def.effects) || 'no effect'} (ring powers are not applied by the engine yet)`;
  if (def.heroIds) return `${describeEffects(def.effects) || 'no effect'}${def.uses ? `, ${def.uses} use${def.uses === 1 ? '' : 's'}` : ''}`;
  if (def.kind === 'sleeping') return 'the dragon sleeps';
  if (def.kind === 'awake') return 'the dragon wakes';
  const out = [];
  if (def.deck === 'DOOR') out.push({ opens: 'the door opens', closed: 'the door stays shut', trap: 'the door is trapped' }[def.kind]);
  out.push(describeEffects(def.effects));
  if (def.followUpDeck) out.push(def.followUpDeck === 'MONSTER' ? 'a monster appears' : `draw a ${DECK[def.followUpDeck]} card next`);
  if (def.cardDisposition === 'RETAIN_HELD' || def.cardDisposition === 'RETAIN_TREASURY') out.push('you keep it');
  if (def.cardDisposition === 'RESHUFFLE_DECK') out.push('its deck is shuffled afterwards');
  if (def.turnDisposition === 'continue') out.push('you may keep moving this turn');
  if (def.use) {
    const u = def.use;
    out.push(`when used ${TIMING[u.timing]}: ${nothing(u.effects)}${u.uses ? ` (${u.uses} use${u.uses === 1 ? '' : 's'})` : ''}, then it ${AFTER[u.afterUse || 'keep']}`);
  } else if (def.specialWeapon) out.push('a special weapon whose effect is not written yet');
  if (def.gold) out.push(`worth ${def.gold} gold`);
  return out.filter(Boolean).join(', ') || 'nothing happens';
}

const NOUN = def => (def.reactions ? 'monster' : def.letter ? 'combat card' : def.trigger ? 'ring' : def.heroIds ? 'weapon' : 'card');
// The line shown for a definition: fixture entries say they are made up.
export const shownEffectText = def => (def?.status === 'FIXTURE' ? `Made-up test ${NOUN(def)}: ${effectText(def)}` : effectText(def));
