// The online client against a fake fetch: long poll with since, 409 adopts the server's view, a network error retries
// the same actionId, backoff, no server, and pausing while the page is hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNet } from '../../site/bomb/ui/net.js';

const json = (status, body) => ({ status, headers: { get: () => 'application/json; charset=utf-8' }, json: async () => body });
const html = status => ({ status, headers: { get: () => 'text/html' }, json: async () => { throw new Error('html'); } });
const tick = () => new Promise(ok => setTimeout(ok, 0));

// A scripted server: handler(req) returns a response or a promise; every request is recorded.
function fake(handler) {
  const calls = [];
  const fetch = async (url, init) => {
    const req = { url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers, signal: init.signal };
    calls.push(req);
    return handler(req, calls);
  };
  return { fetch, calls };
}
const never = req => new Promise((_, no) => req.signal?.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
const view = n => ({ room: { id: 'r1', code: 'ABCDEF', phase: 'lobby', seats: [] }, game: null, you: 0, n });
const ID = '11111111-1111-4111-8111-111111111111';

test('create opens the room, then long polls with since = the latest version', async () => {
  const seen = [];
  let polls = 0;
  const { fetch, calls } = fake(req => {
    if (req.method === 'POST') return json(200, { id: ID, version: 3, view: view(3) });
    polls++;
    if (polls === 1) return json(200, { version: 5, view: view(5) });
    if (polls === 2) return json(200, { version: 5 }); // held and nothing changed
    return never(req);
  });
  const net = createNet({ fetch, auth: async () => ({ 'X-NL-Dev-Person': ID }), onView: (v, n) => seen.push(n), sleep: tick });
  const r = await net.create({ name: 'Alex', style: 'cobalt', decks: 1 });
  assert.deepEqual(r, { ok: true, id: ID, code: 'ABCDEF' });
  for (let i = 0; i < 10; i++) await tick();
  const gets = calls.filter(c => c.method === 'GET').map(c => c.url);
  assert.deepEqual(gets.slice(0, 3), [`/api/bomb/rooms/${ID}?since=3`, `/api/bomb/rooms/${ID}?since=5`, `/api/bomb/rooms/${ID}?since=5`]);
  assert.deepEqual(seen, [3, 5]);
  assert.equal(calls[0].headers['X-NL-Dev-Person'], ID);
  assert.deepEqual(calls[0].body, { name: 'Alex', style: 'cobalt', decks: 1 });
  net.close();
});

test('an action sends expect and an actionId; a network error retries with the same id', async () => {
  let posts = 0;
  const { fetch, calls } = fake(req => {
    if (req.method === 'GET') return never(req);
    posts++;
    if (posts === 1) throw new TypeError('Failed to fetch');
    return json(200, { version: 8, view: view(8) });
  });
  const states = [];
  let ids = 0;
  const net = createNet({ fetch, auth: async () => ({}), sleep: tick, id: () => `a${++ids}`, onState: s => states.push(s) });
  net.open(ID, 7, view(7));
  const r = await net.send({ type: 'pickUp' });
  assert.deepEqual(r, { ok: true });
  const sent = calls.filter(c => c.method === 'POST').map(c => c.body);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], { action: { type: 'pickUp' }, expect: 7, actionId: 'a1' });
  assert.deepEqual(sent[1], sent[0], 'the retry is the same request, so it cannot apply twice');
  assert.deepEqual(states, ['offline', 'ok']);
  assert.equal(net.version, 8);
  net.close();
});

test('409 adopts the view the server sent and reports the reason', async () => {
  const seen = [];
  const { fetch } = fake(req => req.method === 'GET' ? never(req) : json(409, { error: 'conflict', reason: 'stale', version: 12, view: view(12) }));
  const net = createNet({ fetch, auth: async () => ({}), sleep: tick, onView: (v, n) => seen.push(n) });
  net.open(ID, 10, view(10));
  const r = await net.send({ type: 'play', ids: ['QH0'] });
  assert.deepEqual(r, { ok: false, reason: 'stale' });
  assert.deepEqual(seen, [10, 12]);
  assert.equal(net.version, 12);
  net.close();
});

test('join failures come back as reasons; the static preview means no server', async () => {
  let res = json(409, { error: 'conflict', reason: 'full' });
  const { fetch } = fake(() => res);
  const net = createNet({ fetch, auth: async () => ({}), sleep: tick });
  assert.deepEqual(await net.join({ code: 'ABCDEF', name: 'B', style: 'sky' }), { ok: false, reason: 'full' });
  res = json(404, { error: 'not_found' });
  assert.deepEqual(await net.join({ code: 'ABCDEF', name: 'B', style: 'sky' }), { ok: false, reason: 'not_found' });
  res = html(501);
  assert.deepEqual(await net.create({ name: 'B', style: 'sky', decks: 1 }), { ok: false, reason: 'no_server' });
  const offline = createNet({ fetch: async () => { throw new TypeError('offline'); }, auth: async () => ({}), sleep: tick });
  assert.deepEqual(await offline.create({ name: 'B', style: 'sky', decks: 1 }), { ok: false, reason: 'offline' });
});

test('poll errors back off and recover by themselves; a 404 means the room is gone', async () => {
  const waits = [];
  let polls = 0, gone = 0;
  const { fetch } = fake(req => {
    polls++;
    if (polls <= 3) throw new TypeError('offline');
    if (polls === 4) return json(200, { version: 2, view: view(2) });
    return json(404, { error: 'not_found' });
  });
  const states = [];
  const net = createNet({ fetch, auth: async () => ({}), sleep: async ms => { waits.push(ms); await tick(); }, onState: s => states.push(s), onGone: () => gone++ });
  net.open(ID);
  for (let i = 0; i < 30; i++) await tick();
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.deepEqual(states, ['offline', 'ok']);
  assert.equal(gone, 1);
});

test('a 401 fetches a fresh token once', async () => {
  const fresh = [];
  let n = 0;
  const { fetch } = fake(() => ++n === 1 ? json(401, { error: 'unauthenticated' }) : json(200, { id: ID, version: 1, view: view(1) }));
  const net = createNet({ fetch: async (u, i) => (u.includes('?') ? never({ signal: i.signal }) : fetch(u, i)), auth: async f => { fresh.push(f); return {}; }, sleep: tick });
  assert.equal((await net.create({ name: 'A', style: 'sky', decks: 1 })).ok, true);
  assert.deepEqual(fresh.slice(0, 2), [false, true]);
  net.close();
});

test('hidden page: the open poll is dropped and polling waits until visible again', async () => {
  const doc = new EventTarget();
  doc.hidden = false;
  let polls = 0;
  const { fetch } = fake(req => { polls++; return never(req); });
  const net = createNet({ fetch, auth: async () => ({}), sleep: tick, doc });
  net.open(ID);
  await tick(); await tick();
  assert.equal(polls, 1);
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(polls, 1, 'no new poll while hidden');
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(polls, 2, 'resumes on visible');
  net.close();
});

test('a poll answer older than the view shown is ignored: the version never goes backwards', async () => {
  const seen = [];
  let polls = 0;
  const { fetch } = fake(req => {
    if (req.method === 'POST') return json(200, { version: 9, view: view(9) });
    return ++polls === 1 ? new Promise(ok => setTimeout(() => ok(json(200, { version: 8, view: view(8) })), 5)) : never(req);
  });
  const net = createNet({ fetch, auth: async () => ({}), sleep: tick, onView: (v, n) => seen.push(n) });
  net.open(ID, 7, view(7));
  await net.send({ type: 'pickUp' });
  await new Promise(ok => setTimeout(ok, 20));
  assert.deepEqual(seen, [7, 9]);
  assert.equal(net.version, 9);
  net.close();
});

test('closing aborts the open poll, and an action answer that lands afterwards does not bring the room back', async () => {
  let release, aborted = 0;
  const seen = [];
  const { fetch } = fake(req => req.method === 'GET'
    ? new Promise((_, no) => req.signal.addEventListener('abort', () => { aborted++; no(Object.assign(new Error('a'), { name: 'AbortError' })); }))
    : new Promise(ok => { release = () => ok(json(200, { version: 3, view: view(3) })); }));
  const net = createNet({ fetch, auth: async () => ({}), sleep: tick, onView: (v, n) => seen.push(n) });
  net.open(ID, 2, view(2));
  await tick();
  const sent = net.send({ type: 'pickUp' });
  await tick();
  net.close();
  assert.equal(aborted, 1);
  release();
  assert.deepEqual(await sent, { ok: false, reason: 'not_found' });
  assert.deepEqual(seen, [2]);
  assert.equal(net.room, null);
});

test('coming back online ends the backoff wait at once', async () => {
  const win = new EventTarget();
  let polls = 0;
  const { fetch } = fake(req => { polls++; if (polls === 1) throw new TypeError('offline'); return never(req); });
  const net = createNet({ fetch, auth: async () => ({}), sleep: () => new Promise(() => {}), win });
  net.open(ID);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(polls, 1, 'waiting out the backoff');
  win.dispatchEvent(new Event('online'));
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(polls, 2);
  net.close();
});

test('signed in: every request waits for NL.ready and asks ClerkJS for a current token; a 401 skips its cache', async () => {
  const { browserAuth } = await import('../../site/bomb/ui/net.js');
  let ready, n = 0;
  const asked = [];
  globalThis.window = { NL_CONFIG: { clerkPublishableKey: 'pk_test_x' }, NL: { ready: new Promise(ok => { ready = ok; }) } };
  const first = browserAuth();
  // ClerkJS only exists once NL.ready has resolved, as platform.js loads it.
  window.Clerk = { session: { getToken: async opts => { asked.push(opts?.skipCache === true); return `t${++n}`; } } };
  ready();
  assert.deepEqual(await first, { Authorization: 'Bearer t1' });
  let polls = 0;
  const { fetch, calls } = fake(req => {
    if (req.method === 'POST') return json(200, { id: ID, version: 1, view: view(1) });
    polls++;
    if (polls === 1) return json(401, { error: 'unauthenticated' });
    if (polls <= 3) return json(200, { version: 1 }); // two long polls held to the end
    return never(req);
  });
  const net = createNet({ fetch, auth: browserAuth, sleep: tick });
  await net.create({ name: 'A', style: 'sky', decks: 1 });
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(calls.map(c => c.headers.Authorization), ['Bearer t2', 'Bearer t3', 'Bearer t4', 'Bearer t5', 'Bearer t6']);
  assert.deepEqual(asked, [false, false, false, true, false, false], 'only the retry after a 401 skips the cache');
  window.Clerk.session = null;
  assert.deepEqual(await browserAuth(), {}, 'signed out: no header, the server answers 401');
  net.close();
  delete globalThis.window;
});
