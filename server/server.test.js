// Hermetic: a throwaway key pair, hand-signed tokens, and fetch replaced so any outbound call fails the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { verify, AUTHORIZED_PARTY } from './seam.js';
import { checkEnv, createServer } from './index.js';
import { openDb, MAX_BYTES, MAX_SAVES } from './saves.js';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

globalThis.fetch = () => { throw new Error('network call attempted'); };

const ISSUER = 'https://clerk.nordgrenlabs.com';
const PROD = 'https://games.nordgrenlabs.com';
const DEV = 'http://localhost:8765';
const PERSON = '0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
const rsa = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
const { publicKey, privateKey } = rsa();
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
const config = { jwtKey, issuer: ISSUER, authorizedParty: PROD };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const claims = extra => ({
  iss: ISSUER, azp: PROD, sub: 'user_1', sid: 'sess_1', iat: now() - 10, nbf: now() - 10, exp: now() + 60,
  nl_person_id: PERSON, ...extra,
});
function sign(payload, { alg = 'RS256', key = privateKey, secret } = {}) {
  const data = `${b64({ alg, typ: 'JWT', kid: 'ins_test' })}.${b64(payload)}`;
  const sig = alg === 'none' ? Buffer.alloc(0)
    : secret ? crypto.createHmac('sha256', secret).update(data).digest()
    : crypto.sign('sha256', Buffer.from(data), key);
  return `${data}.${sig.toString('base64url')}`;
}
const without = (...names) => { const c = claims(); for (const n of names) delete c[n]; return c; };
const bearer = t => `Bearer ${t}`;

test('seam accepts a valid token, with and without nl_person_id', async () => {
  assert.deepEqual(await verify(bearer(sign(claims())), config), { ok: true, personPublicId: PERSON });
  assert.deepEqual(await verify(bearer(sign(without('nl_person_id'))), config), { ok: true, personPublicId: null });
});

test('authorized party is production unless NODE_ENV is development', () => {
  assert.equal(AUTHORIZED_PARTY, PROD);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { AUTHORIZED_PARTY } from "./seam.js"; console.log(AUTHORIZED_PARTY)'],
    { cwd: import.meta.dirname, env: { ...process.env, NODE_ENV: 'development' }, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), DEV);
});

const valid = sign(claims());
const [h, , s] = valid.split('.');
const refusals = {
  'expired': bearer(sign(claims({ exp: now() - 60 }))),
  'nbf in the future': bearer(sign(claims({ nbf: now() + 60 }))),
  'iat in the future': bearer(sign(claims({ iat: now() + 60 }))),
  'missing exp': bearer(sign(without('exp'))),
  'wrong iss': bearer(sign(claims({ iss: 'https://clerk.example.com' }))),
  'wrong azp': bearer(sign(claims({ azp: 'https://evil.example.com' }))),
  'missing azp': bearer(sign(without('azp'))),
  'development azp in production mode': bearer(sign(claims({ azp: DEV }))),
  'aud string': bearer(sign(claims({ aud: PROD }))),
  'aud array': bearer(sign(claims({ aud: [] }))),
  'missing sid': bearer(sign(without('sid'))),
  'empty sid': bearer(sign(claims({ sid: '' }))),
  'empty sub': bearer(sign(claims({ sub: '' }))),
  'alg none unsigned': bearer(sign(claims(), { alg: 'none' })),
  'HS256 with the public PEM as secret': bearer(sign(claims(), { alg: 'HS256', secret: jwtKey })),
  'RS256 from a different key': bearer(sign(claims(), { key: rsa().privateKey })),
  'tampered payload': bearer(`${h}.${b64({ ...claims(), nl_person_id: '11111111-2222-4333-8444-555555555555' })}.${s}`),
  'over 4096 characters': bearer(sign(claims({ pad: 'x'.repeat(4096) }))),
  'uppercase nl_person_id': bearer(sign(claims({ nl_person_id: PERSON.toUpperCase() }))),
  'nl_person_id not a UUID': bearer(sign(claims({ nl_person_id: 'person-1' }))),
  'null nl_person_id': bearer(sign(claims({ nl_person_id: null }))),
  'garbage token': bearer('a.b.c'),
  'missing header': undefined,
  'Basic scheme': `Basic ${Buffer.from('a:b').toString('base64')}`,
  'empty bearer': 'Bearer ',
  'lowercase scheme': `bearer ${valid}`,
};
for (const [name, header] of Object.entries(refusals)) {
  test(`seam refuses: ${name}`, async () => assert.deepEqual(await verify(header, config), { ok: false }));
}
test('seam refuses everything without a key or issuer configured', async () => {
  assert.deepEqual(await verify(bearer(valid), { ...config, jwtKey: '' }), { ok: false });
  assert.deepEqual(await verify(bearer(valid), { ...config, issuer: undefined }), { ok: false });
});

let server, port;
const db = openDb(':memory:');
const listen = async srv => { await new Promise(r => srv.listen(0, '127.0.0.1', r)); return srv.address().port; };
before(async () => {
  server = createServer({ publishableKey: 'pk_test_games', jwtKey, issuer: ISSUER, db });
  port = await listen(server);
});
after(() => server.close());

// http.get, not fetch: fetch is disabled, and it would normalise "/%2e%2e/" before sending.
const get = (path, headers = {}, method = 'GET', body, p = port) => new Promise((resolve, reject) => {
  http.request({ host: '127.0.0.1', port: p, path, headers, method }, res => {
    let body = '';
    res.on('data', c => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject).end(body);
});

test('/api/me answers 200, 401 and 403 with no-store', async () => {
  const cases = [
    [{ authorization: bearer(sign(claims())) }, 200, { personPublicId: PERSON }],
    [{}, 401, { error: 'unauthenticated' }],
    [{ authorization: bearer(sign(claims({ exp: now() - 60 }))) }, 401, { error: 'unauthenticated' }],
    [{ authorization: bearer(sign(without('nl_person_id'))) }, 403, { error: 'not_associated' }],
  ];
  for (const [headers, status, body] of cases) {
    const r = await get('/api/me', headers);
    assert.equal(r.status, status);
    assert.deepEqual(JSON.parse(r.body), body);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(r.headers['content-type'], /^application\/json/);
  }
});

test('/api unknown path is 404 and wrong method is 405, both JSON', async () => {
  const a = await get('/api/nope');
  assert.equal(a.status, 404);
  assert.equal(a.headers['cache-control'], 'no-store');
  assert.equal((await get('/api/me', {}, 'POST')).status, 405);
  assert.equal((await get('/', {}, 'POST')).status, 405);
});

test('/config.js carries the publishable key', async () => {
  const r = await get('/config.js');
  assert.equal(r.status, 200);
  assert.equal(r.body.trim(), 'window.NL_CONFIG = {"clerkPublishableKey":"pk_test_games"};');
  assert.match(r.headers['content-type'], /^text\/javascript/);
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('static files: index, game page redirect, HEAD, nosniff', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.body, /<html/i);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  const redirect = await get('/bank');
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.location, '/bank/');
  assert.equal((await get('/bank/')).status, 200);
  assert.match((await get('/style.css')).headers['content-type'], /^text\/css/);
  const head = await get('/platform.js', {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

for (const path of ['/server/index.js', '/SERVER/index.js', '//server/index.js', '/server./index.js',
  '/docs/BUILD-GUIDE.md', '/server/node_modules/@clerk/backend/package.json', '/.git/config', '/.gitattributes',
  '/%2e%2e/', '/..%2f..%2f', '/bank/..%5c..%5cserver/index.js', '/bank/%2e%2e/server/index.js', '/%E0%A4%A',
  '/nope.html']) {
  test(`static refuses ${path}`, async () => assert.equal((await get(path)).status, 404));
}

const good = { CLERK_PUBLISHABLE_KEY: 'pk', CLERK_JWT_KEY: 'jwk', CLERK_ISSUER: ISSUER };
test('config check accepts exactly the three public names', () => {
  assert.deepEqual(checkEnv({ ...good, PATH: '/bin' }), []);
});
test('config check refuses a secret or unknown CLERK_ name without printing its value', () => {
  for (const name of ['CLERK_SECRET_KEY', 'CLERK_API_URL', 'CLERK_']) {
    const problems = checkEnv({ ...good, [name]: 'sk_live_VALUE' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(name));
    assert.doesNotMatch(problems.join(), /VALUE/);
  }
});
test('config check refuses a missing or empty required name', () => {
  for (const name of Object.keys(good)) {
    assert.equal(checkEnv({ ...good, [name]: '' }).length, 1);
    const env = { ...good };
    delete env[name];
    assert.equal(checkEnv(env).length, 1);
  }
});
test('the server process refuses to start on a Clerk secret key', () => {
  const r = spawnSync(process.execPath, ['index.js'],
    { cwd: import.meta.dirname, env: { ...good, CLERK_SECRET_KEY: 'sk_live_VALUE', PORT: '0' }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /CLERK_SECRET_KEY/);
  assert.doesNotMatch(r.stderr + r.stdout, /VALUE/);
});

// ---- Saves API: people A and B, over real HTTP against the in-memory database.
const A = PERSON;
const B = '1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5';
const authA = { authorization: bearer(sign(claims())) };
const authB = { authorization: bearer(sign(claims({ nl_person_id: B, sub: 'user_2' }))) };
const record = extra => ({
  schemaVersion: 1, id: crypto.randomUUID(), game: 'bank', personPublicId: null, title: 'Game',
  status: 'in_progress', createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', state: { round: 1 }, ...extra,
});
const put = (rec, auth = authA, id = rec.id, p = port) => get(`/api/saves/${id}`, auth, 'PUT', JSON.stringify(rec), p);
const body = r => (r.body ? JSON.parse(r.body) : undefined);

test('saves: put, get, replace, list newest first and filtered by game', async () => {
  const r1 = record({ game: 'list-test' });
  const res = await put(r1);
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(body(res), { ...r1, personPublicId: A });
  assert.deepEqual(body(await get(`/api/saves/${r1.id}`, authA)), { ...r1, personPublicId: A });
  const newer = { ...r1, title: 'Renamed', updatedAt: '2026-11-18T12:00:00.123Z' };
  assert.equal((await put(newer)).status, 200);
  assert.deepEqual(body(await get(`/api/saves/${r1.id}`, authA)), { ...newer, personPublicId: A });
  const r2 = record({ game: 'list-test', updatedAt: '2026-11-18T11:00:00Z' });
  await put(r2);
  await put(record({ game: 'other-game' }));
  const list = body(await get('/api/saves?game=list-test', authA));
  assert.deepEqual(list.map(r => r.id), [r1.id, r2.id]);
  assert.equal(list[0].title, 'Renamed');
});

test('saves: B cannot see, overwrite or delete a save of A', async () => {
  const r = record({ game: 'iso' });
  await put(r);
  assert.equal((await get(`/api/saves/${r.id}`, authB)).status, 404);
  assert.deepEqual(body(await get('/api/saves?game=iso', authB)), []);
  const hijack = await put({ ...r, title: 'Mine now' }, authB);
  assert.equal(hijack.status, 404);
  assert.deepEqual(body(hijack), { error: 'not_found' });
  assert.equal((await get(`/api/saves/${r.id}`, authB, 'DELETE')).status, 204);
  assert.deepEqual(body(await get(`/api/saves/${r.id}`, authA)), { ...r, personPublicId: A });
});

test('saves: personPublicId is always the verified person', async () => {
  for (const claimed of [B, null]) {
    const r = record({ personPublicId: claimed });
    assert.equal(body(await put(r)).personPublicId, A);
    assert.equal(body(await get(`/api/saves/${r.id}`, authA)).personPublicId, A);
  }
});

const invalid = {
  'unparseable JSON': '{"schemaVersion":1,',
  'array body': '[]',
  'string body': '"hello"',
  'bad status': record({ status: 'paused' }),
  'non-ISO createdAt': record({ createdAt: '2026-11-18 10:00:00' }),
  'non-ISO updatedAt': record({ updatedAt: '2026-11-18T10:00:00+01:00' }),
  'personPublicId not a UUID': record({ personPublicId: 'someone' }),
  'game empty': record({ game: '' }),
  'game over 64 characters': record({ game: 'g'.repeat(65) }),
  'game a number': record({ game: 7 }),
  'state a string': record({ state: 'x' }),
  'state null': record({ state: null }),
  'schemaVersion 2': record({ schemaVersion: 2 }),
  'schemaVersion a string': record({ schemaVersion: '1' }),
  'title a number': record({ title: 5 }),
  'createdAt a number': record({ createdAt: 1 }),
};
for (const field of ['schemaVersion', 'id', 'game', 'personPublicId', 'title', 'status', 'createdAt', 'updatedAt', 'state']) {
  const r = record();
  delete r[field];
  invalid[`missing ${field}`] = r;
}
for (const [name, rec] of Object.entries(invalid)) {
  test(`saves: PUT refuses ${name} with 400`, async () => {
    const id = rec.id ?? crypto.randomUUID();
    const res = await get(`/api/saves/${id}`, authA, 'PUT', typeof rec === 'string' ? rec : JSON.stringify(rec));
    assert.equal(res.status, 400);
    assert.deepEqual(body(res), { error: 'invalid_record' });
  });
}
test('saves: 400 for a non-UUID body id, a body id not matching the path, and a list without game', async () => {
  assert.equal((await put(record({ id: 'not-a-uuid' }), authA, crypto.randomUUID())).status, 400);
  assert.equal((await put(record({ id: crypto.randomUUID().toUpperCase() }), authA, crypto.randomUUID())).status, 400);
  assert.equal((await put(record(), authA, crypto.randomUUID())).status, 400);
  assert.equal((await put(record({ game: 'g'.repeat(64) }))).status, 200);
  assert.equal((await get('/api/saves', authA)).status, 400);
  assert.equal((await get('/api/saves?game=', authA)).status, 400);
});
test('saves: a path id that is not a canonical lowercase UUID is 404', async () => {
  for (const id of ['abc', crypto.randomUUID().toUpperCase(), '%2e%2e']) {
    assert.equal((await get(`/api/saves/${id}`, authA)).status, 404);
  }
});

test('saves: 413 over 256 KB, 200 at exactly 256 KB', async () => {
  const r = record();
  const base = JSON.stringify({ ...r, state: { pad: '' } }).length;
  const atLimit = { ...r, state: { pad: 'x'.repeat(MAX_BYTES - base) } };
  assert.equal(JSON.stringify(atLimit).length, MAX_BYTES);
  assert.equal((await put(atLimit)).status, 200);
  const over = await put({ ...r, state: { pad: 'x'.repeat(MAX_BYTES - base + 1) } });
  assert.equal(over.status, 413);
  assert.deepEqual(body(over), { error: 'too_large' });
  assert.equal((await put({ ...r, state: { pad: 'x'.repeat(4 * MAX_BYTES) } })).status, 413);
  assert.equal(body(await get(`/api/saves/${r.id}`, authA)).state.pad.length, MAX_BYTES - base);
});

test('saves: 200 per person, updates still work at the limit, B unaffected', async () => {
  const C = '2d3e4f5a-6b7c-4d8e-9fa0-b1c2d3e4f5a6';
  const authC = { authorization: bearer(sign(claims({ nl_person_id: C }))) };
  const insert = db.prepare('INSERT INTO saves VALUES (?, ?, ?, ?, ?)');
  const ids = [];
  for (let i = 0; i < MAX_SAVES; i++) {
    const r = record({ personPublicId: C });
    ids.push(r.id);
    insert.run(r.id, C, r.game, r.updatedAt, JSON.stringify(r));
  }
  const full = await put(record(), authC);
  assert.equal(full.status, 409);
  assert.deepEqual(body(full), { error: 'save_limit' });
  assert.equal((await put(record({ id: ids[0], title: 'Updated' }), authC)).status, 200);
  assert.equal((await put(record(), authB)).status, 200);
  assert.equal((await get(`/api/saves/${ids[1]}`, authC, 'DELETE')).status, 204);
  assert.equal((await put(record(), authC)).status, 200);
  assert.equal((await put(record(), authC)).status, 409);
});

test('saves: delete is idempotent and get is then 404', async () => {
  const r = record();
  await put(r);
  for (let i = 0; i < 2; i++) {
    const res = await get(`/api/saves/${r.id}`, authA, 'DELETE');
    assert.equal(res.status, 204);
    assert.equal(res.body, '');
  }
  assert.equal((await get(`/api/saves/${r.id}`, authA)).status, 404);
});

test('saves: 401 without a token and 403 without nl_person_id on all four routes', async () => {
  const id = crypto.randomUUID();
  const noPerson = { authorization: bearer(sign(without('nl_person_id'))) };
  for (const [auth, status, error] of [[{}, 401, 'unauthenticated'], [noPerson, 403, 'not_associated']]) {
    for (const [method, url, payload] of [['GET', '/api/saves?game=bank'], ['GET', `/api/saves/${id}`],
      ['PUT', `/api/saves/${id}`, JSON.stringify(record({ id }))], ['DELETE', `/api/saves/${id}`]]) {
      const res = await get(url, auth, method, payload);
      assert.equal(res.status, status, `${method} ${url}`);
      assert.deepEqual(body(res), { error });
    }
  }
});

test('saves: 405 with Allow for other methods', async () => {
  const a = await get('/api/saves', authA, 'POST', '{}');
  assert.equal(a.status, 405);
  assert.equal(a.headers.allow, 'GET');
  const b = await get(`/api/saves/${crypto.randomUUID()}`, authA, 'PATCH', '{}');
  assert.equal(b.status, 405);
  assert.equal(b.headers.allow, 'GET, PUT, DELETE');
});

test('saves: a closed database answers 503 without database text', async () => {
  const broken = openDb(':memory:');
  broken.close();
  const srv = createServer({ publishableKey: 'pk', jwtKey, issuer: ISSUER, db: broken });
  const p = await listen(srv);
  try {
    for (const res of [await get('/api/saves?game=bank', authA, 'GET', undefined, p), await put(record(), authA, undefined, p)]) {
      assert.equal(res.status, 503);
      assert.deepEqual(body(res), { error: 'unavailable' });
    }
  } finally {
    srv.close();
  }
});

test('saves: a file database keeps records across close and reopen', async () => {
  const dir = path.join(os.tmpdir(), `games-test-${crypto.randomUUID()}`);
  const file = path.join(dir, 'games.db');
  const r = record();
  const withServer = async fn => {
    const fileDb = openDb(file);
    const srv = createServer({ publishableKey: 'pk', jwtKey, issuer: ISSUER, db: fileDb });
    try {
      return await fn(await listen(srv));
    } finally {
      srv.close();
      fileDb.close();
    }
  };
  try {
    assert.equal((await withServer(p => put(r, authA, r.id, p))).status, 200);
    const res = await withServer(p => get(`/api/saves/${r.id}`, authA, 'GET', undefined, p));
    assert.deepEqual(body(res), { ...r, personPublicId: A });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saves: a record round-trips by value', async () => {
  const r = record({
    title: 'O\'Brien "quoted" é中🎲',
    state: { sql: "'); DROP TABLE saves; --", nested: { list: [1, 2.5, null, true, { deep: '☃\n\t\\' }] }, empty: {} },
  });
  assert.deepEqual(body(await put(r)), { ...r, personPublicId: A });
  assert.deepEqual(body(await get(`/api/saves/${r.id}`, authA)), { ...r, personPublicId: A });
  assert.ok(body(await get('/api/saves?game=bank', authA)).some(x => x.id === r.id));
});
