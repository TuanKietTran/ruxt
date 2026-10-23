# Ruxt Admin: Deno Deploy → Cloudflare migration plan

## 1. Status, discovery, and evidence

**Source found; implementation and production migration NOT performed.** This is a separate migration from the public Ruxt application. The assignment identifies `ruxt-admin`, `admin.mashallow.cloud`, and production Deno KV database `659376af-cabf-4f66-9c70-9c489503dff6`. Those deployment facts are **UNVERIFIED against the providers**; no Deno credentials or database connections were used.

Evidence baseline:

| Evidence | Finding |
| --- | --- |
| Planning repository | `TuanKietTran/ruxt`, local `main`, initial HEAD `15b2d89ba22b35fdf8929e199845de279f1ba4b8`; `git remote -v`, branch and HEAD inspected. |
| Dedicated admin repository | Read-only GitHub API confirmed private `TuanKietTran/ruxt-admin`, default branch `main`, inspected commit [`0d148363326ebca35bae2156481d6d71b083f081`](https://github.com/TuanKietTran/ruxt-admin/tree/0d148363326ebca35bae2156481d6d71b083f081). Repository tree and pinned source archive inspected. |
| Dependency contract | Admin `package.json` and lockfile pin `@ruxt/core` / `@ruxt/editor` to `0.1.1`. Public npm metadata and the `@ruxt/core@0.1.1` archive were read; npm reports gitHead `323ce6063edcf1064faf40ca215af7bda23c14bd`. Shapes below use that exact core package, not the newer local core alone. |
| Local context | `docs/architecture.md`, `docs/repository-split.md`, `specs/architecture-runtime.md` independently identify a separately deployed private admin app with GitHub allowlist auth and shared storage contracts. |
| Deployment evidence gap | GitHub deployments API returned no entries. This does **not** establish that no Deno deployment exists. Deployed SHA, build settings, environment values, actual database selection, contents/counts/TTLs, current DNS records, Clerk settings, and Cloudflare resource availability are **UNVERIFIED**. |

Discovery performed:

- Searched directory names and `deno.json` / `deno.jsonc` / `*ruxt-admin*` file names beneath `~/Downloads`, explicitly pruning `~/Downloads/ruxt-work/migration-out` before traversal. A second focused directory search pruned dependency/build/git internals.
- Inspected Ruxt locations under `~/Downloads/ruxt-work`: `ruxt-new`, `ruxt`, `ruxt-core`, worktrees, and Cloudflare worktree locations by path discovery. No standalone local admin checkout was located by those searches; this is not a claim that every local file was content-searched.
- Searched Ruxt repository `vendor/` locations, excluding dependency/build/git internals and the forbidden directory. Located `ruxt-new/vendor/tuankiettran-ruxt-core-0.3.0.tgz`; inspected its archive listing and contract files. It is a newer core package, not admin app source, and is not the admin dependency baseline.
- Inspected local Ruxt remotes; queried read-only `TuanKietTran` GitHub repository listings, admin metadata/tree/commit/deployments, and core tags (no tags returned). Downloaded pinned admin and public npm archives into temporary directories for inspection only.
- **Never read, deleted, or wrote anything inside `~/Downloads/ruxt-work/migration-out`.** No exports, imports, deployment, login, tokens, DNS, secrets, or external writes were performed.

**BLOCKED authorization gates:** production runtime/database verification, production export, resource creation, configuration changes, deployment, and cutover require separate authorization. Finding source does not clear these gates.

### Critical topology uncertainty

Admin `server/storage/chunked-deno-kv.ts` uses `options.path ?? Deno.env.get("DENO_KV_URL")`, then `Deno.openKv(path)`. Without an override, the app opens its deployment's default KV. Its comments and README intend shared public/admin storage, but the assignment explicitly identifies a **second production database**. Therefore matching storage prefixes do not prove shared data. Whether admin reads its own database, remotely selects the public database, or contains stale/independent data is **UNVERIFIED**. Inventory and reconcile both database identities before any consolidation; never import this database on top of the public app's existing migration output or resources blindly.

## 2. What the admin app does

Source references below are relative to the pinned admin repository unless prefixed `ruxt-new/`.

- Independent Nuxt dashboard (`app/pages/index.vue`) for route, CQRS, user, and task analytics. `GET /api/analytics` reads 1–720 trailing hours (24 by default), returning aggregate tables and hourly series; it does not generate the public app's measurements.
- CV import-job visibility (`app/pages/jobs.vue`, `GET /api/jobs`): reads durable jobs; reports counts by state/error, mean finished-job duration, and the 50 most recently updated jobs. It is **not** a job execution, retry, cancellation, or Python extraction service in the inspected source.
- Template catalog list/detail/new/editor pages: Markdown/CSS editing, local file import, capabilities/tags, live preview via `@ruxt/editor`, and immutable-content version creation.
- APIs: `GET/POST /api/templates`, `GET /api/templates/:id?version=…`, `POST /api/templates/:id/versions`, `PUT /api/templates/:id/versions/:version/publish`, and `DELETE /api/templates/:id/versions/:version`.
- Publication mutates `public` tags, unpublishing other versions of the same template. `local` templates cannot be versioned/published here; internal `pipeline-default` cannot be published. Built-in versions cannot be deleted; published versions must be unpublished before deletion. Source: `server/lib/templates.ts`.
- GitHub OAuth sign-in/callback (`/login`, `/oauth/github`, `GET /api/oauth/github`), numeric GitHub-ID authorization, `GET /api/me`, `POST /api/logout`, and unauthenticated `GET /api/health`.
- There are no inspected admin routes for public-user account administration, billing changes, Clerk management, or general CV document editing. Do not infer these from the word “admin.”

## 3. KV schema and value shapes found in source

Storage mounts in `nuxt.config.ts` are `cv` → physical base `cv`, `cvPipeline` → `cv-pipeline`, and `analytics` → `analytics`. The Deno driver splits colon-separated logical keys into nonempty array segments; it does not store the entire logical key as one segment except inside chunk keys.

| Purpose | Nitro logical key | Deno physical array key | Value |
| --- | --- | --- | --- |
| Template version | `templates:<id>:v<version>` in `cv` | `["cv", "templates", id, "v" + version]` | `CvTemplateProps`, or chunk manifest below. |
| Metric hour | `<kind>:<UTC-hour>` in `analytics` | `["analytics", kind, hour]` | `MetricBucket`, or chunk manifest. `kind` is `routes`, `cqrs`, `users`, or `tasks`; hour format `YYYY-MM-DDTHH`. |
| Import-job visibility | keys under `imports:` in `cvPipeline` | `["cv-pipeline", "imports", ...suffixSegments]` | `CvImportJobProps`, or chunk manifest. Admin scans the prefix and filters values with an `id`; exact producer suffix layout is **UNVERIFIED by admin source**. |
| Large JSON payload chunk | hidden from logical listings | `[base, "__ruxt_chunks__", logicalKey, generation, numericIndex]` | `Uint8Array` containing a UTF-8 JSON slice. `logicalKey` retains its colons as one segment here. |

Exact contract shapes from `@ruxt/core@0.1.1`:

```ts
interface CvTemplateProps {
  id: string; version: number; name: string;
  markdownSkeleton: string; css: string;
  capabilities: { pageFormats: string[]; supportsPhoto: boolean; atsFriendly: boolean };
  builtIn: boolean; tags: string[]; createdAt: string;
}
type MetricBucket = Record<string, {
  count: number; errors: number; totalMs: number; maxMs: number;
  statuses: Record<string, number>;
}>;
interface CvImportJobProps {
  id: string; ownerId: string; template: { id: string; version: number };
  state: "queued" | "running" | "awaiting_input" | "succeeded" | "failed" | "cancelled";
  progress: number; stage: string; source: CvSourceArtifact;
  artifacts: CvGeneratedArtifact[]; warnings: string[];
  error?: { code: string; message: string; reasons?: string[] };
  cancelRequested: boolean; attempt: number; idempotencyKey?: string;
  createdAt: string; updatedAt: string;
}
```

`CvSourceArtifact` has `id`, `filename`, `mediaType`, `size`, `checksum`, `createdAt`, `expiresAt`. `CvGeneratedArtifact` substitutes `kind` (`concept`, `markdown`, `css`, `html`, `raw-text`) for `filename`, retaining the other fields. Error-code union: `EMPTY_OR_UNREADABLE`, `NOT_CV_ALIKE`, `UNSUPPORTED_MEDIA_TYPE`, `FILE_TOO_LARGE`, `EXTRACTION_UNAVAILABLE`, `EXTRACTION_FAILED`. These are metadata contracts, not evidence that artifact bytes reside in this database.

Template rules include positive integer versions, 2–64-character lowercase/digit/hyphen IDs not beginning `local-`, up to eight custom tags, Markdown length ≤500,000 and CSS length ≤100,000 JavaScript characters. Content is versioned, but publication tags remain mutable. Source updates are ordinary read/list/set operations without compare-and-swap or a multi-key transaction; concurrent version creation/publication is a migration risk, not an existing guarantee.

Chunk manifest: `{ $ruxtStorage: "ruxt-chunked-json-v1", generation: string, chunks: number, bytes: number }`. Deno defaults to 48 KiB chunks and an 8 MiB logical-item ceiling; small values are stored directly. Driver supports optional `expireIn` derived from TTL seconds, but mounts do not configure TTL. Actual production expirations and other prefixes are **UNVERIFIED**.

Admin sessions are H3 sealed cookies containing optional `user: { id: number, login: string, name: string | null, avatarUrl: string }`, `oauthState`, and safe redirect path, **not a source-proven KV session table**. No `user`/`plan`/`sub` prefixes are evidenced by admin consumers. Preserve/classify any additional families found during a separately authorized export rather than assuming this table is exhaustive.

## 4. Deno APIs and dependencies to replace or validate

- Direct runtime dependency: `Deno.openKv`, `Deno.env.get("DENO_KV_URL")`, KV `get/set/delete/list/close`, optional `expireIn`. Remote KV would use the Deno access-token environment mechanism; none was inspected or used.
- Build selects Deno storage with `RUXT_DENO_STORAGE=1` (`package.json` build script) or `NITRO_PRESET=deno-deploy`. Local/alternate fallback uses filesystem storage (`/data/*` in production). Workers must not fall back to filesystem or call Deno KV.
- Nuxt 4, Vue, Vue Router, Nitro/H3/unstorage, `@ruxt/core@0.1.1`, `@ruxt/editor@0.1.1`, CodeMirror and Lezer packages. These editor/browser dependencies require bundle inspection to avoid server-side inclusion. Existing admin CI is manual `workflow_dispatch`, Node 22, pnpm 11.25.0, frozen install/typecheck/build; it is not a Cloudflare deploy pipeline.
- `node:module` `createRequire`, `node:path`, and `node:url` occur in build configuration. OAuth uses `node:crypto` `randomBytes` / `timingSafeEqual` and `Buffer`; select and test Workers compatibility or replace with reviewed Web Crypto equivalents. Do not assume all Node compatibility works because the main app builds.
- Web-standard `crypto.randomUUID`, `TextEncoder`, `TextDecoder`, URLs, and outbound HTTP calls can remain. H3 sealing/session behavior and Nuxt runtime-config injection must be tested on actual Workers bindings.
- No direct Clerk dependency, Deno cron/queue subscription, subprocess, or Python execution was found in admin server code. Transitive editor dependencies and final Worker CPU/bundle size remain **UNVERIFIED**.

## 5. Proposed Cloudflare target (design, not provisioned)

### Worker and data ownership

Create a **separate** admin Nuxt/Nitro Cloudflare Worker and separate staging/production configuration. Serve bundled assets and same-origin APIs together; retain the standalone hostname and private administrative boundary. Do not mount admin routes into the public Worker or grant the admin Worker unnecessary public users/billing bindings. Production bindings, names, IDs, plan limits, and budgets require approval.

Storage decision:

| Data | Target decision | Required condition |
| --- | --- | --- |
| Authoritative template versions and publication | **D1**, with `(template_id, version)` primary key, immutable content JSON/columns, and a single publication pointer per template. Use atomic conditional version allocation/publication transactions, conflict responses, and an administrative audit trail. | Coordinate the public application's catalog reader/seeding adapter to use the same authority (shared narrowly scoped catalog D1 binding or an authenticated catalog service). This schema/adapter work does not exist in the current migration. Do not enable publication while public Ruxt still reads a disconnected KV copy. |
| Hourly analytics snapshots | **Workers KV** compatibility layout initially; stale reads acceptable for dashboards. | Identify the actual authoritative producer and destination namespace. Admin is read-only for these families. KV read-modify-write is not safe for concurrent authoritative counters; keep/fix producer aggregation separately rather than claiming KV provides atomic increments. |
| Import-job snapshots | **Workers KV** read-only visibility initially, matching the public migration layout. | Public pipeline remains authoritative; accept display staleness only. Do not use dashboard reads to control jobs. If job execution moves to strongly consistent storage later, adapt the reader to that service. |
| Other database families | **No automatic decision/import.** | Authorized inventory and explicit classification first. Preserve originals and report unknowns. |

A separate admin database is not a reason to duplicate public metrics/jobs permanently. **ASSUMPTION:** shared visibility/publication remains the desired product behavior described by source. Compare both source databases by identity, logical key, hash, provenance, and producer ownership. Collisions require an explicit conflict policy; never use last-import-wins. Keep provenance in migration manifests without logging user records.

Read-only staging can first exercise all three families through the reusable KV driver. This is **not** final approval for KV-based production publication: eventual consistency, non-atomic multi-key changes, and the inspected implementation's immediate deletion of prior generation chunks can expose missing chunks during propagation. Gate mutations until D1/public-reader integration is validated. Consider delayed chunk cleanup and retries for remaining KV writes; test rather than asserting chunk generation swaps are atomic.

### Clerk/auth approach

**Recommended migration baseline: retain independent GitHub OAuth and numeric-ID allowlist**, not a simultaneous identity migration. Public Ruxt uses `@clerk/nuxt`; that does not make every Clerk user an administrator. Keep the admin session isolated, host-only, secure, HTTP-only, SameSite=Lax, eight-hour lifetime, and per-request allowlist recheck. Preserve OAuth state checks, safe redirects, exact canonical origin, mutation-origin checks, and no-store auth responses. Health/OAuth are the intentional API guard exceptions.

Provision fresh environment-specific session material only with authorization; never copy public-app sessions. Runtime validation requires an HTTPS admin origin, a nondevelopment session secret of at least 32 characters, GitHub client configuration, and a nonempty numeric allowlist. Keep values out of source, logs, manifests, and command arguments.

If Clerk consolidation is explicitly required later: use an admin-specific application/policy and server-side verified sessions/claims; map verified GitHub numeric identities or another approved immutable administrator list, enforce authorization on every API, and deny ordinary public Clerk users. Test issuer/audience, expiry, role revocation, OAuth redirects, and CSRF. Client-side role checks, email matching, and a general “signed in” check are insufficient. Clerk application/domain settings, entitlement mapping, and live behavior are **UNVERIFIED** and require authorization; no Clerk change is part of this plan execution.

### Domain strategy

Retain `https://admin.mashallow.cloud` on a dedicated Worker Custom Domain (subject to zone eligibility and current record inspection). Keep `NUXT_ADMIN_ORIGIN` canonical and OAuth callback exactly `https://admin.mashallow.cloud/oauth/github`; a stable hostname should avoid a production callback change if already configured correctly (**UNVERIFIED**). Use a separate approved staging hostname and separate OAuth application/settings; do not redirect production callbacks into staging.

Before cutover, authorized operator records current DNS/routing/TLS and rollback values, checks conflicts and cookie behavior, and validates staging without exposing sensitive dashboards. Changing Custom Domain routing can alter DNS; treat it as a gated production change, not a harmless build step. Do not deploy another Worker onto public Ruxt's domain/routes. Production hostname ownership, current TTL/proxy state, and issuance readiness remain **UNVERIFIED**.

## 6. Reuse/adaptation of `ruxt-new/scripts/migrate/`

Reuse the machinery, **not the current schema assumptions or production bindings**:

- `deno-kv-to-cloudflare.ts export`: read-only full KV listing with typed JSONL keys/values/versionstamps and private directory/file modes. Parameterize an explicitly verified admin source identity and a new isolated output directory, never the existing `migration-out`. The current exporter buffers the entire database and is not a cross-key snapshot while writes continue; assess size and freeze writers for a consistent final export.
- `transform`: already recognizes `cv`, `cv-pipeline`, `analytics`, reconstructs Deno chunks, and emits 24 KiB Workers chunks (8 MiB ceiling). `logic.ts` provides SQL quoting, hashes, owner digests, and fail-closed unknown-prefix classification.
- Do **not** run the unmodified transformer on admin and expect a valid result: it assumes public-user/billing prefixes and secondary indexes, emits public D1 tables, and knows nothing about a relational template catalog. A storage-only admin export may pass existing index count checks simply because both sides are zero; that is not schema validation.
- Add an explicit admin mode/profile in future authorized implementation: allowed families, source/database manifest, template-to-D1 conversion, shared-data conflict handling, approved binding/config/environment arguments, and deterministic full-content verification. Retain rejection of every unclassified prefix and validate duplicate template identity/version, tags, references, and chunk integrity.
- `check-kv-roundtrip.ts`: useful offline reconstruction through the production Workers KV driver; it currently prints logical keys and sizes, so redact identifiers for real-data runs. It validates generated import files via an in-memory map, **not remote imported bytes**.
- `verify`: currently hardcodes `RUXT_DB`/`RUXT_KV`, defaults to remote, permits some extra D1 rows, does owner digests only for selected public tables, and samples up to 20 nonbinary KV values. It does not verify every remote binary chunk or D1 template row. Require exact frozen-snapshot counts and full admin catalog hashes, deterministic logical hashes, destination provenance, and actual remote chunk reads before acceptance.
- `seed-rehearsal.ts` and `smoke-worker.mjs`: patterns for synthetic rehearsal and HTTP smoke coverage, not evidence of admin-specific tests. Add fixtures for all metric kinds, all job states/errors, template restrictions/conflicts, Unicode and chunk-boundary payloads, unknown prefixes, missing chunks, and auth/origin denial cases.
- `server/storage/chunked-cloudflare-kv.ts` is a compatibility starting point for the admin read mounts. Wire actual Workers bindings into Nitro context (the existing driver expects `globalThis.__env__`) without process-global cross-environment leakage; test missing binding failures. Do not assume copying the driver alone configures the Worker.

The existing public runbook's remote commands and D1 schema must not be applied wholesale to this second database. No migration script or real-data command was executed during this assignment.

## 7. Phased implementation, migration, validation, cutover

1. **Authorize discovery and settle topology.** Confirm deployed admin revision/build, actual Deno KV selection, the separately identified database and all writers, public-source identity, production OAuth/canonical origin, and target ownership. Record nonsecret resource identities and resolve unknown families/conflicts. Gate: approved authoritative-data map and cutover owner; source correspondence remains blocked until verified.
2. **Implement offline in the admin repository.** Pin reviewed source/dependencies, add Cloudflare build/storage selection, isolated Wrangler environments/bindings, runtime validation, compatibility tests, API/auth tests, and synthetic fixtures. Implement D1 catalog transaction/audit behavior and coordinated public reader/seeding changes in separately scoped work. Gate: typecheck, tests, Worker bundle/CPU assessment, no filesystem/Deno calls in runtime, and least-privilege bindings. Do not modify this repository's public-worker configuration merely to host admin.
3. **Synthetic rehearsal.** Test exports/transforms/imports only against disposable local fixtures/resources under separately granted implementation permissions. Exercise direct/chunked values, invalid schemas, unknown families, collisions, publication concurrency, unpublished/built-in/local/internal restrictions, and restoration. Compare complete logical payload hashes, metric totals, job state/error counts, and template version/publication invariants. Gate: reproducible admin-specific manifest and verification with no real data.
4. **Authorized isolated real-data rehearsal.** Use a separately approved restricted export location and operator-managed credentials, never credentials in shell arguments or logs. Export the admin database independently; retain encrypted/restricted backups and provenance. If public/admin datasets overlap, produce a conflict report for approval before merging anything. Import into isolated staging targets, not existing production bindings; keep publication disabled. Gate: every prefix classified and counts/content reconciled, with TTL/artifact exceptions explicitly resolved.
5. **Staging functional/security validation.** Verify dashboard parity for fixed UTC windows and job snapshots; template list/detail/editor/preview and all mutations on fixtures; public-reader visibility of publication; missing/corrupt chunk behavior; concurrent updates; production-like latency and limits. Test unauthenticated requests, nonallowlisted users, allowlist revocation, invalid OAuth state, redirect handling, forged/missing Origin, logout, cookie flags, and secret/binding fail-closed behavior. Real OAuth login requires authorization; none was attempted here. Gate: recorded tests and accepted freshness/error thresholds.
6. **Authorized final freeze and migration.** Freeze admin template mutation **and every relevant producer** (public analytics/job/template writers if shared), drain pending writes as appropriate, then make a final separately identified export. KV listing alone is not a database-wide transaction; compare pre/post manifests under freeze. Apply only approved reconciliation/conversions into clean or demonstrably reconciled targets; verify exact counts, full logical hashes, catalog publication invariants, and public-reader compatibility. Account for artifacts and expiration separately. Gate: signed-off validation and an executable rollback decision before routing changes.
7. **Authorized deployment and hostname cutover.** Deploy admin with isolated production bindings, verify via approved private preview/staging access, then change `admin.mashallow.cloud` routing/TLS only after explicit approval. Test health and auth denial without credentials first; authorized operator completes login and dashboard checks. Unfreeze writers only once both applications use the intended authorities. Monitor errors, auth failures, publication conflicts, data freshness, and chunk read failures. Do not shut down Deno or delete its KV database during cutover.
8. **Observation and closure.** Maintain a bounded observation period and reconciliation/audit checks; document remaining feature gaps and approved retention. Retirement, database deletion, backup disposal, and credential revocation are separate authorization gates, not automatic final steps.

## 8. Risks and rollback

- **Wrong database / split-brain:** intended sharing in comments contradicts certainty about actual bindings. Preserve both originals, verify identities, and do not combine exports until conflicts and writer ownership are resolved.
- **Catalog authority mismatch:** D1-only admin writes would be invisible to unchanged public KV readers. D1/public adapter and seeding integration is a hard prerequisite for enabling mutation.
- **Consistency/concurrency:** Workers KV is eventually consistent; publication/version allocation cannot rely on list-then-set. Chunk replacement and cleanup can race reads. Use transactional catalog writes, test concurrent behavior, and define acceptable metrics/job staleness.
- **PII and operational exposure:** jobs contain owner IDs, filenames, and error text; user metrics may identify owners. Restrict export/manifest access and log only nonidentifying verification summaries. Do not include record samples in this document or CI artifacts.
- **Incomplete snapshots/TTLs/artifacts:** Deno listing does not expose remaining TTLs; active exports can mix revisions. Artifact metadata is not a backup of bytes. Establish authoritative retention and blob location before claiming complete recovery.
- **Runtime and limits:** editor dependency size, Node crypto compatibility, H3 sealing, full scans of all jobs/templates, and up to 2,880 metric reads per analytics request need measurement. Paginate/index and bound concurrency in implementation as needed; no production performance claim is made here.
- **Authentication regression:** preserving identity scope, origin enforcement, and independent cookies matters more than adopting Clerk during cutover. New session keys may deliberately require fresh login; do not promise existing sessions survive.

Rollback before Cloudflare writes: keep the original Deno deployment/database intact; restore the recorded hostname routing, verify HTTPS/OAuth, and resume the original writers after validation. DNS and browser propagation mean rollback is not instantaneous.

Rollback **after** Cloudflare writes: first freeze all affected writers. Export/reconcile new D1 catalog versions/publication/audit data and any other authoritative deltas into an approved backward-compatible restoration path, or obtain an explicit accepted-loss decision. Then restore routing and unfreeze the selected authority. A DNS reversal alone loses or forks post-cutover changes. Rehearse this procedure; keep the old code/config and source-format backup, but never put secrets in the rollback record. Do not run Deno and Cloudflare as independent active writers to the same logical catalog.

## 9. Needs user authorization

All items below are pending, not instructions already executed:

- Production Deno deployment/configuration inspection and confirmation of the admin database and actual `DENO_KV_URL` selection; any Deno token use, creation, rotation, or deletion.
- Reading/exporting any production KV data, including a new admin-only export location, data handlers, retention policy, backup encryption, and any access to the existing forbidden `migration-out` (not needed for this plan and still prohibited).
- Selecting authoritative datasets, shared public/admin access, conflict-resolution rules, migration exclusions, TTL reconstruction, artifact handling, and any accepted loss.
- Implementing changes outside this document, including the private admin repository, migration scripts, public catalog adapters, CI, auth policy, or schema/audit design.
- Creating/changing Cloudflare Workers, D1, KV, bindings, service access, environments, domains, routes, DNS/TLS, paid-plan resources, or production data imports.
- Any GitHub/Cloudflare secret write or login; GitHub OAuth application/callback changes; real sign-in tests; session-key provisioning; any Clerk application, domain, credential, or administrator-policy change.
- Push, publish, deployment (including any `wrangler deploy`), merge, repository visibility changes, production writer freeze/restart, routing cutover, or rollback execution.
- Deno app retirement, deletion of either database, deletion of backups/exports, or credential revocation. None is implied by migration approval.

This assignment authorizes **only this planning document**, not any of these execution steps.
