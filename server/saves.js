// Saves API handlers on D1 (docs/decisions/0001 decisions 3, 4, 10; 0002). Every statement filters on the verified
// person, and each ownership or cap check sits in the same statement as the read or write it guards.
export const MAX_BYTES = 256 * 1024;
export const MAX_SAVES = 200;

// Must match valid() and its two regexes in site/platform.js.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const valid = r => !!r && typeof r === 'object' && r.schemaVersion === 1 && UUID.test(r.id)
  && typeof r.game === 'string' && (r.personPublicId === null || UUID.test(r.personPublicId))
  && typeof r.title === 'string' && (r.status === 'in_progress' || r.status === 'finished')
  && ISO.test(r.createdAt) && ISO.test(r.updatedAt) && !!r.state && typeof r.state === 'object';

// Resolves null once the body passes MAX_BYTES and stops reading; nothing past the cap is buffered.
async function readBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(r.value);
  }
  return new Blob(chunks).text();
}

// The write happens only if the save is already this person's or they are under the cap, and the upsert never
// touches a row owned by someone else. The count in the same batch tells a full account (409) from a foreign id (404).
const UPSERT = `INSERT INTO saves (id, person_public_id, game, updated_at, record)
  SELECT ?1, ?2, ?3, ?4, ?5
  WHERE EXISTS (SELECT 1 FROM saves WHERE id = ?1 AND person_public_id = ?2)
    OR (SELECT count(*) FROM saves WHERE person_public_id = ?2) < ${MAX_SAVES}
  ON CONFLICT (id) DO UPDATE SET game = excluded.game, updated_at = excluded.updated_at, record = excluded.record
  WHERE saves.person_public_id = excluded.person_public_id`;

// Returns [status, body]. Database errors throw; the caller turns them into 503.
export async function handleSaves(db, request, person, id, game) {
  if (id === undefined) {
    if (!game) return [400, { error: 'game_required' }];
    const { results } = await db.prepare(
      'SELECT record FROM saves WHERE person_public_id = ? AND game = ? ORDER BY updated_at DESC').bind(person, game).all();
    return [200, results.map(row => JSON.parse(row.record))];
  }
  if (!UUID.test(id)) return [404, { error: 'not_found' }];
  if (request.method === 'GET') {
    const row = await db.prepare('SELECT record FROM saves WHERE id = ? AND person_public_id = ?').bind(id, person).first();
    return row ? [200, JSON.parse(row.record)] : [404, { error: 'not_found' }];
  }
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM saves WHERE id = ? AND person_public_id = ?').bind(id, person).run();
    return [204];
  }
  const text = await readBody(request);
  if (text === null) return [413, { error: 'too_large' }];
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
  const [write, count] = await db.batch([
    db.prepare(UPSERT).bind(id, person, stored.game, stored.updatedAt, JSON.stringify(stored)),
    db.prepare('SELECT count(*) AS n FROM saves WHERE person_public_id = ?').bind(person),
  ]);
  if (write.meta.changes) return [200, stored];
  return count.results[0].n >= MAX_SAVES ? [409, { error: 'save_limit' }] : [404, { error: 'not_found' }];
}
