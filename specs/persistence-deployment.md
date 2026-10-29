# Persistence and deployment

## Repository strategies

infra/deploy/strategy.ts selects the highest matching weight:

| Strategy | Weight | Selection |
| --- | --- | --- |
| Deno KV | 10 | globalThis.Deno exists |
| Cloudflare D1 | 5 | Nitro exposes __env__.RUXT_DB |
| SQLite | 1 | Fallback |

Each builds subscription, plan, IAM, user, cloud-consent, and preferences repositories. Handlers depend on private core interfaces.

SQLite opens local.db in the process directory, enables WAL, and creates tables/indexes at startup. Consent projection and audit events update transactionally. Schema changes are ad hoc; there is no versioned migration or foreign-key enforcement.

Deno KV maintains primary and secondary indexes for subscriptions, plans, users, subjects, consent, and preferences. Atomic operations keep associated writes together. Alternate unregistered IAM adapters use different key families; they are not interchangeable.

D1 uses infra/deploy/cloudflare/migrations/0001_init.sql and the same logical aggregates. No PostgreSQL adapter reads DATABASE_URL despite the example environment comment.

## Nitro namespaces

| Namespace | Content | Default local path |
| --- | --- | --- |
| cv | Catalog templates and seed metadata | .data/cv |
| cvPipeline | Import jobs, applications, source/generated artifacts | .data/cv-pipeline |
| analytics | Hourly route/CQRS/user/task aggregates | .data/analytics |

nuxt.config.ts chooses filesystem storage by default, chunked Deno KV when RUXT_DENO_STORAGE=1, or chunked Workers KV when RUXT_CLOUDFLARE_STORAGE=1. Separate deployments require shared backing storage; matching paths on different hosts do not synchronize.

Browser CV sessions/profiles/templates are local. The retired documents:* keys are not served or modified. See [local sessions](cv-documents-realtime.md).

## Chunking and retention

Workers KV stores JSON inline through 24 KiB and larger values as generation-stamped chunks, up to 8 MiB per item. Cached template prefixes and short-lived per-isolate chunk caches reduce reads. KV remains eventually consistent and does not provide transactional publication or multi-isolate revision control.

Pipeline artifacts carry checksums and expiry timestamps; default TTL is 24 hours. Python/OCR and local temporary files are unavailable on Workers. Background pipeline maintenance is omitted from the Worker build.

## Deployment

Ruxt's build script enables Deno storage. For Node/filesystem output, build with the node-server preset and storage flags unset. Cloudflare has a separate build/deploy path; see [runbook](cloudflare-migration-runbook.md).

Clerk/session secrets and feature host/route rules are environment configuration. Deployment definitions do not establish production readiness.

## Gaps

SQLite migrations lack rollback/version tracking. Some legacy Deno indexes and duplicate IAM adapters need cleanup. Strong catalog publication concurrency and end-to-end persistence/restore checks remain incomplete.
