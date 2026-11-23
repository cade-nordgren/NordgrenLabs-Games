// Settings sheet (spec section 22): appearance through the shared theme code, cards, table, gameplay, audio and
// accessibility. Everything here is a preference on this device only (localStorage nl-salad-*); room settings are the
// host's, in the lobby.
import { prefs, setPref, backImage, setBackImage, deckBack, TABLES, FACES, BACK_COLORS, PATTERNS } from './prefs.js';
import { cardEl, backEl, backImageFrom } from './cards.js';
import { $, el, seg } from './dom.js';
import { sound } from './sound.js';

const changed = () => dispatchEvent(new Event('salad-prefs'));
const set = (k, v) => { setPref(k, v); changed(); };
let n = 0;
function section(title, ...kids) {
  const h = el('h3', '', title);
  h.id = 'st' + n++;
  return [h, ...kids.map(k => (typeof k === 'function' ? k(h.id) : k))];
}
const segFor = (key, options) => id => seg(id, options, prefs[key], v => set(key, v));
const note = t => el('p', '', t);

const THEME_ICON = '<svg class="theme-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="12" y1="2.5" x2="12" y2="4.5" pathLength="1" transform="rotate(${a} 12 12)"/>`).join('')
  + '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" fill="currentColor" stroke="none"/></svg>';

export function openSettings(view) {
  n = 0;
  const body = $('settingsBody');
  const title = el('h2', '', 'Settings');
  title.id = 'settingsTitle';
  title.tabIndex = -1;
  title.autofocus = true;
  const kids = [title];

  kids.push(...section('Appearance', id => {
    const row = el('div', 'appearance');
    row.append(seg(id, [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], NL.theme.get(), v => NL.theme.set(v)));
    row.insertAdjacentHTML('beforeend', THEME_ICON); // fixed markup, no user text
    return row;
  }));

  // Card faces: a live preview of each theme.
  const faces = el('div', 'pick');
  faces.setAttribute('role', 'group');
  const drawFaces = () => faces.replaceChildren(...FACES.map(f => {
    const b = el('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', prefs.face === f.id);
    const pv = el('span', 'pv');
    pv.dataset.face = f.id;
    pv.append(cardEl('d1-QH', 'span', f.id), cardEl('d1-KS', 'span', f.id));
    pv.querySelectorAll('.c').forEach(c => c.classList.add('sm'));
    b.append(pv, f.name);
    b.onclick = () => { set('face', f.id); set('deckBack', 'on'); drawFaces(); drawBacks(); drawPresets(); drawPreview(); };
    return b;
  }));
  drawFaces();
  kids.push(...section('Card faces', id => { faces.setAttribute('aria-labelledby', id); return faces; }));

  // Card back: colour, pattern, or a picture from this device (previewed before it is used).
  const preview = el('div', 'preview');
  const drawPreview = (img = null) => {
    const pv = el('span', 'pv'), b = backEl();
    b.classList.add('lg');
    if (img) { pv.dataset.back = 'image'; pv.style.setProperty('--back-img', `url("${img}")`); }
    pv.append(b);
    const face = cardEl('d1-AS');
    face.classList.add('lg');
    preview.replaceChildren(pv, face);
  };
  drawPreview();
  const colours = el('div', 'swatch-row'), patterns = el('div', 'swatch-row pat-row');
  // Ready-made backs (the canvas's presets): one tap sets colour and pattern.
  const PRESETS = [['Felt Diamonds', 'felt', 'diamonds'], ['Cobalt Stripes', 'cobalt', 'stripes'], ['Tangerine Waves', 'tangerine', 'waves'],
    ['Violet Crosshatch', 'violet', 'crosshatch'], ['Slate Dots', 'slate', 'dots'], ['Rose Plain', 'rose', 'plain']];
  const presets = el('div', 'pick backs');
  const drawBacks = () => {
    colours.replaceChildren(...BACK_COLORS.map(([id, name, hex]) => {
      const b = el('button');
      b.type = 'button';
      b.style.background = hex;
      b.setAttribute('aria-label', name);
      b.setAttribute('aria-pressed', prefs.backColor === id && prefs.backImage !== 'on' && !deckBack());
      b.onclick = () => { set('backColor', id); set('backImage', 'off'); set('deckBack', 'off'); drawBacks(); drawPresets(); drawPreview(); };
      return b;
    }));
    patterns.replaceChildren(...PATTERNS.map(([id, name]) => {
      const b = el('button', 'p-' + id);
      b.type = 'button';
      b.setAttribute('aria-label', name);
      b.title = name;
      b.setAttribute('aria-pressed', prefs.backPattern === id && prefs.backImage !== 'on' && !deckBack());
      b.onclick = () => { set('backPattern', id); set('backImage', 'off'); set('deckBack', 'off'); drawBacks(); drawPresets(); drawPreview(); };
      return b;
    }));
  };
  const drawPresets = () => presets.replaceChildren(...PRESETS.map(([name, c, p]) => {
    const b = el('button'), pv = el('span', 'pv');
    b.type = 'button';
    b.setAttribute('aria-pressed', prefs.backColor === c && prefs.backPattern === p && prefs.backImage !== 'on' && !deckBack());
    pv.dataset.backColor = c; pv.dataset.back = p;
    pv.append(backEl());
    b.append(pv, name);
    b.onclick = () => { set('backColor', c); set('backPattern', p); set('backImage', 'off'); set('deckBack', 'off'); drawBacks(); drawPresets(); drawPreview(); };
    return b;
  }));
  drawPresets();
  drawBacks();
  const file = el('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp';
  file.hidden = true;
  const msg = el('p', '');
  msg.setAttribute('role', 'status');
  const choose = el('button', 'btn', 'Use a picture from this device');
  const apply = el('button', 'btn primary', 'Use this picture'), cancel = el('button', 'btn', 'Cancel'), remove = el('button', 'btn danger', 'Remove my picture');
  for (const b of [choose, apply, cancel, remove]) b.type = 'button';
  let pending = null;
  const drawImg = () => { apply.hidden = cancel.hidden = !pending; remove.hidden = !!pending || !backImage(); choose.hidden = !!pending; };
  choose.onclick = () => file.click();
  file.onchange = async () => {
    msg.textContent = '';
    try { pending = await backImageFrom(file.files[0]); drawPreview(pending); msg.textContent = 'Preview above. It stays on this device and is never uploaded.'; }
    catch (e) { msg.textContent = e.message; pending = null; }
    file.value = '';
    drawImg();
  };
  apply.onclick = () => {
    if (!setBackImage(pending)) { msg.textContent = 'This device has no room to keep the picture.'; return; }
    set('backImage', 'on');
    pending = null;
    msg.textContent = 'Your picture is now your card back.';
    drawPreview(); drawBacks(); drawImg();
  };
  cancel.onclick = () => { pending = null; msg.textContent = ''; drawPreview(); drawImg(); };
  remove.onclick = () => { setBackImage(null); set('backImage', 'off'); msg.textContent = ''; drawPreview(); drawBacks(); drawImg(); };
  drawImg();
  kids.push(...section('Card back', preview, presets, el('p', '', 'Colour'), colours, el('p', '', 'Pattern'), patterns, choose, file, apply, cancel, remove, msg,
    note('PNG, JPEG or WebP. It is shrunk to a small picture and kept only on this device; everyone sees their own backs.')));

  kids.push(...section('Card size', segFor('size', [{ value: 's', label: 'Smaller' }, { value: 'm', label: 'Standard' }, { value: 'l', label: 'Larger' }])));
  kids.push(...section('High-contrast cards', segFor('contrast', [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]), note('Black and deep red on pure white with a firm edge, whatever the face theme.')));

  // Table: the room's choice, or your own.
  const tiles = el('div', 'tables');
  const drawTables = () => tiles.replaceChildren(...[{ id: 'room', name: 'Room’s choice', a: '#8e8e93', b: '#636366' }, ...TABLES].map(t => {
    const b = el('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', prefs.table === t.id);
    const sw = el('span', 'sw-t');
    sw.style.background = `radial-gradient(ellipse at 50% 45%, ${t.a}, ${t.b})`;
    b.append(sw, t.name.replace('NordgrenLabs ', ''));
    b.setAttribute('aria-label', t.name);
    b.onclick = () => { set('table', t.id); drawTables(); };
    return b;
  }));
  drawTables();
  kids.push(...section('Table', id => { tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-labelledby', id); return tiles; }, note('The host picks the room’s table; this changes it on your screen only.')));

  kids.push(...section('Sort your hand', segFor('sort', [{ value: 'suit', label: 'Suit' }, { value: 'rank', label: 'Rank' }, { value: 'manual', label: 'My order' }]), note('My order: press and hold a card, then drag it. Only the look changes.')));
  kids.push(...section('Playing a card', segFor('confirm', [{ value: 'button', label: 'Play button' }, { value: 'double', label: 'Tap twice' }, { value: 'direct', label: 'One tap' }])));
  kids.push(...section('Animation speed', segFor('speed', [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }])));
  kids.push(...section('After a trick', segFor('next', [{ value: 'auto', label: 'Move on' }, { value: 'tap', label: 'Tap Continue' }]), note('Move on shows the winner and penalty for a moment. Either way, play never waits for you.')));
  kids.push(...section('Round scores', segFor('scores', [{ value: 'room', label: 'As the room' }, { value: 'end', label: 'At round end' }]), note('At round end hides this round’s points on your screen until its results, even when the room shows them live.')));
  kids.push(...section('Sounds', id => seg(id, [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], prefs.sound, v => { set('sound', v); sound('trick'); })));
  kids.push(...section('Reduced motion', segFor('motion', [{ value: 'system', label: 'As the system' }, { value: 'reduced', label: 'Reduce' }]), note('Reduce shows every result at once, without movement.')));

  const v = view;
  kids.push(el('h3', '', 'Room settings'));
  kids.push(note(!v ? 'The host chooses seats, decks, the shared table and the score display when creating a room, and can change them in the lobby.'
    : v.room.phase === 'lobby' ? (v.you.host ? 'As host, set seats, decks, the shared table and the score display in the lobby.' : 'Only the host can change the room’s setup, in the lobby.')
    : 'Seats and decks are locked while a game is on.'));
  const acct = el('div', 'account');
  acct.hidden = true;
  acct.append(el('h3', '', 'Account'));
  kids.push(acct);
  const done = el('button', 'btn', 'Done');
  done.type = 'button';
  done.dataset.close = '';
  kids.push(done);
  body.replaceChildren(...kids);
  NL.account(acct);
  $('settingsSheet').showModal();
  title.focus({ preventScroll: true });
}
