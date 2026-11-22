# Authentication and IAM

## Identity

Clerk is the primary browser identity provider. Server middleware verifies its session; internal owner ids are clerk:<Clerk user id>. Legacy cookie sessions retain UUID owners. Matching email addresses never merge owners or upload local data.

Clerk is installed first by name (server/middleware/00-clerk.ts, with the module's own handler skipped): the module appends its handler after the app's middleware, so every middleware above it would see no authenticated user. Architecture lint keeps it first.

NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY is public; NUXT_CLERK_SECRET_KEY and NUXT_SESSION_SECRET stay server-side. Deno timeline validation requires matching test keys outside production, live keys in production, and a unique session secret of at least 32 characters.

Legacy register/login canonicalize email, use scrypt password hashes, and create a seven-day auth_session cookie. Password/hash string and JSON conversions redact secrets. Registration bypasses the available password-strength validator, has no email verification or rate limit, and is therefore closed (403) unless a deployment sets NUXT_LEGACY_AUTH_REGISTRATION=true; only local test servers do. Existing legacy sessions and logins keep working until migrated. A legacy cookie is sealed and stateless: logging out clears it in the browser but cannot revoke a copy.

## Sign-in state and sign-out

The page learns who is signed in from /api/auth/me (server-rendered) and from Clerk's client state (useAuthSession): Clerk signs in without a reload, ends sessions in other tabs, and can switch accounts, so the account on screen follows Clerk with one /api/auth/me request per change and no polling. The sign-out control (AccountControl, in every layout and at every screen width) is shown while either source says signed in, so a late or failed /api/auth/me never hides it. Sign-out ends the Clerk session (and the legacy cookie), refuses while offline or when Clerk is unreachable instead of faking success, warns without blocking about unsynchronised work, and never deletes browser-local sessions, drafts, templates or profiles. ClerkJS tells other tabs about a sign-out but not a sign-in or switch, so a tab reloads onto the new account when the session cookie names another user (unless an editor holds unsaved edits).

Browsers send x-ruxt-expected-owner on account requests; a mismatch with the session answers 409 OWNER_MISMATCH before any handler runs, so a tab that missed an account switch can never write as the new account. The sync engine halts on that answer.

## Enforcement

| Surface | Server boundary |
| --- | --- |
| Account preferences and consent | Authenticated owner derived from request context |
| Import, applications, artifacts, full templates, capabilities | Authenticated CV owner; record-level visibility checks |
| /api/public/templates | Public catalog records only |
| Retired /api/cvs and /api/cv-profiles | Authentication middleware, then absent-route 404 |
| /mcp | Authenticated; document tools unavailable |
| Subscriptions | Authenticated owner; another owner's id answers like a missing one; administrators may act for others |
| Plans | Public catalog readable by all; a caller's own plans are private and owner-only; catalog plans are administrator-written |
| IAM subjects | Administrator-only writes; callers read their own subject and check their own access |
| /settings/account | Account-only: Clerk's profile component |

Browser guards and deployment feature gates are not authorization. The /d demo query bypass is UI-only. New anonymous non-auth APIs belong under /api/public/.

## IAM policy

Private core evaluates attribute-based policies using deny-overrides: any deny wins; otherwise one allow is required. Built-in rules allow owners, restrict service accounts to reads, and permit same-org human subscription reads.

The IAM API manages/evaluates subjects; resource routes do not automatically invoke it. Caller-supplied ids are not verified ownership.

## Local data and consent

Signing in does not upload sessions, templates, or profiles. Cloud consent categories are independent and default off. Missing or outdated consent blocks future cloud writes. See [cloud data](authenticated-cloud-data.md).

## Gaps

The administrator role is checked with a Clerk backend call whenever an administrator-only action or another owner's record is requested (ruxt-admin applies the same rule to its own routes; the check is duplicated here because the apps deploy separately). Legacy password endpoints lack rate limits, reset, verification, and documented session rotation; mobile and native clients still use them (see the functionality audit). Live Clerk/browser coverage remains incomplete. MCP does not implement an explicit host/origin allowlist.
