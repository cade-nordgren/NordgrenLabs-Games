// The card table: opponents, the trick on the felt, your hand and the Play button. Everything drawn comes from the
// server's view; animations only decorate it (a play flies in, a finished trick is shown then swept to its winner) and
// never hold back input. A play is shown at once (optimistic) and put back if the server refuses it.
import * as net from './net.js';
import { color, avatar } from './colors.js';
import { prefs, setPref, tableOf, dur, still } from './prefs.js';
import { cardEl, backEl, cardName, short, sortHand, SUIT, SUIT_WORD, isRed } from './cards.js';
import { trickWinner } from '../engine/reducer.js';
import { ROUNDS, scores as scoresIn } from '../engine/score.js';
import { suitOf, isHeart, isQueen, isKingOfSpades } from '../engine/cards.js';
import { $, el, toast, plural, errText } from './dom.js';
import { scoresHidden, roundPts } from './results.js';
import { sound } from './sound.js';

const OBJ = { tricks: '10 a trick', hearts: '10 a heart', queens: '25 a queen', kings: '100 for the K♠︎', last: '100 for the last trick', salad: 'every penalty counts' };
export const objective = round => OBJ[ROUNDS[round - 1].key];
const landscapePhone = matchMedia('(orientation: landscape) and (max-height: 540px)');
const wide = matchMedia('(min-width: 700px) and (min-height: 600px)'); // tablet and desktop: opponents sit round the felt

let idle = () => {};
export const onIdle = fn => { idle = fn; };

// Per-room memory of what has been shown, so nothing animates twice.
const T = { room: null, sel: null, pending: null, flyFrom: null, shown: new Set(), lastKey: undefined, roundKey: undefined, fx: null, manual: null, deal: false, primed: false };
function reset(room) {
  finishFx(true);
  Object.assign(T, { room, sel: null, pending: null, flyFrom: null, shown: new Set(), lastKey: undefined, roundKey: undefined, manual: null, deal: false, primed: false });
}
export const tableBusy = () => !!T.fx;

const nameOf = (v, s) => (s === v.you.seat ? 'You' : v.game.players[s].name);
const verb = (v, s, you, them) => (s === v.you.seat ? you : them);

// ---- Rendering
let view = null;
export function renderTable(v) {
  view = v;
  const g = v.game, my = v.you.seat, n = g.players.length;
  if (T.room !== v.room.id) reset(v.room.id);
  // Changes when a round is dealt (next round, or a rematch's new cut), not when one ends.
  const roundKey = `${g.round}:${JSON.stringify(g.cut)}`;
  const lastKey = g.last ? `${roundKey}:${g.last.n}` : null;
  if (roundKey !== T.roundKey) {
    if (T.roundKey !== undefined && g.phase === 'play') { T.deal = true; sound('shuffle'); }
    T.roundKey = roundKey;
    T.shown = new Set();
    T.sel = null;
    T.manual = loadOrder(roundKey);
  }
  if (lastKey !== T.lastKey) {
    if (lastKey && T.lastKey !== undefined) startFx(g);
    T.lastKey = lastKey;
  }
  if (!T.primed) { T.primed = true; if (g.trick) for (const p of g.trick.plays) T.shown.add(`${roundKey}:${g.trick.n}:${p.seat}`); } // a reload shows the table as it is

  $('game').dataset.table = tableOf(prefs.table === 'room' ? v.room.config.tableTheme : prefs.table).id;
  const myTurn = g.phase === 'play' && g.turn === my && !T.pending;
  const fx = T.fx;
  const title = fx ? `${nameOf(v, fx.last.winner)} ${verb(v, fx.last.winner, 'take', 'takes')} it`
    : g.phase !== 'play' ? 'Round over' : myTurn || (T.pending && g.turn === my) ? 'Your turn' : `${g.players[g.turn].name}’s turn`;
  const tricksTotal = g.config.tricks;
  const trickNo = fx ? fx.last.n : Math.min(tricksTotal, g.tricksPlayed + 1);
  const roundLine = `Round ${g.round} of 6 · ${g.roundName}, ${objective(g.round)} · Trick ${trickNo} of ${tricksTotal}${g.decks > 1 ? ` · ${g.decks} decks` : ''}`;
  $('gTitle').textContent = $('gTitle2').textContent = title;
  $('gRound').textContent = $('gRound2').textContent = roundLine;
  const myTotal = g.totals[my] + (roundPts(g, my) ?? 0);
  $('gScores').replaceChildren('Scores ', Object.assign(el('span', '', String(myTotal)), { style: 'font-weight: 800' }));
  $('gScores').setAttribute('aria-label', `Scores, you have ${myTotal}`);

  drawOpps(v);
  drawFelt(v);
  drawSide(v);
  drawMe(v, myTurn);
  drawHand(v, myTurn);
  drawActions(v, myTurn);
  requestAnimationFrame(() => { layoutHand(); flyIn(v); dealFx(v); });
}

// Clockwise from the viewer: relative seat k sits at angle 90deg + k * 360/n (screen y points down), so the viewer is
// at the bottom and the next seat clockwise to their left.
const angle = (v, s) => { const n = v.game.players.length, k = (s - v.you.seat + n) % n; return (90 + k * 360 / n) * Math.PI / 180; };

function drawOpps(v) {
  const g = v.game, my = v.you.seat, n = g.players.length, box = $('opps');
  const others = Array.from({ length: n - 1 }, (_, i) => (my + 1 + i) % n);
  box.style.setProperty('--cols', others.length <= 4 ? others.length : Math.ceil(others.length / 2));
  const compact = others.length > 4;
  const tight = compact && !landscapePhone.matches && !wide.matches; // four to a row on a portrait phone only
  box.classList.toggle('tight', tight);
  box.classList.toggle('many', compact);
  box.replaceChildren(...others.map(s => {
    const p = g.players[s], seat = v.room.seats[s], c = color(p.color), now = g.phase === 'play' && g.turn === s && !(T.fx && !still());
    const sec = el('section', 'glass opp' + (now ? ' now' : ''));
    sec.dataset.seat = s;
    sec.style.setProperty('--pc', c.hex);
    const a = angle(v, s);
    sec.style.setProperty('--x', Math.cos(a).toFixed(3));
    sec.style.setProperty('--y', Math.sin(a).toFixed(3));
    const nm = el('div', 'nm');
    nm.append(avatar(p), el('strong', '', p.name));
    if (!seat?.connected) { const off = el('span', 'off-tag', 'Away'); nm.append(off); }
    const st = g.seats[s], pts = roundPts(g, s);
    // Hand count first (the face-down back says what it is), then tricks and, when shown, this round's points.
    // No-break spaces inside each part, so a wrapped line breaks between parts ("0 pts" never splits).
    const line = [others.length > 2 ? st.hand : plural(st.hand, 'card'), plural(st.tricks, 'trick'), ...(pts === null || compact ? [] : [`${pts} pts`])]
      .map(t => String(t).replace(/ /g, ' ')).join(' · ');
    // Seven opponents share a phone's width: away replaces the counts there (the name keeps the room it needs).
    const cap = el('p', 'cap', tight && !seat?.connected ? 'Away' : line);
    cap.prepend(backEl()); // their hand, face down, in your card back
    sec.append(nm, cap);
    if (now) {
      const tag = el('span', 'ptag');
      tag.style.background = c.hex; tag.style.color = c.ink;
      const dots = el('span', 'dots'); dots.setAttribute('aria-hidden', 'true'); dots.append(el('i'), el('i'), el('i'));
      tag.append(dots, 'Playing');
      sec.append(tag);
    }
    if (!compact && st.captured?.length) {
      const caps = el('div', 'caps');
      caps.setAttribute('aria-label', `Captured: ${st.captured.map(cardName).join(', ')}`);
      for (const id of st.captured.slice(0, 8)) { const c = cardEl(id); c.classList.add('xs'); caps.append(c); }
      if (st.captured.length > 8) caps.append(el('span', 'cap', `+${st.captured.length - 8}`));
      sec.append(caps);
    }
    sec.setAttribute('aria-label', `${p.name}, ${line}${now ? ', playing now' : ''}${seat?.connected ? '' : ', away'}`);
    return sec;
  }));
}

function scoring(round, id) {
  return (scoresIn(round, 'hearts') && isHeart(id)) || (scoresIn(round, 'queens') && isQueen(id)) || (scoresIn(round, 'kings') && isKingOfSpades(id));
}

function drawFelt(v) {
  const g = v.game, my = v.you.seat, n = g.players.length, fx = T.fx;
  $('felt').classList.toggle('small', n >= 6);
  $('felt').classList.toggle('ring', n >= 7);
  let plays, leader, winner = null, done = false;
  if (fx) { plays = fx.last.plays; leader = fx.last.leader; winner = fx.last.winner; done = true; }
  else {
    plays = g.trick ? [...g.trick.plays] : [];
    leader = g.trick?.leader ?? null;
    if (T.pending && !plays.some(p => p.seat === my)) plays.push({ seat: my, card: T.pending });
    if (plays.length > 1) winner = trickWinner(plays);
  }
  const trickN = fx ? fx.last.n : g.trick?.n;
  const spots = [];
  for (let s = 0; s < n; s++) {
    // Seven or eight seats go round a rectangle instead (three rows on each side), so neighbours never overlap.
    const a = angle(v, s), spot = el('div', 'spot'), m = n >= 7 ? Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) : 1;
    spot.style.setProperty('--x', (Math.cos(a) / m).toFixed(3));
    spot.style.setProperty('--y', (Math.sin(a) / m).toFixed(3));
    const p = plays.find(q => q.seat === s);
    if (p) {
      const c = cardEl(p.card);
      const tags = [];
      if (s === leader) tags.push('Led');
      if (s === winner) tags.push(done ? 'Wins' : 'Winning');
      if (s === winner) c.classList.add('win');
      else if (done && scoring(g.round, p.card)) c.classList.add('pen');
      if (tags.length) { const t = el('span', 'ttag' + (s === winner ? ' w' : ''), tags.join(' · ')); c.append(t); }
      c.setAttribute('aria-label', `${nameOf(v, s)} ${s === leader ? 'led' : 'played'} the ${cardName(p.card)}${s === winner ? (done ? ', wins' : ', winning') : ''}`);
      c.dataset.key = `${T.roundKey}:${trickN}:${s}`;
      spot.append(c);
    } else spot.append(Object.assign(el('span', 'hole'), { ariaHidden: 'true' }));
    const who = el('span', 'who'), dot = el('i');
    dot.style.background = color(g.players[s].color).hex;
    who.append(dot, el('span', '', s === my ? 'You' : g.players[s].name)); // a span, so a long name ends in an ellipsis
    spot.append(who);
    spots.push(spot);
  }
  $('spots').replaceChildren(...spots);
  $('felt').setAttribute('aria-label', fx ? `Trick ${fx.last.n} won by ${nameOf(v, fx.last.winner)}` : `Table: ${plays.length} of ${n} cards played`);

  // Middle of the felt: the lead suit, who leads, or the finished trick with its penalty and the kitty.
  const mid = $('mid');
  if (fx) {
    const box = el('div', 'glass mid ' + (fx.last.kitty.length ? 'kit' : 'won'));
    box.setAttribute('role', 'status');
    box.append(el('p', '', `${nameOf(v, fx.last.winner)} ${verb(v, fx.last.winner, 'take', 'takes')} ${fx.last.kitty.length ? 'the trick and the kitty' : 'it'}`));
    const pen = fx.last.penalty, row = el('div');
    row.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px';
    if (pen) {
      const b = el('span', 'badge' + (pen.points.total ? '' : ' zero'), pen.points.total ? `+${pen.points.total}` : '0');
      b.setAttribute('aria-label', pen.points.total ? `plus ${pen.points.total} points` : 'no points');
      row.append(b, el('span', 'cap', penaltyWords(g.round, pen)));
    } else row.append(el('span', 'cap', 'Points stay hidden until the round ends.'));
    box.append(row);
    if (fx.last.kitty.length) {
      const kc = el('div', 'kit-cards');
      for (const id of fx.last.kitty) { const c = cardEl(id); c.classList.add('sm'); if (scoring(g.round, id)) c.classList.add('pen'); kc.append(c); }
      box.append(kc, el('p', 'cap soft', `${plural(fx.last.kitty.length, 'card')} left over from the deal, now face up for everyone. The kitty is not a trick.`));
    }
    mid.replaceChildren(box);
  } else if (g.phase === 'play') {
    const box = el('div', 'glass mid'), lead = g.trick?.leadSuit;
    if (lead) {
      const sym = el('span', '', SUIT[lead]);
      if (isRed(lead)) sym.style.color = 'var(--red)';
      box.append(el('span', 'cap', 'Lead suit'));
      const st = el('strong'); st.append(sym, ' ', SUIT_WORD[lead]); box.append(st);
    } else {
      const ld = g.turn;
      box.append(el('span', 'cap', g.trick?.n === 1 ? `${nameOf(v, g.dealer)} dealt` : `Trick ${g.trick?.n}`));
      box.append(el('strong', '', ld === my ? 'You lead: any card' : `${g.players[ld].name} leads`));
    }
    mid.replaceChildren(box);
  } else mid.replaceChildren();

  // The kitty lies face down until the first trick's winner takes it: shown under the middle note.
  if (!fx && g.kitty.count && g.kitty.to === null && g.phase === 'play' && mid.firstChild) {
    const k = el('span', 'kit-line');
    k.append(backEl(), `Kitty ${g.kitty.count}, face down`);
    k.title = 'The winner of trick 1 takes the kitty';
    mid.firstChild.append(k);
  }
}

function penaltyWords(round, pen) {
  const parts = [];
  if (scoresIn(round, 'tricks')) parts.push('1 trick');
  if (scoresIn(round, 'hearts') && pen.hearts) parts.push(plural(pen.hearts, 'heart'));
  if (scoresIn(round, 'queens') && pen.queens) parts.push(plural(pen.queens, 'queen'));
  if (scoresIn(round, 'kings') && pen.kings) parts.push(pen.kings > 1 ? `${pen.kings} K♠︎` : 'K♠︎');
  if (scoresIn(round, 'last') && pen.last) parts.push('last trick');
  return parts.length ? parts.join(', ') : 'No penalty cards';
}

function drawSide(v) {
  const g = v.game, rows = g.players.map((p, s) => ({ s, p, t: g.totals[s] + (roundPts(g, s) ?? 0) })).sort((a, b) => a.t - b.t || a.s - b.s);
  $('sideCap').textContent = scoresHidden(g) ? 'Totals before this round' : 'Total · lowest is best';
  $('sideScores').replaceChildren(...rows.map(r => {
    const d = el('div', 'sc');
    d.append(avatar(r.p), el('span', '', r.s === v.you.seat ? 'You' : r.p.name), el('b', '', String(r.t)));
    return d;
  }));
}

function drawMe(v, myTurn) {
  const g = v.game, my = v.you.seat, p = g.players[my], st = g.seats[my], pts = roundPts(g, my);
  $('meAv').replaceChildren(avatar(p));
  $('meName').textContent = `${plural(st.hand - (T.pending ? 1 : 0), 'card')} · ${plural(st.tricks, 'trick')}${pts === null ? '' : ` · ${pts} pts`}`;
  $('meTurn').hidden = !myTurn;
  const c = color(p.color);
  $('meTurn').style.background = c.hex; $('meTurn').style.color = c.ink;
  $('sortBtn').textContent = `Sort: ${prefs.sort}`;
  $('sortBtn').setAttribute('aria-label', `Sort hand, now ${{ suit: 'by suit then rank', rank: 'by rank then suit', manual: 'in your own order (drag to move)' }[prefs.sort]}`);
}

// ---- Hand
let handEls = [], handIds = [];
function drawHand(v, myTurn) {
  const g = v.game, you = g.you, legal = new Set(myTurn ? you.legal : []);
  const ids = you.hand.filter(id => id !== T.pending);
  if (T.sel && !ids.includes(T.sel)) T.sel = null;
  handIds = sortHand(ids, prefs.sort, T.manual);
  handEls = handIds.map(id => {
    const b = cardEl(id, 'button');
    b.type = 'button';
    const ok = legal.has(id), sel = T.sel === id;
    if (myTurn) b.classList.add(sel ? 'sel' : ok ? 'up' : 'no');
    else if (sel) b.classList.add('sel');
    b.setAttribute('aria-pressed', sel);
    if (myTurn && !ok) b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-label', cardName(id) + (myTurn ? (ok ? (sel ? ', selected' : ', playable') : ', can’t be played') : sel ? ', selected' : ''));
    return b;
  });
  const focused = document.activeElement?.closest?.('#hand .c')?.dataset.id;
  $('hand').replaceChildren(...handEls); // laid out into rows by layoutHand once visible
  if (focused) handEls.find(b => b.dataset.id === focused)?.focus({ preventScroll: true });
  // Big hands scroll; chips jump to a suit.
  const counts = { S: 0, H: 0, C: 0, D: 0 };
  for (const id of ids) counts[suitOf(id)]++;
  $('jump').replaceChildren(...Object.entries(counts).filter(([, k]) => k).map(([s, k]) => {
    const b = el('button', 'chip'), sym = el('span', isRed(s) ? 'r' : '', SUIT[s]);
    b.type = 'button';
    b.append(sym, ` ${k}`);
    b.setAttribute('aria-label', `${SUIT_WORD[s]}, ${k}`);
    b.onclick = () => handEls.find(c => suitOf(c.dataset.id) === s)?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: still() ? 'auto' : 'smooth' });
    return b;
  }));
}

// Fits the hand: one row with overlap when it fits, two rows on a portrait phone, else one scrolling row.
function layoutHand() {
  const box = $('hand'), W = box.parentElement.clientWidth;
  if (!W || !handEls.length) { $('jump').hidden = true; return; }
  const scroller = box.scrollLeft;
  box.classList.remove('scroll');
  const probe = el('div', 'hrow');
  probe.append(handEls[0]);
  box.replaceChildren(probe);
  const w = handEls[0].getBoundingClientRect().width || 62, n = handEls.length;
  const fit = Math.floor((W - w) / (w * 0.55)) + 1; // the index stays readable down to about 55% of a card
  let rows;
  if (n <= fit) rows = [handEls];
  else if (n <= 2 * fit && !landscapePhone.matches && n <= 20) { const h = Math.ceil(n / 2); rows = [handEls.slice(0, h), handEls.slice(h)]; }
  else rows = null;
  if (!rows) {
    // Too many to fit: scroll sideways, each card showing at least 44px to tap; a portrait phone stacks two rows.
    box.classList.add('scroll');
    const sw = handEls[0].getBoundingClientRect().width || 56;
    box.style.setProperty('--ov', `${-Math.max(0, Math.round(sw - 44))}px`);
    const h = landscapePhone.matches ? n : Math.ceil(n / 2);
    box.replaceChildren(...[handEls.slice(0, h), handEls.slice(h)].filter(r => r.length).map(cards => { const r = el('div', 'hrow'); r.append(...cards); return r; }));
    box.scrollLeft = scroller;
    $('jump').hidden = false;
    return;
  }
  $('jump').hidden = true;
  const widest = Math.max(...rows.map(r => r.length));
  const step = widest > 1 ? Math.min(w * 0.78, (W - w) / (widest - 1)) : w;
  box.style.setProperty('--ov', `${Math.round(step - w)}px`);
  box.replaceChildren(...rows.map(cards => { const r = el('div', 'hrow'); r.append(...cards); return r; }));
}
landscapePhone.addEventListener('change', () => view && renderTable(view));

// Tap a card: select it (or play it, per the Play setting). Unplayable cards say why.
$('hand').addEventListener('click', e => {
  const b = e.target.closest('.c');
  if (!b || drag.moved) return;
  const v = view, g = v.game, id = b.dataset.id;
  const mine = g.phase === 'play' && g.turn === v.you.seat && !T.pending;
  if (mine && !g.you.legal.includes(id)) {
    const lead = g.trick?.leadSuit;
    toast(lead ? `You have ${SUIT_WORD[lead].toLowerCase()}, so you must follow ${SUIT_WORD[lead].toLowerCase()}.` : 'That card can’t be played now.');
    return;
  }
  if (mine && prefs.confirm === 'direct') return play(id);
  if (T.sel === id) { if (mine && prefs.confirm === 'double') return play(id); T.sel = null; }
  else T.sel = id;
  renderTable(v);
});
$('playBtn').onclick = () => { if (T.sel) play(T.sel); };

async function play(id) {
  const v = view;
  if (T.pending || !v) return;
  finishFx(true);
  const b = handEls.find(c => c.dataset.id === id);
  T.flyFrom = b?.getBoundingClientRect() ?? null;
  T.pending = id;
  T.sel = null;
  sound('play');
  renderTable(v);
  const r = await net.act({ type: 'PLAY_CARD', card: id });
  T.pending = null;
  if (!r.ok && r.error !== 'left' && r.error !== 'not_found') toast(`That card wasn’t played: ${errText(r.error)}`);
  if (net.state.view?.game) renderTable(net.state.view);
}

// ---- Manual order: long-press a card, then drag it along the hand (Alt and the arrow keys move a focused card).
const drag = { id: null, timer: 0, x0: 0, y0: 0, on: false, moved: false, el: null };
function saveOrder() {
  try { localStorage.setItem('nl-salad-order', JSON.stringify({ key: T.room + T.roundKey, ids: T.manual })); } catch {}
}
function loadOrder(roundKey) {
  try { const o = JSON.parse(localStorage.getItem('nl-salad-order')); return o?.key === T.room + roundKey && Array.isArray(o.ids) ? o.ids : null; } catch { return null; }
}
function moveCard(id, to) {
  const order = handIds.filter(x => x !== id);
  order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
  T.manual = order;
  saveOrder();
}
$('hand').addEventListener('pointerdown', e => {
  const b = e.target.closest('.c');
  drag.moved = false;
  if (!b || prefs.sort !== 'manual') return;
  Object.assign(drag, { id: b.dataset.id, x0: e.clientX, y0: e.clientY, on: false, el: b });
  clearTimeout(drag.timer);
  drag.timer = setTimeout(() => { drag.on = true; b.classList.add('drag'); try { b.setPointerCapture(e.pointerId); } catch {} }, e.pointerType === 'mouse' ? 120 : 280);
});
$('hand').addEventListener('pointermove', e => {
  if (!drag.id) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.on) { if (Math.hypot(dx, dy) > 8) { clearTimeout(drag.timer); drag.id = null; } return; }
  drag.moved = true;
  drag.el.style.transform = `translate(${dx}px, ${dy - 20}px)`;
});
const endDrag = e => {
  clearTimeout(drag.timer);
  if (!drag.id) return;
  const was = drag.on, id = drag.id;
  drag.id = null;
  if (!was) return;
  drag.el.classList.remove('drag');
  drag.el.style.transform = '';
  if (!drag.moved) return;
  // Drop before the card whose centre is nearest the finger.
  let best = 0, bestD = Infinity;
  handEls.forEach((c, i) => {
    if (c.dataset.id === id) return;
    const r = c.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
    if (d < bestD) { bestD = d; best = i + (e.clientX > r.left + r.width / 2 ? 1 : 0); }
  });
  const from = handIds.indexOf(id);
  moveCard(id, best > from ? best - 1 : best);
  renderTable(view);
  setTimeout(() => { drag.moved = false; }, 0);
};
$('hand').addEventListener('pointerup', endDrag);
$('hand').addEventListener('pointercancel', endDrag);
$('hand').addEventListener('touchmove', e => { if (drag.on) e.preventDefault(); }, { passive: false });
$('hand').addEventListener('keydown', e => {
  const b = e.target.closest('.c');
  if (!b || prefs.sort !== 'manual' || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  e.preventDefault();
  const id = b.dataset.id;
  moveCard(id, handIds.indexOf(id) + (e.key === 'ArrowLeft' ? -1 : 1));
  renderTable(view);
  handEls.find(c => c.dataset.id === id)?.focus();
});
$('sortBtn').onclick = () => {
  const next = { suit: 'rank', rank: 'manual', manual: 'suit' }[prefs.sort];
  if (next === 'manual' && !T.manual) { T.manual = [...handIds]; saveOrder(); }
  setPref('sort', next);
  if (next === 'manual') toast('Your own order: press and hold a card, then drag it.');
  renderTable(view);
};

function drawActions(v, myTurn) {
  const g = v.game, my = v.you.seat, n = g.players.length, fx = T.fx;
  const legalSel = myTurn && T.sel && g.you.legal.includes(T.sel);
  $('playBtn').hidden = !myTurn || prefs.confirm === 'direct';
  $('playBtn').disabled = !legalSel;
  $('playBtn').textContent = legalSel ? `Play ${short(T.sel)}` : 'Choose a card to play';
  $('playBtn').setAttribute('aria-label', legalSel ? `Play the ${cardName(T.sel)}` : 'Choose a card to play');
  const waiting = g.phase === 'play' && g.turn !== my;
  $('waitBox').hidden = !waiting || !!T.pending;
  if (waiting) {
    const who = g.players[g.turn], away = !v.room.seats[g.turn]?.connected;
    const dots = el('span', 'dots'); dots.setAttribute('aria-hidden', 'true'); dots.append(el('i'), el('i'), el('i'));
    $('waitBox').replaceChildren(dots, `Waiting for ${who.name}${away ? ' (away)' : ''}`);
  }
  $('contBtn').hidden = !(fx && fx.held);
  let note = '';
  if (fx) note = g.phase === 'play' ? `${nameOf(v, g.turn)} ${verb(v, g.turn, 'lead', 'leads')} trick ${fx.last.n + 1}. ${fx.held ? 'Tap Continue when ready.' : 'Tap the table to skip.'}` : 'That was the last trick.';
  else if (myTurn) {
    const lead = g.trick?.leadSuit, k = g.you.legal.length;
    note = !lead ? 'You lead: any card.' : g.you.hand.some(id => suitOf(id) === lead)
      ? `Follow ${SUIT_WORD[lead].toLowerCase()}: ${plural(k, 'card')} of yours can be played.` : `No ${SUIT_WORD[lead].toLowerCase()} left: play any card.`;
    if (prefs.confirm === 'direct') note += ' Tap a card to play it.';
    else if (prefs.confirm === 'double') note += ' Tap a card twice to play it.';
  } else if (waiting && !g.trick?.plays.some(p => p.seat === my) && !T.pending) {
    if ((g.turn + 1) % n === my) note = `You play next, after ${g.players[g.turn].name}.`;
  }
  $('gNote').textContent = note;
}

// ---- Animations (CSS transforms through the Web Animations API; skipped under reduced motion).
const center = r => [r.left + r.width / 2, r.top + r.height / 2];
function originOf(s) {
  if (s === view.you.seat) return T.flyFrom || $('hand').getBoundingClientRect();
  return document.querySelector(`#opps .opp[data-seat="${s}"]`)?.getBoundingClientRect();
}
function flyIn(v) {
  for (const c of document.querySelectorAll('#spots .c[data-key]')) {
    const key = c.dataset.key;
    if (T.shown.has(key)) continue;
    T.shown.add(key);
    if (T.fx) continue; // a finished trick appears in place; its sweep is the motion
    const s = +key.split(':').pop(), from = originOf(s);
    sound(s === v.you.seat ? '' : 'play');
    if (!from || still()) continue;
    const [fx, fy] = center(from), [tx, ty] = center(c.getBoundingClientRect());
    c.animate([{ transform: `translate(${fx - tx}px, ${fy - ty}px) scale(.6)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: dur(240), easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
  T.flyFrom = null;
}
function dealFx(v) {
  if (!T.deal) return;
  T.deal = false;
  if (still()) return;
  const felt = $('felt').getBoundingClientRect(), [cx, cy] = center(felt), layer = $('fx');
  const targets = v.game.players.map((_, s) => originOf(s)).filter(Boolean);
  targets.forEach((r, i) => {
    for (let k = 0; k < 2; k++) {
      const b = backEl(), [tx, ty] = center(r);
      b.classList.add('sm');
      layer.append(b);
      const w = b.getBoundingClientRect();
      const x0 = cx - felt.left - w.width / 2, y0 = cy - felt.top - w.height / 2;
      b.animate([{ transform: `translate(${x0}px, ${y0}px)`, opacity: 1 }, { transform: `translate(${tx - felt.left - w.width / 2}px, ${ty - felt.top - w.height / 2}px) scale(.5)`, opacity: 0 }],
        { duration: dur(420), delay: (k * targets.length + i) * 45, easing: 'cubic-bezier(.3, .7, .3, 1)', fill: 'both' }).finished.then(() => b.remove(), () => b.remove());
    }
  });
}

// A finished trick: shown with its winner and penalty, then swept to the winner; tap the table to skip.
function startFx(g) {
  finishFx(true);
  const speed = { normal: 1, slow: 1.6, fast: 0.55 }[prefs.speed];
  const hold = (g.last.kitty.length ? 2400 : 700) * speed; // with the sweep about 1 s: long enough to read the winner and penalty
  T.fx = { last: g.last, held: prefs.next === 'tap' && g.phase === 'play', timer: 0 };
  sound('trick');
  if (!T.fx.held) T.fx.timer = setTimeout(sweep, hold);
}
function sweep() {
  const fx = T.fx;
  if (!fx) return;
  const target = fx.last.winner === view.you.seat ? $('meAv').getBoundingClientRect() : document.querySelector(`#opps .opp[data-seat="${fx.last.winner}"]`)?.getBoundingClientRect();
  const cards = [...document.querySelectorAll('#spots .c')];
  if (!target || still() || !cards.length) return finishFx();
  const [tx, ty] = center(target), d = dur(320);
  const all = cards.map(c => {
    const [x, y] = center(c.getBoundingClientRect());
    return c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${tx - x}px, ${ty - y}px) scale(.3)`, opacity: 0 }], { duration: d, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' }).finished;
  });
  Promise.all(all).then(() => { if (T.fx === fx) finishFx(); }, () => {});
}
function finishFx(quiet) {
  if (!T.fx) return;
  clearTimeout(T.fx.timer);
  T.fx = null;
  if (!quiet) idle();
}
$('felt').addEventListener('click', () => { if (T.fx) finishFx(); });
$('contBtn').onclick = () => finishFx();
