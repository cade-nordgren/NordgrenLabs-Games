// Crossix online rooms through the real Worker against a real local D1, the same harness as rooms.test.js: a throwaway
// key pair, hand-signed tokens (one per person), and no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';
import { timing } from './rooms.js';
import { validState, rollers, rollWinner } from '../site/crossix/engine/reducer.js';
import { pickOptions, noPicks } from '../site/crossix/engine/moves.js';
import { MAX_PENALTIES } from '../site/crossix/engine/lanes.js';

const ISSUER = 'https://clerk.nordgrenlabs.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(person) {
  const t = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: ISSUER, azp: 'https://games.nordgrenlabs.com', sub: 'user_x', sid: 's', iat: t - 10, exp: t + 600, nl_person_id: person })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
}
const P = Array.from({ length: 10 }, () => crypto.randomUUID());

const dir = path.join(os.tmpdir(), `games-crossix-test-${crypto.randomUUID()}`);
let proxy, env, db;
before(async () => {
  proxy = await getPlatformProxy({ configPath: '../wrangler.jsonc', environment: 'dev', persist: { path: dir } });
  db = proxy.env.DB;
  for (const file of ['0001_saves.sql', '0002_rooms.sql']) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  env = { ...proxy.env, CLERK_PUBLISHABLE_KEY: 'pk_test_games', CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }), CLERK_ISSUER: ISSUER };
  globalThis.fetch = () => { throw new Error('network call attempted'); };
  Object.assign(timing, { hold: 300, interval: 30 });
});
after(async () => {
  await proxy.dispose();
  rmSync(dir, { recursive: true, force: true });
});

const BASE = '/api/crossix/rooms';
async function call(person, method, url, body) {
  const res = await worker.fetch(new Request(`https://games.nordgrenlabs.com${url}`, {
    method, headers: { authorization: `Bearer ${token(person)}` }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}
const create = (p, name = 'Host') => call(p, 'POST', BASE, { name });
const join = (p, code, name = 'Guest') => call(p, 'POST', `${BASE}/join`, { code, name });
const poll = (p, id, since) => call(p, 'GET', `${BASE}/${id}${since === undefined ? '' : `?since=${since}`}`);
const act = (p, id, action, expect, actionId = crypto.randomUUID()) => call(p, 'POST', `${BASE}/${id}/actions`, { action, expect, actionId });
const version = async id => (await db.prepare('SELECT version FROM rooms WHERE id = ?').bind(id).first()).version;
const rawGame = async id => JSON.parse((await db.prepare('SELECT state FROM rooms WHERE id = ?').bind(id).first()).state).game;
const away = (id, p) => db.prepare('UPDATE room_members SET seen = ? WHERE room_id = ? AND person_id = ?').bind(Date.now() - 61000, id, p).run();

async function room(n) {
  const c = await create(P[0]);
  for (let i = 1; i < n; i++) assert.equal((await join(P[i], c.body.view.room.code, `P${i}`)).status, 200);
  return { id: c.body.id, code: c.body.view.room.code };
}
// The stored roll for first player is the server's own: each seat a D6, only those tied for the highest again.
function assertRolls(g) {
  const n = g.players.length;
  assert.ok(g.rolls.length >= 1);
  g.rolls.forEach((round, k) => {
    const who = rollers(g.rolls.slice(0, k), n);
    assert.ok(who.length > 1, 'no round after it is decided');
    round.forEach((d, i) => assert.ok(who.includes(i) ? Number.isInteger(d) && d >= 1 && d <= 6 : d === null, `round ${k} seat ${i}`));
  });
  const last = g.rolls.at(-1), top = Math.max(...last.filter(d => d !== null));
  assert.equal(last[g.first], top, 'the first seat rolled the highest');
  assert.equal(last.filter(d => d === top).length, 1, 'and alone');
  assert.equal(rollWinner(g.rolls, n), g.first);
  assert.equal(g.turn.active, g.first, 'the turn starts there');
}
// Started with seat 0 first (stored as if seat 0 won the roll), so a test knows who rolls.
async function started(n) {
  const r = await room(n);
  const s = await act(P[0], r.id, { type: 'START' }, await version(r.id));
  assert.equal(s.status, 200);
  assertRolls(s.body.view.game);
  const rolls = JSON.stringify([[6, ...Array(n - 1).fill(1)]]);
  await db.prepare("UPDATE rooms SET state = json_set(state, '$.game.first', 0, '$.game.turn.active', 0, '$.game.rolls', json(?)) WHERE id = ?").bind(rolls, r.id).run();
  assert.ok(validState(await rawGame(r.id)));
  return { ...r, v: s.body.version, view: (await poll(P[0], r.id)).body.view };
}
// Puts known dice on the roll in the stored state (the engine treats state as data), keeping it valid.
async function setDice(id, dice) {
  const s = JSON.parse((await db.prepare('SELECT state FROM rooms WHERE id = ?').bind(id).first()).state);
  s.game.turn.dice = dice;
  assert.ok(validState(s.game));
  await db.prepare('UPDATE rooms SET state = ? WHERE id = ?').bind(JSON.stringify(s), id).run();
}
const pick = (white = null, colour = null, penalty = false) => ({ white, colour, penalty });

// Nothing private in any answer: no seed or dice to come, no person ids, and no picks but the reader's own before the
// roll resolves (only their own "white" key can appear in the text).
function assertPrivate(res, seat) {
  assert.ok(!/"rng"|"seed"/.test(res.text), 'no seed or rng');
  for (const p of P) assert.ok(!res.text.includes(p), 'no person id');
  const t = res.body.view?.game?.turn;
  if (t?.phase === 'choose') {
    t.picks.forEach((k, i) => assert.ok(i === seat || k === null, `seat ${seat} saw seat ${i}'s picks`));
    assert.ok((res.text.match(/"white"/g) || []).length <= 1, 'one set of picks at most');
  }
}

test('create, join, start: a room of up to 8 with a 6-letter code; a 9th is refused; Bomb and Crossix never mix', async () => {
  const c = await create(P[0], ' Ana ');
  assert.equal(c.status, 200);
  assert.deepEqual(c.body.view, {
    room: { id: c.body.id, code: c.body.view.room.code, phase: 'lobby', host: 0, rematch: [], startedAt: null, endedAt: null,
      seats: [{ name: 'Ana', id: 0, connected: true }] },
    game: null, you: 0,
  });
  const code = c.body.view.room.code;
  for (let i = 1; i < 8; i++) {
    const r = await join(P[i], i % 2 ? code.toLowerCase() : code, `P${i}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.view.you, i);
  }
  assert.deepEqual((await join(P[8], code)).body, { error: 'conflict', reason: 'full' });
  // A Crossix code is not a Bomb room, a Crossix room is not reachable through Bomb's routes, and the other way round.
  assert.equal((await call(P[8], 'POST', '/api/bomb/rooms/join', { code, name: 'B', style: 'gold' })).status, 404);
  assert.equal((await call(P[0], 'GET', `/api/bomb/rooms/${c.body.id}`)).status, 404);
  assert.equal((await call(P[0], 'POST', `/api/bomb/rooms/${c.body.id}/actions`, { action: { type: 'START' }, expect: 1, actionId: 'x' })).status, 404);
  const bomb = await call(P[9], 'POST', '/api/bomb/rooms', { name: 'B', style: 'gold', decks: 1 });
  assert.equal((await join(P[8], bomb.body.view.room.code)).status, 404);
  assert.equal((await poll(P[9], bomb.body.id)).status, 404);
  const s = await act(P[0], c.body.id, { type: 'START' }, await version(c.body.id));
  assert.equal(s.status, 200);
  const g = s.body.view.game;
  assert.equal(g.players.length, 8);
  assert.equal(g.mode, 'digital');
  assert.deepEqual([g.turn.phase, g.turn.n], ['roll', 1]);
  assertRolls(g);
  assert.ok(validState(await rawGame(c.body.id)));
  assertPrivate(s, 0);
  assert.deepEqual((await join(P[8], code)).body, { error: 'conflict', reason: 'started' });
  assert.equal((await join(P[3], code)).body.view.you, 3, 'a seated player reconnects');
});

test('lobby permissions: only the host starts, with two or more; leave re-packs; not seated is not found', async () => {
  const c = await create(P[0]);
  const id = c.body.id;
  assert.equal((await act(P[0], id, { type: 'START' }, 1)).body.reason, 'too_few_players');
  await join(P[1], c.body.view.room.code);
  assert.equal((await act(P[1], id, { type: 'START' }, 0)).body.reason, 'not_host');
  assert.equal((await act(P[1], id, { type: 'roll' }, await version(id))).body.reason, 'not_started');
  assert.equal((await poll(P[5], id)).status, 404);
  assert.equal((await act(P[5], id, { type: 'START' }, 0)).status, 404);
  const r = await act(P[0], id, { type: 'LEAVE' }, 0);
  assert.deepEqual(r.body.view, null);
  const left = await poll(P[1], id);
  assert.equal(left.body.view.you, 0, 'the next seat is host');
  assert.equal((await act(P[1], id, { type: 'LEAVE' }, 0)).status, 200);
  assert.equal(await db.prepare('SELECT id FROM rooms WHERE id = ?').bind(id).first(), null, 'the last one out deletes the room');
});

test('a roll: only the active seat rolls; everyone picks at once; Done checks the picks; reopen; the last Done resolves', async () => {
  const { id, v } = await started(3);
  assert.equal((await act(P[1], id, { type: 'roll' }, v)).body.reason, 'not_your_turn');
  assert.equal((await act(P[0], id, { type: 'roll' }, v - 1)).body.reason, 'stale');
  let r = await act(P[0], id, { type: 'roll' }, v);
  assert.equal(r.status, 200);
  assert.equal(r.body.view.game.turn.phase, 'choose');
  assertPrivate(r, 0);
  // Whites 3 and 4 (sum 7), red 1, yellow 2, green 6, blue 5.
  await setDice(id, { w: [3, 4], c: [1, 2, 6, 5] });
  const n = 1;
  const done = (p, picks, extra = {}) => act(P[p], id, { type: 'done', n, picks, ...extra }, 0);
  // Illegal picks: a colour by a non-active player, a colour sum not on that lane, nothing for the roller, both a pick
  // and a penalty, the wrong roll.
  assert.equal((await done(1, pick(null, { lane: 2, die: 0 }))).body.reason, 'illegal');
  assert.equal((await done(0, pick(null, null))).body.reason, 'illegal', 'the roller needs a pick or the penalty');
  assert.equal((await done(0, pick(0, null, true))).status, 400);
  assert.equal((await act(P[1], id, { type: 'done', n: 2, picks: pick(0) }, 0)).body.reason, 'stale');
  // A seat acts only for itself: a player field is dropped.
  r = await done(1, pick(2), { player: 0 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.view.game.turn.done, [false, true, false]);
  assert.deepEqual(r.body.view.game.turn.picks[1], { white: 2, colour: null, penalty: false }, 'their own picks come back to them');
  assertPrivate(r, 1);
  for (const seat of [0, 2]) assertPrivate(await poll(P[seat], id), seat);
  assert.equal((await done(1, pick(3))).body.reason, 'illegal', 'done twice');
  r = await act(P[1], id, { type: 'reopen', n }, 0);
  assert.deepEqual(r.body.view.game.turn.done, [false, false, false]);
  assert.deepEqual(r.body.view.game.turn.picks[1], { white: 2, colour: null, penalty: false }, 'reopened picks are kept');
  assert.equal((await act(P[1], id, { type: 'reopen', n }, 0)).body.reason, 'illegal');
  r = await done(1, pick(3)); // changed their mind: blue 7
  assert.equal(r.status, 200);
  // Roller: white 7 on yellow, then white 4 + green 6 = 10. Seat 2 marks nothing.
  r = await done(0, pick(1, { lane: 2, die: 1 }));
  assertPrivate(r, 0);
  r = await done(2, pick());
  assert.equal(r.status, 200);
  const g = r.body.view.game;
  assert.deepEqual([g.turn.phase, g.turn.active, g.turn.n], ['roll', 1, 2], 'resolved: the next seat rolls');
  assert.deepEqual(g.turn.picks, []);
  assert.deepEqual(g.players[0].marks, [[], [5], [2], []]);
  assert.deepEqual(g.players[1].marks, [[], [], [], [5]]);
  assert.deepEqual(g.players[2].marks, [[], [], [], []]);
  assert.ok(validState(await rawGame(id)));
  assert.equal((await act(P[1], id, { type: 'reopen', n }, 0)).body.reason, 'stale', 'a late reopen never reaches the next roll');
});

test('stale expect on a roll is 409 with the view; a repeated actionId applies once; simultaneous Dones all count', async () => {
  const { id, v } = await started(4);
  let r = await act(P[0], id, { type: 'roll' }, v, 'roll-1');
  const again = await act(P[0], id, { type: 'roll' }, v, 'roll-1');
  assert.equal(again.status, 200);
  assert.equal(again.body.version, r.body.version);
  assert.equal(await version(id), v + 1);
  const stale = await act(P[0], id, { type: 'roll' }, v);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.reason, 'stale');
  assert.equal(stale.body.version, v + 1);
  assert.equal(stale.body.view.game.turn.phase, 'choose');
  await setDice(id, { w: [1, 1], c: [1, 1, 1, 1] });
  const outs = await Promise.all([1, 2, 3].map(p => act(P[p], id, { type: 'done', n: 1, picks: pick() }, v)));
  assert.deepEqual(outs.map(o => o.status), [200, 200, 200], 'Dones do not refuse each other');
  r = await poll(P[0], id);
  assert.deepEqual(r.body.view.game.turn.done, [false, true, true, true]);
  assert.equal(await version(id), v + 4);
});

test('Skip: any player, only for a seat unseen for a minute; rolls for the roller, ends a choice, the roller takes the penalty', async () => {
  const { id, v } = await started(3);
  assert.equal((await act(P[0], id, { type: 'skip', seat: 0 }, v)).body.reason, 'illegal', 'not yourself');
  assert.equal((await act(P[0], id, { type: 'skip', seat: 5 }, v)).body.reason, 'illegal', 'no such seat');
  // Seat 0 rolls and is then away; seat 2 is away too.
  let r = await act(P[0], id, { type: 'roll' }, v);
  await setDice(id, { w: [1, 1], c: [1, 1, 1, 1] });
  r = await act(P[1], id, { type: 'done', n: 1, picks: pick() }, 0);
  r = await act(P[2], id, { type: 'done', n: 1, picks: pick() }, 0);
  r = await act(P[0], id, { type: 'done', n: 1, picks: pick(0) }, 0);
  assert.equal(r.body.view.game.turn.active, 1);
  await away(id, P[2]);
  let host = await poll(P[0], id);
  assert.deepEqual(host.body.view.room.seats.map(s => s.connected), [true, true, false]);
  assert.equal((await act(P[0], id, { type: 'skip', seat: 1 }, host.body.version)).body.reason, 'not_away');
  assert.equal((await act(P[0], id, { type: 'skip', seat: 2 }, host.body.version)).body.reason, 'illegal', 'seat 2 is not rolling');
  // Seat 1 rolls; away seat 2 is skipped, by a player who is not the host: done with nothing.
  r = await act(P[1], id, { type: 'roll' }, host.body.version);
  r = await act(P[1], id, { type: 'skip', seat: 2 }, r.body.version);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.view.game.turn.done, [false, false, true]);
  assert.equal((await act(P[0], id, { type: 'skip', seat: 2 }, r.body.version)).body.reason, 'illegal', 'already done');
  await act(P[0], id, { type: 'done', n: 2, picks: pick() }, 0);
  r = await act(P[1], id, { type: 'done', n: 2, picks: pick(null, null, true) }, 0);
  assert.equal(r.body.view.game.turn.active, 2, 'away seat 2 is the roller now');
  r = await act(P[0], id, { type: 'skip', seat: 2 }, r.body.version);
  assert.equal(r.body.view.game.turn.phase, 'choose', 'the host rolled for them');
  r = await act(P[0], id, { type: 'skip', seat: 2 }, r.body.version);
  assert.deepEqual(r.body.view.game.turn.done, [false, false, true]);
  await act(P[0], id, { type: 'done', n: 3, picks: pick() }, 0);
  r = await act(P[1], id, { type: 'done', n: 3, picks: pick() }, 0);
  assert.equal(r.body.view.game.players[2].penalties, 1, 'the skipped roller marked nothing: one penalty');
  assert.equal(r.body.view.game.turn.active, 0);
  assert.ok(validState(await rawGame(id)));
  // Back again: polling refreshes their last-seen, and Skip no longer applies to them.
  await poll(P[2], id);
  host = await poll(P[0], id);
  assert.deepEqual(host.body.view.room.seats.map(s => s.connected), [true, true, true]);
});

test('who goes first: the server rolls a D6 per seat, ties for the highest roll again, the first seat rolled highest', async () => {
  // Eight seats tie for the highest about half the time; keep starting rooms until one did.
  let tie = false;
  for (let k = 0; k < 30 && !tie; k++) {
    const { id } = await room(8);
    const s = await act(P[0], id, { type: 'START' }, await version(id));
    const g = s.body.view.game, raw = await rawGame(id);
    assertRolls(g);
    assert.deepEqual([raw.first, raw.rolls], [g.first, g.rolls], 'the view shows the stored roll');
    assert.equal((await act(P[(g.first + 1) % 8], id, { type: 'roll' }, s.body.version)).body.reason, 'not_your_turn');
    assert.equal((await act(P[g.first], id, { type: 'roll' }, s.body.version)).status, 200, 'the first seat rolls');
    tie = g.rolls.length > 1;
  }
  assert.ok(tie, 'a tie came up and was rolled again');
});

test('a timed-out poll still sends the view, so who is away stays current', async () => {
  const { id, v } = await started(2);
  await away(id, P[1]);
  const r = await poll(P[0], id, v);
  assert.equal(r.body.version, v);
  assert.deepEqual(r.body.view.room.seats.map(s => s.connected), [true, false]);
});

// A seeded random stream for the test's own choices.
const rng = s => () => ((s = (s + 0x6D2B79F5) | 0, s = Math.imul(s ^ s >>> 15, s | 1), s ^= s + Math.imul(s ^ s >>> 7, s | 61), (s ^ s >>> 14) >>> 0) / 4294967296);

// Plays a started room to the end like the phones do: the roller rolls, then each seat picks at random from the
// engine's own options on its view and taps Done. The stored state is checked after every step.
async function playToEnd(id, n, seedNo) {
  const rand = rng(seedNo);
  let r = await poll(P[0], id), steps = 0;
  while (r.body.view.room.phase === 'game') {
    assert.ok(++steps < 2000, 'the game ends');
    const t = r.body.view.game.turn;
    r = await act(P[t.active], id, { type: 'roll' }, r.body.version);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assertPrivate(r, t.active);
    assert.ok(validState(await rawGame(id)));
    for (const seat of [...Array(n).keys()].sort(() => rand() - .5)) {
      const view = (await poll(P[seat], id)).body.view;
      // The phone's copy: other players' picks are hidden, so they read as none.
      const g = { ...view.game, seed: 0, rng: 0, turn: { ...view.game.turn, picks: view.game.turn.picks.map(k => k ?? noPicks()) } };
      let k = noPicks();
      for (let tries = 0; tries < 2; tries++) {
        const opts = pickOptions({ ...g, turn: { ...g.turn, picks: g.turn.picks.map((x, i) => i === seat ? k : x) } }, seat);
        if (!opts.length || rand() < .25) break;
        k = opts[Math.floor(rand() * opts.length)].pick;
      }
      if (seat === g.turn.active && k.white === null && k.colour === null) k = { ...noPicks(), penalty: true };
      r = await act(P[seat], id, { type: 'done', n: g.turn.n, picks: k }, 0);
      assert.equal(r.status, 200, JSON.stringify({ k, body: r.body }));
      assertPrivate(r, seat);
      assert.ok(validState(await rawGame(id)));
    }
  }
  const g = r.body.view.game;
  assert.equal(g.status, 'over');
  assert.ok(g.players.some(p => p.penalties >= MAX_PENALTIES) || g.closed.filter(Boolean).length >= 2);
  assert.equal(typeof r.body.view.room.endedAt, 'number');
  return r;
}

test('a seeded random game to the end through the API, then a rematch and a leave', async () => {
  for (const [n, s] of [[3, 11], [8, 29]]) {
    const { id, code } = await started(n);
    // Seeded dice too (the server's own seed is random), so the game replays the same every run.
    await db.prepare("UPDATE rooms SET state = json_set(state, '$.game.seed', ?, '$.game.rng', ?) WHERE id = ?").bind(s, s, id).run();
    let r = await playToEnd(id, n, s);
    const t = r.body.view.game.turn;
    assert.equal((await act(P[t.active], id, { type: 'roll' }, r.body.version)).body.reason, 'illegal', 'nothing after the end');
    assert.equal((await act(P[(t.active + 1) % n], id, { type: 'roll' }, r.body.version)).body.reason, 'not_your_turn');
    for (let p = 0; p < n - 1; p++) r = await act(P[p], id, { type: 'REMATCH' }, 0);
    assert.deepEqual(r.body.view.room.rematch, [...Array(n - 1).keys()]);
    assert.equal(r.body.view.room.phase, 'over');
    r = await act(P[n - 1], id, { type: 'REMATCH' }, 0);
    assert.equal(r.body.view.room.phase, 'game');
    assertRolls(r.body.view.game); // a rematch rolls again for who goes first
    assert.deepEqual(r.body.view.game.turn, { n: 1, active: r.body.view.game.first, phase: 'roll', dice: null, picks: [], done: [] });
    assert.equal((await act(P[1], id, { type: 'LEAVE' }, 0)).body.reason, 'started', 'no leaving mid-game');
    if (n === 3) {
      r = await playToEnd(id, n, s + 1);
      r = await act(P[1], id, { type: 'LEAVE' }, 0);
      assert.equal(r.body.view, null);
      r = await poll(P[0], id);
      assert.equal(r.body.view.room.phase, 'lobby', 'the rest go back to the lobby');
      assert.deepEqual(r.body.view.room.seats.map(x => x.name), ['Host', 'P2']);
      assert.deepEqual(r.body.view.room.seats.map(x => x.id), [0, 2], 'seat ids stay with the player, so phones see who left');
      assert.equal((await join(P[9], code)).status, 200, 'and can be joined again');
    }
  }
});

test('input validation: 400 with the field, 413 over 4 KB', async () => {
  for (const [body, reason] of [[{ name: '' }, 'name'], [{ name: 'x'.repeat(21) }, 'name'], [{}, 'name'], ['nope', 'body']]) {
    assert.deepEqual((await call(P[0], 'POST', BASE, body)).body, { error: 'invalid', reason });
  }
  assert.equal((await call(P[0], 'POST', BASE, { name: 'A', pad: 'x'.repeat(5000) })).status, 413);
  assert.deepEqual((await join(P[0], 'ABC')).body, { error: 'invalid', reason: 'code' });
  const { id, v } = await started(2);
  const bad = [
    { type: 'roll ' }, { type: 'next' }, { type: 'skip' }, { type: 'skip', seat: 8 }, { type: 'skip', seat: '1' },
    { type: 'reopen' }, { type: 'reopen', n: 0 }, { type: 'done', n: 1 },
    { type: 'done', n: 1, picks: { white: null, colour: null } }, { type: 'done', n: 1, picks: { white: 4, colour: null, penalty: false } },
    { type: 'done', n: 1, picks: { white: null, colour: { lane: 0, die: 2 }, penalty: false } },
    { type: 'done', n: 1, picks: { white: null, colour: { lane: 0 }, penalty: false } },
    { type: 'done', n: 1, picks: { white: null, colour: 3, penalty: false } },
    { type: 'done', n: 1, picks: { white: null, colour: { lane: 1, die: 0 }, penalty: true } },
    { type: 'done', n: 1, picks: { white: null, colour: null, penalty: 'no' } }, { type: 'done', n: 1.5, picks: pick() },
    { type: 'SET_DECKS', decks: 2 }, { type: 'SET_PLAYER', name: 'A', style: 'gold' },
  ];
  for (const action of bad) {
    const r = await act(P[0], id, action, v);
    assert.equal(r.status, 400, JSON.stringify(action));
    assert.deepEqual(r.body, { error: 'invalid', reason: 'action' });
  }
  assert.equal(await version(id), v);
});
