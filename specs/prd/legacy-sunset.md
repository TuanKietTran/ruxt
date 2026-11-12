# Legacy sunset

Clerk, Cloudflare, and Deno Deploy are legacy dependencies. All three are retired by January 2027. Until retirement each sits behind a narrow seam, carries its sunset in the legacy tracker (Planned: a versioned registry rendered read-only on the admin platform pages), and gains no new dependents. New code targets the replacement, not the legacy provider.

## Clerk — identity

Current state: Clerk is the primary browser identity provider; server middleware verifies its session and owners are stored as `clerk:<user id>`. A legacy cookie-session system (canonicalised email, scrypt hashes, seven-day `auth_session` cookie) already exists alongside it, and the identity seam (`server/utils/auth-user.ts`) isolates callers from the provider.

Retirement path: promote the local session authentication behind the existing seam; migrate or re-key stored `clerk:` owner ids (email matching never merges owners); replace the Clerk user lookup and the admin role check with local role records; remove the Clerk package from both applications; retire the `CLERK_*` environment names and telemetry. The admin application's per-request server-side role check keeps working throughout, sourced from local records instead of Clerk metadata.

## Cloudflare — hosting and storage

Current state: the production web deployment is a Cloudflare Worker with the custom domain, a D1 database binding, and a Workers KV binding; a separate Cloudflare build/deploy path and migration runbook exist.

Retirement path: move hosting to the native/self-hosted deployment and data to the replacement persistence adapter (SQLite first); work the bindings, the custom domain, and the tag-gated deployment workflow through the migration runbook in order, verifying bindings, deployment, and rollback at each step. No new Worker features, bindings, or KV namespaces are added meanwhile.

## Deno Deploy — runtime and KV

Current state: the default build enables Deno storage; Deno KV is the highest-weighted persistence strategy (weight 10, ahead of D1 at 5 and SQLite at 1), with primary and secondary indexes maintained for subscriptions, plans, users, subjects, consent, and preferences.

Retirement path, in mandatory order: first flip the strategy weights so SQLite/D1 win selection and verify every repository against the replacement store; then retire the Deno KV repositories, the chunked Deno KV storage driver, and the Deno build/deploy path. The order matters: the Deno adapter is removed only after nothing selects it.

## Rules for the sunset period

- The tracker records, per provider: dependents, checklist items with state, replacement, and the January 2027 sunset date. Progress is measured against it (section 6).
- Legacy adapters in the platform control plane (Planned) carry the same sunset field and checklist state as the tracker; they are not extended with new capabilities.
- A missed checklist item is carried past the date only with a recorded decision in the tracker, never silently.
