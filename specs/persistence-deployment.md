# Persistence And Deployment

Last updated: main@d1ae665 | 2026-09-13

## Scope

This spec covers:

- repository ports in `core/repos/` and the aggregate in `infra/types.ts`;
- deployment registry and boot wiring in `infra/deploy/` and `infra/registry.ts`;
- SQLite schema/connection and adapters under `infra/db/` and `infra/deploy/onprem/`;
- Deno KV connection and adapters in `infra/kv.ts` and `infra/deploy/deno/`;
- Nitro CV storage configured in `nuxt.config.ts` and used by `server/adapters/cv/document-store.ts`;
- deployment metadata in `.env.example` and `.github/workflows/deploy.yml`.

## Strategy Selection

`infra/deploy/strategy.ts` owns a global strategy registry. Side-effect imports in `infra/deploy/index.ts` register Deno KV and SQLite. `resolveStrategy()` sorts descending by weight and selects the first predicate that passes:

- Deno KV: weight 10, selected when `globalThis.Deno` exists;
- Cloudflare D1: weight 5, selected when Nitro exposes `globalThis.__env__.RUXT_DB`;
- SQLite: weight 1, unconditional fallback.

Each strategy builds `{ sub, plan, iam, user, cloudConsent, preferences }`. Core handlers depend only on repository interfaces. D1 persists structured aggregates using the same SQLite-shaped tables in `infra/deploy/cloudflare/migrations/0001_init.sql`; D1 batch updates consent projection and audit event together. Strategy selection preserves Deno and SQLite priority. Cloudflare binding behavior still needs runtime verification.

## SQLite

The on-prem adapter opens `local.db` in the process working directory through `better-sqlite3`, enables WAL, and wraps it with Drizzle. Startup executes `CREATE TABLE IF NOT EXISTS` statements for subscriptions, IAM subjects, plans, and users, creates IAM/user indexes, and applies best-effort `ALTER TABLE` additions for plan provider/source/creator compatibility.

Drizzle schema owns serialized columns. Dates and statuses are text, booleans are integer-backed, plan features are JSON text, and ids are text primary keys. There are no foreign-key declarations between subscriptions, plans, users, or IAM subjects.

Repository saves use upsert-by-primary-key. Subscription/user/IAM lookups are direct. Plan queries support all/public/user-owned views. JSON-to-domain hydration reruns value-object validation.

Cloud consent uses `cloud_consent_states`, keyed by owner/category, plus append-only `cloud_consent_events` indexed by owner/change time. A transaction updates one category projection and appends its audit event together, so session and template choices remain independent.

User preferences use `user_preferences`, one row per owner holding the normalized preferences JSON and `updated_at`; `PUT /api/preferences` merges a validated partial update into it.

## Deno KV

`infra/kv.ts` lazily opens one `@deno/kv` connection. Primary/index key families are:

- `['sub', id]` and `['sub_user', userId, id]`;
- `['plan', id]`, `['plan_public', id]`, and `['plan_user', userId, id]`;
- `['user', id]` and `['user_email', email]`;
- `['iam_subject', userId]`;
- `['cloud_consent', ownerId, category]` and `['cloud_consent_event', ownerId, changedAt, eventId]`.
- `['user_preferences', ownerId]` for the owner's editor preferences.

Subscription, plan, user, and cloud-consent writes use atomic operations for primary/index or projection/event updates. List methods walk indexes and fetch each primary record. Deletes remove known indexes.

`iam-subject-repo-kv.ts` and `iam-subject-repo-sqlite.ts` are alternate, currently unregistered IAM adapter implementations. The active strategies instantiate `DenoKvIamRepo` and `SqliteIamRepo`; the alternate Deno class uses different `iam_sub`/`iam_sub_org` keys and must not be assumed to share active data.

## CV Storage

CV documents do not use the deployment strategy or repository aggregate. Default Nitro namespace `cv` uses the filesystem driver with base `CV_DATA_DIR ?? './.data/cv'`; records are stored under `documents:<id>`. Explicit `RUXT_CLOUDFLARE_STORAGE=1` selects `server/storage/chunked-cloudflare-kv.ts` for `cv`, `cvPipeline`, and `analytics` with the `RUXT_KV` binding. The driver stores JSON values inline through 24 KiB and larger values as generation-stamped chunks, with an 8 MiB maximum item; this avoids platform per-value limits but is not a substitute for R2 for large artifacts. A read costs one KV get for an inline value and 1 + chunks gets for a chunked one (chunks fetched in parallel); a chunked item read or written by the same isolate within 10 s costs only the manifest get, because generations are write-once (16 items, 1 MiB each, per mount). Chunk manifests also copy the configured `metaFields` (`id`, `title`, `revision`, `updatedAt` for `cv`) so `getMeta` answers a revision probe without chunk reads. Only `cachedPrefixes` (`templates:` and `template-seeds:` for `cv`) read through the KV edge cache (`cacheTtl` 300 s); CV documents, writes and removals never do. The template seed/migration scan runs once per deployment build (marker `template-seeds:build`, cleared by saving a template) instead of once per isolate, and catalog reads are reused for 60 s per isolate.

Import jobs, source/generated artifacts, and composed CV applications use the separate filesystem namespace `cvPipeline` at `CV_PIPELINE_DATA_DIR ?? './.data/cv-pipeline'`. Jobs and metadata are JSON records; artifact bodies use raw storage values. Source and generated artifact metadata carry checksums and expiry timestamps, defaulting to 24 hours through Nuxt runtime config `cvArtifactTtlHours` (`NUXT_CV_ARTIFACT_TTL_HOURS`). Local `.data/` is ignored by Git.

This separation means selecting Deno KV for subscription data does not move CV data into Deno KV. Filesystem durability and sharing depend on the deployed Nitro environment. Cloudflare Workers KV is eventually consistent; this application has no Durable Object event hub, so process-local SSE updates do not broadcast across isolates.

CV source compatibility uses lazy, idempotent soft migrations rather than a database migration table. Document list/read rewrites only records carrying the legacy `.cv-sheet` or intermediate `.cv-document` stylesheet contract to explicit `:::resume`/`{.cv-name}` indicators and increments their revision; template catalog initialization rewrites the same contracts in existing `templates:*` values without creating a new semantic template version. Nonmatching records and retained legacy document aliases remain untouched.

## Deployment Configuration

The package supports Nuxt dev/build/generate/preview. `NITRO_PRESET` may select a target. `.env.example` mentions `DATABASE_URL` for Neon and a node-server preset, but no current source reads `DATABASE_URL` and there is no PostgreSQL/Neon adapter.

`.github/workflows/deploy.yml` validates pushes to `main`, pull requests, and manual dispatch with Node 22, pinned pnpm 11.25.0, a frozen install, and a `deno-deploy` Nitro build. The Deno Deploy native GitHub integration owns deployment and default-branch promotion. Deno KV uses the runtime-native `Deno.openKv()` API so the bundle does not include the Node-only `@deno/kv` N-API package. Runtime Clerk and session secrets are configured separately in Deno Production and Development contexts as specified in `testing-devops.md`; they do not belong in the Build context. Authenticated feature policy is entirely deployment-configured rather than embedded in the package. Set `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_DISABLED_HOSTS=*.deno.net` and provide the feature-owned routes through `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_ROUTES` to disable them on shared Deno hostnames while leaving custom domains enabled. Values are comma-separated; empty values enable authentication on all hosts and assign no routes.

## Current Gaps

- Cloudflare D1 and KV adapters, binding resolution, migration application and Worker runtime smoke have not yet been exercised against a local or account-backed runtime.
- Cloudflare KV eventual consistency and process-local CV listener/write queues do not provide strong multi-isolate revision serialization or realtime SSE delivery.
- Python extraction/OCR and filesystem-backed pipeline execution are unavailable on Workers; capability reports unavailable and import POST rejects with 503 before accepting work.
- CV document and pipeline filesystem persistence is not compatible with stateless/multi-instance Deno deployment without a durable shared storage implementation.
- Artifact expiry metadata is recorded, but scheduled physical deletion is not implemented yet.
- SQLite startup migration is ad hoc and non-transactional; there is no migration version table or rollback path.
- SQLite has no foreign keys, so dangling plan/user references are possible.
- Deno KV plan saves do not remove an old user index if an existing plan changes creator or changes from user to catalog source.
- Two parallel IAM adapter pairs use incompatible Deno key schemas, creating maintenance and accidental-import risk.
- `.env.example` still documents an unused PostgreSQL requirement and omits `CV_URL` and `CHROMIUM_PATH` configuration.
