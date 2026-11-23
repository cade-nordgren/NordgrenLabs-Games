// The only file that talks to the server: the rooms API in docs/plans/salad-server-contract.md.
// Long polling now; a later move to WebSockets swaps this file. Callers get { version, view } through onChange.

const API = '/api/salad';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) || /\.(localhost|test)$/.test(location.hostname);
const signInOn = typeof window.NL_CONFIG?.clerkPublishableKey === 'string';

// Local development (signed out, Worker in --env dev): X-Dev-Person names the person. ?as=alice picks it; otherwise a
// random id per tab, so every tab is its own player.
const devPerson = (() => {
  if (signInOn || !local) return null;
  const as = new URLSearchParams(location.search).get('as');
  if (as && ID.test(as)) return as;
  try {
    let id = sessionStorage.getItem('nl-salad-dev');
    if (!id || !ID.test(id)) sessionStorage.setItem('nl-salad-dev', id = 'p' + crypto.randomUUID().slice(0, 8));
    return id;
  } catch { return 'p' + crypto.randomUUID().slice(0, 8); }
})();

// The room this person was last in, so a reload or a later visit gets back to the table.
const who = () => devPerson || NL.person() || 'me';
const ROOM_KEY = () => `nl-salad-room-${who()}`;
export function savedRoom() {
  try {
    const r = JSON.parse(localStorage.getItem(ROOM_KEY()));
    return r && typeof r.id === 'string' && /^[A-Z]{6}$/.test(r.code) ? r : null;
  } catch { return null; }
}
const saveRoom = r => { try { localStorage.setItem(ROOM_KEY(), JSON.stringify({ id: r.id, code: r.code })); } catch {} };
export const forgetRoom = () => { try { localStorage.removeItem(ROOM_KEY()); } catch {} };

let listener = () => {};
export const onChange = fn => { listener = fn; };

// Current room: version and view from the last answer we accepted.
export const state = { version: null, view: null };
let gen = 0; // bumps when we leave a room, so a stale poll loop stops

async function headers(fresh) {
  const h = { 'Content-Type': 'application/json' };
  if (devPerson) h['X-Dev-Person'] = devPerson;
  else if (signInOn) {
    const t = await NL.token(fresh);
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

// One request. 401 refreshes the token once. Network failures throw; everything else returns { status, data }.
async function call(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API + path, { method, headers: await headers(attempt > 0), body: body && JSON.stringify(body), cache: 'no-store' });
    if (r.status === 401 && attempt === 0 && signInOn) continue;
    let data = null;
    try { data = await r.json(); } catch {}
    return { status: r.status, data: data || {} };
  }
}

const wait = ms => new Promise(ok => setTimeout(ok, ms));
const backoff = n => Math.min(15000, 1000 * 2 ** n) * (0.85 + Math.random() * 0.3);
const retryable = s => s >= 500 || s === 429;

// Takes an answer if it is not older than what we hold; tells the screens when something they show changed.
function accept(data) {
  if (!data || typeof data.version !== 'number' || !data.view) return;
  if (state.version !== null && data.version < state.version) return;
  const dots = v => v?.room?.seats?.map(s => s.connected).join() ?? '';
  const changed = data.version !== state.version || dots(data.view) !== dots(state.view);
  state.version = data.version;
  state.view = data.view;
  saveRoom(data.view.room);
  if (changed) listener({ type: 'view' });
}

function gone(reason) {
  gen++;
  forgetRoom();
  state.version = state.view = null;
  listener({ type: 'gone', reason });
}

// Fatal answers that no retry fixes: signed out, or signed in without a linked person.
function fatal(status, data) {
  if (status === 401) { listener({ type: 'error', error: 'unauthenticated' }); return true; }
  if (status === 403 && data.error === 'not_associated') { listener({ type: 'error', error: 'not_associated' }); return true; }
  return false;
}

// ---- Poll loop: one long poll after another while the tab is visible.
let polling = false, fresh = true;
async function loop(my) {
  if (polling) return;
  polling = true;
  let fails = 0;
  try {
    while (my === gen && state.view && !document.hidden) {
      const id = state.view.room.id;
      try {
        const q = fresh || state.version === null ? '' : `?since=${state.version}`;
        const { status, data } = await call('GET', `/rooms/${id}${q}`);
        if (my !== gen) return;
        if (status === 200) { fresh = false; fails = 0; accept(data); continue; }
        if (status === 404) return gone('not_found');
        if (fatal(status, data)) return;
        if (!retryable(status)) throw new Error(status);
      } catch {}
      listener({ type: 'offline', fails: ++fails });
      await wait(backoff(fails - 1));
    }
  } finally { polling = false; }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.view) { fresh = true; loop(gen); }
});
addEventListener('online', () => { if (state.view) { fresh = true; loop(gen); } });

function enter(data) {
  gen++;
  state.version = null;
  accept(data);
  fresh = false;
  loop(gen);
}

// ---- Create, join, reconnect. Each resolves { ok: true } or { ok: false, error }.
async function once(method, path, body) {
  for (let n = 0; n < 4; n++) {
    try {
      const { status, data } = await call(method, path, body);
      if (!retryable(status)) return { status, data };
    } catch {}
    await wait(backoff(n));
  }
  return { status: 0, data: { error: 'network' } };
}

export async function create(name, color, config) {
  const { status, data } = await once('POST', '/rooms', { name, color, config });
  if (status === 201) { enter(data); return { ok: true }; }
  fatal(status, data);
  return { ok: false, error: data.error || 'network' };
}

export async function join(code, name, color) {
  const { status, data } = await once('POST', '/rooms/join', { code, name, color });
  if (status === 200) { enter(data); return { ok: true }; }
  fatal(status, data);
  return { ok: false, error: data.error || 'network' };
}

// Back into the stored room after a reload. Resolves true when we are seated there.
export async function reconnect() {
  const r = savedRoom();
  if (!r) return false;
  const { status, data } = await once('GET', `/rooms/${encodeURIComponent(r.id)}`);
  if (status === 200) { enter(data); return true; }
  if (status === 404) forgetRoom();
  else fatal(status, data);
  return false;
}

// Stop following the room without leaving the seat (the game waits for us); the stored room stays for later.
export function detach() {
  gen++;
  state.version = state.view = null;
}

// ---- Actions. Same actionId and expect on every retry, so a retry of a landed action answers duplicate.
export async function act(action) {
  if (!state.view) return { ok: false, error: 'no_room' };
  const my = gen, id = state.view.room.id, body = { action, expect: state.version, actionId: crypto.randomUUID() };
  for (let n = 0; ; n++) {
    let status = 0, data = {};
    try { ({ status, data } = await call('POST', `/rooms/${id}/actions`, body)); } catch {}
    if (my !== gen) return { ok: false, error: 'left' };
    if (status === 200) {
      if (action.type === 'LEAVE') { gone('left'); return { ok: true }; }
      accept(data);
      return { ok: true };
    }
    if (status === 404) { gone('not_found'); return { ok: false, error: 'not_found' }; }
    if (status === 409 || status === 400 || status === 403) {
      if (data.view) accept(data);
      fatal(status, data);
      return { ok: false, error: data.error || 'bad_request' };
    }
    if (status === 401) { fatal(status, data); return { ok: false, error: 'unauthenticated' }; }
    if (n >= 5) return { ok: false, error: 'network' };
    await wait(backoff(n));
  }
}

export const shareLink = code => `${location.origin}/salad/?room=${code}`;
export const isDev = !!devPerson;
