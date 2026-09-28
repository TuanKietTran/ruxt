# Authentication, IAM, And Security

Last updated: main@d1ae665 | 2026-09-13

## Scope

This spec covers:

- account handlers and IAM policy code under `core/handlers/` and `core/domain/iam/`;
- password hashing in `infra/crypto/scrypt-hasher.ts`;
- user/IAM persistence ports and adapters;
- session ownership in `server/utils/session.ts`;
- `/api/auth/*` and `/api/iam/*` routes;
- browser auth state, SSR plugin, global route middleware, login page, and auth controls in layouts;
- auth and authorization boundaries for the rest of the repository.

## Account Authentication

Clerk is the primary browser identity broker. `@clerk/nuxt` installs request authentication middleware and the browser SDK; the Clerk application enables verified email plus managed Google, GitHub, and Microsoft sign-in. Broker secrets stay in server-only `NUXT_CLERK_SECRET_KEY`, while `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intentionally public. Deno's Production context uses a matching `pk_live_`/`sk_live_` pair; its Development context, shared by Preview and Git Branch timelines, uses a matching `pk_test_`/`sk_test_` pair. `server/plugins/validate-deployment-env.ts` rejects missing or cross-environment keys before serving a Deno timeline.

A verified Clerk id maps deterministically to the internal owner id `clerk:<Clerk user id>`. The namespace prevents collisions with legacy UUID users. This mapping does not copy, merge, or upload legacy user data, and matching email addresses do not implicitly merge owners. `/api/auth/me` resolves the email from Clerk's server API only after middleware verifies the request token.

The custom account implementation remains temporarily as a compatibility path. Registration canonicalizes and validates email, rejects an existing canonical address, generates a UUID, hashes the password, and persists id/email/hash/creation timestamp. Login lowercases and trims the supplied email and compares the password. Responses expose user id only; `/api/auth/me` returns id and email.

`ScryptHasher` uses Node crypto scrypt with `N=16384`, `r=8`, `p=1`, a 32-byte random salt, and a 64-byte key. Persistent hashes encode algorithm, parameters, salt, and derived key. Verification parses the stored parameters and uses `timingSafeEqual`.

Auth routes are:

- `POST /api/auth/register`: requires email/password, creates an account, starts a session, and returns 201;
- `POST /api/auth/login`: requires email/password, maps all credential failures to 401, and starts a session;
- `GET /api/auth/me`: requires a session user id and an existing user, otherwise 401;
- `POST /api/auth/logout`: clears the session.

`getAuthSession()` owns an H3 `auth_session` cookie-backed session with a seven-day max age. Its password comes from private Nuxt runtime config `sessionSecret`, overridden at runtime by `NUXT_SESSION_SECRET`; the fallback development password must not be used on any deployed timeline.

## Browser Auth State

`useAppAuth()` owns one Nuxt `auth:user` state value and normalizes Clerk and legacy identities through `/api/auth/me`. The server-only `app/plugins/auth.ts` calls `fetchMe()` during SSR only when the authenticated feature is enabled for the request host. Logout ends the Clerk session in the browser and clears any legacy cookie. The global middleware redirects unauthenticated `/d*` and `/settings*` paths to `/login`, except routes explicitly marked `meta.public`; only `/d*` retains the legacy `?userId=demo` bypass. `/p` is explicitly public and now hosts the profile editor; the plan-catalog page formerly at that path has been retired.

`AuthDialog` embeds Clerk's sign-in/sign-up components inside the in-context dialog, exposing email and enabled social providers while retaining mode tabs, focus trapping/restoration, Escape/backdrop dismissal, responsive presentation, safe local redirects, and local-data consent copy. `/login` remains a deep-link and protected-route bridge rather than a second form. Editor sign-in preserves the current workflow; protected-route sign-in returns to the requested local route. Default and editor layouts display session identity and logout controls. `/settings/cloud-data` is authenticated and exposes independent, default-off session/template consent controls. On deployment-configured disabled hosts (`*.deno.net` in the documented Deno configuration), the shared authenticated-feature rule suppresses account/import/authenticated-template UI and both browser and Nitro middleware reject configured feature-owned routes with 404. Browser route middleware and hidden controls are navigation conveniences; Nitro feature gating is deployment segmentation, and neither replaces per-route API authorization.

## IAM Model

IAM subjects persist `userId`, nullable `orgId`, tier (`free`, `pro`, `enterprise`), and `isServiceAccount`. Resource attributes and action codes are validated value objects. `CheckAccess` derives `isOwner` by comparing the request's `ownerUserId` to the stored subject id.

The default `PolicyEvaluator` is deny-overrides:

1. any explicit deny wins immediately;
2. otherwise at least one allow permits;
3. all policies abstaining produces default deny.

Built-in policies are:

- owner full access when subject and resource owner ids match;
- service-account read-only for action codes classified as reads, with explicit denial for all other actions;
- same-organization human access for `subscription:read` only.

IAM routes expose `POST /api/iam/check-access` and get/upsert/delete under `/api/iam/subjects/:userId`. These routes calculate and manage IAM state; no route middleware automatically invokes them.

## Trust Boundaries

Current account sessions do not protect plan, subscription, IAM, or CV API routes. Those routes accept caller-supplied user/owner ids. Consequently, IAM output is advisory unless a caller explicitly uses it; it is not an enforcement layer for mutation routes.

Legacy CV document HTTP/SSE and the `/mcp` Streamable HTTP endpoint are public at the application boundary and may expose personal data. `GET /api/public/templates` is the explicitly public, read-only template catalog and returns only records carrying the persisted `public` tag. CV import, preview, artifact, full template catalog, capability, cancellation, retry, and commit routes require an auth session and scope records by session user id. The MCP route also has no host/origin allowlist or DNS-rebinding protection. See [cv-documents-realtime.md](cv-documents-realtime.md) and [mcp-automation.md](mcp-automation.md).

`GET/PUT /api/cloud-data/consent` require a verified Clerk request or a legacy cookie session and derive the consent owner solely from the server authentication context; request bodies cannot select another owner. Clerk owners use the collision-safe `clerk:` namespace. A current-policy grant is required by future cloud writers, while missing or obsolete consent projects as denied.

New unauthenticated APIs outside authentication must be visibly namespaced under `/api/public/*`; `/api/auth/*` is exempt from that route naming convention. A data tag never removes an authentication gate by itself.

Imported profile snapshots contain personal data and are stored inside owner-scoped CV application/import artifacts. The standalone unauthenticated `/p` editor has no API: its lightweight profile records remain browser-local under `cv-sv:local-profiles:v1`, so clearing site data removes them and shared-device users can read them.

Passwords and hashes must never be logged or serialized through API outputs. `PlainPassword` and `HashedPassword` redact `toString()`/`toJSON()`, but direct `.value`/`.hash` getters exist for hashing and persistence.

## Verification

`tests/core/auth-workflows.test.ts` covers canonical sign-up, duplicate accounts, successful and failed login, password non-exposure, and safe local redirects. `tests/core/auth-principal.test.ts` covers Clerk namespacing, legacy migration sessions, and anonymous rejection. The opt-in browser suite in `tests/smoke/auth-ui.test.ts` exercises protected-route entry, sign-in/sign-up mode switching, enabled social-provider presentation, dialog dismissal, authenticated settings access, and persisted consent.

## Current Gaps

- Plan, subscription, IAM-subject, access-check, legacy CV document, SSE, and MCP routes have no server-side session or ownership enforcement; the new CV import/application routes do enforce the session owner.
- Any caller can supply another user's ids and can mutate IAM subjects; the ABAC evaluator is not wired into protected resources.
- Registration constructs `PlainPassword` directly and therefore bypasses the available `PasswordValidator` strength rules.
- The legacy custom endpoints have no rate limiting, login throttling, password reset, email verification, or documented session rotation; Clerk supplies these identity flows only for broker-managed users.
- The runtime has an insecure local-development fallback session secret; every deployed Deno context must override it with `NUXT_SESSION_SECRET`.
- The `/d*` `?userId=demo` browser bypass and prefix checks are UI-only and broader than exact route matching.
