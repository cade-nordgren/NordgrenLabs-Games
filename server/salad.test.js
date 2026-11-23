// Canadian Salad rooms through the real Worker handler against a real local D1 (as worker.test.js), people signed in
// with hand-signed tokens from a throwaway key pair.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';
import { POLL, cleanName } from './salad.js';
import { expectedTotal } from '../site/salad/engine/score.js';

const ISSUER = 'https://clerk.nordgrenlabs.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = person => {
  const t = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: ISSUER, azp: 'https://games.nordgrenlabs.com', sub: `user_${person}`,
    sid: 'sess_1', iat: t - 10, nbf: t - 10, exp: t + 600, nl_person_id: person })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
};
const P = Array.from({ length: 9 }, () => crypto.randomUUID());
const tokens = new Map(P.map(p => [p, token(p)]));

let proxy, env, dir;
before(async () => {
  dir = path.join(os.tmpdir(), `salad-test-${crypto.randomUUID()}`);
  proxy = await getPlatformProxy({ configPath: '../wrangler.jsonc', environment: 'dev', persist: { path: dir } });
  const db = proxy.env.DB;
  for (const f of ['0001_saves.sql', '0003_salad.sql']) {
    const sql = readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  env = { ...proxy.env, CLERK_PUBLISHABLE_KEY: 'pk_test_games', CLERK_JWT_KEY: jwtKey, CLERK_ISSUER: ISSUER };
  globalThis.fetch = () => { throw new Error('network call attempted'); };
});
after(async () => {
  await proxy.dispose();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (person, method, url, body, headers = {}) => {
  const res = await worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, {
    method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { ...(person ? { authorization: `Bearer ${tokens.get(person)}` } : {}), 'content-type': 'application/json', ...headers },
  }), env);
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers), body: text ? JSON.parse(text) : null };
};
const create = (p, extra = {}) => call(p, 'POST', '/api/salad/rooms', { name: 'Host', color: 'cobalt', ...extra });
const join = (p, code, color = 'scarlet', name = 'Guest') => call(p, 'POST', '/api/salad/rooms/join', { code, name, color });
const get = (p, id, since) => call(p, 'GET', `/api/salad/rooms/${id}${since === undefined ? '' : `?since=${since}`}`);
const act = (p, id, expect, action, actionId = crypto.randomUUID()) =>
  call(p, 'POST', `/api/salad/rooms/${id}/actions`, { action, expect, actionId });
const stored = async id => JSON.parse((await env.DB.prepare('SELECT state FROM salad_rooms WHERE id = ?').bind(id).first()).state);

// A lobby of the first n people, everyone but the host ready. Returns { id, code, v }.
async function lobby(n, config = { capacity: n }, people = P) {
  const c = await create(people[0], { config });
  assert.equal(c.status, 201);
  const { id, code } = c.body.view.room;
  let v = c.body.version;
  for (let i = 1; i < n; i++) v = (await join(people[i], code, ['scarlet', 'forest', 'tangerine', 'violet', 'teal', 'rose', 'gold'][i - 1], `P${i}`)).body.version;
  for (let i = 1; i < n; i++) v = (await act(people[i], id, v, { type: 'SET_READY', ready: true })).body.version;
  return { id, code, v };
}
async function started(n, config) {
  const l = await lobby(n, config);
  const s = await act(P[0], l.id, l.v, { type: 'START' });
  assert.equal(s.status, 200);
  return { ...l, v: s.body.version };
}

test('create: host in seat 0, defaults, cleaned name, no person id or raw state in the answer', async () => {
  const r = await create(P[0], { name: '  A\u0000d‮a\n ' });
  assert.equal(r.status, 201);
  assert.equal(r.headers['cache-control'], 'no-store');
  const { room, game, you } = r.body.view;
  assert.match(room.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  assert.match(room.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(room.config, { capacity: 4, decks: 1, tableTheme: 'felt', scoreDisplay: 'live' });
  assert.deepEqual(room.seats, [{ seat: 0, name: 'Ada', color: 'cobalt', ready: false, connected: true, rematch: false }]);
  assert.equal(room.phase, 'lobby');
  assert.equal(game, null);
  assert.deepEqual(you, { seat: 0, host: true });
  assert.equal(r.body.version, 1);
  assert.doesNotMatch(JSON.stringify(r.body), new RegExp(P[0]));
  assert.equal((await create(P[0], { config: { capacity: 7 } })).body.view.room.config.decks, 2); // default decks follow capacity
});

test('create refuses bad names, colours and configs', async () => {
  for (const [extra, error] of [[{ name: ' \u0001 ' }, 'invalid_name'], [{ name: 5 }, 'invalid_name'], [{ color: 'pink' }, 'invalid_color'],
    [{ config: { capacity: 9 } }, 'invalid_config'], [{ config: { decks: 4 } }, 'invalid_config'], [{ config: { decks: 1.5 } }, 'invalid_config'],
    [{ config: { tableTheme: ['felt'] } }, 'invalid_config'], [{ config: { scoreDisplay: 'never' } }, 'invalid_config'], [{ config: 3 }, 'invalid_config']]) {
    const r = await create(P[0], extra);
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.deepEqual(r.body, { error });
  }
  assert.deepEqual((await call(P[0], 'POST', '/api/salad/rooms', '[]')).body, { error: 'bad_request' });
  assert.equal((await call(P[0], 'POST', '/api/salad/rooms', `{"name":"${'x'.repeat(5000)}"}`)).status, 413);
  assert.equal(cleanName('x'.repeat(30)).length, 20);
});

test('routes: 405 with Allow, 401 without a token, 404 for unknown salad paths', async () => {
  const a = await call(P[0], 'GET', '/api/salad/rooms');
  assert.equal(a.status, 405);
  assert.equal(a.headers.allow, 'POST');
  assert.equal((await call(P[0], 'POST', `/api/salad/rooms/${crypto.randomUUID()}`, {})).headers.allow, 'GET');
  assert.equal((await call(null, 'POST', '/api/salad/rooms', { name: 'x', color: 'sky' })).status, 401);
  assert.equal((await call(P[0], 'GET', '/api/salad/nope')).status, 404);
});

test('join by code: next seat, case and hyphens ignored, twice is the same seat, a taken colour is swapped', async () => {
  const c = await create(P[0]);
  const { code, id } = c.body.view.room;
  const j = await join(P[1], `${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`, 'cobalt', 'Bea');
  assert.equal(j.status, 200);
  assert.deepEqual(j.body.view.you, { seat: 1, host: false });
  assert.equal(j.body.view.room.seats[1].color, 'scarlet'); // cobalt is the host's: first free colour
  assert.equal(j.body.version, 2);
  const again = await join(P[1], code, 'sky', 'Other');
  assert.deepEqual(again.body.view.you, { seat: 1, host: false });
  assert.equal(again.body.version, 2);
  assert.equal(again.body.view.room.seats.length, 2);
  assert.equal((await get(P[0], id)).body.view.room.seats[1].name, 'Bea');
  assert.deepEqual((await join(P[2], 'ZZZZZZ')).body, { error: 'not_found' });
  assert.equal((await join(P[2], 'nope')).status, 404);
});

test('join: full room and started room are 409; a seated player still gets back in after the start', async () => {
  const l = await lobby(2);
  assert.deepEqual(await join(P[2], l.code).then(r => [r.status, r.body]), [409, { error: 'full' }]);
  await act(P[0], l.id, l.v, { type: 'START' });
  const s = await stored(l.id);
  s.config.capacity = 4; // even with room to spare, a running game takes nobody new
  await env.DB.prepare('UPDATE salad_rooms SET state = ? WHERE id = ?').bind(JSON.stringify(s), l.id).run();
  assert.deepEqual(await join(P[2], l.code).then(r => [r.status, r.body]), [409, { error: 'started' }]);
  const back = await join(P[1], l.code);
  assert.equal(back.status, 200);
  assert.equal(back.body.view.you.seat, 1);
  assert.ok(back.body.view.game.you.hand.length > 0);
});

test('a person not seated gets 404 for the room, whatever they try', async () => {
  const l = await started(2);
  for (const r of [await get(P[5], l.id), await get(P[5], l.id, l.v), await act(P[5], l.id, l.v, { type: 'SET_READY', ready: true }),
    await act(P[5], l.id, l.v, { type: 'PLAY_CARD', card: 'd1-2C' }), await get(P[0], crypto.randomUUID()), await get(P[0], 'not-a-uuid')]) {
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'not_found' });
  }
});

test('turn enforcement: only the seat whose turn it is may play, and only a legal card', async () => {
  const l = await started(2);
  const turn = (await stored(l.id)).game.turn;
  const other = 1 - turn;
  const theirs = (await get(P[other], l.id)).body.view.game.you.hand[0];
  const r = await act(P[other], l.id, l.v, { type: 'PLAY_CARD', card: theirs });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'illegal');
  assert.equal(r.body.version, l.v);
  assert.ok(r.body.view.game);
  const mine = (await get(P[turn], l.id)).body.view.game.you.hand;
  assert.equal((await act(P[turn], l.id, l.v, { type: 'PLAY_CARD', card: theirs })).body.error, 'illegal'); // not in my hand
  assert.equal((await act(P[turn], l.id, l.v, { type: 'PLAY_CARD', card: 7 })).body.error, 'bad_request');
  assert.equal((await act(P[turn], l.id, l.v, { type: 'PLAY_CARD', card: mine[0] })).status, 200);
});

test('a repeated actionId is answered as success without applying twice; a stale expect is 409 with the current view', async () => {
  const c = await create(P[0]);
  const { id, code } = c.body.view.room;
  const v = (await join(P[1], code)).body.version;
  const once = await act(P[1], id, v, { type: 'SET_READY', ready: true }, 'ready-action-1');
  assert.equal(once.status, 200);
  assert.equal(once.body.version, v + 1);
  const twice = await act(P[1], id, v, { type: 'SET_READY', ready: true }, 'ready-action-1');
  assert.equal(twice.status, 200);
  assert.equal(twice.body.duplicate, true);
  assert.equal(twice.body.version, v + 1);
  const stale = await act(P[1], id, v, { type: 'SET_READY', ready: false });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'stale');
  assert.equal(stale.body.version, v + 1);
  assert.equal(stale.body.view.room.seats[1].ready, true);
  for (const body of [{ action: { type: 'SET_READY', ready: true }, expect: 'x', actionId: 'abcdefgh' },
    { action: { type: 'SET_READY', ready: true }, expect: v + 1, actionId: 'short' }, { action: 'START', expect: v + 1, actionId: 'abcdefgh' },
    { action: { type: 'DANCE' }, expect: v + 1, actionId: 'abcdefgh' }]) {
    assert.equal((await call(P[1], 'POST', `/api/salad/rooms/${id}/actions`, body)).status, 400, JSON.stringify(body));
  }
});

test('two simultaneous submissions on the same version: exactly one applies', async () => {
  const c = await create(P[0]);
  const { id, code } = c.body.view.room;
  let v = (await join(P[1], code)).body.version;
  v = (await join(P[2], code, 'forest')).body.version;
  const both = await Promise.all([act(P[1], id, v, { type: 'SET_READY', ready: true }), act(P[2], id, v, { type: 'SET_READY', ready: true })]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
  const s = await stored(id);
  assert.equal(s.seats.filter(x => x.ready).length, 1);
  // Two people racing for the last seat: one sits, the other is told it is full, and no stray member row is left.
  const race = await create(P[0], { config: { capacity: 2 } });
  const joins = await Promise.all([join(P[3], race.body.view.room.code), join(P[4], race.body.view.room.code, 'forest')]);
  assert.deepEqual(joins.map(r => r.status).sort(), [200, 409]);
  assert.equal(await env.DB.prepare('SELECT count(*) AS n FROM salad_members WHERE room_id = ?').bind(race.body.view.room.id).first('n'), 2);
  // The same player sending two different cards at once: one card leaves the hand.
  const g = await started(2);
  const turn = (await stored(g.id)).game.turn;
  const legal = (await get(P[turn], g.id)).body.view.game.you.legal;
  const plays = await Promise.all(legal.slice(0, 2).map(card => act(P[turn], g.id, g.v, { type: 'PLAY_CARD', card })));
  assert.deepEqual(plays.map(r => r.status).sort(), [200, 409]);
  const after = (await stored(g.id)).game;
  assert.equal(after.trick.plays.length, 1);
  assert.equal(after.hands[turn].length, 25);
});

test('lobby rules: host-only config and start, readiness, colours, capacity', async () => {
  const c = await create(P[0]);
  const { id, code } = c.body.view.room;
  let v = c.body.version;
  assert.equal((await act(P[0], id, v, { type: 'START' })).body.error, 'not_enough_players');
  v = (await join(P[1], code)).body.version;
  assert.deepEqual(await act(P[1], id, v, { type: 'SET_CONFIG', decks: 2 }).then(r => [r.status, r.body.error]), [403, 'not_host']);
  assert.deepEqual(await act(P[1], id, v, { type: 'START' }).then(r => [r.status, r.body.error]), [403, 'not_host']);
  assert.equal((await act(P[0], id, v, { type: 'START' })).body.error, 'not_ready');
  assert.equal((await act(P[0], id, v, { type: 'SET_CONFIG', capacity: 1 })).body.error, 'invalid_config');
  const cfg = await act(P[0], id, v, { type: 'SET_CONFIG', capacity: 2, decks: 3, tableTheme: 'midnight', scoreDisplay: 'roundEnd' });
  assert.deepEqual(cfg.body.view.room.config, { capacity: 2, decks: 3, tableTheme: 'midnight', scoreDisplay: 'roundEnd' });
  v = cfg.body.version;
  assert.equal((await join(P[2], code)).body.error, 'full');
  assert.equal((await act(P[0], id, v, { type: 'SET_PLAYER', color: 'scarlet' })).body.error, 'color_taken');
  const me = await act(P[1], id, v, { type: 'SET_PLAYER', name: ' Bea ', color: 'sky' });
  assert.deepEqual([me.body.view.room.seats[1].name, me.body.view.room.seats[1].color], ['Bea', 'sky']);
  v = (await act(P[1], id, me.body.version, { type: 'SET_READY', ready: true })).body.version;
  const s = await act(P[0], id, v, { type: 'START' });
  assert.equal(s.status, 200);
  assert.equal(s.body.view.room.phase, 'game');
  assert.deepEqual(s.body.view.game.players, [{ name: 'Host', color: 'cobalt' }, { name: 'Bea', color: 'sky' }]);
  assert.equal(s.body.view.game.decks, 3);
  v = s.body.version;
  for (const action of [{ type: 'SET_CONFIG', decks: 1 }, { type: 'SET_PLAYER', name: 'Late' }, { type: 'SET_READY', ready: false }, { type: 'START' }]) {
    assert.equal((await act(P[0], id, v, action)).body.error, 'wrong_phase', action.type);
  }
  assert.equal((await act(P[0], id, v, { type: 'LEAVE' })).body.error, 'in_game');
});

test('leave: the host passes to the next seat, seats close up, the leaver gets 404, the last one out deletes the room', async () => {
  const l = await lobby(3, { capacity: 4 });
  const left = await act(P[0], l.id, l.v, { type: 'LEAVE' });
  assert.deepEqual(left.body, { version: l.v + 1, view: null });
  assert.equal((await get(P[0], l.id)).status, 404);
  const b = (await get(P[1], l.id)).body;
  assert.deepEqual(b.view.you, { seat: 0, host: true });
  assert.deepEqual(b.view.room.seats.map(s => s.name), ['P1', 'P2']);
  assert.deepEqual((await get(P[2], l.id)).body.view.you, { seat: 1, host: false });
  const back = await join(P[0], l.code, 'cobalt', 'Host'); // rejoining takes the next seat
  assert.deepEqual(back.body.view.you, { seat: 2, host: false });
  let v = back.body.version;
  v = (await act(P[2], l.id, v, { type: 'LEAVE' })).body.version; // a guest leaving: host moves down with the seats
  assert.deepEqual((await get(P[0], l.id)).body.view.you, { seat: 1, host: false });
  v = (await act(P[1], l.id, v, { type: 'LEAVE' })).body.version;
  assert.deepEqual((await get(P[0], l.id)).body.view.you, { seat: 0, host: true });
  await act(P[0], l.id, v, { type: 'LEAVE' });
  assert.equal(await env.DB.prepare('SELECT count(*) AS n FROM salad_rooms WHERE id = ?').bind(l.id).first('n'), 0);
  assert.equal(await env.DB.prepare('SELECT count(*) AS n FROM salad_members WHERE room_id = ?').bind(l.id).first('n'), 0);
});

test('reconnect mid-hand: a new request and a rejoin return the same hand', async () => {
  const l = await started(3);
  const turn = (await stored(l.id)).game.turn;
  const card = (await get(P[turn], l.id)).body.view.game.you.legal[0];
  await act(P[turn], l.id, l.v, { type: 'PLAY_CARD', card });
  const seat = (turn + 2) % 3;
  const first = (await get(P[seat], l.id)).body.view.game.you.hand;
  assert.deepEqual((await get(P[seat], l.id)).body.view.game.you.hand, first);
  assert.deepEqual((await join(P[seat], l.code)).body.view.game.you.hand, first);
  assert.deepEqual((await stored(l.id)).game.hands[seat], first);
});

test('long poll: answers at once without since, waits for a change, and returns the same version after the wait', async () => {
  const saved = { ...POLL };
  Object.assign(POLL, { reads: 40, ms: 25 });
  try {
    const c = await create(P[0]);
    const { id, code } = c.body.view.room;
    const waiting = get(P[0], id, 1);
    await new Promise(ok => setTimeout(ok, 60));
    await join(P[1], code);
    const woke = await waiting;
    assert.equal(woke.body.version, 2);
    assert.equal(woke.body.view.room.seats.length, 2);
    Object.assign(POLL, { reads: 3, ms: 10 });
    const idle = await get(P[0], id, 2);
    assert.equal(idle.status, 200);
    assert.equal(idle.body.version, 2);
    assert.equal((await get(P[0], id, 1)).body.version, 2); // an old since answers at once
  } finally {
    Object.assign(POLL, saved);
  }
});

test('connected dots: polling refreshes lastSeen without a new version; 30 s unseen shows disconnected', async () => {
  const c = await create(P[0]);
  const { id, code } = c.body.view.room;
  await join(P[1], code);
  await env.DB.prepare("UPDATE salad_rooms SET state = json_set(state, '$.seats[1].lastSeen', ?) WHERE id = ?").bind(Date.now() - 31_000, id).run();
  assert.equal((await get(P[0], id)).body.view.room.seats[1].connected, false);
  const own = await get(P[1], id);
  assert.equal(own.body.version, 2);
  assert.equal((await get(P[0], id)).body.view.room.seats[1].connected, true);
  assert.equal((await env.DB.prepare('SELECT version FROM salad_rooms WHERE id = ?').bind(id).first('version')), 2);
});

test('creating a room deletes rooms idle for more than 24 hours, and only those', async () => {
  const old = await create(P[0]);
  const fresh = await create(P[0]);
  await env.DB.prepare('UPDATE salad_rooms SET updated_at = ? WHERE id = ?').bind(new Date(Date.now() - 25 * 3600_000).toISOString(), old.body.view.room.id).run();
  await create(P[1]);
  assert.equal((await get(P[0], old.body.view.room.id)).status, 404);
  assert.equal(await env.DB.prepare('SELECT count(*) AS n FROM salad_members WHERE room_id = ?').bind(old.body.view.room.id).first('n'), 0);
  assert.equal((await get(P[0], fresh.body.view.room.id)).status, 200);
});

test('a whole six-round game over HTTP: private hands throughout, host-only rounds, exact totals, rematch ready-up', async () => {
  const n = 3; // 3 players, 1 deck: 17 each and a one-card kitty
  const l = await started(n);
  let v = l.v;
  let pending = null; // the last action's answer, checked against the state it produced
  const isolated = (body, seat, game) => {
    const text = JSON.stringify(body);
    const secret = [...game.hands.flatMap((h, s) => (s === seat ? [] : h)), ...(game.kittyTo === null ? game.kitty : [])];
    for (const card of secret) assert.ok(!text.includes(`"${card}"`), `seat ${seat} saw ${card}`);
    assert.ok(!text.includes('"rng"'));
    for (const p of P) assert.ok(!text.includes(p));
  };
  for (let steps = 0; ; steps++) {
    assert.ok(steps < 400);
    const game = (await stored(l.id)).game;
    if (pending) isolated(pending.body, pending.seat, game);
    const views = [];
    for (let s = 0; s < n; s++) {
      const r = await get(P[s], l.id);
      isolated(r.body, s, game);
      assert.deepEqual(r.body.view.game.you.hand, game.hands[s]);
      views.push(r.body.view);
    }
    if (game.phase === 'over') break;
    if (game.phase === 'roundEnd') {
      assert.deepEqual(await act(P[1], l.id, v, { type: 'NEXT_ROUND' }).then(r => [r.status, r.body.error]), [403, 'not_host']);
      assert.equal((await act(P[0], l.id, v, { type: 'REMATCH_READY' })).body.error, 'illegal');
      const r = await act(P[0], l.id, v, { type: 'NEXT_ROUND' });
      assert.equal(r.status, 200);
      v = r.body.version;
      pending = { body: r.body, seat: 0 };
      continue;
    }
    if (game.trick.plays.length === 0 && game.trick.n === 1) {
      assert.equal((await act(P[0], l.id, v, { type: 'NEXT_ROUND' })).body.error, 'illegal'); // round still running
    }
    const t = game.turn;
    const r = await act(P[t], l.id, v, { type: 'PLAY_CARD', card: views[t].game.you.legal.at(-1) });
    assert.equal(r.status, 200);
    assert.equal(r.body.version, v + 1);
    v = r.body.version;
    pending = { body: r.body, seat: t };
  }
  const end = (await get(P[2], l.id)).body.view.game;
  assert.equal(end.phase, 'over');
  assert.equal(end.history.length, 6);
  assert.equal(end.totals.reduce((a, b) => a + b, 0), expectedTotal({ players: n, decks: 1 }));
  assert.equal(end.standings.rows.length, n);

  // Rematch: nothing until every seat has voted; a vote can be withdrawn.
  let r = await act(P[1], l.id, v, { type: 'REMATCH_READY' });
  assert.deepEqual(r.body.view.room.seats.map(s => s.rematch), [false, true, false]);
  r = await act(P[0], l.id, r.body.version, { type: 'REMATCH_READY', ready: false });
  r = await act(P[0], l.id, r.body.version, { type: 'REMATCH_READY' });
  assert.equal(r.body.view.game.phase, 'over');
  r = await act(P[2], l.id, r.body.version, { type: 'REMATCH_READY' });
  assert.equal(r.status, 200);
  assert.equal(r.body.view.game.phase, 'play');
  assert.equal(r.body.view.game.round, 1);
  assert.deepEqual(r.body.view.game.totals, [0, 0, 0]);
  assert.deepEqual(r.body.view.room.seats.map(s => s.rematch), [false, false, false]);
  assert.equal(r.body.view.game.you.hand.length, 17);
});

test('X-Dev-Person: ignored in production, honoured only by a development build with Clerk unconfigured', async () => {
  const devEnv = { ...env, CLERK_PUBLISHABLE_KEY: '', CLERK_JWT_KEY: '', CLERK_ISSUER: '' };
  for (const e of [env, devEnv]) {
    const res = await worker.fetch(new Request('https://games.nordgrenlabs.com/api/salad/rooms', { method: 'POST',
      headers: { 'x-dev-person': 'alice' }, body: JSON.stringify({ name: 'A', color: 'sky' }) }), e);
    assert.equal(res.status, 401);
    assert.equal((await worker.fetch(new Request('https://games.nordgrenlabs.com/api/me', { headers: { 'x-dev-person': 'alice' } }), e)).status, 401);
  }
  const script = `globalThis.__GAMES_BUILD_MODE__ = 'development';
    const { default: worker } = await import('./worker.js');
    const ask = (env, h) => worker.fetch(new Request('http://localhost:8787/api/me', { headers: h }), env).then(async r => r.status + ' ' + await r.text());
    const off = { CLERK_PUBLISHABLE_KEY: '', CLERK_JWT_KEY: '', CLERK_ISSUER: '' };
    const on = { CLERK_PUBLISHABLE_KEY: 'pk', CLERK_JWT_KEY: ${JSON.stringify(jwtKey)}, CLERK_ISSUER: '${ISSUER}' };
    console.log([await ask(off, { 'x-dev-person': 'alice' }), await ask(off, { 'x-dev-person': 'bad id!' }), await ask(off, {}),
      await ask(on, { 'x-dev-person': 'alice' })].join('|'));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: import.meta.dirname, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '200 {"personPublicId":"alice"}|401 {"error":"unauthenticated"}|401 {"error":"unauthenticated"}|401 {"error":"unauthenticated"}', r.stderr);
});

test('the changes() guard: a member row is written or moved only when the room update in the same batch won', async () => {
  const c = await create(P[0]);
  const { id } = c.body.view.room;
  const db = env.DB;
  const batch = version => db.batch([
    db.prepare('UPDATE salad_rooms SET version = version + 1 WHERE id = ? AND version = ?').bind(id, version),
    db.prepare('INSERT INTO salad_members (room_id, person_id, seat) SELECT ?, ?, 5 WHERE changes() = 1').bind(id, `x-${version}`),
    db.prepare('UPDATE salad_members SET seat = seat + 10 WHERE room_id = ? AND seat = 5 AND changes() = 1').bind(id),
  ]);
  await batch(99); // stale: nothing happens
  assert.equal(await db.prepare('SELECT count(*) AS n FROM salad_members WHERE room_id = ?').bind(id).first('n'), 1);
  await batch(1);
  assert.equal(await db.prepare('SELECT seat FROM salad_members WHERE room_id = ? AND person_id = ?').bind(id, 'x-1').first('seat'), 15);
});
