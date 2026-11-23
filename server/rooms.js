// Bomb online rooms on D1 with long polling (docs/decisions/0004; the API is docs/plans/bomb-online-contract.md).
// The room row holds everything as JSON; each change is one conditional UPDATE ... WHERE version = ?, so of two
// simultaneous actions only one applies. Phones only ever get viewFor(game, theirSeat), never the state or the seed.
import { allowedDecks, MAX_DECKS, MAX_PLAYERS } from '../site/bomb/engine/cards.js';
import { createGame, reduce, checkState } from '../site/bomb/engine/reducer.js';
import { viewFor } from '../site/bomb/engine/view.js';
import { readBody } from './saves.js';

// Same order and ids as the plan's table of card styles.
export const STYLES = ['cobalt', 'scarlet', 'forest', 'tangerine', 'violet', 'teal', 'rose', 'gold', 'indigo', 'slate',
  'sky', 'lime'];
// The free plan allows 50 D1 queries per request: a poll makes at most hold / interval + 4. Tests shorten both.
export const timing = { hold: 20000, interval: 700 };
export const IDLE_MS = 24 * 60 * 60 * 1000;
const SEEN_EVERY_MS = 30000; // a poll refreshes its member's last-seen at most this often, so most polls write nothing
const CONNECTED_MS = 60000;
const MAX_BODY = 4096;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L or O
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CARD_ID = /^(?:[2-9]|10|[JQKA])[SHDC][0-3]$/;

const conflict = (reason, cur) => [409, cur ? { error: 'conflict', reason, version: cur.version, view: cur.view } : { error: 'conflict', reason }];
const invalid = reason => [400, { error: 'invalid', reason }];
const NOT_FOUND = [404, { error: 'not_found' }];
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// Same limit as the roster inputs of the other games (maxlength 20), trimmed, no control characters.
const cleanName = v => {
  const n = typeof v === 'string' ? v.trim() : '';
  return n && n.length <= 20 && !/\p{Cc}/u.test(n) ? n : null;
};
const phase = room => !room.game ? 'lobby' : room.game.phase === 'over' ? 'over' : 'game';
const sleep = ms => new Promise(ok => setTimeout(ok, ms));

function newCode() {
  let code = '';
  while (code.length < 6) {
    for (const b of crypto.getRandomValues(new Uint8Array(8))) {
      if (b < 230 && code.length < 6) code += ALPHABET[b % 23]; // 230 = 10 * 23, so every letter is equally likely
    }
  }
  return code;
}

// One batch: the row and its members. Null when the room is gone or this person is not seated in it.
async function load(db, id, person) {
  const [rooms, members] = await db.batch([
    db.prepare('SELECT id, code, version, state, last_action FROM rooms WHERE id = ?').bind(id),
    db.prepare('SELECT person_id, seen FROM room_members WHERE room_id = ?').bind(id),
  ]);
  const row = rooms.results[0];
  if (!row || !members.results.some(m => m.person_id === person)) return null;
  const room = JSON.parse(row.state);
  const seat = room.seats.findIndex(s => s.person === person);
  const seen = new Map(members.results.map(m => [m.person_id, m.seen]));
  const now = Date.now();
  const view = {
    room: {
      id: row.id, code: row.code, phase: phase(room), host: 0, decks: room.decks, rematch: room.rematch,
      seats: room.seats.map(s => ({ name: s.name, style: s.style, connected: now - (seen.get(s.person) ?? 0) < CONNECTED_MS })),
    },
    game: room.game && viewFor(room.game, seat),
    you: seat,
  };
  return { id: row.id, version: row.version, room, seat, acts: JSON.parse(row.last_action), view };
}

// Member statements go first, guarded on the version just read, so they apply exactly when the room update does
// (a D1 batch is one transaction). Returns false when someone else changed the room first.
async function save(db, cur, room, acts, members = []) {
  const results = await db.batch([...members, db.prepare(
    'UPDATE rooms SET state = ?, last_action = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
    .bind(JSON.stringify(room), JSON.stringify(acts), Date.now(), cur.id, cur.version)]);
  return results.at(-1).meta.changes === 1;
}
const guarded = (db, sql, cur, ...binds) =>
  db.prepare(`${sql} AND (SELECT version FROM rooms WHERE id = ?) = ?`).bind(...binds, cur.id, cur.version);

async function json(request) {
  const text = await readBody(request, MAX_BODY);
  if (text === null) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

// Returns [status, body]. Database errors throw; the Worker turns them into 503.
export async function handleRooms(db, request, person, id, actions, since) {
  if (id === undefined) return create(db, request, person);
  if (id === 'join' && !actions) return join(db, request, person);
  if (!UUID.test(id)) return NOT_FOUND;
  return actions ? act(db, request, person, id) : poll(db, request, person, id, since);
}

async function create(db, request, person) {
  const body = await json(request);
  if (body === null) return [413, { error: 'too_large' }];
  if (!body) return invalid('body');
  const name = cleanName(body.name);
  if (!name) return invalid('name');
  if (!STYLES.includes(body.style)) return invalid('style');
  if (!isInt(body.decks, 1, MAX_DECKS)) return invalid('decks');
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM room_members WHERE room_id IN (SELECT id FROM rooms WHERE updated_at < ?)').bind(now - IDLE_MS),
    db.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(now - IDLE_MS),
  ]);
  const state = JSON.stringify({ decks: body.decks, seats: [{ person, name, style: body.style }], game: null, rematch: [] });
  for (let tries = 0; tries < 5; tries++) {
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare('INSERT INTO rooms (id, code, version, state, last_action, updated_at) VALUES (?, ?, 1, ?, \'{}\', ?)')
          .bind(id, newCode(), state, now),
        db.prepare('INSERT INTO room_members (room_id, person_id, seen) VALUES (?, ?, ?)').bind(id, person, now),
      ]);
    } catch (e) {
      if (/UNIQUE/.test(String(e?.message))) continue; // the code is taken: draw another
      throw e;
    }
    const cur = await load(db, id, person);
    return [200, { id, version: cur.version, view: cur.view }];
  }
  throw new Error('no free room code');
}

async function join(db, request, person) {
  const body = await json(request);
  if (body === null) return [413, { error: 'too_large' }];
  if (!body) return invalid('body');
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z]{6}$/.test(code)) return invalid('code');
  const name = cleanName(body.name);
  if (!name) return invalid('name');
  if (!STYLES.includes(body.style)) return invalid('style');
  for (let tries = 0; tries < 5; tries++) {
    const found = await db.prepare('SELECT id FROM rooms WHERE code = ?').bind(code).first();
    if (!found) return NOT_FOUND;
    const cur = await load(db, found.id, person);
    if (cur) return [200, { id: cur.id, version: cur.version, view: cur.view }]; // already seated: reconnecting
    const row = await db.prepare('SELECT version, state, last_action FROM rooms WHERE id = ?').bind(found.id).first();
    if (!row) continue;
    const room = JSON.parse(row.state);
    if (room.game) return conflict('started');
    if (room.seats.length >= MAX_PLAYERS) return conflict('full');
    const taken = new Set(room.seats.map(s => s.style));
    room.seats.push({ person, name, style: taken.has(body.style) ? STYLES.find(s => !taken.has(s)) : body.style });
    const allowed = allowedDecks(room.seats.length);
    if (!allowed.includes(room.decks)) room.decks = allowed[0]; // five or six players need two decks or more
    const at = { id: found.id, version: row.version };
    if (await save(db, at, room, JSON.parse(row.last_action), [guarded(db,
      'INSERT INTO room_members (room_id, person_id, seen) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = ? AND person_id = ?)',
      at, found.id, person, Date.now(), found.id, person)])) {
      const now = await load(db, found.id, person);
      return [200, { id: now.id, version: now.version, view: now.view }];
    }
  }
  throw new Error('room too busy');
}

// The action as the server will use it, or null when its shape is wrong. Fields not listed are dropped.
function parseAction(a) {
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return null;
  const ids = (min, max) => Array.isArray(a.ids) && a.ids.length >= min && a.ids.length <= max
    && a.ids.every(id => typeof id === 'string' && CARD_ID.test(id)) ? a.ids : null;
  switch (a.type) {
    case 'SET_PLAYER': {
      const name = cleanName(a.name);
      return name && STYLES.includes(a.style) ? { type: a.type, name, style: a.style } : null;
    }
    case 'SET_DECKS': return isInt(a.decks, 1, MAX_DECKS) ? { type: a.type, decks: a.decks } : null;
    case 'START': case 'LEAVE': case 'REMATCH': case 'confirm': case 'pickUp': return { type: a.type };
    case 'arrange': return ids(4, 4) && { type: a.type, ids: a.ids };
    case 'play': return ids(1, 4 * MAX_DECKS) && { type: a.type, ids: a.ids }; // at most every copy of one rank
    case 'playDown': return isInt(a.slot, 0, 3) ? { type: a.type, slot: a.slot } : null;
    default: return null; // 'next' included: the server applies it
  }
}

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] | 0;

// The room after the action, or a reason string when it does not apply now.
function apply(room, seat, a) {
  const next = structuredClone(room);
  const lobby = !room.game;
  switch (a.type) {
    case 'SET_PLAYER':
      if (!lobby) return 'started';
      if (room.seats.some((s, i) => i !== seat && s.style === a.style)) return 'style_taken';
      Object.assign(next.seats[seat], { name: a.name, style: a.style });
      return next;
    case 'SET_DECKS':
      if (!lobby) return 'started';
      if (seat !== 0) return 'not_host';
      next.decks = a.decks;
      return next;
    case 'START':
      if (!lobby) return 'started';
      if (seat !== 0) return 'not_host';
      if (room.seats.length < 2) return 'too_few_players';
      if (!allowedDecks(room.seats.length).includes(room.decks)) return 'decks';
      next.game = createGame({ players: room.seats.length, decks: room.decks, seed: seed() });
      return next;
    case 'REMATCH':
      if (phase(room) !== 'over') return 'not_over';
      if (!next.rematch.includes(seat)) next.rematch.push(seat);
      if (next.rematch.length === room.seats.length) {
        next.game = createGame({ players: room.seats.length, decks: room.decks, seed: seed() });
        next.rematch = [];
      }
      return next;
    default: {
      if (lobby) return 'not_started';
      let game = reduce(room.game, { ...a, seat });
      if (game === room.game) return 'illegal';
      if (game.pending) game = reduce(game, { type: 'next' }); // online turns pass by themselves
      next.game = game;
      return next;
    }
  }
}

async function act(db, request, person, id) {
  const body = await json(request);
  if (body === null) return [413, { error: 'too_large' }];
  if (!body) return invalid('body');
  if (!isInt(body.expect, 0, Number.MAX_SAFE_INTEGER)) return invalid('expect');
  if (typeof body.actionId !== 'string' || !ACTION_ID.test(body.actionId)) return invalid('actionId');
  const action = parseAction(body.action);
  if (!action) return invalid('action');
  const cur = await load(db, id, person);
  if (!cur) return NOT_FOUND;
  if (cur.acts[person] === body.actionId) return [200, { version: cur.version, view: cur.view }]; // a retry: already applied
  if (body.expect !== cur.version) return conflict('stale', cur);
  if (cur.room.game) checkState(cur.room.game); // the row came from D1: a trust boundary
  const acts = { ...cur.acts, [person]: body.actionId };

  if (action.type === 'LEAVE') {
    if (cur.room.game) return conflict('started', cur);
    const room = structuredClone(cur.room);
    room.seats.splice(cur.seat, 1); // later seats move up one; seat 0, the host, is whoever is left first
    delete acts[person];
    const leave = guarded(db, 'DELETE FROM room_members WHERE room_id = ? AND person_id = ?', cur, id, person);
    if (!room.seats.length) {
      const [, gone] = await db.batch([leave, db.prepare('DELETE FROM rooms WHERE id = ? AND version = ?').bind(id, cur.version)]);
      if (gone.meta.changes) return [200, { version: cur.version + 1, view: null }];
    } else if (await save(db, cur, room, acts, [leave])) {
      return [200, { version: cur.version + 1, view: null }];
    }
    return conflict('stale', await load(db, id, person));
  }

  const room = apply(cur.room, cur.seat, action);
  if (typeof room === 'string') return conflict(room, cur);
  if (!await save(db, cur, room, acts)) return conflict('stale', await load(db, id, person));
  const now = await load(db, id, person);
  return [200, { version: now.version, view: now.view }];
}

async function poll(db, request, person, id, since) {
  if (since !== null && !/^\d{1,15}$/.test(since)) return invalid('since');
  const me = await db.prepare(
    'SELECT m.seen, r.version FROM room_members m JOIN rooms r ON r.id = m.room_id WHERE m.room_id = ? AND m.person_id = ?')
    .bind(id, person).first();
  if (!me) return NOT_FOUND;
  if (Date.now() - me.seen >= SEEN_EVERY_MS) {
    await db.prepare('UPDATE room_members SET seen = ? WHERE room_id = ? AND person_id = ?').bind(Date.now(), id, person).run();
  }
  const want = since === null ? null : Number(since);
  let version = me.version;
  // Reads only the version by primary key until it moves; a disconnected client cancels the request (or the signal).
  for (let left = Math.floor(timing.hold / timing.interval); version === want && left > 0 && !request.signal?.aborted; left--) {
    await sleep(timing.interval);
    const row = await db.prepare('SELECT version FROM rooms WHERE id = ?').bind(id).first();
    if (!row) return NOT_FOUND;
    version = row.version;
  }
  if (version === want) return [200, { version }];
  const cur = await load(db, id, person);
  return cur ? [200, { version: cur.version, view: cur.view }] : NOT_FOUND;
}
