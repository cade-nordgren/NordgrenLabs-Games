// Bomb screens: everything drawn from a view (viewFor in ../engine/view.js) plus the players' names and styles.
// Nothing here changes game state; taps call the handlers the caller passes in. Both modes use these same screens.
import { label } from '../engine/cards.js';
import { style } from './styles.js';
import { SUIT, isRed, cardName, sortHand, canPlaySel, playLabel, beatInfo, lastLine, nextLabel, drawPlan, drawFinal,
  plural, listOf, rankName } from './logic.js';

export const $ = id => document.getElementById(id);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent, never innerHTML: names are user input
  return e;
};
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(ok => setTimeout(ok, ms));
// Text presentation selector, so suits never turn into emoji.
const sym = s => SUIT[s][0] + '︎';
export const initial = name => [...name.trim()][0]?.toUpperCase() || '?';

// Sets a player's colour (--pc) and the ink that reads on it (--pi) on an element.
export function paint(e, styleId) {
  const s = style(styleId);
  e.style.setProperty('--pc', s.hex);
  e.style.setProperty('--pi', s.ink);
  return e;
}
export function face(c, { button = false, cls = '' } = {}) {
  const e = el(button ? 'button' : 'span', `card${isRed(c.suit) ? ' r' : ''}${cls ? ' ' + cls : ''}`);
  const i = el('span', 'i', label(c.rank));
  i.append(el('small', '', sym(c.suit)));
  e.append(i, el('span', 'm', sym(c.suit)));
  e.setAttribute('aria-label', cardName(c));
  if (button) e.type = 'button'; else e.setAttribute('role', 'img');
  if (c.id) e.dataset.id = c.id;
  return e;
}
export function back(styleId, cls = '') {
  const s = style(styleId), e = el('span', `card back p-${s.pattern}${cls ? ' ' + cls : ''}`);
  e.style.setProperty('--pc', s.hex);
  e.setAttribute('aria-hidden', 'true');
  return e;
}
export const deckBack = () => { const e = el('span', 'card back deck'); e.setAttribute('aria-hidden', 'true'); return e; };
export function whoChip(person) {
  const c = paint(el('span', 'who'), person.style);
  c.append(el('i', '', initial(person.name)), el('span', '', person.name));
  return c;
}
export function avatar(e, person) {
  paint(e, person.style);
  e.textContent = initial(person.name);
  return e;
}

// ---- Polite announcements: one live region, and only when the words change.
let said = '';
export function say(text) {
  if (!text || text === said) return;
  said = text;
  $('live').textContent = text;
}

// ---- Draw for first. Plays the rounds card by card (about 0.35 s each), calls out ties, then the starter.
let drawToken = 0;
export function stopDraw() { drawToken++; }
export function drawScreen(view, people, { animate, onDone }) {
  const my = ++drawToken, plan = drawPlan(view.draws), final = drawFinal(view.draws), n = people.length;
  const grid = $('drawGrid');
  grid.style.setProperty('--cols', n <= 4 ? 2 : 3);
  const tiles = people.map((p, seat) => {
    const t = paint(el('section', 'glass tile'), p.style), slot = el('div'), tag = el('span', 'tag');
    slot.append(back(p.style));
    t.append(whoChip(p), slot, tag);
    return { t, slot, tag, seat };
  });
  grid.replaceChildren(...tiles.map(x => x.t));
  const showCard = (seat, d, flip) => {
    const c = face({ rank: d.rank, suit: d.suit }, { cls: flip ? 'flip' : '' });
    tiles[seat].slot.replaceChildren(c);
  };
  const mark = (seat, result) => {
    const x = tiles[seat];
    x.t.className = `glass tile ${result}`;
    x.tag.className = `tag ${result}`;
    x.tag.textContent = result === 'tie' ? 'Tie, draw again' : result === 'starts' ? 'Starts' : result === 'out' ? 'Out' : '';
  };
  const starter = people[view.first].name;
  const explain = () => {
    const last = plan.at(-1), w = last.cards.find(d => d.seat === view.first);
    const beaten = last.cards.filter(d => d.seat !== view.first).map(d => rankName(d.rank));
    return `${rankName(w.rank)} beats ${listOf([...new Set(beaten)])}.${plan.length > 1 ? ` After ${plural(plan.length - 1, 'tie')}.` : ''}`;
  };
  const end = () => {
    if (my !== drawToken) return;
    for (const [seat, f] of Object.entries(final)) { showCard(+seat, f, false); mark(+seat, f.result === 'starts' ? 'starts' : 'out'); }
    const s = $('drawSummary');
    s.replaceChildren(el('strong', '', `${starter} starts`), explain());
    $('drawSkip').hidden = true;
    $('drawGo').hidden = false;
    onDone?.();
  };
  $('drawSummary').textContent = '';
  $('drawSkip').hidden = !animate;
  $('drawGo').hidden = animate;
  if (!animate) return end();
  (async () => {
    await wait(350);
    for (const r of plan) {
      if (r.round > 0) {
        $('drawSummary').textContent = `Tie. ${listOf(r.cards.map(d => people[d.seat].name))} draw again.`;
        for (const d of r.cards) { tiles[d.seat].slot.replaceChildren(back(people[d.seat].style)); mark(d.seat, 'tie'); }
        await wait(700);
      }
      for (const d of r.cards) {
        if (my !== drawToken) return;
        showCard(d.seat, d, true);
        await wait(380);
      }
      if (my !== drawToken) return;
      for (const d of r.cards) mark(d.seat, r.winner === d.seat ? 'starts' : r.tied?.includes(d.seat) ? 'tie' : 'out');
      if (r.tied) { $('drawSummary').textContent = `Tie between ${listOf(r.tied.map(s => people[s].name))}. Draw again.`; await wait(1100); }
    }
    end();
  })();
}

// ---- Handoff: no cards at all, only public counts.
export function handoffScreen(view, people, seat, { choosing, from }) {
  const p = people[seat], pv = view.players[seat];
  paint($('handoffPage'), p.style);
  avatar($('handAv'), p);
  $('handHidden').textContent = from != null && from !== seat ? `${people[from].name}'s cards are hidden` : 'Cards are hidden';
  $('handTitle').textContent = `Pass the device to ${p.name}`;
  const stat = (n, t) => { const s = el('span'); s.append(el('strong', '', n), ' ', el('span', '', t)); return s; };
  if (choosing) $('handStats').replaceChildren(stat('4', 'face-up cards to choose'));
  else {
    const b = beatInfo(view);
    $('handStats').replaceChildren(stat(pv.hand, `in ${p.name}'s hand`), stat(b.rank, 'to beat'));
  }
  $('handNote').textContent = `${p.name} taps when holding the phone. This screen also shows after a refresh.`;
}

// ---- Face-up choice. picks: four ids or null (table positions); on: the position picked to swap, or null.
export function chooseScreen(view, people, seat, ui, { onPick, onSlot, onConfirm, online, waitingNames }) {
  const p = people[seat], you = view.you, mine = view.players[seat];
  const nine = sortHand([...you.hand, ...(mine.up || [])]);
  const byId = new Map(nine.map(c => [c.id, c]));
  paint($('choosePage'), p.style);
  const pill = $('choosePill');
  pill.replaceChildren(el('i'), online ? `${p.name}, only you see these` : `Only ${p.name} should look`);
  $('chooseTitle').textContent = `${p.name}, pick your four face-up cards`;
  const table = ui.picks.map((id, i) => {
    const s = el('div', 'cslot');
    s.append(back(p.style));
    if (id) {
      const b = face(byId.get(id), { button: true, cls: 'up' + (ui.on === i ? ' on' : '') });
      b.setAttribute('aria-label', `${cardName(byId.get(id))}, table spot ${i + 1}${ui.on === i ? ', chosen to swap' : ''}`);
      b.setAttribute('aria-pressed', ui.on === i);
      b.dataset.k = `slot${i}`;
      b.onclick = () => onSlot(i);
      s.append(b);
    } else {
      const h = el('button', 'card hole', i + 1);
      h.setAttribute('aria-label', `Table spot ${i + 1}, empty${ui.on !== null ? ', move the chosen card here' : ''}`);
      h.dataset.k = `slot${i}`;
      h.onclick = () => onSlot(i);
      s.append(h);
    }
    return s;
  });
  $('chooseTable').replaceChildren(...table);
  const count = ui.picks.filter(Boolean).length;
  $('chooseNine').replaceChildren(...nine.map(c => {
    const b = face(c, { button: true }), on = ui.picks.includes(c.id);
    b.setAttribute('aria-pressed', on);
    b.dataset.k = c.id;
    b.onclick = () => onPick(c.id);
    return b;
  }));
  $('chooseCount').textContent = `${count} of 4 chosen`;
  $('chooseCount').classList.toggle('done', count === 4);
  $('tableHint').textContent = count ? 'Tap two to swap places' : 'Your picks land here';
  $('chooseNote').textContent = online ? (waitingNames.length ? `Waiting on ${listOf(waitingNames)} too.` : 'Play starts when everyone has confirmed.')
    : 'Your cards are hidden again as soon as you confirm.';
  $('confirm').textContent = online ? 'Confirm' : 'Confirm and hide';
  $('confirm').disabled = count !== 4;
  $('confirm').onclick = onConfirm;
}

export function waitScreen(view, people, me) {
  const left = view.players.map((q, i) => q.ready ? null : i).filter(i => i !== null);
  $('waitLede').textContent = 'Your cards are on the table. Play starts when everyone has chosen.';
  $('waitList').replaceChildren(...people.map((p, i) => {
    const li = paint(el('li', 'rrow glass'), p.style), s = el('strong');
    s.append(el('i'), el('span', '', p.name + (i === me ? ' (you)' : '')));
    li.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    li.append(s, el('span', 'cap', view.players[i].ready ? 'Ready' : 'Choosing'));
    return li;
  }));
  $('waitText').textContent = `Waiting for ${plural(left.length, 'player')}`;
}

// ---- The table.
// ctx: { view, people, me (viewer seat), online, sel: [card], info, onCard, onSlot, onPlay, onPick, onNext }
export function tableScreen(ctx) {
  const { view, people, me, online } = ctx, you = view.you, mp = view.players[me], person = people[me];
  const myTurn = view.phase === 'play' && view.turn === me && !view.pending;
  $('tableInfo').textContent = ctx.info;

  // Opponents in turn order after the viewer, the one to move ringed in their colour and named in text.
  const n = people.length, order = Array.from({ length: n - 1 }, (_, k) => (me + 1 + k) % n);
  const opps = $('opps');
  opps.classList.toggle('one', n === 2);
  opps.replaceChildren(...order.map(seat => {
    const q = view.players[seat], who = people[seat], active = view.phase === 'play' && view.turn === seat;
    const sec = paint(el('section', 'opp glass' + (active ? ' now' : '')), who.style);
    sec.dataset.seat = seat;
    const ups = (q.up || []).filter(Boolean);
    sec.setAttribute('aria-label', `${who.name}: ${plural(q.hand, 'card')} in hand${ups.length ? `, face up ${listOf(ups.map(cardName))}` : ''}, ${plural(q.down.filter(Boolean).length, 'card')} face down${active ? ', their turn' : ''}`);
    const spots = el('div', 'spots');
    spots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) {
      const sp = el('div', 'spot'), u = q.up?.[i];
      if (q.down[i]) sp.append(back(who.style));
      if (u) sp.append(face(u, { cls: 'mini up' }));
      if (!q.down[i] && !u) sp.append(el('span', 'card mini slot-empty up'));
      spots.append(sp);
    }
    sec.append(whoChip(who), el('p', 'opp-sub', `${q.hand} in hand${active ? ' · their turn' : ''}`), spots);
    return sec;
  }));
  const now = opps.querySelector('.now');
  if (now) { // keep the player to move in view without scrolling the page
    const l = now.offsetLeft - opps.offsetLeft, r = l + now.offsetWidth;
    if (l < opps.scrollLeft || r > opps.scrollLeft + opps.clientWidth) opps.scrollLeft = l - 4;
  }

  // Centre: deck, pile (top four fanned), and what to beat.
  $('deckStack').replaceChildren(...(view.deck ? [deckBack(), deckBack()] : [el('span', 'card slot-empty')]));
  $('deckStack').querySelectorAll('.card').forEach(c => c.style.setProperty('--w', 'var(--dw)'));
  $('deckCap').replaceChildren('Deck', el('br'), el('strong', '', view.deck || 'Empty'));
  const top = view.pile.slice(-4), pile = $('pile');
  if (top.length) {
    const step = 16, w = `(var(--pw) + ${(top.length - 1) * step}px)`;
    pile.replaceChildren(...top.map((c, i) => {
      const f = face(c);
      f.style.left = `calc(50% - ${w} / 2 + ${i * step}px)`;
      f.style.rotate = `${[-6, 3, -2, 5][(view.pile.length - top.length + i) % 4]}deg`;
      return f;
    }));
  } else pile.replaceChildren(el('span', 'card slot-empty'));
  pile.querySelectorAll('.card').forEach(c => c.style.setProperty('--w', 'var(--pw)'));
  $('pileCap').replaceChildren('Pile · ', el('strong', '', view.pile.length || 'empty'));
  const beat = beatInfo(view);
  $('beatRank').textContent = beat.rank;
  $('beatNote').textContent = beat.note;
  $('centre').setAttribute('aria-label', `Deck ${view.deck || 'empty'}. Pile ${view.pile.length ? `${view.pile.length}, top ${cardName(view.pile.at(-1))}` : 'empty'}. To beat: ${beat.rank === 'Any' ? 'anything' : rankName(view.required)}, ${beat.note}.`);

  // Your table: face-down backs, face-up cards over them.
  paint($('mineBox'), person.style);
  const fromUp = myTurn && you.source === 'up', fromDown = myTurn && you.source === 'down';
  $('mySpots').replaceChildren(...[0, 1, 2, 3].map(i => {
    const s = el('div', 'mslot'), u = mp.up?.[i];
    if (mp.down[i]) {
      if (fromDown && you.blind.includes(i)) {
        const b = el('button', `card back p-${style(person.style).pattern} tap`);
        b.style.setProperty('--pc', style(person.style).hex);
        b.setAttribute('aria-label', `Face-down card ${i + 1}, turn it over`);
        b.dataset.k = `down${i}`;
        b.onclick = () => ctx.onSlot(i);
        s.append(b);
      } else s.append(back(person.style));
    }
    if (u) s.append(cardButton(u, fromUp, ctx, 'up'));
    if (!mp.down[i] && !u) s.append(el('span', 'card slot-empty'));
    return s;
  }));
  $('mySpots').classList.toggle('locked', !myTurn || you.source === 'hand');
  $('mineNote').textContent = you.source === 'up' ? (myTurn ? 'play these now' : 'face up next')
    : you.source === 'down' ? (myTurn ? 'face down: pick one' : `${plural(mp.down.filter(Boolean).length, 'card')} face down`)
    : view.deck ? 'after your hand and the deck' : 'after your hand';

  // Your hand, sorted, in a tray that overlaps cards only when they do not fit.
  avatar($('handAvSmall'), person);
  const hand = sortHand(you.hand), tray = $('tray'), keep = tray.scrollLeft;
  // Cards just drawn or picked up are the newest at the end of the engine's hand list: mark them with a dot.
  const got = view.last?.seat === me ? (view.last.type === 'play' ? view.last.drew : view.last.count) : 0;
  const fresh = new Set(got ? you.hand.slice(-got).map(c => c.id) : []);
  tray.replaceChildren(...hand.map(c => {
    const b = cardButton(c, myTurn && you.source === 'hand', ctx, 'hand');
    if (fresh.has(c.id)) b.classList.add('new');
    return b;
  }));
  if (!hand.length) tray.replaceChildren(el('p', 'empty-hand', you.source === 'up' ? 'Your hand is empty. Play from your table.' : 'Your hand is empty.'));
  tray.classList.toggle('locked', !myTurn || you.source !== 'hand');
  fitTray(tray, hand.length);
  tray.scrollLeft = keep;
  $('handTitleSmall').textContent = `${person.name} · your hand · ${hand.length}`;
  const overflow = tray.scrollWidth > tray.clientWidth + 2;
  $('handCount').textContent = ctx.sel.length ? `${ctx.sel.length} selected` : fresh.size && view.last.type === 'play' ? `drew ${view.last.drew}`
    : fresh.size ? `took ${fresh.size}` : overflow ? 'sorted · swipe' : '';

  // Status and actions.
  const words = statusLine(ctx, myTurn);
  $('status').textContent = words;
  const short = words.replace(/Your turn: (.)/, (_, c) => c.toUpperCase());
  $('turnbox').replaceChildren(el('strong', '', myTurn ? 'Your turn' : view.pending ? (view.pending.next === me ? 'You go again' : 'Turn over') : view.phase === 'play' ? `${people[view.turn].name}'s turn` : 'Game over'), el('br'), short.charAt(0).toUpperCase() + short.slice(1));
  say(words);
  const pick = $('pick'), play = $('play'), next = $('next');
  const must = myTurn && you.mustPickUp;
  pick.hidden = play.hidden = online && !myTurn;
  pick.disabled = !(myTurn && you.canPickUp);
  pick.textContent = view.pile.length && myTurn ? `Pick up ${view.pile.length}` : 'Pick up';
  pick.classList.toggle('ink', must);
  play.classList.toggle('ink', !must);
  play.disabled = !(myTurn && canPlaySel(ctx.sel, you.playable));
  play.textContent = fromDown ? 'Tap a card above' : must ? 'Nothing to play' : playLabel(ctx.sel);
  next.hidden = online;
  next.disabled = !view.pending;
  next.textContent = nextLabel(view, people.map(p => p.name));
  $('waitPill').hidden = !online || myTurn;
  $('waitPillText').textContent = view.phase === 'play' ? `Waiting for ${people[view.turn].name}` : '';
  pick.onclick = ctx.onPick;
  play.onclick = ctx.onPlay;
  next.onclick = ctx.onNext;
}

function cardButton(c, active, ctx, zone) {
  const b = face(c, { button: true });
  const ok = active && ctx.view.you.playable.includes(c.id), on = ctx.sel.some(s => s.id === c.id);
  b.setAttribute('aria-pressed', on);
  if (!ok) b.setAttribute('aria-disabled', 'true');
  if (active && !ok) b.classList.add('no');
  if (zone === 'up') b.classList.add('up');
  if (active && !ok) b.setAttribute('aria-label', `${cardName(c)}, too low`);
  b.dataset.k = c.id;
  b.onclick = () => ctx.onCard(c, ok);
  return b;
}

// Cards keep their full size; when the hand is wider than the tray they overlap, never closer than 44px apart, and
// the tray scrolls sideways.
function fitTray(tray, count) {
  tray.style.removeProperty('--step');
  if (count < 2) return;
  const card = tray.querySelector('.card');
  if (!card) return;
  const w = card.getBoundingClientRect().width, room = tray.clientWidth - 32;
  if (!w || count * (w + 6) - 6 <= room) return;
  const step = Math.max(44, Math.min(w + 6, (room - w) / (count - 1)));
  tray.style.setProperty('--step', `${step}px`);
}

function statusLine(ctx, myTurn) {
  const { view, people, me } = ctx, you = view.you;
  const said = lastLine(view, people.map(p => p.name), me);
  let ask = '';
  if (view.pending) ask = '';
  else if (myTurn) {
    if (you.source === 'down') ask = 'Tap one face-down card. It turns over when you tap it.';
    else if (you.mustPickUp) ask = 'Nothing you have can beat it: pick up the pile.';
    else if (you.source === 'up') ask = 'Your turn: play from your face-up cards.';
    else ask = ctx.sel.length ? '' : 'Your turn: choose cards to play.';
  } else if (view.phase === 'play') ask = `Waiting for ${people[view.turn].name}.`;
  return [said, ask].filter(Boolean).join(' ');
}

// ---- Animations for the latest move: card to pile, reset pulse, BOMB!, pile to hand, face-down flip. Skipped under
// reduced motion. snap: rects taken from the table before it was redrawn.
export function snapshot() {
  if ($('tablePage').hidden) return null;
  const cards = new Map(), seats = new Map();
  for (const e of document.querySelectorAll('#tablePage [data-id]')) cards.set(e.dataset.id, e.getBoundingClientRect());
  for (const e of document.querySelectorAll('#tablePage [data-seat]')) seats.set(+e.dataset.seat, e.getBoundingClientRect());
  return { cards, seats, slots: [...document.querySelectorAll('#mySpots .mslot')].map(e => e.getBoundingClientRect()),
    tray: $('tray').getBoundingClientRect(), pile: $('pile').getBoundingClientRect() };
}

const centreOf = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function flyer(c, rect, w) {
  const f = c ? face(c, { cls: 'fly' }) : el('span', 'card back deck fly');
  f.removeAttribute('data-id');
  f.setAttribute('aria-hidden', 'true');
  f.style.setProperty('--w', `${w}px`);
  f.style.left = `${rect.x - w / 2}px`;
  f.style.top = `${rect.y - w * .715}px`;
  document.body.append(f);
  return f;
}
const go = (f, from, to, opts) => f.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: 'none' }],
  { duration: 340, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'both', ...opts }).finished;

// A page that is not being drawn holds its animations, so an older one can resume much later: its flyers go at once,
// and the token stops it from adding anything more.
let animToken = 0;
export const clearFlyers = () => { animToken++; document.querySelectorAll('.fly, .boom').forEach(e => e.remove()); };
export async function animate(prev, view, snap, me) {
  const l = view.last;
  clearFlyers();
  const my = animToken, stale = () => my !== animToken;
  if (!prev || !snap || !l || still() || view.turns !== prev.turns + 1) return;
  const pileNow = $('pile').getBoundingClientRect(), pw = pileNow.height / 1.43 - 4;
  const target = centreOf(pileNow);
  const seatRect = s => s === me ? snap.tray : snap.seats.get(s) || snap.pile;
  const downSlot = () => prev.players[l.seat].down.findIndex((d, i) => d && !view.players[l.seat].down[i]);
  const fromFor = c => {
    const r = snap.cards.get(c.id);
    if (r) return centreOf(r);
    if (l.from === 'down' && l.seat === me && snap.slots[downSlot()]) return centreOf(snap.slots[downSlot()]);
    return centreOf(seatRect(l.seat));
  };
  const flips = [];
  try {
    if (l.type === 'play') {
      const real = [...$('pile').querySelectorAll('[data-id]')].filter(e => l.cards.some(c => c.id === e.dataset.id));
      real.forEach(e => { e.style.visibility = 'hidden'; });
      await Promise.all(l.cards.map((c, k) => {
        const end = real.find(e => e.dataset.id === c.id);
        const to = end ? centreOf(end.getBoundingClientRect()) : target;
        const f = flyer(c, to, pw);
        flips.push(f);
        const from = fromFor(c);
        if (l.from === 'down') return f.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) rotateY(90deg)` },
          { transform: `translate(${(from.x - to.x) / 2}px, ${(from.y - to.y) / 2}px) rotateY(0)`, offset: .4 }, { transform: 'none' }],
          { duration: 600, easing: 'ease-out', fill: 'both' }).finished;
        return go(f, from, to, { delay: k * 60 });
      }));
      real.forEach(e => { e.style.visibility = ''; });
      if (stale()) return;
      if (l.bomb) {
        const prevPile = prev.pile.slice(-4).map(c => ({ c, r: snap.cards.get(c.id) })).filter(x => x.r);
        prevPile.forEach(x => flips.push(flyer(x.c, centreOf(x.r), pw)));
        const boom = el('div', 'boom');
        boom.append(el('b', '', 'BOMB!'));
        $('centre').append(boom);
        flips.forEach((f, k) => f.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(k % 2 ? 1 : -1) * (40 + k * 18)}px, ${-30 - k * 10}px) rotate(${(k % 2 ? 1 : -1) * 40}deg) scale(.6)`, opacity: 0 }],
          { duration: 600, easing: 'ease-in', fill: 'both' }));
        await wait(900);
        boom.remove();
      } else if (l.cards[0].rank === 2) {
        $('beat').classList.remove('pulse'); void $('beat').offsetWidth; $('beat').classList.add('pulse');
      }
    } else {
      // Pickup, or a blind card too low: show it on the pile with "Too low", then the pile goes to the hand.
      const prevPile = prev.pile.slice(-4).map(c => ({ c, r: snap.cards.get(c.id) })).filter(x => x.r);
      const cards = prevPile.map(x => flyer(x.c, centreOf(x.r), pw));
      if (l.type === 'failed') {
        const at = prevPile.length ? centreOf(prevPile.at(-1).r) : target;
        const shown = { x: at.x + (prevPile.length ? 16 : 0), y: at.y };
        const f = flyer(l.card, shown, pw);
        const tag = el('span', 'toolow', 'Too low');
        f.append(tag);
        const from = l.seat === me && snap.slots[downSlot()] ? centreOf(snap.slots[downSlot()]) : centreOf(seatRect(l.seat));
        await f.animate([{ transform: `translate(${from.x - shown.x}px, ${from.y - shown.y}px) rotateY(90deg)` }, { transform: 'none' }],
          { duration: 450, easing: 'ease-out', fill: 'both' }).finished;
        await wait(900);
        cards.push(f);
        if (stale()) return;
      }
      flips.push(...cards);
      const dest = l.seat === me ? centreOf($('tray').getBoundingClientRect()) : centreOf(document.querySelector(`#opps [data-seat="${l.seat}"]`)?.getBoundingClientRect() || seatRect(l.seat));
      await Promise.all(cards.map((f, k) => {
        const r = f.getBoundingClientRect(), from = centreOf(r);
        return f.animate([{ transform: f.style.transform || 'none', opacity: 1 }, { transform: `translate(${dest.x - from.x}px, ${dest.y - from.y}px) scale(.7)`, opacity: .2 }],
          { duration: 420, delay: k * 40, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both' }).finished;
      }));
    }
  } finally {
    flips.forEach(f => f.remove());
  }
}

// ---- Results: winner glows, every row's numbers tick up once (Crossix's finish), turns and game time.
let resultsToken = 0;
export function stopResults() { resultsToken++; }
export function resultsScreen(view, people, { animate, time, me }) {
  const my = ++resultsToken, w = view.winner, winner = people[w];
  paint($('resultsPage'), winner.style);
  avatar($('winAv'), winner);
  $('winTitle').textContent = w === me ? 'You win!' : `${winner.name} wins!`;
  const l = view.last;
  $('winWhy').textContent = !l ? '' : l.bomb ? 'Out on a bomb.' : l.from === 'down' ? 'Out on the last face-down card.' : l.from === 'up' ? 'Out on a face-up card.' : 'Every card played.';
  const order = people.map((_, i) => i).sort((a, b) => (a === w ? -1 : b === w ? 1 : view.players[a].left - view.players[b].left || a - b));
  const rows = order.map((seat, k) => {
    const p = people[seat], q = view.players[seat];
    const li = paint(el('li', 'rrow glass' + (seat === w ? ' win' : ' dim')), p.style);
    const name = el('strong');
    name.append(el('i'), el('span', '', p.name + (seat === me ? ' (you)' : '')));
    const stats = el('div', 'rstats');
    const vals = [[q.left, people.length > 3 ? 'left' : 'cards left'], [q.bombs, 'bombs'], [q.pickups, 'pickups']];
    const bs = vals.map(([v, t]) => { const d = el('div'), b = el('b', '', animate ? 0 : v); d.append(b, el('small', '', t)); stats.append(d); return { b, v }; });
    li.setAttribute('aria-label', `${k + 1}. ${p.name}: ${plural(q.left, 'card')} left, ${plural(q.bombs, 'bomb')}, ${plural(q.pickups, 'pickup')}`);
    li.append(el('span', 'rank' + (seat === w ? ' first' : ''), k + 1), name, stats);
    return { li, bs };
  });
  $('resultRows').replaceChildren(...rows.map(r => r.li));
  $('resultRows').classList.toggle('many', people.length > 3);
  $('totTurns').textContent = animate ? 0 : view.turns;
  $('timeBox').hidden = !time;
  $('totTime').textContent = time || '';
  say(`${$('winTitle').textContent} ${view.turns} turns.`);
  const finish = () => {
    rows.forEach(r => r.bs.forEach(x => { x.b.textContent = x.v; }));
    $('totTurns').textContent = view.turns;
    $('resultsSkip').hidden = true;
    $('resultRows').querySelectorAll('.rrow').forEach(li => { li.style.animationPlayState = ''; });
  };
  if (!animate || still()) return finish();
  $('resultsSkip').hidden = false;
  $('resultsSkip').onclick = () => { resultsToken++; finish(); };
  // Every number ticks up at a shared pace, landing together in about a second.
  const all = [...rows.flatMap(r => r.bs), { b: $('totTurns'), v: view.turns }], t0 = performance.now();
  const tick = () => {
    if (my !== resultsToken) return;
    const p = Math.min(1, (performance.now() - t0) / 1100);
    all.forEach(x => { x.b.textContent = Math.round(x.v * p); });
    if (p < 1) setTimeout(tick, 16); else finish();
  };
  setTimeout(tick, 300);
}

