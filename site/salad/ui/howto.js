// How to play (spec section 23): the rules with small card pictures, and an optional try-it table that runs the real
// engine on this device (nothing is sent anywhere, nothing is saved). Never forced on anyone.
import { layout, reduce, trickWinner } from '../engine/reducer.js';
import { viewFor } from '../engine/view.js';
import { rankOf, suitOf } from '../engine/cards.js';
import { cardEl, cardName, short, sortHand, SUIT_WORD } from './cards.js';
import { color } from './colors.js';
import { $, el } from './dom.js';

// A row of small cards with a caption, on felt.
function ex(text, ids, mark = []) {
  const d = el('div', 'ex');
  for (const id of ids) { const c = cardEl(id); c.classList.add('sm'); if (mark.includes(id)) c.classList.add('win'); d.append(c); }
  d.append(el('span', '', text));
  return d;
}
const h3 = t => el('h3', '', t);
const p = t => el('p', '', t);
function list(tag, items) { const l = el(tag); for (const i of items) l.append(el('li', '', i)); return l; }

let built = false, demoBox = null;
export function openHow() {
  if (!built) build(); else startDemo(demoBox); // a fresh practice trick each time
  $('howSheet').showModal();
  $('howTitle').focus({ preventScroll: true });
}

function build() {
  built = true;
  const b = $('howBody');
  b.append(
    p('Six rounds of tricks for 2 to 8 players, each on their own device. Every round hands out penalty points. The lowest total after six rounds wins.'),
    h3('The six rounds'),
    list('ol', ['No Tricks: 10 for each trick you win.', 'No Hearts: 10 for each heart you take.', 'No Queens: 25 for each queen you take.',
      'No King of Spades: 100 for taking the King of Spades.', 'No Last Trick: 100 for winning the last trick.', 'Canadian Salad: all five at once.']),
    h3('Leading a suit'),
    p('The leader may play any card, hearts included. That card’s suit is the lead suit for the trick.'),
    ex('Sam leads clubs', ['d1-9C']),
    h3('Following suit'),
    p('If you hold a card of the lead suit, you must play one. Only when you have none may you play anything else. The game greys out the cards you can’t play.'),
    ex('Clubs led: you must play a club if you have one', ['d1-9C', 'd1-4C']),
    h3('Winning a trick'),
    p('The highest card of the lead suit wins. Ace is high, 2 is low. A card of another suit never wins, however high. The winner leads the next trick.'),
    ex('The J♣ wins: the A♥ is off suit', ['d1-9C', 'd1-AH', 'd1-JC', 'd1-4C'], ['d1-JC']),
    h3('No trumps'),
    p('No suit beats another. Hearts are a penalty, not a trump.'),
    h3('Capturing penalty cards'),
    p('Whoever wins a trick takes every card in it, and with them their penalties for this round.'),
    ex('No Hearts: two hearts, 20 points', ['d1-KH', 'd1-4H', 'd1-9C']),
    ex('No Queens: 25 for the Q♠', ['d1-QS', 'd1-3S']),
    h3('The King of Spades'),
    ex('Round 4: 100 points for this card', ['d1-KS']),
    h3('The last trick'),
    p('In round 5 only the last trick of the round scores: 100 points to whoever wins it.'),
    h3('Combined scoring'),
    p('In round 6, Canadian Salad, everything counts: 10 a trick, 10 a heart, 25 a queen, 100 for the King of Spades and 100 for the last trick. The Queen of Hearts counts as a heart and a queen: 35.'),
    ex('Round 6: one trick (10), one heart (10), Q♥ (10 + 25) = 55', ['d1-QH', 'd1-7H', 'd1-2C']),
    h3('Multiple decks'),
    p('Bigger tables can play with 2 or 3 whole decks, so there are more cards, tricks and penalties. When the cards don’t split evenly, the few left over form a kitty, face down. The winner of each round’s first trick takes it, face up, with any penalties in it. The kitty is not a trick.'),
    h3('Identical cards'),
    p('With more than one deck, two identical cards can meet in a trick. If they are the highest of the lead suit, the one played later wins.'),
    ex('Two J♠: the second one wins', ['d1-JS', 'd2-JS'], ['d2-JS']),
    h3('Final scoring'),
    p('After round 6 the totals are counted up round by round. The lowest total wins. Equal totals share a place, and a tie for lowest means joint winners.'),
    h3('Try it'),
    p('A practice trick against three players on this device. Nothing is saved.'),
  );
  const demo = demoBox = el('div', 'demo');
  b.append(demo);
  const done = el('button', 'btn', 'Done');
  done.type = 'button';
  done.dataset.close = '';
  b.append(done);
  startDemo(demo);
}

// ---- Practice table: you (seat 0) against three on-device players, round 2, Ada leads a heart and you hold hearts.
const PLAYERS = [{ name: 'You', color: 'cobalt' }, { name: 'Sam', color: 'forest' }, { name: 'Ada', color: 'violet' }, { name: 'Lou', color: 'tangerine' }];
function startDemo(box) {
  let g = layout({ players: PLAYERS, round: 2, dealer: 1, hands: [['KH', '7H', '3H', 'AS', '10S', '5S', 'QC', '6C', '2C', 'JD', '8D', '4D', '9C'], [], ['9H']] });
  let timer = 0, shownTrick = null, tricksDone = 0;
  const trickBox = el('div', 'dtrick'), msg = el('p', 'msg'), hand = el('div', 'hrow'), row = el('div', 'two');
  msg.setAttribute('aria-live', 'polite');
  const next = el('button', 'btn', 'Next trick'), again = el('button', 'btn', 'Start over');
  next.type = again.type = 'button';
  row.append(next, again);
  box.replaceChildren(trickBox, msg, hand, row);
  const nameOf = s => PLAYERS[s].name;

  const draw = () => {
    const v = viewFor(g, 0), plays = shownTrick ? shownTrick.plays : v.trick?.plays ?? [];
    const win = shownTrick ? shownTrick.winner : plays.length > 1 ? trickWinner(plays) : null;
    trickBox.replaceChildren(...plays.map(q => {
      const s = el('div', 'spot'), c = cardEl(q.card);
      c.classList.add('sm');
      if (q.seat === win) c.classList.add('win');
      const who = el('span', 'who'), dot = el('i');
      dot.style.background = color(PLAYERS[q.seat].color).hex;
      who.append(dot, nameOf(q.seat));
      s.append(c, who);
      return s;
    }));
    const mine = v.phase === 'play' && v.turn === 0 && !shownTrick, legal = new Set(mine ? v.you.legal : []);
    hand.replaceChildren(...sortHand(v.you.hand, 'suit').map(id => {
      const c = cardEl(id, 'button');
      c.type = 'button';
      if (mine) c.classList.add(legal.has(id) ? 'up' : 'no');
      c.setAttribute('aria-label', cardName(id) + (mine ? (legal.has(id) ? ', playable' : ', can’t be played') : ''));
      c.onclick = () => tap(id);
      return c;
    }));
    next.hidden = !shownTrick;
  };
  const say = t => { msg.textContent = t; };

  function tap(id) {
    const v = viewFor(g, 0);
    if (shownTrick || v.turn !== 0) return;
    if (!v.you.legal.includes(id)) {
      const lead = v.trick.leadSuit;
      return say(`You hold ${SUIT_WORD[lead].toLowerCase()}, so you must follow ${SUIT_WORD[lead].toLowerCase()}. The bright cards are the ones you can play.`);
    }
    g = reduce(g, { type: 'PLAY_CARD', seat: 0, card: id });
    after();
  }
  // Others play the lowest card they may (a leader leads its lowest), half a second apart.
  function bots() {
    clearTimeout(timer);
    if (g.phase !== 'play' || g.turn === 0) return;
    timer = setTimeout(() => {
      const s = g.turn, v = viewFor(g, s);
      const card = s === 2 && g.tricks.length === 0 && !g.trick.plays.length ? v.you.hand.find(c => c === 'd1-9H') : [...v.you.legal].sort((a, b) => rankOf(a) - rankOf(b))[0];
      g = reduce(g, { type: 'PLAY_CARD', seat: s, card });
      after();
    }, 550);
  }
  function after() {
    const before = shownTrick;
    if (g.tricks.length > tricksDone) {
      tricksDone = g.tricks.length;
      shownTrick = g.tricks.at(-1);
      const w = shownTrick.winner, lead = suitOf(shownTrick.plays[0].card), top = shownTrick.plays.find(q => q.seat === w).card;
      const hearts = shownTrick.plays.filter(q => suitOf(q.card) === 'H').length;
      say(`${w === 0 ? 'You win' : `${nameOf(w)} wins`} with the ${short(top)}, the highest ${SUIT_WORD[lead].toLowerCase().replace(/s$/, '')} played. ${hearts ? `In No Hearts that costs ${hearts * 10} points (${hearts} × 10).` : 'No hearts, so no points this time.'} ${w === 0 ? 'You lead next.' : `${nameOf(w)} leads next.`}`);
      draw();
      return;
    }
    if (!before) {
      const v = viewFor(g, 0);
      if (v.turn === 0) {
        const lead = v.trick.leadSuit;
        say(!lead ? 'Your lead: tap any card.' : v.you.hand.some(c => suitOf(c) === lead)
          ? `${nameOf(v.trick.leader)} led ${SUIT_WORD[lead].toLowerCase()}. You hold ${SUIT_WORD[lead].toLowerCase()}, so tap one of the bright cards.`
          : `No ${SUIT_WORD[lead].toLowerCase()} in your hand: any card may go.`);
      } else say(`${nameOf(v.turn)} is playing…`);
    }
    draw();
    bots();
  }
  next.onclick = () => { shownTrick = null; if (tricksDone >= 3) { say('That is the idea. Start over to try again, or close this and play for real.'); next.hidden = true; return; } after(); };
  again.onclick = () => { clearTimeout(timer); startDemo(box); };
  $('howSheet').addEventListener('close', () => clearTimeout(timer), { once: true });
  after();
}
