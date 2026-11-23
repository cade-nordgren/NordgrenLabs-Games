// Crossix's online client: Bomb's site/bomb/ui/net.js pointed at /api/crossix/rooms, against the real Worker and a real
// local D1, as bomb-client.test.js does for Bomb (tokens signed by a throwaway key).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';
import { timing } from './rooms.js';
import { createNet } from '../site/bomb/ui/net.js';

const ISSUER = 'https://clerk.nordgrenlabs.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = person => {
  const t = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: ISSUER, azp: 'https://games.nordgrenlabs.com', sub: `user_${person}`, sid: 's', iat: t - 10, exp: t + 60, nl_person_id: person })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
};

let proxy, env, dir;
before(async () => {
  dir = path.join(os.tmpdir(), `games-crossix-client-${crypto.randomUUID()}`);
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

function phone() {
  const person = crypto.randomUUID(), views = [], urls = [];
  const net = createNet({
    base: '/api/crossix/rooms', auth: async () => ({ Authorization: `Bearer ${tokenFor(person)}` }), onView: v => views.push(v),
    fetch: (url, init) => { urls.push(url); return worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, init), env); },
  });
  return { net, views, urls, last: () => views.at(-1) };
}
const until = async check => {
  for (const end = Date.now() + 3000; Date.now() < end; await new Promise(r => setTimeout(r, 10))) if (check()) return;
  assert.fail('timed out');
};

test('net.js on Crossix rooms: create, join, a roll chosen on both phones, picks hidden until it resolves, leave', async () => {
  const a = phone(), b = phone();
  const made = await a.net.create({ name: 'Ana' });
  assert.equal(made.ok, true);
  assert.ok(a.urls.every(u => u.startsWith('/api/crossix/rooms')), 'every call goes to the Crossix rooms');
  assert.equal((await b.net.join({ code: made.code, name: 'Ben' })).ok, true);
  await until(() => a.last().room.seats.length === 2);
  assert.deepEqual(await a.net.send({ type: 'START' }), { ok: true });
  assert.deepEqual(await a.net.send({ type: 'roll' }), { ok: true });
  await until(() => b.last().game?.turn.phase === 'choose');
  assert.equal((await b.net.send({ type: 'roll' })).reason, 'not_your_turn');
  assert.deepEqual(await b.net.send({ type: 'done', n: 1, picks: { white: 0, colour: null, penalty: false } }), { ok: true });
  await until(() => a.last().game.turn.done[1]);
  assert.equal(a.last().game.turn.picks[1], null, "Ben's pick is hidden from Ana");
  assert.deepEqual(await a.net.send({ type: 'done', n: 1, picks: { white: null, colour: null, penalty: true } }), { ok: true });
  await until(() => b.last().game.turn.n === 2);
  assert.equal(b.last().game.players[0].penalties, 1);
  assert.equal(b.last().game.players[1].marks[0].length, 1);
  assert.equal((await a.net.send({ type: 'LEAVE' })).reason, 'started');
  a.net.close();
  b.net.close();
});
