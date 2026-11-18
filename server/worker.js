// The Worker (docs/decisions/0002). Static assets serve site/ without reaching this code; the Worker answers /api/*,
// /config.js, and any request no asset matched, all on one origin.
import { verify, AUTHORIZED_PARTY } from './seam.js';
import { handleSaves } from './saves.js';

const REQUIRED = ['CLERK_PUBLISHABLE_KEY', 'CLERK_JWT_KEY', 'CLERK_ISSUER'];

// Names only, never values (decision 7 of 0001). A Worker cannot refuse to start, so it refuses to serve instead.
// All three empty is the signed-out dev environment; anything else partial is a broken deploy.
export function problems(env) {
  const found = Object.keys(env)
    .filter(name => name.startsWith('CLERK_') && !REQUIRED.includes(name))
    .map(name => `${name} is not allowed`);
  const filled = REQUIRED.filter(name => typeof env[name] === 'string' && env[name] !== '');
  for (const name of REQUIRED) {
    if (typeof env[name] !== 'string' || (filled.length && !filled.includes(name))) found.push(`${name} is missing`);
  }
  return found;
}

export default {
  async fetch(request, env) {
    const send = (status, type, body, headers = {}) => new Response(request.method === 'HEAD' ? null : body,
      { status, headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers } });
    const json = (status, body, headers) =>
      send(status, 'application/json; charset=utf-8', body === undefined ? null : JSON.stringify(body),
        { 'Cache-Control': 'no-store', ...headers });
    const { pathname, searchParams } = new URL(request.url);

    const refused = problems(env);
    if (refused.length) {
      console.error(`misconfigured: ${refused.join('; ')}`);
      return json(503, { error: 'misconfigured' });
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const id = /^\/api\/saves\/([^/]+)$/.exec(pathname)?.[1];
      const allow = pathname === '/api/me' || pathname === '/api/saves' ? 'GET' : id ? 'GET, PUT, DELETE' : null;
      if (!allow) return json(404, { error: 'not_found' });
      if (!allow.split(', ').includes(request.method)) return json(405, { error: 'method_not_allowed' }, { Allow: allow });
      const r = await verify(request.headers.get('authorization') ?? undefined,
        { jwtKey: env.CLERK_JWT_KEY, issuer: env.CLERK_ISSUER, authorizedParty: AUTHORIZED_PARTY });
      if (!r.ok) return json(401, { error: 'unauthenticated' });
      if (r.personPublicId === null) return json(403, { error: 'not_associated' });
      if (pathname === '/api/me') return json(200, { personPublicId: r.personPublicId });
      try {
        return json(...await handleSaves(env.DB, request, r.personPublicId, id, searchParams.get('game')));
      } catch {
        return json(503, { error: 'unavailable' });
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' });
    }
    if (pathname === '/config.js') {
      // An empty key (the dev environment) gives the same signed-out config as the static placeholder.
      const config = env.CLERK_PUBLISHABLE_KEY ? { clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY } : null;
      return send(200, 'text/javascript; charset=utf-8', `window.NL_CONFIG = ${JSON.stringify(config)};\n`,
        { 'Cache-Control': 'no-store' });
    }
    return send(404, 'text/plain', 'Not found');
  },
};
