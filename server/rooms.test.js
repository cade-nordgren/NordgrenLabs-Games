// Bomb online rooms through the real Worker against a real local D1, the same harness as worker.test.js: a throwaway
// key pair, hand-signed tokens (one per person), and no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';
import { devPerson } from './seam.js';
import { timing, STYLES, IDLE_MS } from './rooms.js';

const ISSUER = 'https://clerk.nordgrenlabs.com';
const PROD = 'https://games.nordgrenlabs.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(extra) {
  const t = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: ISSUER, azp: PROD, sub: 'user_x', sid: 'sess_x', iat: t - 10, exp: t + 600, ...extra })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
}
const P = Array.from({ length: 8 }, () => crypto.randomUUID());

const dir = path.join(os.tmpdir(), `games-rooms-test-${crypto.randomUUID()}`);
let proxy, env, db;
before(async () => {
  proxy = await getPlatformProxy({ configPath: '../wrangler.jsonc', environment: 'dev', persist: { path: dir } });
  db = proxy.env.DB;
  for (const file of ['0001_saves.sql', '0002_rooms.sql']) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  env = { ...proxy.env, CLERK_PUBLISHABLE_KEY: 'pk_test_games', CLERK_JWT_KEY: jwtKey, CLERK_ISSUER: ISSUER };
  globalThis.fetch = () => { throw new Error('network call attempted'); };
  Object.assign(timing, { hold: 400, interval: 40 });
});
after(async () => {
  await proxy.dispose();
  rmSync(dir, { recursive: true, force: true });
});

async function call(person, method, url, body, headers = {}) {
  const auth = person === null ? {} : { authorization: `Bearer ${token(person === undefined ? {} : { nl_person_id: person })}` };
  const res = await worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, {
    method, headers: { ...auth, ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text, headers: Object.fromEntries(res.headers) };
}
const create = (p, body = {}) => call(p, 'POST', '/api/bomb/rooms', { name: 'Host', style: 'cobalt', decks: 1, ...body });
const join = (p, code, body = {}) => call(p, 'POST', '/api/bomb/rooms/join', { code, name: 'Guest', style: 'scarlet', ...body });
const poll = (p, id, since) => call(p, 'GET', `/api/bomb/rooms/${id}${since === undefined ? '' : `?since=${since}`}`);
const act = (p, id, action, expect, actionId = crypto.randomUUID()) =>
  call(p, 'POST', `/api/bomb/rooms/${id}/actions`, { action, expect, actionId });
const version = async id => (await db.prepare('SELECT version FROM rooms WHERE id = ?').bind(id).first()).version;
const rawState = async id => JSON.parse((await db.prepare('SELECT state FROM rooms WHERE id = ?').bind(id).first()).state);

async function room(n, decks = n > 3 ? 2 : 1) {
  const c = await create(P[0], { decks });
  for (let i = 1; i < n; i++) assert.equal((await join(P[i], c.body.view.room.code, { name: `P${i}`, style: STYLES[i] })).status, 200);
  return { id: c.body.id, code: c.body.view.room.code };
}

test('create: the creator is the host in seat 0 of a lobby, with a 6-letter code', async () => {
  const r = await create(P[0], { name: '  Alex  ', extra: 'ignored' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.body.id, /^[0-9a-f-]{36}$/);
  assert.equal(r.body.version, 1);
  assert.match(r.body.view.room.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  assert.deepEqual(r.body.view, {
    room: { id: r.body.id, code: r.body.view.room.code, phase: 'lobby', host: 0, decks: 1, art: ['', '', '', ''], rematch: [], startedAt: null, endedAt: null,
      seats: [{ name: 'Alex', style: 'cobalt', connected: true }] },
    game: null, you: 0,
  });
  assert.doesNotMatch(r.text, new RegExp(P[0]));
});

test('join: players 2 to 6 take the next seats, a 7th is refused, codes are case-insensitive', async () => {
  const c = await create(P[0]);
  const code = c.body.view.room.code;
  for (let i = 1; i < 6; i++) {
    const r = await join(P[i], i % 2 ? code.toLowerCase() : ` ${code} `, { name: `P${i}`, style: STYLES[i] });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, c.body.id);
    assert.equal(r.body.view.you, i);
    assert.equal(r.body.view.room.seats.length, i + 1);
    assert.equal(r.body.version, i + 1);
  }
  const s = await rawState(c.body.id);
  assert.equal(s.decks, 2, 'five players raised the deck count to the smallest allowed');
  assert.equal((await join(P[6], code)).status, 409);
  assert.deepEqual((await join(P[6], code)).body, { error: 'conflict', reason: 'full' });
  assert.deepEqual((await join(P[6], 'ZZZZZZ')).body, { error: 'not_found' });
  assert.equal((await join(P[6], 'ZZZZZZ')).status, 404);
});

test('join: a taken style gets the first free one; joining again is a reconnect that changes nothing', async () => {
  const c = await create(P[0], { style: 'scarlet' });
  const code = c.body.view.room.code;
  const r = await join(P[1], code, { style: 'scarlet' });
  assert.equal(r.body.view.room.seats[1].style, 'cobalt');
  const again = await join(P[1], code, { name: 'Other', style: 'lime' });
  assert.equal(again.status, 200);
  assert.equal(again.body.version, r.body.version);
  assert.deepEqual(again.body.view, r.body.view);
});

test('join after start is refused, but a seated player still reconnects', async () => {
  const { id, code } = await room(2);
  assert.equal((await act(P[0], id, { type: 'START' }, await version(id))).status, 200);
  const r = await join(P[2], code);
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'conflict', reason: 'started' });
  const back = await join(P[1], code);
  assert.equal(back.status, 200);
  assert.equal(back.body.view.you, 1);
  assert.equal(back.body.view.room.phase, 'game');
});

test('lobby: SET_PLAYER, SET_DECKS and START with their permissions', async () => {
  const c = await create(P[0]);
  const id = c.body.id;
  let v = 1;
  const expect409 = async (p, action, reason) => {
    const r = await act(p, id, action, v);
    assert.equal(r.status, 409, reason);
    assert.equal(r.body.reason, reason);
    assert.equal(r.body.version, v);
    assert.ok(r.body.view.room);
  };
  await expect409(P[0], { type: 'START' }, 'too_few_players');
  const j = await join(P[1], c.body.view.room.code);
  v = j.body.version;
  await expect409(P[1], { type: 'SET_DECKS', decks: 2 }, 'not_host');
  await expect409(P[1], { type: 'SET_ART', art: ['honor'] }, 'not_host');
  await expect409(P[1], { type: 'START' }, 'not_host');
  await expect409(P[1], { type: 'SET_PLAYER', name: 'B', style: 'cobalt' }, 'style_taken');
  await expect409(P[1], { type: 'REMATCH' }, 'not_over');
  await expect409(P[1], { type: 'pickUp' }, 'not_started');
  let r = await act(P[1], id, { type: 'SET_PLAYER', name: 'Brooke', style: 'lime' }, v);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.view.room.seats[1], { name: 'Brooke', style: 'lime', connected: true });
  v = r.body.version;
  r = await act(P[0], id, { type: 'SET_DECKS', decks: 3 }, v);
  assert.equal(r.body.view.room.decks, 3);
  v = r.body.version;
  // Deck art: the host picks a picture deck per deck; unknown ids and wrong shapes are refused as bad actions.
  r = await act(P[0], id, { type: 'SET_ART', art: ['honor', '', 'odium'] }, v);
  assert.deepEqual(r.body.view.room.art, ['honor', '', 'odium', '']);
  v = r.body.version;
  for (const art of [['nope'], [], ['honor', '', '', '', ''], 'honor']) assert.equal((await act(P[0], id, { type: 'SET_ART', art }, v)).status, 400);
  for (let i = 2; i < 5; i++) v = (await join(P[i], c.body.view.room.code, { style: STYLES[i] })).body.version;
  r = await act(P[0], id, { type: 'SET_DECKS', decks: 1 }, v);
  v = r.body.version;
  await expect409(P[0], { type: 'START' }, 'decks');
  v = (await act(P[0], id, { type: 'SET_DECKS', decks: 2 }, v)).body.version;
  r = await act(P[0], id, { type: 'START' }, v);
  assert.equal(r.status, 200);
  assert.equal(r.body.view.room.phase, 'game');
  assert.equal(r.body.view.game.phase, 'choose');
  assert.equal(r.body.view.game.players.length, 5);
  assert.equal(r.body.view.game.you.hand.length, 9);
  v = r.body.version;
  await expect409(P[1], { type: 'SET_PLAYER', name: 'X', style: 'gold' }, 'started');
  await expect409(P[0], { type: 'START' }, 'started');
  await expect409(P[2], { type: 'LEAVE' }, 'started');
});

test('leave: seats re-pack, the next seat becomes host, the last one out deletes the room', async () => {
  const { id } = await room(3);
  let r = await act(P[0], id, { type: 'LEAVE' }, await version(id));
  assert.deepEqual(r.body, { version: 4, view: null });
  assert.equal((await poll(P[0], id)).status, 404);
  r = await poll(P[1], id);
  assert.equal(r.body.view.you, 0);
  assert.deepEqual(r.body.view.room.seats.map(s => s.name), ['P1', 'P2']);
  r = await act(P[1], id, { type: 'SET_DECKS', decks: 2 }, r.body.version);
  assert.equal(r.status, 200, 'the new seat 0 is host');
  await act(P[2], id, { type: 'LEAVE' }, r.body.version);
  r = await act(P[1], id, { type: 'LEAVE' }, await version(id));
  assert.equal(r.status, 200);
  assert.equal(await db.prepare('SELECT id FROM rooms WHERE id = ?').bind(id).first(), null);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM room_members WHERE room_id = ?').bind(id).first()).n, 0);
});

// The cards nobody but their owner may see: every hand and face-down card, and face-up choices before play.
async function secretsFor(id, seat) {
  const s = (await rawState(id)).game;
  const ids = [];
  s.deck.forEach(c => ids.push(c.id));
  s.players.forEach(p => p.draw?.forEach(c => ids.push(c.id))); // every own draw pile, the viewer's too
  s.players.forEach((p, i) => {
    p.down.forEach(c => c && ids.push(c.id));
    if (i !== seat) p.hand.forEach(c => ids.push(c.id));
    if (i !== seat && s.phase === 'choose') p.up.forEach(c => c && ids.push(c.id));
  });
  return { ids, rng: s.rng };
}
async function assertPrivate(id, seat, res) {
  assert.ok(res.body.view, 'carries a view');
  const { ids, rng } = await secretsFor(id, seat);
  const text = JSON.stringify(res.body.view.game);
  for (const card of ids) assert.ok(!text.includes(`"${card}"`), `seat ${seat} saw ${card}`);
  assert.ok(!/"rng"|"seed"/.test(res.text));
  assert.ok(!res.text.includes(String(rng)) || String(rng).length < 4);
  for (const p of P) assert.ok(!res.text.includes(p));
}

// Plays a started room to the end through the API, checking privacy on every answer; returns the last answer.
async function playToEnd(id, n, r) {
  for (let seat = 0; seat < n; seat++) {
    r = await poll(P[seat], id);
    await assertPrivate(id, seat, r);
    assert.equal(r.body.view.room.startedAt, null, 'play has not started while choosing');
    const hand = r.body.view.game.you.hand.map(c => c.id);
    r = await act(P[seat], id, { type: 'arrange', ids: hand.slice(0, 4) }, r.body.version);
    assert.equal(r.status, 200);
    await assertPrivate(id, seat, r);
    r = await act(P[seat], id, { type: 'confirm' }, r.body.version);
    assert.equal(r.status, 200);
    await assertPrivate(id, seat, r);
  }
  assert.equal(r.body.view.game.phase, 'play');
  const g0 = r.body.view.game;
  assert.ok(g0.firstWhy && g0.turn === g0.first, 'the first player was picked from the hands at the last confirm');
  assert.equal(typeof r.body.view.room.startedAt, 'number');
  assert.equal(r.body.view.room.endedAt, null);
  let moves = 0, again = 0;
  while (r.body.view.room.phase === 'game') {
    assert.ok(++moves < 3000, 'game ends');
    const turn = r.body.view.game.turn;
    r = await poll(P[turn], id);
    await assertPrivate(id, turn, r);
    const g = r.body.view.game;
    assert.equal(g.pending, null, 'the server applied Next Turn');
    const you = g.you;
    let action;
    if (you.playable.length) {
      const byRank = you.hand.concat(g.players[turn].up.filter(Boolean)).filter(c => you.playable.includes(c.id));
      const low = Math.min(...byRank.map(c => c.rank));
      action = { type: 'play', ids: byRank.filter(c => c.rank === low).map(c => c.id) };
    } else if (you.blind.length) action = { type: 'playDown', slot: you.blind[0] };
    else action = { type: 'pickUp' };
    r = await act(P[turn], id, action, r.body.version);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await assertPrivate(id, turn, r);
    const l = r.body.view.game.last;
    if (r.body.view.room.phase === 'game' && l.type === 'play' && (l.bomb || l.cards[0].rank === 2)) {
      assert.deepEqual([r.body.view.game.turn, r.body.view.game.pending], [turn, null], 'a 2 or a bomb: the same player goes again');
      again++;
    }
    // Someone else's turn: they may not move.
    const other = (turn + 1) % n;
    if (r.body.view.room.phase === 'game' && r.body.view.game.turn !== other) {
      const no = await act(P[other], id, { type: 'pickUp' }, r.body.version);
      assert.equal(no.status, 409);
      assert.equal(no.body.reason, 'illegal');
      await assertPrivate(id, other, no);
    }
  }
  assert.equal(r.body.view.room.phase, 'over');
  assert.equal(typeof r.body.view.game.winner, 'number');
  assert.ok(moves > 20, `${moves} moves`);
  assert.ok(again > 0, 'the game had a 2 or a bomb');
  return r;
}

test('a full scripted game through the API: nobody ever sees another player\'s cards, turns pass by themselves, then a rematch', async () => {
  const n = 3;
  const { id } = await room(n);
  let r = await playToEnd(id, n, await act(P[0], id, { type: 'START' }, await version(id)));
  const { startedAt, endedAt } = r.body.view.room;
  assert.ok(Number.isInteger(endedAt) && endedAt >= startedAt, 'game time from the server clock');
  const winnerView = await poll(P[1], id);
  assert.equal(winnerView.body.view.game.phase, 'over');

  r = await act(P[0], id, { type: 'REMATCH' }, r.body.version);
  assert.deepEqual(r.body.view.room.rematch, [0]);
  r = await act(P[2], id, { type: 'REMATCH' }, r.body.version);
  assert.deepEqual(r.body.view.room.rematch, [0, 2]);
  assert.equal(r.body.view.room.phase, 'over');
  r = await act(P[1], id, { type: 'REMATCH' }, r.body.version);
  assert.equal(r.body.view.room.phase, 'game');
  assert.deepEqual(r.body.view.room.rematch, []);
  assert.equal(r.body.view.game.phase, 'choose');
  assert.equal(r.body.view.game.players.length, n);
  assert.equal(r.body.view.room.startedAt, null, 'a rematch starts a new clock');
  await assertPrivate(id, 1, r);
});

test('leave after a finished game: the rest go back to the lobby, re-packed, and can start again or be joined', async () => {
  const n = 3;
  const { id, code } = await room(n);
  let r = await playToEnd(id, n, await act(P[0], id, { type: 'START' }, await version(id)));
  r = await act(P[2], id, { type: 'REMATCH' }, 0);
  assert.deepEqual(r.body.view.room.rematch, [2]);
  r = await act(P[0], id, { type: 'LEAVE' }, 0); // a stale expect is fine for room-level actions
  assert.equal(r.status, 200);
  assert.equal(r.body.view, null);
  assert.equal((await poll(P[0], id)).status, 404);
  r = await poll(P[1], id);
  assert.equal(r.body.view.room.phase, 'lobby');
  assert.equal(r.body.view.game, null);
  assert.equal(r.body.view.you, 0, 'the next seat is host');
  assert.deepEqual(r.body.view.room.rematch, [], 'votes are discarded');
  assert.deepEqual(r.body.view.room.seats.map(s => s.name), ['P1', 'P2']);
  assert.equal(r.body.view.room.startedAt, null);
  assert.equal(r.body.view.room.endedAt, null);
  assert.equal((await act(P[2], id, { type: 'LEAVE' }, 0)).status, 200);
  const j = await join(P[5], code, { name: 'New', style: 'sky' });
  assert.equal(j.status, 200, 'a room of one can be joined again by code');
  assert.equal(j.body.view.you, 1);
  r = await act(P[1], id, { type: 'START' }, 0);
  assert.equal(r.status, 200);
  assert.equal(r.body.view.room.phase, 'game');
  const no = await act(P[5], id, { type: 'LEAVE' }, r.body.version);
  assert.equal(no.status, 409);
  assert.equal(no.body.reason, 'started', 'leaving a game in progress is not supported');
});

test('simultaneous room-level actions all apply: every rematch vote counts', async () => {
  const n = 4;
  const { id } = await room(n);
  await playToEnd(id, n, await act(P[0], id, { type: 'START' }, await version(id)));
  const v = await version(id);
  const votes = await Promise.all(P.slice(0, n).map(p => act(p, id, { type: 'REMATCH' }, v)));
  assert.deepEqual(votes.map(r => r.status), [200, 200, 200, 200]);
  assert.equal((await poll(P[0], id)).body.view.room.phase, 'game');
  assert.equal(await version(id), v + n);
});

test('stale expect is 409 with the current version and view; a repeated actionId applies once', async () => {
  const { id } = await room(2);
  const v = await version(id);
  const actionId = 'retry-1';
  const first = await act(P[1], id, { type: 'SET_PLAYER', name: 'Once', style: 'gold' }, v, actionId);
  assert.equal(first.status, 200);
  const again = await act(P[1], id, { type: 'SET_PLAYER', name: 'Once', style: 'gold' }, v, actionId);
  assert.equal(again.status, 200);
  assert.equal(again.body.version, first.body.version);
  assert.equal(await version(id), v + 1);
  // The same actionId from a different person is a different action; room-level actions ignore a stale expect.
  const late = await act(P[0], id, { type: 'SET_DECKS', decks: 2 }, v, actionId);
  assert.equal(late.status, 200);
  assert.equal(late.body.version, v + 2);
  const started = await act(P[0], id, { type: 'START' }, v);
  assert.equal(started.status, 200);
  // Game actions keep a strict expect.
  const hand = started.body.view.game.you.hand.map(c => c.id);
  const stale = await act(P[0], id, { type: 'arrange', ids: hand.slice(0, 4) }, v);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.reason, 'stale');
  assert.equal(stale.body.version, v + 3);
  assert.equal(stale.body.view.room.seats[1].name, 'Once');
});

test('two simultaneous actions on the same version: exactly one applies', async () => {
  for (let round = 0; round < 3; round++) {
    const { id } = await room(2);
    const v = await version(id);
    const [a, b] = await Promise.all([
      act(P[0], id, { type: 'SET_PLAYER', name: 'A', style: 'gold' }, v),
      act(P[1], id, { type: 'SET_PLAYER', name: 'B', style: 'gold' }, v),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal((a.status === 409 ? a : b).body.reason, 'style_taken', 'the second is re-checked against the first');
    assert.equal(await version(id), v + 1);
    const s = await rawState(id);
    assert.equal(s.seats.filter(x => x.style === 'gold').length, 1);
  }
});

test('not seated means not found; signed out and unlinked get what the rest of the API gives', async () => {
  const { id, code } = await room(2);
  const v = await version(id);
  assert.deepEqual((await poll(P[7], id)).body, { error: 'not_found' });
  assert.equal((await poll(P[7], id)).status, 404);
  assert.equal((await act(P[7], id, { type: 'START' }, v)).status, 404);
  assert.equal((await poll(P[0], crypto.randomUUID())).status, 404);
  assert.equal((await poll(P[0], 'not-a-uuid')).status, 404);
  for (const [method, url, body] of [['POST', '/api/bomb/rooms', {}], ['POST', '/api/bomb/rooms/join', { code }],
    ['GET', `/api/bomb/rooms/${id}`], ['POST', `/api/bomb/rooms/${id}/actions`, {}]]) {
    const out = await call(null, method, url, body);
    assert.equal(out.status, 401, url);
    assert.deepEqual(out.body, { error: 'unauthenticated' });
    const unlinked = await call(undefined, method, url, body);
    assert.equal(unlinked.status, 403, url);
    assert.deepEqual(unlinked.body, { error: 'not_associated' });
  }
  for (const [method, url, allow] of [['GET', '/api/bomb/rooms', 'POST'], ['GET', '/api/bomb/rooms/join', 'POST'],
    ['POST', `/api/bomb/rooms/${id}`, 'GET'], ['GET', `/api/bomb/rooms/${id}/actions`, 'POST'], ['DELETE', `/api/bomb/rooms/${id}`, 'GET']]) {
    const out = await call(null, method, url);
    assert.equal(out.status, 405, `${method} ${url}`);
    assert.equal(out.headers.allow, allow);
  }
  for (const url of ['/api/bomb', '/api/bomb/rooms/', `/api/bomb/rooms/${id}/actions/x`, '/api/bomb/other']) {
    assert.equal((await call(P[0], 'GET', url)).status, 404, url);
  }
});

test('long poll: answers at once without since, promptly on a change, and with the version alone at timeout', async () => {
  const { id } = await room(2);
  const v = await version(id);
  let r = await poll(P[1], id);
  assert.equal(r.body.version, v);
  assert.ok(r.body.view);
  r = await poll(P[1], id, v - 1);
  assert.ok(r.body.view, 'an old since answers at once');

  let t = Date.now();
  r = await poll(P[1], id, v);
  const waited = Date.now() - t;
  assert.deepEqual(r.body, { version: v });
  assert.ok(waited >= timing.hold - timing.interval && waited < timing.hold + 1000, `held ${waited} ms`);

  t = Date.now();
  const pending = poll(P[1], id, v);
  await new Promise(ok => setTimeout(ok, 100));
  await act(P[0], id, { type: 'SET_DECKS', decks: 2 }, v);
  r = await pending;
  const took = Date.now() - t;
  assert.equal(r.body.version, v + 1);
  assert.equal(r.body.view.room.decks, 2);
  assert.ok(took < timing.hold, `answered after ${took} ms`);

  assert.equal((await poll(P[1], id, 'abc')).status, 400);
  assert.equal((await poll(P[1], id, '-1')).status, 400);
});

test('long poll stops early when the client has gone', async () => {
  const { id } = await room(2);
  const v = await version(id);
  const ac = new AbortController();
  ac.abort();
  const t = Date.now();
  const res = await worker.fetch(new Request(`https://games.nordgrenlabs.com/api/bomb/rooms/${id}?since=${v}`, {
    headers: { authorization: `Bearer ${token({ nl_person_id: P[0] })}` }, signal: ac.signal,
  }), env);
  assert.deepEqual(await res.json(), { version: v });
  assert.ok(Date.now() - t < timing.hold / 2);
});

test('connected: from the last poll, coarse, and refreshed without a write on every poll', async () => {
  const { id } = await room(2);
  await db.prepare('UPDATE room_members SET seen = ? WHERE room_id = ? AND person_id = ?').bind(Date.now() - 120000, id, P[1]).run();
  let r = await poll(P[0], id);
  assert.deepEqual(r.body.view.room.seats.map(s => s.connected), [true, false]);
  await poll(P[1], id);
  r = await poll(P[0], id);
  assert.deepEqual(r.body.view.room.seats.map(s => s.connected), [true, true]);
  const seen = (await db.prepare('SELECT seen FROM room_members WHERE room_id = ? AND person_id = ?').bind(id, P[1]).first()).seen;
  await poll(P[1], id);
  assert.equal((await db.prepare('SELECT seen FROM room_members WHERE room_id = ? AND person_id = ?').bind(id, P[1]).first()).seen, seen);
});

test('rooms idle for more than a day are deleted when a room is created', async () => {
  const old = await room(2);
  const fresh = await room(2);
  await db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').bind(Date.now() - IDLE_MS - 1000, old.id).run();
  await create(P[3]);
  assert.equal((await poll(P[0], old.id)).status, 404);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM room_members WHERE room_id = ?').bind(old.id).first()).n, 0);
  assert.equal((await poll(P[0], fresh.id)).status, 200);
});

test('input validation: 400 with the field, 413 over 4 KB, unknown fields ignored', async () => {
  const bad = [
    [{ name: '', style: 'cobalt', decks: 1 }, 'name'], [{ name: '   ', style: 'cobalt', decks: 1 }, 'name'],
    [{ name: 'x'.repeat(21), style: 'cobalt', decks: 1 }, 'name'], [{ name: 'a\u0007b', style: 'cobalt', decks: 1 }, 'name'],
    [{ name: 7, style: 'cobalt', decks: 1 }, 'name'], [{ name: 'A', style: 'Cobalt', decks: 1 }, 'style'],
    [{ name: 'A', style: 'pink', decks: 1 }, 'style'], [{ name: 'A', style: 'cobalt', decks: 0 }, 'decks'],
    [{ name: 'A', style: 'cobalt', decks: 5 }, 'decks'], [{ name: 'A', style: 'cobalt', decks: '1' }, 'decks'],
    [{ name: 'A', style: 'cobalt', decks: 1.5 }, 'decks'], ['not json', 'body'], [[1, 2], 'body'], ['null', 'body'],
  ];
  for (const [body, reason] of bad) {
    const r = await call(P[0], 'POST', '/api/bomb/rooms', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.deepEqual(r.body, { error: 'invalid', reason });
  }
  assert.equal((await create(P[0], { name: 'x'.repeat(20) })).status, 200);
  assert.equal((await call(P[0], 'POST', '/api/bomb/rooms', { name: 'A', style: 'cobalt', decks: 1, pad: 'x'.repeat(5000) })).status, 413);
  for (const [code, reason] of [['ABC', 'code'], ['ABCDEFG', 'code'], ['ABC12D', 'code'], [123456, 'code']]) {
    assert.deepEqual((await join(P[1], code)).body, { error: 'invalid', reason });
  }
  assert.equal((await join(P[1], 'ABCDEF', { name: '' })).body.reason, 'name');

  const { id } = await room(2);
  const v = await version(id);
  const actions = [
    [{ action: { type: 'next' }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'START' }, expect: v, actionId: 'has space' }, 'actionId'],
    [{ action: { type: 'START' }, expect: v, actionId: 'x'.repeat(65) }, 'actionId'],
    [{ action: { type: 'START' }, expect: v }, 'actionId'],
    [{ action: { type: 'START' }, expect: -1, actionId: 'a' }, 'expect'],
    [{ action: { type: 'START' }, expect: '3', actionId: 'a' }, 'expect'],
    [{ action: { type: 'START' }, actionId: 'a' }, 'expect'],
    [{ expect: v, actionId: 'a' }, 'action'],
    [{ action: 'START', expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'start' }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'SET_DECKS', decks: 9 }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'SET_PLAYER', name: '', style: 'gold' }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'SET_PLAYER', name: 'A', style: 'pink' }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'arrange', ids: ['AS0', 'KS0', 'QS0'] }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'play', ids: [] }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'play', ids: ['XS0'] }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'play', ids: Array(17).fill('AS0') }, expect: v, actionId: 'a' }, 'action'],
    [{ action: { type: 'playDown', slot: 4 }, expect: v, actionId: 'a' }, 'action'],
  ];
  for (const [body, reason] of actions) {
    const r = await call(P[0], 'POST', `/api/bomb/rooms/${id}/actions`, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.deepEqual(r.body, { error: 'invalid', reason });
  }
  assert.equal(await version(id), v);
  // Prototype keys are plain data: they neither throw nor reach the room.
  const proto = await call(P[1], 'POST', `/api/bomb/rooms/${id}/actions`,
    `{"action":{"type":"SET_PLAYER","name":"Proto","style":"gold","__proto__":{"seat":0},"constructor":1},"expect":${v},"actionId":"p1","__proto__":{"x":1}}`);
  assert.equal(proto.status, 200);
  assert.deepEqual(proto.body.view.room.seats.map(s => s.name), ['Host', 'P1'].map((n, i) => i === 1 ? 'Proto' : n));
  assert.equal((await call(P[1], 'POST', `/api/bomb/rooms/${id}/actions`, '{"action":{"type":"__proto__"},"expect":1,"actionId":"p2"}')).status, 400);
  const v2 = await version(id);
  // The phone cannot choose its seat: a seat in the action is overwritten.
  const r = await act(P[1], id, { type: 'SET_DECKS', decks: 2, seat: 0 }, v2);
  assert.equal(r.body.reason, 'not_host');
});

test('dev identity: only a development build with sign-in off reads X-NL-Dev-Person', async () => {
  const person = crypto.randomUUID();
  assert.equal(devPerson(person, ''), null, 'this test runs the production build');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `globalThis.__GAMES_BUILD_MODE__ = "development"; const { devPerson } = await import("./seam.js");
     console.log(JSON.stringify([devPerson("${person}", ""), devPerson("${person}", "key"), devPerson("${person.toUpperCase()}", ""), devPerson(undefined, "")]))`],
    { cwd: import.meta.dirname, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout), [person, null, null, null]);
  // Through the production Worker with sign-in off, the header is ignored.
  const signedOut = { ...env, CLERK_PUBLISHABLE_KEY: '', CLERK_JWT_KEY: '', CLERK_ISSUER: '' };
  const res = await worker.fetch(new Request('https://games.nordgrenlabs.com/api/bomb/rooms', {
    method: 'POST', headers: { 'x-nl-dev-person': person }, body: JSON.stringify({ name: 'A', style: 'cobalt', decks: 1 }),
  }), signedOut);
  assert.equal(res.status, 401);
});
