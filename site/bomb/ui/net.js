// The only file that talks to the games server: Bomb online rooms (docs/plans/bomb-online-contract.md).
// Long polling with `since`, one actionId per user action (a retry after a network error reuses it, so it never
// applies twice), 409 adopts the server's view, backoff on errors, and no polling while the page is hidden.
const BASE = '/api/bomb/rooms';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Why a call failed, in words a player can act on.
export const REASONS = {
  not_found: 'No room with that code. Check the letters and try again.',
  full: 'That room is full: six players is the most.',
  started: 'That game has already started.',
  style_taken: 'Someone else has that card style.',
  too_few_players: 'Two players are needed to start.',
  not_host: 'Only the host can do that.',
  decks: 'That many players need more decks.',
  illegal: 'That move is not allowed now.',
  not_over: 'Someone left, so the room is back in the lobby.',
  stale: 'The table changed. Try again.',
  offline: 'No connection. Check your network and try again.',
  no_server: 'Online play needs the games server, and it is not reachable from this page.',
  unauthenticated: 'Sign in again to play online.',
  not_associated: 'Finish setting up your account in the Control Center to play online.',
  unavailable: 'The games server is busy. Try again in a moment.',
};
export const reasonText = r => REASONS[r] || 'Something went wrong. Try again.';

// How this browser proves who it is. Signed in: ClerkJS's session token as a bearer, like NL.saves. Local development
// with sign-in off: a person id per tab in the X-NL-Dev-Person header, which only a development build of the Worker
// reads, so two tabs can be two players.
export async function browserAuth(fresh = false) {
  if (window.NL_CONFIG !== null) {
    await window.NL?.ready;
    const t = await window.Clerk?.session?.getToken(fresh ? { skipCache: true } : undefined).catch(() => null);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  let id = null;
  try { id = sessionStorage.getItem('nl-bomb-dev-person'); } catch {}
  if (!UUID.test(id ?? '')) {
    id = crypto.randomUUID();
    try { sessionStorage.setItem('nl-bomb-dev-person', id); } catch {}
  }
  return { 'X-NL-Dev-Person': id };
}

// deps: { fetch, auth(fresh) -> headers, onView(view, version), onState('ok' | 'offline'), onGone(reason?), doc (visibility),
//   win (online events), sleep, id }
export function createNet(deps) {
  const fetch = deps.fetch, auth = deps.auth;
  const sleep = deps.sleep || (ms => new Promise(ok => setTimeout(ok, ms)));
  const doc = deps.doc || null;
  const newId = deps.id || (() => crypto.randomUUID());
  let room = null, version = 0, alive = false, poller = null, abort = null, state = 'ok', reached = false, wake = null;
  // A backoff wait ends early when the network comes back or the page is shown again.
  const pause = ms => Promise.race([sleep(ms), new Promise(ok => { wake = ok; })]);
  deps.win?.addEventListener('online', () => wake?.());

  const setState = s => { if (s !== state) { state = s; deps.onState?.(s); } };
  const adopt = (v, view) => {
    if (!Number.isInteger(v) || v < version) return;
    version = v;
    if (view !== undefined) deps.onView?.(view, v);
  };

  // One request. Resolves { status, body }; rejects with { reason } for no server or no network.
  async function call(method, path, body, signal) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(BASE + path, {
          method, signal, cache: 'no-store',
          headers: { ...(await auth(attempt > 0)), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        throw { reason: 'offline' };
      }
      if (res.status === 401 && attempt === 0) continue; // a cached token expired: fetch a fresh one once
      let data = null;
      // The plain static preview answers /api with its own 404 or 501 page, not JSON: there is no server.
      if (!(res.headers.get('content-type') || '').includes('application/json')) throw { reason: 'no_server' };
      try { data = await res.json(); } catch { throw { reason: 'no_server' }; }
      return { status: res.status, body: data || {} };
    }
  }
  const failure = r => r.status === 404 ? 'not_found' : r.body.reason || r.body.error || 'unavailable';

  // Create or join: returns { ok: true } or { ok: false, reason }.
  async function enter(path, body) {
    try {
      const r = await call('POST', path, body);
      if (r.status !== 200) return { ok: false, reason: failure(r) };
      open(r.body.id, r.body.version, r.body.view);
      return { ok: true, id: r.body.id, code: r.body.view?.room?.code };
    } catch (e) { return { ok: false, reason: e.reason || 'offline' }; }
  }

  function open(id, v = 0, view) {
    close();
    room = id; version = 0; alive = true; reached = !!view;
    if (view) adopt(v, view);
    loop();
  }
  function close() {
    alive = false;
    abort?.abort();
    room = null;
  }

  async function loop() {
    if (poller) return;
    poller = (async () => {
      let delay = 1000;
      while (alive) {
        if (doc?.hidden) { await new Promise(ok => doc.addEventListener('visibilitychange', ok, { once: true })); continue; }
        const at = room;
        abort = new AbortController();
        try {
          const r = await call('GET', `/${at}?since=${version}`, null, abort.signal);
          if (at !== room) continue;
          if (r.status === 404) { alive = false; deps.onGone?.(); break; }
          if (r.status === 401 || r.status === 403) { alive = false; deps.onGone?.(failure(r)); break; }
          if (r.status !== 200) throw { reason: failure(r) };
          setState('ok');
          reached = true;
          delay = 1000;
          adopt(r.body.version, r.body.view);
        } catch (e) {
          if (!alive || e?.name === 'AbortError') continue;
          // No server at all (the static preview) ends it; after a good answer, an odd page is an outage: keep trying.
          if (e.reason === 'no_server' && !reached) { setState('offline'); alive = false; deps.onGone?.('no_server'); break; }
          setState('offline');
          await pause(delay);
          delay = Math.min(delay * 2, 15000);
        }
      }
      poller = null;
    })();
    return poller;
  }
  // Hidden: drop the open poll at once (the loop then waits for visible); visible again: carry on.
  doc?.addEventListener('visibilitychange', () => { if (doc.hidden) abort?.abort(); else wake?.(); });

  // A user action: { ok: true } or { ok: false, reason }. Network errors retry with the same actionId and backoff;
  // a conflict adopts the view the server sent.
  async function send(action) {
    if (!room) return { ok: false, reason: 'not_found' };
    const actionId = newId(), at = room;
    let delay = 500;
    for (let tries = 0; tries < 6; tries++) {
      try {
        const r = await call('POST', `/${at}/actions`, { action, expect: version, actionId });
        if (at !== room) return { ok: false, reason: 'not_found' }; // left meanwhile: never bring the room back
        setState('ok');
        if (r.status === 200) {
          if (r.body.view === null) { close(); return { ok: true, left: true }; }
          adopt(r.body.version, r.body.view);
          return { ok: true };
        }
        if (r.status === 409 && r.body.view) adopt(r.body.version, r.body.view);
        return { ok: false, reason: failure(r) };
      } catch (e) {
        if (e.reason === 'no_server') return { ok: false, reason: 'no_server' };
        if (at !== room) return { ok: false, reason: 'not_found' };
        setState('offline');
        await sleep(delay);
        delay = Math.min(delay * 2, 8000);
      }
    }
    return { ok: false, reason: 'offline' };
  }

  return {
    create: body => enter('', body),
    join: body => enter('/join', body),
    open, close, send,
    get room() { return room; },
    get version() { return version; },
  };
}
