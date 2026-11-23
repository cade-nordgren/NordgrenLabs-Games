// The Worker (docs/decisions/0002, 0003). It runs first for every request: /api/* and /config.js are its own, and every
// other path is a file from site/ through the ASSETS binding, behind the sign-in gate when Clerk is configured.
import { verify, verifyCookie, devPerson, AUTHORIZED_PARTY } from './seam.js';
import { handleSaves } from './saves.js';
import { handleRooms } from './rooms.js';

const REQUIRED = ['CLERK_PUBLISHABLE_KEY', 'CLERK_JWT_KEY', 'CLERK_ISSUER'];
// What the sign-in page and a home-screen install need (phones fetch these without a usable session), nothing else. Exact paths, so any other file,
// present or future, needs a session. The sign-in page itself is self-contained and served in place (below).
const PUBLIC = new Set(['/manifest.webmanifest', '/apple-touch-icon.png', '/favicon.ico', '/icons/favicon.svg',
  '/icons/icon-192.png', '/icons/icon-512.png']);
// site/signin.html; html_handling serves it at /signin. It carries this placeholder for the Worker to fill in.
const SIGN_IN = '/signin';
const PLACEHOLDER = 'window.NL_CONFIG = null;';

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
      const room = /^\/api\/bomb\/rooms(?:\/([^/]+)(\/actions)?)?$/.exec(pathname);
      const allow = pathname === '/api/me' || pathname === '/api/saves' ? 'GET' : id ? 'GET, PUT, DELETE'
        : room ? (room[1] && !room[2] && room[1] !== 'join' ? 'GET' : 'POST') : null;
      if (!allow) return json(404, { error: 'not_found' });
      if (!allow.split(', ').includes(request.method)) return json(405, { error: 'method_not_allowed' }, { Allow: allow });
      const dev = devPerson(request.headers.get('x-nl-dev-person') ?? undefined, env.CLERK_JWT_KEY);
      const r = dev ? { ok: true, personPublicId: dev } : await verify(request.headers.get('authorization') ?? undefined,
        { jwtKey: env.CLERK_JWT_KEY, issuer: env.CLERK_ISSUER, authorizedParty: AUTHORIZED_PARTY });
      if (!r.ok) return json(401, { error: 'unauthenticated' });
      if (r.personPublicId === null) return json(403, { error: 'not_associated' });
      if (pathname === '/api/me') return json(200, { personPublicId: r.personPublicId });
      try {
        if (room) return json(...await handleRooms(env.DB, request, r.personPublicId, room[1], !!room[2], searchParams.get('since')));
        return json(...await handleSaves(env.DB, request, r.personPublicId, id, searchParams.get('game')));
      } catch {
        return json(503, { error: 'unavailable' });
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' });
    }
    // An empty key (the dev environment) gives the same signed-out config as the static placeholder.
    const config = `window.NL_CONFIG = ${JSON.stringify(env.CLERK_PUBLISHABLE_KEY ? { clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY } : null)};`;
    if (pathname === '/config.js') return send(200, 'text/javascript; charset=utf-8', `${config}\n`, { 'Cache-Control': 'no-store' });
    // All three empty (problems() allows nothing in between) is local development: no gate.
    if (!env.CLERK_JWT_KEY || PUBLIC.has(pathname)) return env.ASSETS.fetch(request);
    const r = await verifyCookie(request.headers.get('cookie') ?? undefined,
      { jwtKey: env.CLERK_JWT_KEY, issuer: env.CLERK_ISSUER, authorizedParty: AUTHORIZED_PARTY });
    if (!r.ok) {
      // Served in place, never a redirect, so the page can reload this same URL once Clerk has a fresh cookie.
      const page = await (await env.ASSETS.fetch(new URL(SIGN_IN, request.url))).text();
      return send(401, 'text/html; charset=utf-8', page.replace(PLACEHOLDER, config), { 'Cache-Control': 'no-store' });
    }
    // private: never in a shared cache. no-cache: every use comes back here to have the cookie checked again, and the
    // asset's ETag passes through so an unchanged file answers 304.
    const asset = await env.ASSETS.fetch(request);
    const res = new Response(asset.body, asset);
    res.headers.set('Cache-Control', 'private, no-cache');
    return res;
  },
};
