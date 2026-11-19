// Card decks (system 5; RB 7.2-7.4, SP 6). Seven separate draw decks, never merged.
// A deck holds card instance ids "CARD_ID#n" (one per physical copy), top first.
// Used cards go to the bottom of their own deck unless the card says otherwise.
import { shuffle, logEvent } from './dice.js';
import { contentIndex } from '../content/schema.js';

// Deck category -> content key.
export const DECKS = { ROOM: 'room', SEARCH: 'search', ROOM_SEARCH: 'roomSearch', CHEST: 'chest', DOOR: 'door', MONSTER: 'monster', TREASURY: 'treasury' };

export const cardId = inst => inst.split('#')[0];
export const instances = defs => defs.flatMap(d => Array.from({ length: d.copies ?? 1 }, (_, i) => `${d.id}#${i + 1}`));
export const cardDef = (content, inst) => {
  const def = contentIndex(content).cards.get(cardId(inst));
  if (!def) throw new Error(`Unknown card ${inst}`);
  return def;
};

// RB 4, SP 3: each deck shuffled separately at setup. The dragon deck is drawn from the top of a
// shuffled order, which is an unbiased draw from the remaining cards (SP 8 step 2).
export function initDecks(g, content) {
  g.decks = {};
  for (const [cat, key] of Object.entries(DECKS)) g.decks[cat] = { order: shuffle(g, instances(content[key] || []), cat), shuffles: 1 };
  g.dragon = { remaining: shuffle(g, instances(content.dragon || []), 'DRAGON'), aside: [], resets: 0 };
}

// priv: the seat allowed to see the card (treasury holder, monster controller); null = public.
export function draw(g, cat, reason, priv = null) {
  const d = g.decks[cat];
  // shortcut: an exhausted deck yields no card (every copy held); revisit if real content can empty a deck.
  if (!d.order.length) { logEvent(g, { kind: 'deck-empty', deck: cat, reason }); return null; }
  const inst = d.order.shift();
  logEvent(g, { kind: 'draw', deck: cat, value: inst, reason, ...(priv === null ? {} : { private: priv }) });
  return inst;
}

export function toBottom(g, cat, inst, priv = null) {
  g.decks[cat].order.push(inst);
  logEvent(g, { kind: 'bottom', deck: cat, value: inst, ...(priv === null ? {} : { private: priv }) });
}

// RB 7.4: a "shuffle again" card reshuffles its own pile only.
export function reshuffle(g, cat) {
  const d = g.decks[cat];
  d.order = shuffle(g, d.order, cat);
  d.shuffles += 1;
}
