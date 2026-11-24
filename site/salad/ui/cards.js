// Card rendering: original CSS cards (index top left, a large suit or a line-drawn court figure), themed by CSS on
// <html data-face>. Backs are a colour and a CSS pattern, or the player's own image (kept on this device only).
import { cardOf, label } from '../engine/cards.js';
import { deckOf, faceUrl, backUrl } from '../../decks/decks.js';

export const SUIT = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };
export const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
export const SUIT_WORD = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const RANK_NAME = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
export const isRed = s => s === 'H' || s === 'D';

export function cardName(id) {
  const c = cardOf(id);
  return c ? `${RANK_NAME[c.rank] || c.rank} of ${SUIT_NAME[c.suit]}` : 'card';
}
// Short form for buttons and messages: "Q♥".
export const short = id => { const c = cardOf(id); return c ? label(c.rank) + SUIT[c.suit] : ''; };

const svgNS = 'http://www.w3.org/2000/svg';
// The picture deck each deck in the room wears (the host's config `art`, '' for drawn cards); app.js sets it on render.
let tableArt = [];
export const setTableArt = a => { tableArt = Array.isArray(a) ? a : []; };
const artFor = deck => deckOf(tableArt[deck - 1]) ? tableArt[deck - 1] : '';
// face: a picture deck id (site/decks) or a face theme to show instead; by default the card's own deck's art, else the
// face theme prefs.js put on <html>. A picture deck lays its picture over the drawn card.
export function cardEl(id, tag = 'span', face) {
  const c = cardOf(id), e = document.createElement(tag);
  e.className = 'c' + (isRed(c.suit) ? ' r' : '');
  e.dataset.id = id;
  const ix = document.createElement('span');
  ix.className = 'i';
  ix.append(label(c.rank));
  const sm = document.createElement('small');
  sm.textContent = SUIT[c.suit];
  ix.append(sm);
  e.append(ix);
  if (c.rank >= 11 && c.rank <= 13) {
    const svg = document.createElementNS(svgNS, 'svg'), use = document.createElementNS(svgNS, 'use');
    svg.setAttribute('class', 'art');
    svg.setAttribute('viewBox', '0 0 40 56');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#art-' + label(c.rank));
    svg.append(use);
    e.append(svg);
  } else {
    const m = document.createElement('span');
    m.className = 'm' + (c.rank === 14 ? ' ace' : '');
    m.textContent = SUIT[c.suit];
    e.append(m);
  }
  const pic = faceUrl(face !== undefined ? face : artFor(c.deck), label(c.rank), c.suit);
  if (pic) { const img = document.createElement('img'); img.className = 'pic'; img.alt = ''; img.src = pic; e.append(img); }
  if (tag === 'span') { e.setAttribute('role', 'img'); e.setAttribute('aria-label', cardName(id)); }
  return e;
}

// A picture deck's own back, a whole printed card.
export function deckBackEl(id) {
  const e = document.createElement('span');
  e.className = 'c back pic-back';
  e.style.setProperty('--img', `url("${backUrl(id)}")`);
  e.setAttribute('aria-hidden', 'true');
  return e;
}
// Hidden cards at the table: deck 1's back when it is a picture deck, else this player's own back.
export const tableBackEl = () => artFor(1) ? deckBackEl(artFor(1)) : backEl();
// A deck choice as the host's picker shows it: its back, or its ace of spades.
export const deckPreview = (id, show) => show === 'ace' ? cardEl('d1-AS', 'span', id || 'none') : id ? deckBackEl(id) : backEl();
export function backEl() {
  const e = document.createElement('span');
  e.className = 'c back';
  e.setAttribute('aria-hidden', 'true');
  return e;
}

// Display order of a hand. Suit order alternates colours: spades, hearts, clubs, diamonds.
const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
export function sortHand(ids, how, manual) {
  const k = id => cardOf(id);
  if (how === 'manual' && manual) {
    const at = new Map(manual.map((id, i) => [id, i]));
    const known = ids.filter(id => at.has(id)).sort((a, b) => at.get(a) - at.get(b));
    return [...known, ...sortHand(ids.filter(id => !at.has(id)), 'suit')];
  }
  return [...ids].sort((a, b) => {
    const x = k(a), y = k(b);
    const bySuit = SUIT_ORDER[x.suit] - SUIT_ORDER[y.suit], byRank = y.rank - x.rank;
    return (how === 'rank' ? byRank || bySuit : bySuit || byRank) || x.deck - y.deck;
  });
}

// ---- Custom card back from a picture on this device. Only PNG, JPEG or WebP, checked by their first bytes as well as
// the type; redrawn through a canvas to a JPEG of at most 512 px on the long side, so nothing but pixels survives
// (no SVG, no scripts, no metadata). Never uploaded.
const MAX_IN = 8 * 1024 * 1024, MAX_OUT = 400 * 1024;
export async function backImageFrom(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture.');
  if (file.size > MAX_IN) throw new Error('That picture is over 8 MB. Choose a smaller one.');
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  if (!png && !jpg && !webp) throw new Error('That file is not a picture this game can use.');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('That picture could not be opened.'); }
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * scale));
  cv.height = Math.max(1, Math.round(bmp.height * scale));
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  for (const q of [0.82, 0.7, 0.55]) {
    const url = cv.toDataURL('image/jpeg', q);
    if (url.length <= MAX_OUT) return url;
  }
  throw new Error('That picture is too detailed to store. Try another.');
}
