# Security requirements

These requirements apply to every surface. The authentication and IAM specification is the contract; this section states the product-level requirements it implements.

## Identity and authorisation

- Identity is derived from the verified server session on every request. An owner id is never taken from a request body, URL, or client-supplied field.
- Account surfaces (preferences, consent, import, applications, artifacts, full templates, capabilities) require an authenticated owner, with record-level visibility checks against that owner. Cross-owner access is rejected without revealing whether the record exists.
- Administrator status is a server-side role, rechecked on every admin request; non-GET admin requests additionally require a trusted origin. Negative tests are required: anonymous callers receive 401 and authenticated non-admin callers receive 403 on admin routes, and those responses surface as error states in clients, never as success.
- The only anonymous API surface is the public namespace (for example the public template catalog, which returns public records only). New anonymous non-auth APIs belong under `/api/public/`. Browser route guards and feature gates are not authorisation.
- IAM policy evaluation is deny-overrides: any deny wins, otherwise one allow is required. Caller-supplied subject ids are not verified ownership and must not be treated as authority by any client or route.
- Native and mobile clients must not call the legacy plans, subscriptions, or IAM routes, and must never send a caller-chosen user id as authority; plans, subscriptions, and IAM are used only through the authenticated owner and admin surfaces above.

## Credentials and secrets

- Server secrets (identity-provider secret key, session secret) stay server-side; only the publishable key is public. The session secret is unique and at least 32 characters; test keys are used outside production and live keys in production.
- Legacy password credentials use scrypt hashes; password and hash values are redacted in string and JSON conversions. The password-strength validator applies at registration as well as everywhere else it is enforced.
- Platform and deployment tooling handles secrets by reference only: environment variable names in plans, registries, and configuration; values are resolved at apply time and never appear in plans, logs, audit records, or committed files.

## Local and cloud data

- Signing in does not upload local sessions, templates, or profiles, and matching email addresses never merge owners.
- Cloud writes require a current, per-category consent grant for the authenticated owner; missing or outdated consent blocks new writes. Consent defaults to off for every category.
- Local records are never deleted or blanked as a side effect of sign-out, consent revocation, expiry, quota rejection, missing cloud records, or network responses (see the cloud-data specification's destructive-safety checks).

## Automation surface

- The MCP endpoint requires authentication, and document tools are not available through it. An explicit host/origin allowlist for MCP is Planned.
