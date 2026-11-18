// One process: the static site from the repo root, /config.js and /api, on one origin (docs/decisions/0001).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify, AUTHORIZED_PARTY } from './seam.js';
import { openDb, handleSaves } from './saves.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REQUIRED = ['CLERK_PUBLISHABLE_KEY', 'CLERK_JWT_KEY', 'CLERK_ISSUER'];
const HIDDEN = new Set(['server', 'docs', 'node_modules']);
// Plain name segments only: no dot files, no "..", no backslash, colon or trailing dot (Windows aliases).
const SEGMENT = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

// Returns the problems that must stop start-up. Names only, never values (decision 7).
export function checkEnv(env) {
  const problems = Object.keys(env)
    .filter(name => name.startsWith('CLERK_') && !REQUIRED.includes(name))
    .map(name => `refusing to start: ${name} is not allowed`);
  for (const name of REQUIRED) if (!env[name]) problems.push(`refusing to start: ${name} is missing`);
  return problems;
}

export function createServer({ publishableKey, jwtKey, issuer, db }) {
  return http.createServer(async (req, res) => {
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const json = (status, body, headers) =>
      send(status, 'application/json; charset=utf-8', JSON.stringify(body), { 'Cache-Control': 'no-store', ...headers });
    const raw = req.url.split('?')[0];

    if (raw === '/api' || raw.startsWith('/api/')) {
      const id = /^\/api\/saves\/([^/]+)$/.exec(raw)?.[1];
      const allow = raw === '/api/me' || raw === '/api/saves' ? 'GET' : id ? 'GET, PUT, DELETE' : null;
      if (!allow) return json(404, { error: 'not_found' });
      if (!allow.split(', ').includes(req.method)) return json(405, { error: 'method_not_allowed' }, { Allow: allow });
      const r = await verify(req.headers.authorization, { jwtKey, issuer, authorizedParty: AUTHORIZED_PARTY });
      if (!r.ok) return json(401, { error: 'unauthenticated' });
      if (r.personPublicId === null) return json(403, { error: 'not_associated' });
      if (raw === '/api/me') return json(200, { personPublicId: r.personPublicId });
      try {
        const game = new URLSearchParams(req.url.split('?')[1]).get('game');
        return json(...await handleSaves(db, req, r.personPublicId, id, game));
      } catch {
        return json(503, { error: 'unavailable' });
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' });
    if (raw === '/config.js') {
      return send(200, TYPES['.js'], `window.NL_CONFIG = ${JSON.stringify({ clerkPublishableKey: publishableKey })};\n`,
        { 'Cache-Control': 'no-store' });
    }

    const notFound = () => send(404, 'text/plain', 'Not found');
    let parts;
    try {
      parts = decodeURIComponent(raw).split('/').filter(Boolean);
    } catch {
      return notFound();
    }
    if (!parts.every(s => SEGMENT.test(s)) || HIDDEN.has(parts[0]?.toLowerCase())) return notFound();
    let file = path.join(ROOT, ...parts);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return notFound();
    try {
      if ((await stat(file)).isDirectory()) {
        if (!raw.endsWith('/')) return send(301, 'text/plain', '', { Location: `/${parts.join('/')}/` });
        file = path.join(file, 'index.html');
      }
      send(200, TYPES[path.extname(file)] ?? 'application/octet-stream', await readFile(file));
    } catch {
      notFound();
    }
  });
}

if (import.meta.main) {
  const problems = checkEnv(process.env);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 8765;
  createServer({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    jwtKey: process.env.CLERK_JWT_KEY,
    issuer: process.env.CLERK_ISSUER,
    db: openDb(process.env.GAMES_DB || path.join(import.meta.dirname, 'data', 'games.db')),
  }).listen(port, () => console.log(`games server on http://localhost:${port}/`));
}
