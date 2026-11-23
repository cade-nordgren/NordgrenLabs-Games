// Small DOM helpers shared by the screens.
export const $ = id => document.getElementById(id);
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent, never innerHTML: names are user input
  return e;
}
export const listOf = names => new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const ordinal = n => n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');

let toastTimer;
export function toast(text, ms = 3200) {
  const t = $('toast');
  t.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.textContent = ''; }, ms);
}

// A segmented control built in code: [{ value, label }], wired with the shared NL.segmented.
export function seg(labelId, options, value, onPick) {
  const g = el('div', 'segmented');
  g.setAttribute('role', 'group');
  if (labelId) g.setAttribute('aria-labelledby', labelId);
  for (const o of options) {
    const b = el('button', '', o.label);
    b.type = 'button';
    b.value = String(o.value);
    if (o.aria) b.setAttribute('aria-label', o.aria);
    if (o.disabled) b.disabled = true;
    g.append(b);
  }
  const show = NL.segmented(g, v => { show(v); onPick(v); });
  show(String(value));
  return g;
}

export const svgUse = (id, size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
};

// Server error codes in plain words.
export const ERR = {
  not_found: 'No room with that code. Check the letters and try again.',
  full: 'That room is full.',
  started: 'That game has already started, so no one new can join.',
  invalid_name: 'Enter a name (up to 20 characters).',
  invalid_color: 'Pick a colour.',
  invalid_config: 'That table setup is not allowed.',
  color_taken: 'Someone else has that colour now. Pick another.',
  not_ready: 'Everyone needs to be ready first.',
  not_enough_players: 'You need at least 2 players.',
  capacity_below_players: 'More people are already seated than that.',
  not_host: 'Only the host can do that.',
  wrong_phase: 'The game has already started.',
  in_game: 'You keep your seat once the game has started.',
  stale: 'The table moved on before that arrived. Try again.',
  illegal: 'That is not allowed right now.',
  network: 'Could not reach the game server. Check your connection and try again.',
  unauthenticated: 'You are signed out. Reload the page to sign in.',
  not_associated: 'Finish setting up your account in the Control Center to play online.',
};
export const errText = e => ERR[e] || 'Something went wrong. Try again.';
