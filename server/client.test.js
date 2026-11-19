// The saves matrix at the client level: the real site/platform.js in a Node vm, with only the browser's edges stubbed
// (window, localStorage, document.cookie, a fake window.Clerk whose getToken() hands out tokens signed by a throwaway
// key) and fetch routed into the real Worker handler against a real local D1. Nothing on the server side is mocked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';
import { MAX_SAVES } from './saves.js';

const PLATFORM = readFileSync(new URL('../site/platform.js', import.meta.url), 'utf8');
const MIGRATION = readFileSync(new URL('../migrations/0001_saves.sql', import.meta.url), 'utf8');
const ISSUER = 'https://clerk.nordgrenlabs.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = claims => {
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
};
const tokenFor = (person, exp = 60) => {
  const t = Math.floor(Date.now() / 1000);
  return sign({ iss: ISSUER, azp: 'https://games.nordgrenlabs.com', sub: `user_${person}`, sid: 'sess_1', iat: t - 10, exp: t + exp, nl_person_id: person });
};

let proxy, env, dir;
before(async () => {
  dir = path.join(os.tmpdir(), `games-client-${crypto.randomUUID()}`);
  proxy = await getPlatformProxy({ configPath: '../wrangler.jsonc', environment: 'dev', persist: { path: dir } });
  const db = proxy.env.DB;
  await db.batch(MIGRATION.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  env = { ...proxy.env, CLERK_PUBLISHABLE_KEY: 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k', CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }), CLERK_ISSUER: ISSUER };
});
after(async () => { await proxy.dispose(); rmSync(dir, { recursive: true, force: true }); });

// One page load in one browser. `storage` is that browser's localStorage and outlives the page, like a real one.
function page({ person, storage = new Map(), net = { online: true }, staleFirstToken = false }) {
  const listeners = {};
  let clerkListener = null, fresh = !staleFirstToken;
  const clerk = {
    load: async () => {},
    user: person ? { id: `user_${person}`, firstName: `Name ${person.slice(0, 4)}` } : null,
    session: person ? { getToken: async opts => { if (opts?.skipCache) fresh = true; return tokenFor(person, fresh ? 60 : -60); } } : null,
    addListener: fn => { clerkListener = fn; },
    signOut: async () => {},
  };
  const ctx = {
    NL_CONFIG: { clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY },
    Clerk: clerk,
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    document: { cookie: person ? `__session=${tokenFor(person)}` : '', documentElement: { dataset: {} }, addEventListener() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    dispatchEvent: e => (listeners[e.type] || []).forEach(fn => fn(e)),
    location: { reloaded: false, reload() { this.reloaded = true; } },
    fetch: async (url, init) => {
      if (!net.online) throw new TypeError('Failed to fetch');
      return worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, init), env);
    },
    atob, setTimeout, clearTimeout, console, Event, AbortController, WeakMap,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(PLATFORM, ctx);
  return { NL: ctx.NL, ctx, storage, net, emit: state => clerkListener(state), local: () => JSON.parse(storage.get('nl-games-saves-v1') ?? '[]') };
}

const person = () => crypto.randomUUID();
// Values from the page come from another realm (vm), so compare them as plain data.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual) ?? 'null'), expected, message);
const until = async (check, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 10))) if (await check()) return;
  assert.fail('timed out');
};
const serverRows = async who => (await env.DB.prepare('SELECT record FROM saves WHERE person_public_id = ? ORDER BY updated_at DESC').bind(who).all())
  .results.map(r => JSON.parse(r.record));
const iso = (s = 0) => new Date(Date.UTC(2026, 10, 18, 10, 0, s)).toISOString();
const record = extra => ({
  schemaVersion: 1, id: crypto.randomUUID(), game: 'bank', personPublicId: null, title: 'Ann and Bo', status: 'in_progress',
  createdAt: iso(), updatedAt: iso(), state: { names: ['Ann', 'Bo'], g: { round: 2 }, hist: [{ g: '{"round":1}', roll: true }] }, ...extra,
});
const synced = p => until(() => p.local().length === 0);

// ---- 1. Saves once
test('saves once: a save is written here first, uploaded once, and the local copy is dropped', async () => {
  const a = person(), p = page({ person: a });
  await p.NL.ready;
  const r = record({ personPublicId: a });
  await Promise.all([p.NL.saves.put(r), p.NL.saves.put(r)]); // a double tap
  assert.equal(p.local().length, 1, 'in this browser before the server answers');
  await synced(p);
  same((await serverRows(a)).map(x => x.id), [r.id]);
});

test('saves once: saving a resumed save again updates the same record, same id and createdAt, newer updatedAt', async () => {
  const a = person(), p = page({ person: a });
  const r = record();
  await p.NL.saves.put(r);
  await synced(p);
  const resumed = await p.NL.saves.get(r.id);
  await p.NL.saves.put({ ...resumed, title: 'Again', updatedAt: iso(30) });
  await synced(p);
  const rows = await serverRows(a);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].createdAt, r.createdAt);
  assert.equal(rows[0].updatedAt, iso(30));
});

test('saves once: a save made while an earlier upload of it is in flight ends as one record, the newer one', async () => {
  const a = person(), p = page({ person: a });
  await p.NL.ready;
  const r = record();
  p.NL.saves.put(r);
  await p.NL.saves.put({ ...r, title: 'Newer', updatedAt: iso(5) });
  await synced(p);
  const rows = await serverRows(a);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Newer');
});

test('saves once: a failed upload stays pending, survives a reload, and the retry does not duplicate', async () => {
  const a = person(), storage = new Map(), net = { online: false };
  const p = page({ person: a, storage, net });
  const r = record();
  await p.NL.saves.put(r);
  await p.NL.saves.put({ ...r, updatedAt: iso(9) }); // saved again while still offline
  await p.NL.ready;
  await new Promise(r => setTimeout(r, 50));
  assert.equal(p.local().length, 1);
  assert.equal(p.local()[0].personPublicId, a, 'tagged with its owner');
  await assert.rejects(p.NL.saves.list('bank'));
  same(p.NL.saves.cached('bank'), null, 'never an invented empty list');
  net.online = true;
  const again = page({ person: a, storage, net }); // the next load retries
  await synced(again);
  const rows = await serverRows(a);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].updatedAt, iso(9));
});

// ---- 2. Loading
test('loading: the list is the person\'s server saves newest first; resume restores the exact state', async () => {
  const a = person(), p = page({ person: a });
  const older = record({ updatedAt: iso(1) }), newer = record({ updatedAt: iso(2), status: 'finished' });
  await p.NL.saves.put(older);
  await p.NL.saves.put(newer);
  await synced(p);
  const q = page({ person: a });
  const list = await q.NL.saves.list('bank');
  same(list.map(r => r.id), [newer.id, older.id]);
  assert.ok(list.every(r => !r.pending));
  const back = await q.NL.saves.get(older.id);
  same(back.state, older.state);
  assert.equal((await q.NL.saves.get(newer.id)).status, 'finished');
});

test('loading: a save that fails validation is not shown and breaks nothing', async () => {
  const a = person();
  const bad = { ...record(), schemaVersion: 2 };
  await env.DB.prepare('INSERT INTO saves VALUES (?, ?, ?, ?, ?)').bind(bad.id, a, 'bank', bad.updatedAt, JSON.stringify(bad)).run();
  const storage = new Map([['nl-games-saves-v1', JSON.stringify([{ id: 'junk' }, 42])]]);
  const good = record();
  const p = page({ person: a, storage });
  await p.NL.saves.put(good);
  await synced(p);
  same((await p.NL.saves.list('bank')).map(r => r.id), [good.id]);
});

// ---- 3. Deleting
test('deleting: gone from the server, the list, the cache and the next load', async () => {
  const a = person(), storage = new Map(), p = page({ person: a, storage });
  const r = record();
  await p.NL.saves.put(r);
  await synced(p);
  await p.NL.saves.list('bank'); // fills the cache
  await p.NL.saves.remove(r.id);
  same(await serverRows(a), []);
  same(await p.NL.saves.list('bank'), []);
  const next = page({ person: a, storage });
  same(next.NL.saves.cached('bank'), [], 'the cached list does not bring it back');
  same(await next.NL.saves.list('bank'), []);
});

test('deleting: a save still pending upload is removed here and never uploaded later', async () => {
  const a = person(), storage = new Map(), p = page({ person: a, storage });
  await p.NL.ready;
  const r = record();
  p.NL.saves.put(r); // its upload is queued
  await p.NL.saves.remove(r.id);
  await new Promise(r => setTimeout(r, 100));
  same(p.local(), []);
  page({ person: a, storage });
  await new Promise(r => setTimeout(r, 100));
  same(await serverRows(a), [], 'no resurrection');
});

test('deleting: offline, the delete rejects and the save stays', async () => {
  const a = person(), net = { online: true }, p = page({ person: a, net });
  const r = record();
  await p.NL.saves.put(r);
  await synced(p);
  net.online = false;
  await assert.rejects(p.NL.saves.remove(r.id));
  net.online = true;
  assert.equal((await serverRows(a)).length, 1);
});

// ---- 4. Sign-out and switching accounts
test('switching: sign-out clears the cache; B never sees A\'s saves, even cached, and A\'s pending save waits for A', async () => {
  const a = person(), b = person(), storage = new Map(), net = { online: true };
  const pa = page({ person: a, storage, net });
  const kept = record();
  await pa.NL.saves.put(kept);
  await synced(pa);
  await pa.NL.saves.list('bank');
  assert.ok(storage.has('nl-games-cache-v1'));
  net.online = false;
  const pending = record({ title: 'Pending of A' });
  await pa.NL.saves.put(pending);
  await new Promise(r => setTimeout(r, 50)); // A's own page tried and failed to upload it
  pa.emit({ user: null }); // signed out here or in another tab
  assert.equal(pa.ctx.location.reloaded, true);
  assert.equal(storage.has('nl-games-cache-v1'), false);

  net.online = true;
  const pb = page({ person: b, storage, net });
  assert.equal(pb.NL.saves.cached('bank'), null);
  same(await pb.NL.saves.list('bank'), []);
  await new Promise(r => setTimeout(r, 100));
  same(await serverRows(b), [], 'A\'s pending save never goes into B\'s account');
  assert.equal(pb.local().length, 1);
  storage.set('nl-games-cache-v1', JSON.stringify({ personPublicId: a, displayName: 'A', lists: { bank: [{ ...kept, personPublicId: a }] } }));
  assert.equal(page({ person: b, storage, net }).NL.saves.cached('bank'), null, 'a cached list of another person is never shown');

  const back = page({ person: a, storage, net });
  await synced(back);
  same((await serverRows(a)).map(r => r.title).sort(), ['Ann and Bo', 'Pending of A']);
});

test('switching: saves made before any sign-in move to the first account', async () => {
  const a = person(), storage = new Map([['nl-games-saves-v1', JSON.stringify([record({ title: 'From before' })])]]);
  const p = page({ person: a, storage });
  await synced(p);
  same((await serverRows(a)).map(r => r.title), ['From before']);
});

test('the cached name and list show at once on the next load, keyed to the cookie\'s person', async () => {
  const a = person(), storage = new Map(), p = page({ person: a, storage });
  await p.NL.ready;
  await p.NL.saves.put(record());
  await synced(p);
  await p.NL.saves.list('bank');
  const next = page({ person: a, storage });
  assert.equal(next.NL.identity().displayName, `Name ${a.slice(0, 4)}`);
  assert.equal(next.NL.saves.cached('bank').length, 1);
});

// ---- 5. Two devices
test('two devices: a save from one appears on the other; an older local copy never overwrites a newer server copy', async () => {
  const a = person(), phone = new Map(), laptop = new Map(), net = { online: true };
  const r = record({ updatedAt: iso(1) });
  const p1 = page({ person: a, storage: phone, net });
  await p1.NL.saves.put(r);
  await synced(p1);
  same((await page({ person: a, storage: laptop }).NL.saves.list('bank')).map(x => x.id), [r.id]);

  const offline = { online: false };
  const p2 = page({ person: a, storage: laptop, net: offline });
  await p2.NL.saves.put({ ...r, title: 'Older, from the laptop', updatedAt: iso(2) });
  await p1.NL.saves.put({ ...r, title: 'Newer, from the phone', updatedAt: iso(3) });
  await synced(p1);
  offline.online = true;
  const p3 = page({ person: a, storage: laptop, net: offline });
  await synced(p3);
  assert.equal((await serverRows(a))[0].title, 'Newer, from the phone');
});

// ---- 6. Limits and failures
test('limits: a full account and an oversized save stay pending here with a reason, and nothing is lost', async () => {
  const c = person();
  const rows = Array.from({ length: MAX_SAVES }, () => record({ personPublicId: c }));
  await env.DB.batch(rows.map(r => env.DB.prepare('INSERT INTO saves VALUES (?, ?, ?, ?, ?)').bind(r.id, c, 'other', r.updatedAt, JSON.stringify({ ...r, game: 'other' }))));
  const p = page({ person: c });
  const r = record();
  await p.NL.saves.put(r);
  await until(async () => (await p.NL.saves.list('bank')).some(x => x.pending === 'save_limit'));
  assert.equal(p.local().length, 1);

  const d = person(), q = page({ person: d });
  const big = record({ state: { pad: 'x'.repeat(300 * 1024) } });
  await q.NL.saves.put(big);
  await until(async () => (await q.NL.saves.list('bank')).some(x => x.pending === 'too_large'));
  assert.equal(q.local().length, 1);
});

test('failures: an expired token is refreshed and the call retried once', async () => {
  const a = person(), p = page({ person: a, staleFirstToken: true });
  await p.NL.saves.put(record());
  await synced(p);
  assert.equal((await serverRows(a)).length, 1);
});

test('failures: server unreachable leaves saves pending and the cached list still shows', async () => {
  const a = person(), storage = new Map(), net = { online: true };
  const p = page({ person: a, storage, net });
  const r = record();
  await p.NL.saves.put(r);
  await synced(p);
  await p.NL.saves.list('bank');
  net.online = false;
  const q = page({ person: a, storage, net });
  const pending = record({ updatedAt: iso(20) });
  await q.NL.saves.put(pending);
  await assert.rejects(q.NL.saves.list('bank'));
  const shown = q.NL.saves.cached('bank');
  same(shown.map(x => [x.id, !!x.pending]), [[pending.id, true], [r.id, false]]);
  assert.equal((await q.NL.saves.get(r.id)).id, r.id, 'a cached save still opens offline');
});
