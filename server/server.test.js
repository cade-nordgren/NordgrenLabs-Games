// Hermetic: a throwaway key pair, hand-signed tokens, and fetch replaced so any outbound call fails the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { verify, AUTHORIZED_PARTY } from './seam.js';
import { checkEnv, createServer } from './index.js';

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
before(async () => {
  server = createServer({ publishableKey: 'pk_test_games', jwtKey, issuer: ISSUER });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

// http.get, not fetch: fetch is disabled, and it would normalise "/%2e%2e/" before sending.
const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  http.request({ host: '127.0.0.1', port, path, headers, method }, res => {
    let body = '';
    res.on('data', c => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject).end();
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
