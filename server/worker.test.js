// Hermetic: a throwaway key pair, hand-signed tokens, the real Worker handler against a real local D1 (miniflare,
// through wrangler's getPlatformProxy), and fetch replaced so any outbound call from the Worker fails the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { verify, AUTHORIZED_PARTY } from './seam.js';
import worker from './worker.js';
import { MAX_BYTES, MAX_SAVES } from './saves.js';

const ISSUER = 'https://clerk.nordgrenlabs.com';
const PROD = 'https://games.nordgrenlabs.com';
const DEV = 'http://localhost:8787';
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

test('authorized party is production unless the build defines development', () => {
  assert.equal(AUTHORIZED_PARTY, PROD);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    'globalThis.__GAMES_BUILD_MODE__ = "development"; const { AUTHORIZED_PARTY } = await import("./seam.js"); console.log(AUTHORIZED_PARTY)'],
    { cwd: import.meta.dirname, encoding: 'utf8' });
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

// ---- The Worker against a local D1 that has had the migration applied, persisted in a throwaway directory.
const MIGRATION = readFileSync(new URL('../migrations/0001_saves.sql', import.meta.url), 'utf8');
const dirs = [];
async function openEnv({ dir = path.join(os.tmpdir(), `games-test-${crypto.randomUUID()}`), migrate = true } = {}) {
  dirs.push(dir);
  const proxy = await getPlatformProxy({ configPath: '../wrangler.jsonc', environment: 'dev', persist: { path: dir } });
  if (migrate) {
    const db = proxy.env.DB;
    await db.batch(MIGRATION.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
  return { proxy, dir, env: { ...proxy.env, CLERK_PUBLISHABLE_KEY: 'pk_test_games', CLERK_JWT_KEY: jwtKey, CLERK_ISSUER: ISSUER } };
}

let main;
before(async () => {
  main = await openEnv();
  globalThis.fetch = () => { throw new Error('network call attempted'); };
});
after(async () => {
  await main.proxy.dispose();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const get = async (url, headers = {}, method = 'GET', body, env = main.env) => {
  const res = await worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, { method, headers, body }), env);
  return { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
};

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
  for (const url of ['/api/nope', '/api']) {
    const a = await get(url);
    assert.equal(a.status, 404);
    assert.equal(a.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(a.body), { error: 'not_found' });
  }
  assert.equal((await get('/api/me', {}, 'POST')).status, 405);
  assert.equal((await get('/api/me', {}, 'HEAD')).status, 405);
});

test('/config.js carries the publishable key', async () => {
  const r = await get('/config.js');
  assert.equal(r.status, 200);
  assert.equal(r.body.trim(), 'window.NL_CONFIG = {"clerkPublishableKey":"pk_test_games"};');
  assert.match(r.headers['content-type'], /^text\/javascript/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  const head = await get('/config.js', {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

// ---- The sign-in gate (docs/decisions/0003): pages and files need ClerkJS's __session cookie, verified like a token.
const session = (payload = claims()) => ({ cookie: `theme=dark; __session=${sign(payload)}; other=1` });
const isSignInPage = r => {
  assert.equal(r.status, 401);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.match(r.body, /Sign in to play/);
  assert.match(r.body, /window\.NL_CONFIG = \{"clerkPublishableKey":"pk_test_games"\};/); // filled in: it needs no other file
  assert.doesNotMatch(r.body, /NL_CONFIG = null/);
};

test('signed out, every page and file outside the allowlist answers 401 with the sign-in page in place', async () => {
  for (const p of ['/', '/index.html', '/bank/', '/bank', '/bank/index.html', '/keep/', '/keep/art/hero_1.webp',
    '/style.css', '/platform.js', '/config.js/', '/icons/', '/icons/favicon.svg/', '/ICONS/icon-192.png',
    '/%69cons/icon-192.png', '/signin', '/signin.html', '/a-future-game/deep/asset.png', '/nope.html']) {
    isSignInPage(await get(p));
  }
  const head = await get('/bank/', {}, 'HEAD');
  assert.equal(head.status, 401);
  assert.equal(head.body, '');
});

// A phone fetches these at install time and from the home screen without a usable session.
const INSTALL = ['/manifest.webmanifest', '/apple-touch-icon.png', '/favicon.ico',
  ...readdirSync(new URL('../site/icons/', import.meta.url)).map(f => `/icons/${f}`)];
test('every install file is served signed out with normal caching, and nothing else near them is', async () => {
  for (const p of INSTALL) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.headers['cache-control'] ?? '', /private|no-store/, p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
  assert.equal((await get('/config.js')).status, 200);
  for (const p of ['/icons/nope.png', '/apple-touch-icon-precomposed.png', '/favicon.ico/', '/manifest.json', '/icons/../bank/']) {
    isSignInPage(await get(p));
  }
  const manifest = JSON.parse((await get('/manifest.webmanifest')).body);
  assert.deepEqual([manifest.id, manifest.scope, manifest.start_url, manifest.name, manifest.short_name],
    ['/', '/', '/', 'NordgrenLabs Games', 'Games']);
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
  for (const icon of manifest.icons) assert.ok(INSTALL.includes(icon.src), icon.src);
});

test('a valid cookie gets the real file, private and revalidated, and an unchanged file answers 304', async () => {
  for (const [p, type] of [['/', /text\/html/], ['/bank/', /text\/html/], ['/style.css', /text\/css/], ['/platform.js', /javascript/]]) {
    const r = await get(p, session());
    assert.equal(r.status, 200, p);
    assert.match(r.headers['content-type'], type);
    assert.doesNotMatch(r.body, /Sign in to play/);
    assert.equal(r.headers['cache-control'], 'private, no-cache');
    assert.ok(r.headers.etag, p);
    const again = await get(p, { ...session(), 'if-none-match': r.headers.etag });
    assert.equal(again.status, 304, p);
    assert.equal(again.headers['cache-control'], 'private, no-cache');
    isSignInPage(await get(p, { 'if-none-match': r.headers.etag })); // revalidating signed out gets the sign-in page
  }
  assert.equal((await get('/bank/', session(without('nl_person_id')))).status, 200); // signed in, not yet linked: may play
});

const cookieRefusals = {
  'expired': claims({ exp: now() - 60 }),
  'wrong iss': claims({ iss: 'https://clerk.example.com' }),
  'wrong azp': claims({ azp: 'https://evil.example.com' }),
  'development azp': claims({ azp: DEV }),
  'aud': claims({ aud: PROD }),
  'missing sid': without('sid'),
  'over 4096 characters': claims({ pad: 'x'.repeat(4096) }),
  'nl_person_id not a UUID': claims({ nl_person_id: 'person-1' }),
};
for (const [name, payload] of Object.entries(cookieRefusals)) {
  test(`gate refuses a cookie: ${name}`, async () => isSignInPage(await get('/bank/', session(payload))));
}
test('gate refuses garbage, another key, a look-alike name and an empty cookie', async () => {
  const t = sign(claims());
  for (const cookie of ['__session=a.b.c', `__session=${sign(claims(), { key: rsa().privateKey })}`, `__session-abc=${t}`, `__sessionabc=${t}`,
    `x__session=${t}`, `__Session=${t}`, '__session=', `__session="${t}"`, `__session=${t}%00`]) {
    isSignInPage(await get('/bank/', { cookie }));
  }
});
test('gate accepts the suffixed cookie name ClerkJS also writes, and a fresh one beside a stale one', async () => {
  const t = sign(claims()), stale = sign(claims({ exp: now() - 600, iat: now() - 660, nbf: now() - 660 }));
  for (const cookie of [`__session_AbC123=${t}`, `__session=${stale}; __session_AbC123=${t}`, `__session_AbC123=${stale}; __session=${t}`]) {
    assert.equal((await get('/bank/', { cookie })).status, 200, cookie.slice(0, 24));
  }
  // Only the first few candidates are checked, so a pile of junk cookies cannot buy unlimited signature checks.
  const junk = Array.from({ length: 4 }, (_, i) => `__session_j${i}=a.b.c`).join('; ');
  isSignInPage(await get('/bank/', { cookie: `${junk}; __session=${t}` }));
});
test('a bearer header is not a page session, and a cookie is not an API token', async () => {
  isSignInPage(await get('/bank/', { authorization: bearer(sign(claims())) }));
  const api = await get('/api/me', session());
  assert.equal(api.status, 401);
  assert.deepEqual(JSON.parse(api.body), { error: 'unauthenticated' });
});

test('a path no file matched: 404 for GET and HEAD signed in, 405 with Allow for other methods', async () => {
  assert.equal((await get('/nope.html', session())).status, 404);
  assert.equal((await get('/nope.html', session(), 'HEAD')).body, '');
  for (const p of ['/', '/style.css', '/nope']) {
    const post = await get(p, {}, 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
  }
});

// Static files come only from site/ (config.test.js); nothing outside it is served, signed in or out.
for (const p of ['/server/worker.js', '/SERVER/worker.js', '//server/worker.js', '/server./worker.js',
  '/docs/BUILD-GUIDE.md', '/server/node_modules/@clerk/backend/package.json', '/.git/config', '/.gitattributes',
  '/wrangler.jsonc', '/migrations/0001_saves.sql', '/..%2f..%2f', '/bank/..%5c..%5cserver/worker.js',
  '/bank/%2e%2e/server/worker.js', '/%E0%A4%A', '/nope.html', '/brand/games-icon-1024.png']) {
  test(`worker refuses ${p}`, async () => {
    assert.equal((await get(p, session())).status, 404);
    isSignInPage(await get(p));
  });
}
test('dot segments resolve inside site/ before the gate: /%2e%2e/ is the games list, and only with a session', async () => {
  assert.match((await get('/%2e%2e/', session())).body, /<title>Games/);
  isSignInPage(await get('/%2e%2e/'));
});

// ---- The refuse-to-serve tripwire: names only, never values, on every route the Worker answers.
const clerk = { CLERK_PUBLISHABLE_KEY: 'pk', CLERK_JWT_KEY: jwtKey, CLERK_ISSUER: ISSUER };
const logged = async fn => {
  const lines = [], original = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try { return { result: await fn(), log: lines.join('\n') }; } finally { console.error = original; }
};
test('tripwire accepts exactly the three public names next to other bindings', async () => {
  assert.equal((await get('/config.js', {}, 'GET', undefined, { ...main.env, ...clerk, OTHER: 'x' })).status, 200);
});
test('tripwire refuses a secret or unknown CLERK_ name with 503 and without its value', async () => {
  for (const name of ['CLERK_SECRET_KEY', 'CLERK_API_URL', 'CLERK_']) {
    const env = { ...main.env, ...clerk, [name]: 'sk_live_VALUE' };
    for (const url of ['/api/me', '/config.js', '/nope']) {
      const { result: r, log } = await logged(() => get(url, { authorization: bearer(sign(claims())) }, 'GET', undefined, env));
      assert.equal(r.status, 503);
      assert.deepEqual(JSON.parse(r.body), { error: 'misconfigured' });
      assert.equal(r.headers['cache-control'], 'no-store');
      assert.match(log, new RegExp(`${name} is not allowed`));
      assert.doesNotMatch(log + r.body, /VALUE|pk_test|BEGIN/);
    }
  }
});
test('tripwire refuses a missing name, or one of the three left empty', async () => {
  for (const name of Object.keys(clerk)) {
    const env = { ...main.env, ...clerk };
    delete env[name];
    assert.equal((await logged(() => get('/api/me', {}, 'GET', undefined, env))).result.status, 503);
    assert.equal((await logged(() => get('/api/me', {}, 'GET', undefined, { ...main.env, ...clerk, [name]: '' }))).result.status, 503);
  }
});
test('all three empty is the signed-out dev environment: null config, every API call 401, pages with no gate', async () => {
  const env = { ...main.env, CLERK_PUBLISHABLE_KEY: '', CLERK_JWT_KEY: '', CLERK_ISSUER: '' };
  assert.equal((await get('/config.js', {}, 'GET', undefined, env)).body, 'window.NL_CONFIG = null;\n');
  assert.equal((await get('/api/me', { authorization: bearer(sign(claims())) }, 'GET', undefined, env)).status, 401);
  for (const p of ['/', '/bank/', '/style.css']) { // only Bank and shared files: other games may be absent from a release
    const r = await get(p, {}, 'GET', undefined, env);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.headers['cache-control'], /private/);
  }
  assert.equal((await get('/nope.html', {}, 'GET', undefined, env)).status, 404);
});
test('a partial configuration fails closed on pages too: 503, never an open site', async () => {
  for (const name of Object.keys(clerk)) {
    for (const p of ['/', '/bank/', '/icons/icon-192.png']) {
      const { result } = await logged(() => get(p, session(), 'GET', undefined, { ...main.env, ...clerk, [name]: '' }));
      assert.equal(result.status, 503);
      assert.doesNotMatch(result.body, /Bank|Sign in/);
    }
  }
});
test('the key works on one line, and one that is not a public key refuses every token', async () => {
  const oneLine = jwtKey.replace(/\n/g, '');
  assert.equal((await verify(bearer(sign(claims())), { ...config, jwtKey: oneLine })).ok, true);
  for (const bad of ['jwk', jwtKey.replace(/\n/g, '\\n'), privateKey.export({ type: 'pkcs8', format: 'pem' })]) {
    assert.equal((await verify(bearer(sign(claims())), { ...config, jwtKey: bad })).ok, false);
  }
});

// ---- Saves API: people A and B, through the Worker against the local D1.
const A = PERSON;
const B = '1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5';
const authA = { authorization: bearer(sign(claims())) };
const authB = { authorization: bearer(sign(claims({ nl_person_id: B, sub: 'user_2' }))) };
const record = extra => ({
  schemaVersion: 1, id: crypto.randomUUID(), game: 'bank', personPublicId: null, title: 'Game',
  status: 'in_progress', createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', state: { round: 1 }, ...extra,
});
const put = (rec, auth = authA, id = rec.id, env = main.env) => get(`/api/saves/${id}`, auth, 'PUT', JSON.stringify(rec), env);
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
  const db = main.env.DB;
  const rows = Array.from({ length: MAX_SAVES }, () => record({ personPublicId: C }));
  await db.batch(rows.map(r => db.prepare('INSERT INTO saves VALUES (?, ?, ?, ?, ?)')
    .bind(r.id, C, r.game, r.updatedAt, JSON.stringify(r))));
  const ids = rows.map(r => r.id);
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

test('saves: a database without the schema answers 503 without database text', async () => {
  const broken = await openEnv({ migrate: false });
  try {
    for (const res of [await get('/api/saves?game=bank', authA, 'GET', undefined, broken.env),
      await put(record(), authA, undefined, broken.env), await get(`/api/saves/${crypto.randomUUID()}`, authA, 'DELETE', undefined, broken.env)]) {
      assert.equal(res.status, 503);
      assert.deepEqual(body(res), { error: 'unavailable' });
    }
  } finally {
    await broken.proxy.dispose();
  }
});

test('saves: the local database keeps records across dispose and reopen', async () => {
  const r = record();
  const first = await openEnv();
  try {
    assert.equal((await put(r, authA, r.id, first.env)).status, 200);
  } finally {
    await first.proxy.dispose();
  }
  const again = await openEnv({ dir: first.dir, migrate: false });
  try {
    assert.deepEqual(body(await get(`/api/saves/${r.id}`, authA, 'GET', undefined, again.env)), { ...r, personPublicId: A });
  } finally {
    await again.proxy.dispose();
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
