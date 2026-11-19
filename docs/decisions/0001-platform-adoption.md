# 0001: Adoption of NordgrenLabs platform law

**Status:** Accepted 2026-11-18. The owner accepted the seven recommended answers in `docs/PLATFORM-INTEGRATION-PLAN.md`. Decision 2 (anonymous play) is superseded by `0003-sign-in-required.md`.
**Scope:** How Games becomes a platform app: identity, saves, hosting, and its relationship to the Control Center. Documentation only.
**Authorizes:** the repo-only build steps 2 to 6 of the plan, each as its own reviewed change. It authorizes no deployment, DNS or Cloudflare change, Clerk Dashboard change, or change to any other repository. Each of those needs its own explicit go-ahead from the owner.

Platform records are cited as `NL-ADR-000N` and live in `C:\Projects\NordgrenLabs-Platform\docs\decisions\`. Platform `AGENTS.md` rule 11 requires an app to adopt them through its own record; this is that record.

## 1. Decisions

1. **Hostname.** `https://games.nordgrenlabs.com`. The Control Center catalog key will be `games`.
2. **Anonymous play stays.** A signed-out visitor plays exactly as before, with saves in that browser's localStorage. On first sign-in, that browser's local saves are uploaded to the account once and then removed locally.
3. **Membership policy.** Every signed-in person whose verified session token carries `nl_person_id` may use server saves. There is no Games membership table and there are no roles. A signed-in person without the claim is "authenticated but not associated" (NL-ADR-0003 §9): treated as signed-out for saves and pointed to the Control Center to finish setup. Games decides this locally; a Control Center catalog entry or role implies nothing here.
4. **Data key.** Saves are keyed on `nl_person_id` only (`personPublicId` in records). No Clerk user id, email or provider identifier is stored (NL-ADR-0002 §13, §14; NL-ADR-0004 §2.B).
5. **Name.** The first player is pre-filled from the Clerk profile first name, read in the browser from ClerkJS. It is an editable convenience, not identity, and it is not the registry's `people.display_name`. The session token carries no name (NL-ADR-0003 §3).
6. **Browser authentication seam.** ClerkJS on the Games origin with the publishable key only; the session token is sent to the Games backend as `Authorization: Bearer`. The backend has one verification seam: `verifyToken` from `@clerk/backend` with the instance public key, offline, then its own pins: algorithm RS256, issuer exactly `https://clerk.nordgrenlabs.com`, `azp` exactly the Games origin as a source constant, non-empty `sid` and `sub`, no `aud`, bounded clock skew and token length, `nl_person_id` in canonical UUID shape. Any failure is signed-out (401). `nl_person_id` is read only after verification (NL-ADR-0003 §6). This is "another seam recorded in its adoption record" under NL-ADR-0007 §6.1, modelled on Ascend's ADR 0002.
7. **No Clerk authority.** No Games runtime, build, backup or tool holds a Clerk secret key or calls the Clerk Backend API (NL-ADR-0007 §3.1, §3.2). The backend refuses to start if any environment variable name beginning `CLERK_` is present other than `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY` and `CLERK_ISSUER`, all public values (NL-ADR-0007 §3.4(d), in the allowlist form of NL-ADR-0009 §1(i)). No Frontend API proxy, no satellite domain, and session cookies stay host-only (NL-ADR-0007 §3.7, §3.9).
8. **Backend.** One Node process in this repo under `server/`, serving the static site and the saves API from the same origin. The client stays plain HTML, CSS and JavaScript with no build step.
9. **Storage.** One SQLite file in a Docker volume. This departs from the platform default of PostgreSQL (NL-ADR-0001 §19) for a concrete reason: the data is one small table written by one process, and SQLite needs no second container, no database password and no role provisioning, so the app holds no secret at all. The static, framework-free client is likewise a departure from that default stack, for the reasons already in the build guide.
10. **Retention.** A save is kept until its owner deletes it. Limits: 200 saves per person, 256 KB per save. The database file is backed up with the VM. Losing access never deletes saves (NL-ADR-0002 §6); any future bulk deletion needs its own decision.
11. **Hosting placement** (NL-ADR-0007 §6.2). The shared Ubuntu Production VM `nordgren-labs`, in its own Compose project with its own volume and its own config directory `/etc/nordgren-labs/games/`, sharing nothing with RideLab or the Control Center. One service on a loopback port, reached through one new ingress rule in the host-level Cloudflare Tunnel.
12. **Control Center.** Games asks only for catalog presence: key, name and launch origin (NL-ADR-0004 §5). It publishes no private contract, so NL-ADR-0005 and NL-ADR-0006 do not apply. Saved games are not shown inside the Control Center; the Control Center never reads the Games database (NL-ADR-0004 §13). The catalog entry is a Control Center milestone under that repository's own record.
13. **Clerk key gate.** NL-ADR-0007 §9 requires an owner decision before a new app's users are admitted while another runtime holds a Clerk secret key. Control Center `docs/handoffs/CURRENT.md:52-57` records the shared `default` key revoked on 2026-11-12, and the owner accepted that reading with the plan on 2026-11-18. The dated attestation in section 3 re-checks it before go-live.

## 2. Platform records and how they apply

| Record | Position |
|---|---|
| NL-ADR-0002 | Adopted: saves are domain data anchored to the Person. |
| NL-ADR-0003 | Adopted: the claim is identity only, read after verification, fail closed. |
| NL-ADR-0004, 0005, 0006 | Not applicable beyond catalog presence: no private contract is published. |
| NL-ADR-0007 | Adopted: secretless from day one, seam recorded here under §6.1. |
| NL-ADR-0008 | Not applicable: Games uses no Clerk server SDK middleware and no `auth()` hand-off. The seam verifies the token itself on every request. |
| NL-ADR-0009 | Its cookie-based own-seam is not used. Its start-up allowlist and its acceptance events are borrowed (decision 7, section 3). |

## 3. Evidence owed before Production

Recorded here as an addendum when done (NL-ADR-0007 §6.3, §7):

- A test in this repo that the Compose file names no Clerk secret variable, and that the backend refuses to start on one.
- A dated owner attestation that no deploy tool, preview or backup of Games holds a Clerk secret key.
- An acceptance pass on the production origin: fresh sign-in, reload, new tab, arriving from the Control Center, idle past token expiry, sign-out then sign-in, save and resume on a second device, session cookies host-only, no token in any URL or log. Repeated on every upgrade of `@clerk/backend` or the pinned ClerkJS version.

## 4. Known and accepted

- Whether a session on another NordgrenLabs origin is recognised on Games without a second sign-in is unmeasured. The worst case is one extra sign-in.
- Games shares the Clerk instance with the Control Center, so a script flaw in Games is a risk to anyone who visits while signed in (NL-ADR-0007 §9). User text is inserted with `textContent` only. No content security policy is set, because game scripts are inline.
- Concurrent edits to one save resolve as last write wins.

## Addendum 2026-11-18: `verifyJwt` instead of `verifyToken`

Decision 6 names `verifyToken`. The seam as built calls `verifyJwt` from `@clerk/backend/jwt` with the same public key: the same library and the same checks, still offline. `verifyToken` (2.33.8) caches one key entry per `kid` taken from the token header before the signature is checked, and never evicts, so unauthenticated requests could grow server memory without limit. NL-ADR-0009 §1(h) names this risk. `verifyJwt` has no cache. The pins in decision 6 are unchanged.
