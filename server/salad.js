// Canadian Salad rooms API (docs/plans/salad-server-contract.md). The engine in site/salad/engine owns every rule; this
// file owns rooms, seats and who may do what. A seat is the verified person id through salad_members, and an answer only
// ever carries viewFor(state, thatSeat), never the stored state. Free plan: long polling on D1, a handful of queries a call.
import { createGame, reduce, checkState, SCORE_DISPLAYS } from '../site/salad/engine/reducer.js';
import { viewFor } from '../site/salad/engine/view.js';
import { describeConfig } from '../site/salad/engine/score.js';
import { validPlayers, validDecks, defaultDecks } from '../site/salad/engine/cards.js';
import { DECKS } from '../site/decks/decks.js';
import { readBody } from './saves.js';

export const COLORS = ['cobalt', 'scarlet', 'forest', 'tangerine', 'violet', 'teal', 'rose', 'gold', 'slate', 'sky'];
// Mutable so tests can shorten the wait. 20 reads keeps a poll well under the 50 subrequests a request may make.
export const POLL = { reads: 20, ms: 800 };
const SEEN_EVERY = 10_000;
const CONNECTED = 30_000;
const IDLE = 24 * 3600_000;
const RECENT = 64;
const MAX_BODY = 4096;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const THEME = /^[a-z][a-z0-9-]{0,23}$/;
const ROOM = /^\/api\/salad\/rooms\/([^/]+)(\/actions)?$/;
const NOT_FOUND = [404, { error: 'not_found' }];
const BAD = [400, { error: 'bad_request' }];

const LOAD = `SELECT r.id, r.code, r.version, r.state, m.seat FROM salad_rooms r
  JOIN salad_members m ON m.room_id = r.id WHERE r.id = ? AND m.person_id = ?`;
const LIGHT = `SELECT r.version, json_extract(r.state, '$.seats[' || m.seat || '].lastSeen') AS seen FROM salad_rooms r
  JOIN salad_members m ON m.room_id = r.id WHERE r.id = ? AND m.person_id = ?`;
// Presence only: no version bump, so idle polling never wakes the other pollers.
const TOUCH = 'UPDATE salad_rooms SET state = json_set(state, ?, ?), updated_at = ? WHERE id = ? AND version = ?';
const SAVE = 'UPDATE salad_rooms SET version = version + 1, state = ?, updated_at = ? WHERE id = ? AND version = ?';

const seed = () => crypto.getRandomValues(new Int32Array(1))[0];
const iso = ms => new Date(ms).toISOString();
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => ALPHABET[b % ALPHABET.length]).join('');
const seatOf = (name, color, now) => ({ name, color, ready: false, lastSeen: now, rematch: false });

// Methods allowed on a salad path, or null when the path is not one of ours.
export function saladAllow(pathname) {
  if (pathname === '/api/salad/rooms' || pathname === '/api/salad/rooms/join') return 'POST';
  const m = ROOM.exec(pathname);
  return m ? (m[2] ? 'POST' : 'GET') : null;
}

export function cleanName(n) {
  if (typeof n !== 'string') return null;
  const s = n.replace(/\s+/g, ' ').replace(/[\p{Cc}‎‏‪-‮⁦-⁩]/gu, '').trim();
  return [...s].slice(0, 20).join('').trim() || null;
}

// The picture deck each of the three possible decks wears ('' for the drawn cards), ids from site/decks.
const NO_ART = ['', '', ''];
const okArt = a => Array.isArray(a) && a.length === 3 && a.every(x => x === '' || DECKS.some(d => d.id === x));
// The config fields over `base`, or null when anything is invalid. A room from before art had none: Standard decks.
function config(input, base) {
  if (input === undefined) return base;
  if (!input || typeof input !== 'object') return null;
  const c = { art: NO_ART, ...base };
  for (const k of ['capacity', 'decks', 'tableTheme', 'scoreDisplay', 'art']) if (input[k] !== undefined) c[k] = input[k];
  if (!validPlayers(c.capacity) || !validDecks(c.decks) || typeof c.tableTheme !== 'string' || !THEME.test(c.tableTheme)
    || !SCORE_DISPLAYS.includes(c.scoreDisplay) || !okArt(c.art)) return null;
  c.art = [...c.art];
  try { describeConfig(c.capacity, c.decks); } catch { return null; }
  return c;
}

function view(row, room, seat) {
  const now = Date.now();
  return {
    room: {
      id: row.id, code: row.code, host: room.host, phase: room.game ? 'game' : 'lobby', config: room.config,
      seats: room.seats.map((s, i) => ({ seat: i, name: s.name, color: s.color, ready: s.ready,
        connected: i === seat || now - s.lastSeen < CONNECTED, rematch: s.rematch })),
    },
    game: room.game ? viewFor(room.game, seat) : null,
    you: { seat, host: seat === room.host },
  };
}
const answer = (row, room, extra = {}, status = 200) =>
  [status, { ...extra, version: row.version, view: view(row, room, row.seat) }];

// Returns [status, body]. Database errors throw; the Worker turns them into 503.
export async function handleSalad(db, request, person, pathname, searchParams) {
  const id = ROOM.exec(pathname)?.[1];
  if (request.method === 'GET') return poll(db, id, person, searchParams.get('since'));
  const text = await readBody(request, MAX_BODY);
  if (text === null) return [413, { error: 'too_large' }];
  let body;
  try { body = JSON.parse(text); } catch { return BAD; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return BAD;
  if (pathname === '/api/salad/rooms') return create(db, person, body);
  if (pathname === '/api/salad/rooms/join') return join(db, person, body);
  return act(db, id, person, body);
}

async function poll(db, id, person, sinceText) {
  if (!UUID.test(id)) return NOT_FOUND;
  const since = /^\d{1,15}$/.test(sinceText ?? '') ? Number(sinceText) : null;
  let row = await db.prepare(LOAD).bind(id, person).first();
  if (!row) return NOT_FOUND;
  let { version } = row;
  let seen = JSON.parse(row.state).seats[row.seat]?.lastSeen ?? 0;
  for (let i = 0; ; i++) {
    if (Date.now() - seen >= SEEN_EVERY) {
      await db.prepare(TOUCH).bind(`$.seats[${row.seat}].lastSeen`, Date.now(), iso(Date.now()), id, version).run();
      seen = Date.now();
    }
    if (version !== since || i >= POLL.reads - 1) break;
    await sleep(POLL.ms);
    const light = await db.prepare(LIGHT).bind(id, person).first();
    if (!light) return NOT_FOUND;
    ({ version, seen } = light);
  }
  if (version !== row.version || since === row.version) row = await db.prepare(LOAD).bind(id, person).first();
  return row ? answer(row, JSON.parse(row.state)) : NOT_FOUND;
}

async function create(db, person, body) {
  const name = cleanName(body.name);
  if (!name) return [400, { error: 'invalid_name' }];
  if (!COLORS.includes(body.color)) return [400, { error: 'invalid_color' }];
  const capacity = validPlayers(body.config?.capacity) ? body.config.capacity : 4;
  const cfg = config(body.config, { capacity, decks: defaultDecks(capacity), tableTheme: 'felt', scoreDisplay: 'live', art: NO_ART });
  if (!cfg) return [400, { error: 'invalid_config' }];
  const now = Date.now();
  const room = { v: 1, host: 0, config: cfg, seats: [seatOf(name, body.color, now)], game: null, recent: [] };
  const id = crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    const code = newCode();
    try {
      await db.batch([
        db.prepare('DELETE FROM salad_members WHERE room_id IN (SELECT id FROM salad_rooms WHERE updated_at < ?)').bind(iso(now - IDLE)),
        db.prepare('DELETE FROM salad_rooms WHERE updated_at < ?').bind(iso(now - IDLE)),
        db.prepare('INSERT INTO salad_rooms (id, code, version, state, updated_at) VALUES (?, ?, 1, ?, ?)')
          .bind(id, code, JSON.stringify(room), iso(now)),
        db.prepare('INSERT INTO salad_members (room_id, person_id, seat) VALUES (?, ?, 0)').bind(id, person),
      ]);
      return answer({ id, code, version: 1, seat: 0 }, room, {}, 201);
    } catch (e) {
      if (attempt >= 2 || !/UNIQUE/i.test(String(e?.message))) throw e; // a code collision: draw another
    }
  }
}

async function join(db, person, body) {
  const code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[\s-]/g, '') : '';
  if (!/^[A-Z]{6}$/.test(code)) return NOT_FOUND;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare(`SELECT r.id, r.code, r.version, r.state, m.seat FROM salad_rooms r
      LEFT JOIN salad_members m ON m.room_id = r.id AND m.person_id = ? WHERE r.code = ?`).bind(person, code).first();
    if (!row) return NOT_FOUND;
    const room = JSON.parse(row.state);
    if (row.seat !== null) return answer(row, room); // already seated: this is reconnection
    if (room.game) return [409, { error: 'started' }];
    if (room.seats.length >= room.config.capacity) return [409, { error: 'full' }];
    const name = cleanName(body.name);
    if (!name) return [400, { error: 'invalid_name' }];
    if (!COLORS.includes(body.color)) return [400, { error: 'invalid_color' }];
    const taken = new Set(room.seats.map(s => s.color));
    const seat = room.seats.length;
    room.seats.push(seatOf(name, taken.has(body.color) ? COLORS.find(c => !taken.has(c)) : body.color, Date.now()));
    // The member row is written only if the room update won (changes() of the statement before, same transaction).
    const [w] = await db.batch([
      db.prepare(SAVE).bind(JSON.stringify(room), iso(Date.now()), row.id, row.version),
      db.prepare('INSERT INTO salad_members (room_id, person_id, seat) SELECT ?, ?, ? WHERE changes() = 1').bind(row.id, person, seat),
    ]);
    if (w.meta.changes) return answer({ ...row, version: row.version + 1, seat }, room);
  }
  throw new Error('join lost three races');
}

async function act(db, id, person, body) {
  const { action, expect, actionId } = body;
  if (!UUID.test(id)) return NOT_FOUND;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string' || !Number.isInteger(expect)
    || typeof actionId !== 'string' || !ACTION_ID.test(actionId)) return BAD;
  const row = await db.prepare(LOAD).bind(id, person).first();
  if (!row) return NOT_FOUND;
  const room = JSON.parse(row.state);
  if (room.recent.includes(actionId)) return answer(row, room, { duplicate: true });
  if (expect !== row.version) return answer(row, room, { error: 'stale' }, 409);
  if (room.game) checkState(room.game); // the row is a trust boundary
  const next = structuredClone(room);
  const refused = apply(next, row.seat, action);
  if (refused) return answer(row, room, { error: refused[1] }, refused[0]);
  next.recent = [...room.recent, actionId].slice(-RECENT);
  const stamp = iso(Date.now());
  let statements;
  if (action.type === 'LEAVE') {
    // Each statement runs only if the one before changed something: a lost race leaves every row as it was.
    statements = next.seats.length ? [
      db.prepare(SAVE).bind(JSON.stringify(next), stamp, id, row.version),
      db.prepare('DELETE FROM salad_members WHERE room_id = ? AND person_id = ? AND changes() = 1').bind(id, person),
      db.prepare('UPDATE salad_members SET seat = seat - 1 WHERE room_id = ? AND seat > ? AND changes() = 1').bind(id, row.seat),
    ] : [
      db.prepare('DELETE FROM salad_rooms WHERE id = ? AND version = ?').bind(id, row.version),
      db.prepare('DELETE FROM salad_members WHERE room_id = ? AND changes() = 1').bind(id),
    ];
  } else {
    next.seats[row.seat].lastSeen = Date.now();
    statements = [db.prepare(SAVE).bind(JSON.stringify(next), stamp, id, row.version)];
  }
  const [w] = await db.batch(statements);
  if (!w.meta.changes) { // another write got there first
    const fresh = await db.prepare(LOAD).bind(id, person).first();
    if (!fresh) return NOT_FOUND;
    const now = JSON.parse(fresh.state);
    return now.recent.includes(actionId) ? answer(fresh, now, { duplicate: true }) : answer(fresh, now, { error: 'stale' }, 409);
  }
  if (action.type === 'LEAVE') return [200, { version: row.version + 1, view: null }];
  return answer({ ...row, version: row.version + 1 }, next);
}

const engine = (room, action) => {
  if (!room.game) return [409, 'illegal'];
  const next = reduce(room.game, action);
  if (next === room.game) return [409, 'illegal'];
  room.game = next;
  return null;
};

// Applies `a` for `seat` to `room` in place. Returns null, or [status, error] and the room must be discarded.
function apply(room, seat, a) {
  const lobby = !room.game, host = seat === room.host, me = room.seats[seat];
  const WRONG = [409, 'wrong_phase'], NOT_HOST = [403, 'not_host'];
  switch (a.type) {
    case 'SET_PLAYER':
      if (!lobby) return WRONG;
      if (a.name !== undefined) {
        const name = cleanName(a.name);
        if (!name) return [400, 'invalid_name'];
        me.name = name;
      }
      if (a.color !== undefined) {
        if (!COLORS.includes(a.color)) return [400, 'invalid_color'];
        if (room.seats.some((s, i) => i !== seat && s.color === a.color)) return [409, 'color_taken'];
        me.color = a.color;
      }
      return null;
    case 'SET_READY':
      if (typeof a.ready !== 'boolean') return [400, 'bad_request'];
      if (!lobby) return WRONG;
      me.ready = a.ready;
      return null;
    case 'SET_CONFIG': {
      if (!lobby) return WRONG;
      if (!host) return NOT_HOST;
      const c = config(a, room.config);
      if (!c) return [400, 'invalid_config'];
      if (c.capacity < room.seats.length) return [409, 'capacity_below_players'];
      // Ready meant ready for that setup: a change asks everyone again.
      if (JSON.stringify(c) !== JSON.stringify(room.config)) for (const s of room.seats) s.ready = false;
      room.config = c;
      return null;
    }
    case 'START':
      if (!lobby) return WRONG;
      if (!host) return NOT_HOST;
      if (room.seats.length < 2) return [409, 'not_enough_players'];
      if (room.seats.some((s, i) => i !== room.host && !s.ready)) return [409, 'not_ready'];
      room.game = createGame({ players: room.seats.map(({ name, color }) => ({ name, color })), decks: room.config.decks,
        seed: seed(), scoreDisplay: room.config.scoreDisplay });
      return null;
    case 'LEAVE':
      if (!lobby && room.game.phase !== 'over') return [409, 'in_game'];
      // Leaving a finished game ends it: the rest are back in the lobby to start again or leave, not left waiting on a
      // rematch that needs every seat.
      if (!lobby) {
        room.game = null;
        for (const s of room.seats) { s.ready = false; s.rematch = false; }
      }
      room.seats.splice(seat, 1);
      if (host) room.host = room.seats.length ? seat % room.seats.length : 0;
      else if (room.host > seat) room.host--;
      return null;
    case 'PLAY_CARD':
      if (typeof a.card !== 'string') return [400, 'bad_request'];
      return engine(room, { type: 'PLAY_CARD', seat, card: a.card });
    case 'NEXT_ROUND':
      if (!host) return NOT_HOST;
      return engine(room, { type: 'NEXT_ROUND' });
    case 'REMATCH_READY':
      if (a.ready !== undefined && typeof a.ready !== 'boolean') return [400, 'bad_request'];
      if (room.game?.phase !== 'over') return [409, 'illegal'];
      me.rematch = a.ready !== false;
      if (room.seats.every(s => s.rematch)) {
        room.game = reduce(room.game, { type: 'REMATCH', seed: seed() });
        for (const s of room.seats) s.rematch = false;
      }
      return null;
    default:
      return [400, 'bad_request'];
  }
}
