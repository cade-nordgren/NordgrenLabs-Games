// The single verification seam (docs/decisions/0001 decision 6). The only module that sees a token or its claims.
// verifyJwt with the public key is networkless; it checks signature, exp/nbf/iat, a string sub, and azp only when
// present, but not iss, sid, empty sub, missing azp or aud. The pins below close those gaps. Never log a token or claim.
// Not verifyToken: it caches a key per unverified header kid, without bound (the risk NL-ADR-0009 §1(h) names).
import { verifyJwt } from '@clerk/backend/jwt';

const PRODUCTION_AUTHORIZED_PARTY = 'https://games.nordgrenlabs.com';
const DEVELOPMENT_AUTHORIZED_PARTY = 'http://localhost:8787';
// __GAMES_BUILD_MODE__ is a wrangler `define`, replaced at build time (wrangler.jsonc); never a runtime variable.
export const AUTHORIZED_PARTY = typeof __GAMES_BUILD_MODE__ !== 'undefined' && __GAMES_BUILD_MODE__ === 'development'
  ? DEVELOPMENT_AUTHORIZED_PARTY : PRODUCTION_AUTHORIZED_PARTY;

const SKEW_S = 5;
const MAX_TOKEN_LENGTH = 4096;
const BEARER = /^Bearer ([A-Za-z0-9_.-]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const filled = v => typeof v === 'string' && v.length > 0;
const base64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

export async function verify(authorization, { jwtKey, issuer, authorizedParty, now = Date.now() }) {
  try {
    const token = BEARER.exec(authorization ?? '')?.[1];
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
