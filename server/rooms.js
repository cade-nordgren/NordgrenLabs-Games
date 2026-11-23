// Online rooms on D1 with long polling (docs/decisions/0004; the APIs are docs/plans/bomb-online-contract.md and
// crossix-online-contract.md). One file for every game that shares the rooms tables: what differs is a small adapter,
// Bomb's below and Crossix's in crossix.js. The room row holds everything as JSON; each change is one conditional
// UPDATE ... WHERE version = ?, so of two simultaneous actions only one applies. Phones only ever get the adapter's
// view for their seat, never the state or the seed.
import { allowedDecks, MAX_DECKS, MAX_PLAYERS } from '../site/bomb/engine/cards.js';
import { createGame, reduce, checkState } from '../site/bomb/engine/reducer.js';
import { viewFor } from '../site/bomb/engine/view.js';
import { DECKS } from '../site/decks/decks.js';
import { readBody } from './saves.js';

// Same order and ids as the client's styles (site/bomb/ui/styles.js): the picture decks, then the twelve colours.
export const STYLES = [...DECKS.map(d => d.id), 'cobalt', 'scarlet', 'forest', 'tangerine', 'violet', 'teal', 'rose', 'gold', 'indigo', 'slate',
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
export const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// Same limit as the roster inputs of the other games (maxlength 20), trimmed, no control characters.
const cleanName = v => {
  const n = typeof v === 'string' ? v.trim() : '';
  return n && n.length <= 20 && !/\p{Cc}/u.test(n) ? n : null;
};
const phase = (kind, room) => !room.game ? 'lobby' : kind.over(room.game) ? 'over' : 'game';
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
export const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] | 0;
// The room's game, kept in its state. Bomb rooms (the first, from before there were others) carry none, so Bomb's
// kind is null and queries match it with IS: a code or id of one game never finds a room of another.
const KIND = "json_extract(r.state, '$.kind') IS ?";

function newCode() {
  let code = '';
  while (code.length < 6) {
    for (const b of crypto.getRandomValues(new Uint8Array(8))) {
      if (b < 230 && code.length < 6) code += ALPHABET[b % 23]; // 230 = 10 * 23, so every letter is equally likely
    }
  }
  return code;
}

// One batch: the row and its members. Null when the room is gone, is another game's, or this person is not seated in it.
async function load(db, kind, id, person) {
  const [rooms, members] = await db.batch([
    db.prepare(`SELECT id, code, version, state, last_action FROM rooms r WHERE id = ? AND ${KIND}`).bind(id, kind.kind),
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
      id: row.id, code: row.code, phase: phase(kind, room), host: 0, ...kind.roomView(room), rematch: room.rematch,
      startedAt: room.startedAt ?? null, endedAt: room.endedAt ?? null,
      seats: room.seats.map(s => ({ name: s.name, ...kind.seatView(s), connected: now - (seen.get(s.person) ?? 0) < CONNECTED_MS })),
    },
    game: room.game && kind.view(room.game, seat),
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

// What differs per game:
//   kind         the room state's kind (null: Bomb)         max   most seats
//   seat(body, room)  the seat's own fields from a create or join body (room is null while only checking the body),
//                     or the bad field's name; it may adjust the room for one more player
//   settings(body)    the room's own fields from a create body, or the bad field's name
//   roomView(room), seatView(seat)  their public fields      parse(a)  an action's clean shape, or null
//   anyVersion   its own actions that are checked against the room as it is now, never refused for a stale expect
//   start(room)       a new game for the seats, or why not
//   apply(room, next, seat, a, cur)  next (a copy of room) with the action applied, or why not
//   view(game, seat), check(game) (throws on a bad stored state), over(game)
//   presence     a held poll that times out sends the view anyway, so who is away stays current on every phone
export const BOMB = {
  kind: null, max: MAX_PLAYERS,
  seat(body, room) {
    if (!STYLES.includes(body.style)) return 'style';
    if (!room) return { style: body.style };
    const allowed = allowedDecks(room.seats.length + 1);
    if (!allowed.includes(room.decks)) room.decks = allowed[0]; // five or six players need two decks or more
    const taken = new Set(room.seats.map(s => s.style));
    return { style: taken.has(body.style) ? STYLES.find(s => !taken.has(s)) : body.style };
  },
  settings: body => isInt(body.decks, 1, MAX_DECKS) ? { decks: body.decks } : 'decks',
  roomView: room => ({ decks: room.decks }),
  seatView: s => ({ style: s.style }),
  parse: parseAction,
  anyVersion: new Set(['SET_PLAYER', 'SET_DECKS']),
  start: room => allowedDecks(room.seats.length).includes(room.decks)
    ? createGame({ players: room.seats.length, decks: room.decks, seed: seed() }) : 'decks',
  apply(room, next, seat, a) {
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
      default: {
        if (lobby) return 'not_started';
        let game = reduce(room.game, { ...a, seat });
        if (game === room.game) return 'illegal';
        if (game.pending) game = reduce(game, { type: 'next' }); // online turns pass by themselves
        next.game = game;
        if (room.game.phase === 'choose' && game.phase === 'play') next.startedAt = Date.now();
        if (room.game.phase !== 'over' && game.phase === 'over') next.endedAt = Date.now();
        return next;
      }
    }
  },
  view: viewFor,
  check: checkState,
  over: g => g.phase === 'over',
  presence: false,
};

// Returns [status, body]. Database errors throw; the Worker turns them into 503.
export async function handleRooms(db, request, person, id, actions, since, kind = BOMB) {
  if (id === undefined) return create(db, kind, request, person);
  if (id === 'join' && !actions) return join(db, kind, request, person);
  if (!UUID.test(id)) return NOT_FOUND;
  return actions ? act(db, kind, request, person, id) : poll(db, kind, request, person, id, since);
}

async function create(db, kind, request, person) {
  const body = await json(request);
  if (body === null) return [413, { error: 'too_large' }];
  if (!body) return invalid('body');
  const name = cleanName(body.name);
  if (!name) return invalid('name');
  const seat = kind.seat(body, null);
  if (typeof seat === 'string') return invalid(seat);
  const settings = kind.settings(body);
  if (typeof settings === 'string') return invalid(settings);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM room_members WHERE room_id IN (SELECT id FROM rooms WHERE updated_at < ?)').bind(now - IDLE_MS),
    db.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(now - IDLE_MS),
  ]);
  const state = JSON.stringify({ ...(kind.kind && { kind: kind.kind }), ...settings, seats: [{ person, name, ...seat }], game: null, rematch: [] });
  for (let tries = 0; tries < 5; tries++) {
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare('INSERT INTO rooms (id, code, version, state, last_action, updated_at) VALUES (?, ?, 1, ?, \'{}\', ?)')
          .bind(id, newCode(), state, now),
        db.prepare('INSERT INTO room_members (room_id, person_id, seen) VALUES (?, ?, ?)').bind(id, person, now),
      ]);
    } catch (e) {
      if (/UNIQUE/.test(String(e?.message))) continue; // the code is taken (by any game: codes are unique): draw another
      throw e;
    }
    const cur = await load(db, kind, id, person);
    return [200, { id, version: cur.version, view: cur.view }];
  }
  throw new Error('no free room code');
}

async function join(db, kind, request, person) {
  const body = await json(request);
  if (body === null) return [413, { error: 'too_large' }];
  if (!body) return invalid('body');
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z]{6}$/.test(code)) return invalid('code');
  const name = cleanName(body.name);
  if (!name) return invalid('name');
  const ok = kind.seat(body, null);
  if (typeof ok === 'string') return invalid(ok);
  for (let tries = 0; tries < 5; tries++) {
    const found = await db.prepare(`SELECT id FROM rooms r WHERE code = ? AND ${KIND}`).bind(code, kind.kind).first();
    if (!found) return NOT_FOUND;
    const cur = await load(db, kind, found.id, person);
    if (cur) return [200, { id: cur.id, version: cur.version, view: cur.view }]; // already seated: reconnecting
    const row = await db.prepare('SELECT version, state, last_action FROM rooms WHERE id = ?').bind(found.id).first();
    if (!row) continue;
    const room = JSON.parse(row.state);
    if (room.game) return conflict('started');
    if (room.seats.length >= kind.max) return conflict('full');
    room.seats.push({ person, name, ...kind.seat(body, room) });
    const at = { id: found.id, version: row.version };
    if (await save(db, at, room, JSON.parse(row.last_action), [guarded(db,
      'INSERT INTO room_members (room_id, person_id, seen) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = ? AND person_id = ?)',
      at, found.id, person, Date.now(), found.id, person)])) {
      const now = await load(db, kind, found.id, person);
      return [200, { id: now.id, version: now.version, view: now.view }];
    }
  }
  throw new Error('room too busy');
}

const ROOM_LEVEL = new Set(['START', 'REMATCH', 'LEAVE']);

// The room after the action, or a reason string when it does not apply now.
function apply(kind, room, seat, a, cur) {
  const next = structuredClone(room);
  const lobby = !room.game;
  switch (a.type) {
    case 'START': {
      if (!lobby) return 'started';
      if (seat !== 0) return 'not_host';
      if (room.seats.length < 2) return 'too_few_players';
      const game = kind.start(room);
      if (typeof game === 'string') return game;
      Object.assign(next, { game, startedAt: null, endedAt: null });
      return next;
    }
    case 'LEAVE':
      if (phase(kind, room) === 'game') return 'started';
      next.seats.splice(seat, 1); // later seats move up one; seat 0, the host, is whoever is left first
      // After a finished game the others go back to the lobby, so the host can start again with whoever is left.
      Object.assign(next, { game: null, rematch: [], startedAt: null, endedAt: null });
      return next;
    case 'REMATCH':
      if (phase(kind, room) !== 'over') return 'not_over';
      if (!next.rematch.includes(seat)) next.rematch.push(seat);
      if (next.rematch.length === room.seats.length) {
        const game = kind.start(room);
        if (typeof game === 'string') return game;
        Object.assign(next, { game, rematch: [], startedAt: null, endedAt: null });
      }
      return next;
    default:
      return kind.apply(room, next, seat, a, cur);
  }
}

async function act(db, kind, request, person, id) {
  const body = await json(request);
  if (body === null) return [413, { error: 'too_large' }];
  if (!body) return invalid('body');
  if (!isInt(body.expect, 0, Number.MAX_SAFE_INTEGER)) return invalid('expect');
  if (typeof body.actionId !== 'string' || !ACTION_ID.test(body.actionId)) return invalid('actionId');
  const action = kind.parse(body.action);
  if (!action) return invalid('action');
  const roomLevel = ROOM_LEVEL.has(action.type) || kind.anyVersion.has(action.type);
  // Room-level actions are checked against whatever the room is now, so a change in between is no reason to refuse
  // them: re-read and try again. Bounded: each try is 3 to 4 queries, well under the 50 a request may make.
  for (let tries = 0; tries < 5; tries++) {
    const cur = await load(db, kind, id, person);
    if (!cur) return NOT_FOUND;
    if (cur.acts[person] === body.actionId) return [200, { version: cur.version, view: cur.view }]; // a retry: already applied
    if (!roomLevel && body.expect !== cur.version) return conflict('stale', cur);
    if (cur.room.game) kind.check(cur.room.game); // the row came from D1: a trust boundary
    const room = apply(kind, cur.room, cur.seat, action, cur);
    if (typeof room === 'string') return conflict(room, cur);
    const acts = { ...cur.acts, [person]: body.actionId };
    if (action.type === 'LEAVE') {
      delete acts[person];
      const leave = guarded(db, 'DELETE FROM room_members WHERE room_id = ? AND person_id = ?', cur, id, person);
      if (!room.seats.length) {
        const [, gone] = await db.batch([leave, db.prepare('DELETE FROM rooms WHERE id = ? AND version = ?').bind(id, cur.version)]);
        if (gone.meta.changes) return [200, { version: cur.version + 1, view: null }];
      } else if (await save(db, cur, room, acts, [leave])) {
        return [200, { version: cur.version + 1, view: null }];
      }
    } else if (await save(db, cur, room, acts)) {
      const now = await load(db, kind, id, person);
      return now ? [200, { version: now.version, view: now.view }] : NOT_FOUND;
    }
    if (!roomLevel) {
      const now = await load(db, kind, id, person);
      return now ? conflict('stale', now) : NOT_FOUND;
    }
  }
  const now = await load(db, kind, id, person);
  return now ? conflict('stale', now) : NOT_FOUND;
}

async function poll(db, kind, request, person, id, since) {
  if (since !== null && !/^\d{1,15}$/.test(since)) return invalid('since');
  const me = await db.prepare(
    `SELECT m.seen, r.version FROM room_members m JOIN rooms r ON r.id = m.room_id WHERE m.room_id = ? AND m.person_id = ? AND ${KIND}`)
    .bind(id, person, kind.kind).first();
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
  if (version === want && (!kind.presence || request.signal?.aborted)) return [200, { version }];
  const cur = await load(db, kind, id, person);
  return cur ? [200, { version: cur.version, view: cur.view }] : NOT_FOUND;
}
