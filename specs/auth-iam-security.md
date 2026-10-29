# Authentication and IAM

## Identity

Clerk is the primary browser identity provider. Server middleware verifies its session; internal owner ids are clerk:<Clerk user id>. Legacy cookie sessions retain UUID owners. Matching email addresses never merge owners or upload local data.

NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY is public; NUXT_CLERK_SECRET_KEY and NUXT_SESSION_SECRET stay server-side. Deno timeline validation requires matching test keys outside production, live keys in production, and a unique session secret of at least 32 characters.

Legacy register/login canonicalize email, use scrypt password hashes, and create a seven-day auth_session cookie. Password/hash string and JSON conversions redact secrets. Registration currently bypasses the available password-strength validator.

## Enforcement

| Surface | Server boundary |
| --- | --- |
| Account preferences and consent | Authenticated owner derived from request context |
| Import, applications, artifacts, full templates, capabilities | Authenticated CV owner; record-level visibility checks |
| /api/public/templates | Public catalog records only |
| Retired /api/cvs and /api/cv-profiles | Authentication middleware, then absent-route 404 |
| /mcp | Authenticated; document tools unavailable |
| Legacy plans, subscriptions, IAM management | No general session/ownership enforcement |

Browser guards and deployment feature gates are not authorization. The /d demo query bypass is UI-only. New anonymous non-auth APIs belong under /api/public/.

## IAM policy

Private core evaluates attribute-based policies using deny-overrides: any deny wins; otherwise one allow is required. Built-in rules allow owners, restrict service accounts to reads, and permit same-org human subscription reads.

The IAM API manages/evaluates subjects; resource routes do not automatically invoke it. Caller-supplied ids are not verified ownership.

## Local data and consent

Signing in does not upload sessions, templates, or profiles. Cloud consent categories are independent and default off. Missing or outdated consent blocks future cloud writes. See [cloud data](authenticated-cloud-data.md).

## Gaps

Legacy commercial/IAM APIs accept caller-selected ids. Legacy password endpoints lack rate limits, reset, verification, and documented session rotation. Live Clerk/browser coverage remains incomplete. MCP does not implement an explicit host/origin allowlist.
