// Bomb's online client (site/bomb/ui/net.js) against the real Worker and a real local D1, signed in the production way:
// browserAuth() reads ClerkJS after NL.ready, like client.test.js does for platform.js's saves. Only window.Clerk is
// fake: its getToken() hands out tokens signed by a throwaway key, and the first cached one has already expired.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';
import { timing } from './rooms.js';
import { createNet, browserAuth } from '../site/bomb/ui/net.js';

const ISSUER = 'https://clerk.nordgrenlabs.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (person, exp) => {
  const t = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: ISSUER, azp: 'https://games.nordgrenlabs.com', sub: `user_${person}`, sid: 's', iat: t - 10, exp: t + exp, nl_person_id: person })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
};

let proxy, env, dir;
before(async () => {
  dir = path.join(os.tmpdir(), `games-bomb-client-${crypto.randomUUID()}`);
  proxy = await getPlatformProxy({ configPath: '../wrangler.jsonc', environment: 'dev', persist: { path: dir } });
  const db = proxy.env.DB;
  for (const file of ['0001_saves.sql', '0002_rooms.sql']) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  env = { ...proxy.env, CLERK_PUBLISHABLE_KEY: 'pk_test_games', CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }), CLERK_ISSUER: ISSUER };
  Object.assign(timing, { hold: 300, interval: 30 });
});
after(async () => { await proxy.dispose(); rmSync(dir, { recursive: true, force: true }); });

// One phone. browserAuth reads the global window, so only phone A uses it; the others sign their own tokens.
function phone(person, viaWindow) {
  const clerk = { fresh: false, asked: 0, session: { getToken: async opts => {
    clerk.asked++;
    if (opts?.skipCache) clerk.fresh = true;
    return tokenFor(person, clerk.fresh ? 60 : -60); // the cached token outlived its 60 s
  } } };
  if (viaWindow) globalThis.window = { NL_CONFIG: { clerkPublishableKey: 'pk_test_games' }, NL: { ready: Promise.resolve() }, Clerk: clerk };
  const auth = viaWindow ? browserAuth : async () => ({ Authorization: `Bearer ${tokenFor(person, 60)}` });
  const views = [];
  const net = createNet({
    auth, onView: v => views.push(v),
    fetch: (url, init) => worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, init), env),
  });
  return { net, views, clerk, last: () => views.at(-1) };
}
const until = async check => {
  for (const end = Date.now() + 3000; Date.now() < end; await new Promise(r => setTimeout(r, 10))) if (check()) return;
  assert.fail('timed out');
};

test('net.js with ClerkJS tokens: an expired cached token is refreshed once, polls see the others, LEAVE frees the seat', async () => {
  const a = phone(crypto.randomUUID(), true), b = phone(crypto.randomUUID());
  const made = await a.net.create({ name: 'Alex', style: 'cobalt', decks: 1 });
  assert.equal(made.ok, true);
  assert.ok(a.clerk.fresh, 'the 401 made it ask ClerkJS again without its cache');
  assert.equal((await b.net.join({ code: made.code, name: 'Dana', style: 'gold' })).ok, true);
  await until(() => a.last().room.seats.length === 2);
  const asked = a.clerk.asked;
  await new Promise(r => setTimeout(r, timing.hold * 2)); // long polls held to the end, then sent again
  assert.ok(a.clerk.asked > asked, 'every poll asks ClerkJS for the current token');
  assert.deepEqual(await b.net.send({ type: 'LEAVE' }), { ok: true, left: true });
  await until(() => a.last().room.seats.length === 1);
  assert.deepEqual(a.last().room.seats.map(s => s.name), ['Alex']);
  assert.equal((await a.net.send({ type: 'START' })).reason, 'too_few_players');
  assert.deepEqual(await a.net.send({ type: 'LEAVE' }), { ok: true, left: true });
  assert.equal(await env.DB.prepare('SELECT id FROM rooms WHERE id = ?').bind(made.id).first(), null, 'the last one out deletes the room');
  delete globalThis.window;
});
