// The single verification seam (docs/decisions/0001 decision 6). The only module that sees a token or its claims.
// verifyJwt with the public key is networkless; it checks signature, exp/nbf/iat, a string sub, and azp only when
// present, but not iss, sid, empty sub, missing azp or aud. The pins below close those gaps. Never log a token or claim.
// Not verifyToken: it caches a key per unverified header kid, without bound (the risk NL-ADR-0009 §1(h) names).
import { verifyJwt } from '@clerk/backend/jwt';

const PRODUCTION_AUTHORIZED_PARTY = 'https://games.nordgrenlabs.com';
const DEVELOPMENT_AUTHORIZED_PARTY = 'http://localhost:8787';
// __GAMES_BUILD_MODE__ is a wrangler `define`, replaced at build time (wrangler.jsonc); never a runtime variable.
export const DEVELOPMENT = typeof __GAMES_BUILD_MODE__ !== 'undefined' && __GAMES_BUILD_MODE__ === 'development';
export const AUTHORIZED_PARTY = DEVELOPMENT ? DEVELOPMENT_AUTHORIZED_PARTY : PRODUCTION_AUTHORIZED_PARTY;

const SKEW_S = 5;
const MAX_TOKEN_LENGTH = 4096;
const BEARER = /^Bearer ([A-Za-z0-9_.-]+)$/;
// ClerkJS writes the session token as `__session` and, in current versions, also as `__session_<suffix>`.
const SESSION = /(?:^|;\s*)__session(?:_[A-Za-z0-9_-]{1,32})?=([A-Za-z0-9_.-]+)(?=\s*(?:;|$))/g;
const MAX_SESSION_COOKIES = 4; // bounds the signature checks one request can ask for
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const filled = v => typeof v === 'string' && v.length > 0;
const base64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

// The API reads only the bearer header.
export const verify = (authorization, options) => check(BEARER.exec(authorization ?? '')?.[1], options);
// Pages only (docs/decisions/0003): a browser navigation cannot send a header, so it proves its session with ClerkJS's
// __session cookie, which holds the same short-lived session token. Same checks, nothing else trusted.
export async function verifyCookie(cookie, options) {
  // Either name may hold the fresh token while the other is stale, so any one that verifies is enough.
  for (const m of [...(cookie ?? '').matchAll(SESSION)].slice(0, MAX_SESSION_COOKIES)) {
    const r = await check(m[1], options);
    if (r.ok) return r;
  }
  return { ok: false };
}

async function check(token, { jwtKey, issuer, authorizedParty, now = Date.now() }) {
  try {
    if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false };
    if (!filled(jwtKey) || !filled(issuer) || !filled(authorizedParty)) return { ok: false };
    const p = await verifyJwt(token, { key: jwtKey, authorizedParties: [authorizedParty], clockSkewInMs: SKEW_S * 1000 });
    const header = JSON.parse(base64url(token.split('.')[0]));
    const t = now / 1000;
    if (header.alg !== 'RS256' || p.iss !== issuer || p.azp !== authorizedParty || 'aud' in p) return { ok: false };
    if (!filled(p.sid) || !filled(p.sub)) return { ok: false };
    if (typeof p.exp !== 'number' || p.exp + SKEW_S <= t) return { ok: false };
    if ('nbf' in p && !(typeof p.nbf === 'number' && p.nbf - SKEW_S <= t)) return { ok: false };
    if ('iat' in p && !(typeof p.iat === 'number' && p.iat - SKEW_S <= t)) return { ok: false };
    if (!('nl_person_id' in p)) return { ok: true, personPublicId: null };
    return typeof p.nl_person_id === 'string' && UUID.test(p.nl_person_id)
      ? { ok: true, personPublicId: p.nl_person_id }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}
