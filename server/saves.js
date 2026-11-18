// Saves API storage and handlers (docs/decisions/0001 decisions 3, 4, 9, 10). Every statement filters on the verified person.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MAX_BYTES = 256 * 1024;
export const MAX_SAVES = 200;

// Must match valid() and its two regexes in platform.js.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const valid = r => !!r && typeof r === 'object' && r.schemaVersion === 1 && UUID.test(r.id)
  && typeof r.game === 'string' && (r.personPublicId === null || UUID.test(r.personPublicId))
  && typeof r.title === 'string' && (r.status === 'in_progress' || r.status === 'finished')
  && ISO.test(r.createdAt) && ISO.test(r.updatedAt) && !!r.state && typeof r.state === 'object';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS saves (id TEXT PRIMARY KEY, person_public_id TEXT NOT NULL, game TEXT NOT NULL,
      updated_at TEXT NOT NULL, record TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS saves_owner ON saves (person_public_id, game, updated_at);`);
  return db;
}

// Resolves null once the body passes MAX_BYTES; later chunks are discarded, not buffered.
const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BYTES) resolve(null);
    else chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

// Returns [status, body, headers]. Database errors throw; the caller turns them into 503.
export async function handleSaves(db, req, person, id, game) {
  if (id === undefined) {
    if (!game) return [400, { error: 'game_required' }];
    return [200, db.prepare('SELECT record FROM saves WHERE person_public_id = ? AND game = ? ORDER BY updated_at DESC')
      .all(person, game).map(row => JSON.parse(row.record))];
  }
  if (!UUID.test(id)) return [404, { error: 'not_found' }];
  if (req.method === 'GET') {
    const row = db.prepare('SELECT record FROM saves WHERE id = ? AND person_public_id = ?').get(id, person);
    return row ? [200, JSON.parse(row.record)] : [404, { error: 'not_found' }];
  }
  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM saves WHERE id = ? AND person_public_id = ?').run(id, person);
    return [204];
  }
  const text = await readBody(req);
  if (text === null) return [413, { error: 'too_large' }, { Connection: 'close' }];
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return [400, { error: 'invalid_record' }];
  }
  if (!valid(record) || record.id !== id || record.game.length < 1 || record.game.length > 64) {
    return [400, { error: 'invalid_record' }];
  }
  const stored = { ...record, personPublicId: person };
  // No await from here on: node:sqlite is synchronous, so the count check and the write are atomic in this process.
  const own = db.prepare('SELECT 1 FROM saves WHERE id = ? AND person_public_id = ?').get(id, person);
  if (!own && db.prepare('SELECT count(*) AS n FROM saves WHERE person_public_id = ?').get(person).n >= MAX_SAVES) {
    return [409, { error: 'save_limit' }];
  }
  const { changes } = db.prepare(`INSERT INTO saves (id, person_public_id, game, updated_at, record) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET game = excluded.game, updated_at = excluded.updated_at, record = excluded.record
    WHERE saves.person_public_id = excluded.person_public_id`)
    .run(id, person, stored.game, stored.updatedAt, JSON.stringify(stored));
  return changes ? [200, stored] : [404, { error: 'not_found' }];
}
