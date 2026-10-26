# Ruxt Admin: Deno Deploy → Cloudflare migration plan

## 1. Status, discovery, and evidence

**Phase 1 source discovery VERIFIED; phase 2 design recorded below; implementation and production migration NOT performed.** Source verification is against pinned code, not deployed behavior. This is a separate migration from the public Ruxt application. The assignment identifies `ruxt-admin`, `admin.mashallow.cloud`, and production Deno KV database `659376af-cabf-4f66-9c70-9c489503dff6`. Those deployment facts are **UNVERIFIED against the providers**; no Deno credentials or database connections were used.

Evidence baseline:

| Evidence | Finding |
| --- | --- |
| Planning repository | `TuanKietTran/ruxt`, local `main`, initial HEAD `15b2d89ba22b35fdf8929e199845de279f1ba4b8`; `git remote -v`, branch and HEAD inspected. |
| Dedicated admin repository | Read-only GitHub API confirmed private `TuanKietTran/ruxt-admin`, default branch `main`, inspected commit [`0d148363326ebca35bae2156481d6d71b083f081`](https://github.com/TuanKietTran/ruxt-admin/tree/0d148363326ebca35bae2156481d6d71b083f081). Repository tree and pinned source archive inspected. |
| Dependency contract | Admin `package.json` and lockfile pin `@ruxt/core` / `@ruxt/editor` to `0.1.1`. Public npm metadata and the `@ruxt/core@0.1.1` archive were read; npm reports gitHead `323ce6063edcf1064faf40ca215af7bda23c14bd`. Shapes below use that exact core package, not the newer local core alone. |
| Local context | `docs/architecture.md`, `docs/repository-split.md`, `specs/architecture-runtime.md` independently identify a separately deployed private admin app with GitHub allowlist auth and shared storage contracts. |
| Follow-up source discovery | `rxadmin/DISCOVERY.md` records the local admin checkout on `feat/ruxt-admin-cloudflare`, HEAD `0d148363326ebca35bae2156481d6d71b083f081`, initially clean. Exact core/editor 0.1.1 archive integrity matched lockfile and registry. Sections 3–4 source contracts and the Clerk inventory below are **VERIFIED at this pin**, not production assertions. |
| Deployment evidence gap | GitHub deployments API returned no entries and Actions returned zero runs. No authenticated read-only Deno metadata was established. This does **not** establish that no Deno deployment exists. Deployed SHA, build settings, environment values, actual database selection, contents/counts/TTLs, current DNS records, provider Clerk settings, and Cloudflare resource availability are **UNVERIFIED**; production topology is **BLOCKED**. |

Discovery performed:

- Searched directory names and `deno.json` / `deno.jsonc` / `*ruxt-admin*` file names beneath `~/Downloads`, explicitly pruning `~/Downloads/ruxt-work/migration-out` before traversal. A second focused directory search pruned dependency/build/git internals.
- Inspected Ruxt locations under `~/Downloads/ruxt-work`: `ruxt-new`, `ruxt`, `ruxt-core`, worktrees, and Cloudflare worktree locations by path discovery. No standalone local admin checkout was located by those searches; this is not a claim that every local file was content-searched.
- Searched Ruxt repository `vendor/` locations, excluding dependency/build/git internals and the forbidden directory. Located `ruxt-new/vendor/tuankiettran-ruxt-core-0.3.0.tgz`; inspected its archive listing and contract files. It is a newer core package, not admin app source, and is not the admin dependency baseline.
- Inspected local Ruxt remotes; queried read-only `TuanKietTran` GitHub repository listings, admin metadata/tree/commit/deployments, and core tags (no tags returned). Downloaded pinned admin and public npm archives into temporary directories for inspection only.
- **Never read, deleted, or wrote anything inside `~/Downloads/ruxt-work/migration-out`.** No exports, imports, deployment, login, tokens, DNS, secrets, or external writes were performed.

**BLOCKED authorization gates:** production runtime/database verification, production export, resource creation, configuration changes, deployment, and cutover require separate authorization. Finding source does not clear these gates.

### Critical topology uncertainty

Admin `server/storage/chunked-deno-kv.ts` uses `options.path ?? Deno.env.get("DENO_KV_URL")`, then `Deno.openKv(path)`. Without an override, the app opens its deployment's default KV. Its comments and README intend shared public/admin storage, but the assignment explicitly identifies a **second production database**. Therefore matching storage prefixes do not prove shared data. Whether admin reads its own database, remotely selects the public database, or contains stale/independent data is **UNVERIFIED**. The candidates are admin DB `659376af-cabf-4f66-9c70-9c489503dff6`, public DB `ec33b425-4006-4118-82e9-8657af3fc84f`, or the deployment default; none is established as the deployed admin source. Inventory and reconcile both database identities before any consolidation. This design never authorizes importing admin data over public resources or existing public migration output.

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

### Worker boundary and binding decisions (phase 2)

Use dedicated production Worker **`ruxt-admin`**, staging Worker **`ruxt-admin-staging`**, and Nitro **`cloudflare_module`** (`nitro.preset`, with an explicit matching build target). Serve bundled assets and same-origin APIs together; do not mount admin routes into public Worker `ruxt`. Each environment has an explicit complete binding configuration with no inheritance of public or production resource IDs. Keep **`workers_dev: true`** and **omit `routes` entirely** before approved cutover; do not attach a Custom Domain during build or pre-cutover deployment. Resource names are design decisions, not evidence they exist.

| Binding / configuration | Ownership and exact strategy |
| --- | --- |
| `ADMIN_CATALOG_DB` (D1) | Admin-owned, catalog-only authority; proposed database names `ruxt-admin-catalog` and `ruxt-admin-catalog-staging`. IDs remain absent until separately approved provisioning. Never alias this to `RUXT_DB` or the existing `ruxt-dev` database. No public users/billing tables or bindings. |
| `ADMIN_OBSERVABILITY_KV` (Workers KV) | Explicitly selected analytics/jobs source only, not catalog/session storage. Local fixtures and isolated staging namespace first (proposed staging name `ruxt-admin-observability-staging`). A production namespace ID/name is **UNRESOLVED/BLOCKED**, not automatically a new admin-only namespace: select the verified public producer's namespace only after ownership/topology approval, or approve an explicit snapshot replication contract. An empty independent namespace does not provide shared visibility. |
| Existing D1 `ruxt-dev`, ID `979c2b6e-a4ec-4f8d-8796-4162dc36b938` | Existing **public-app resource in checked-in configuration**, bound there as `RUXT_DB`; not a dedicated admin target. Name does not prove actual provider environment or safety for rehearsal. Provider state remains UNVERIFIED. Do not bind/import admin catalog into it. |
| Existing KV `ruxt-kv`, ID `62ef57bf79e3482db10e800d2b211510` | Supplied name; ID is checked into public configuration as `RUXT_KV`. Treat as a **shared/public resource**, not disposable admin storage. Name/availability/live writers remain provider-UNVERIFIED. No admin import/overwrite, automatic attachment, or rehearsal against it. |
| Adapter controls | Runtime nonsecret `ADMIN_CATALOG_ADAPTER=d1` and `ADMIN_OBSERVABILITY_ADAPTER=workers-kv`; default both to `disabled` until explicitly configured. `ADMIN_CATALOG_WRITES_ENABLED=false` is the default and requires both explicit enablement and an approved shared-catalog integration. Tests may inject synthetic adapters only in a local test harness, never as deployed fallback. |

Before provisioning approval, implementation may define typed binding interfaces and disabled adapters, plus a clearly local-only synthetic config; checked-in deployment configuration must not contain invented IDs, these supplied public IDs, or usable production bindings. Deployment preflight rejects unresolved placeholders/disabled required adapters. Missing/misconfigured bindings return a sanitized 503 for affected data APIs, never empty-success dashboards or a fallback source; health must not claim storage readiness. Binding resolution is request-scoped from Nitro's Cloudflare event context, not mutable `globalThis.__env__`, filesystem, Deno, or implicit process environment. No source database is opened by a Worker.

A direct KV binding grants write capability even when the application adapter is read-only; it is not provider-enforced least privilege. Do not grant this shared binding without explicit acceptance of that capability. If that is not approved, keep the adapter disabled pending a separately scoped read-only service binding. Do not silently provision an independent namespace and claim parity. Catalog isolation is compatible with shared behavior only when public readers/seeding use the same catalog authority through a separately approved authenticated catalog service; no public D1 access to users/billing is needed. That public integration is outside this document's implementation scope.

Storage decision:

| Data | Target decision | Required condition |
| --- | --- | --- |
| Authoritative template versions and publication | **D1**, with `(template_id, version)` primary key, immutable content JSON/columns, and a single publication pointer per template. Use the operation/transaction contract below, conflict responses, and an administrative audit trail. | Coordinate the public application's catalog reader/seeding adapter through the approved authenticated catalog service against this same authority. This schema/adapter work does not exist in the current migration. Do not enable any deployed catalog mutation while public Ruxt still reads a disconnected KV copy. |
| Hourly analytics snapshots | **Workers KV** compatibility layout initially; stale reads acceptable for dashboards. | Identify the actual authoritative producer and destination namespace. Admin is read-only for these families. KV read-modify-write is not safe for concurrent authoritative counters; keep/fix producer aggregation separately rather than claiming KV provides atomic increments. |
| Import-job snapshots | **Workers KV** read-only visibility initially, matching the public migration layout. | Public pipeline remains authoritative; accept display staleness only. Do not use dashboard reads to control jobs. If job execution moves to strongly consistent storage later, adapt the reader to that service. |
| Other database families | **No automatic decision/import.** | Authorized inventory and explicit classification first. Preserve originals and report unknowns. |

A separate admin database is not a reason to duplicate public metrics/jobs permanently. **ASSUMPTION:** shared visibility/publication remains the desired product behavior described by source. Compare both source databases by identity, logical key, hash, provenance, and producer ownership. Collisions require an explicit conflict policy; never use last-import-wins. Keep provenance in migration manifests without logging user records.

### Storage schema and operation contracts

- **Catalog D1 repository, not generic KV emulation:** replace template list/get/create/version/publish/delete storage calls with explicit repository operations. Minimum schema: `catalog_templates(template_id PRIMARY KEY, next_version INTEGER, revision INTEGER)`, `catalog_versions(template_id, version, content_json, PRIMARY KEY(template_id,version))`, `catalog_publications(template_id PRIMARY KEY, version)` with a composite foreign key to versions, and `catalog_audit(operation_id PRIMARY KEY, actor_github_id, action, template_id, version, occurred_at)`. Validate JSON against section 3 before insert; content includes custom/local tags but not a mutable `public` tag. Project that tag from the single publication pointer when returning the existing `CvTemplateProps` API shape. Version content is immutable; deletion of eligible unpublished non-built-in versions remains supported. Never reuse a deleted version number.
- **Atomic mutations:** allocate versions from the template counter and insert the version plus audit in one atomic D1 operation; use SQL-side allocation, not JavaScript `MAX+1`. Publish/unpublish updates the pointer, template revision and audit in the same atomic operation; deletion checks publication/built-in restrictions and removes the row atomically with its audit. Use D1 transactional `batch`/SQL with constraints and tested conditional revision predicates, not unsupported interactive `BEGIN` across requests. A failed precondition must abort the entire operation (no zero-row CAS followed by unconditional writes/audit). Require expected revision for competing mutations and return 409 on stale revisions/duplicates; 400 for invalid input and 404 for absent targets. Concurrency tests must prove one winning allocation/publication and no orphan audit entries. Retain source local/internal/built-in restrictions and read response compatibility. Paginate SQL lists rather than scanning a KV catalog.
- **Shared catalog authority:** public readers and startup seeding must read/seed through the approved catalog service against this same D1 authority; seeding cannot overwrite edited versions or rewrite publication tags in an old KV copy. Until that separately scoped integration and authority reconciliation are approved/tested, **all deployed catalog mutations remain disabled**, including draft creation/deletion, not merely publication. No dual-write bridge or KV publication fallback.
- **Analytics/jobs KV:** expose only `getItem`/paginated `getKeys` to admin consumers, retaining logical bases `analytics` and `cv-pipeline` and section 3 schemas. Match the public Workers compatibility driver's physical encoding/chunk manifest exactly after fixture verification; do not guess the producer's job suffix. Bound parallel reads and paginate listings. Distinguish genuinely missing buckets from unavailable/corrupt data; fail affected requests on chunk/schema errors rather than silently treating them as zero. No set/delete/atomic increment/job-control methods. KV provides eventual, not transactional or cross-key snapshot, consistency; accept dashboard staleness only with an agreed measured threshold. It cannot implement authoritative counters, job transitions, or catalog concurrency.

Read-only staging uses **synthetic D1 catalog plus synthetic KV metrics/jobs**, not a temporary KV catalog adapter. The reusable KV driver's immediate deletion of old generation chunks can expose missing chunks during propagation; test bounded retries and producer-side delayed cleanup in separately scoped work rather than asserting generation swaps are atomic. Production freshness, producer destination and cleanup behavior remain UNVERIFIED.

### Clerk/auth approach

**VERIFIED Clerk inventory:** no admin Clerk dependency, import, environment variable, runtime configuration, documentation, workflow, or configuration in the five fetched commits. The only relevant dependency text is generic `clerk:` route-normalization regex text in exact `@ruxt/core@0.1.1` `domain/analytics/metric.ts`; it is **not configuration or an integration**. There is no real local Clerk configuration to fix. Do not add Clerk or change public-app/provider Clerk. Provider configuration remains UNVERIFIED, not inferred absent.

**Decision: retain independent GitHub OAuth and numeric-ID allowlist**, not a simultaneous identity migration. Public Ruxt uses `@clerk/nuxt`; that does not make every Clerk user an administrator. Keep the admin session isolated, host-only, secure, HTTP-only, SameSite=Lax, eight-hour lifetime, and per-request allowlist recheck. Preserve OAuth state checks, safe redirects, exact canonical origin, mutation-origin checks, and no-store auth responses. Health/OAuth are the intentional API guard exceptions.

Runtime contract: production `NUXT_ADMIN_ORIGIN=https://admin.mashallow.cloud` and `NUXT_GITHUB_REDIRECT_URL=https://admin.mashallow.cloud/oauth/github` exactly; reject alternate origins, paths, query/fragment, callback overrides or inference from untrusted Host headers. Preserve request-aware config validation; eventless startup `useRuntimeConfig()` alone does not prove Workers secret injection works.

Provision fresh dedicated per-environment `NUXT_SESSION_SECRET` (at least 32 random characters; reject the source development default) and `NUXT_GITHUB_CLIENT_SECRET` only with authorization, using Workers secret bindings resolved at request time into private runtime config. Never reuse public session keys. Secrets must never appear in Wrangler `vars`, build-time config, client/public runtime config, bundles, logs, manifests or command arguments. `NUXT_GITHUB_CLIENT_ID` is runtime configuration, not a session secret. Approved administrator IDs live in environment-specific private runtime `NUXT_GITHUB_ALLOWED_IDS`, mapped to `runtimeConfig.github.allowedIds`, not a baked-in source default; require an explicitly supplied nonempty list of positive safe-integer decimal GitHub IDs, reject malformed tokens rather than dropping them, and recheck on every protected request. Source's `35926768` default is evidence, not approval of the production list. Missing/invalid auth config fails closed. Local CI uses synthetic identities/secrets only; real OAuth/secret provisioning remains gated.

Clerk consolidation is not part of phase 2 or this migration baseline. Public sign-in, email matching, client-side roles and a generic “signed in” check do not grant administrative access. No public app/provider Clerk change is authorized or needed to implement this GitHub-only design.

### Domain strategy

Retain canonical `https://admin.mashallow.cloud`; attach its dedicated Worker Custom Domain **only at separately approved cutover after recording and removing the conflicting Deno CNAME (and any verified conflicting A/AAAA records)**. Until then keep `workers_dev: true` with no custom-domain route. Zone eligibility and current records remain UNVERIFIED. Keep `NUXT_ADMIN_ORIGIN` canonical and OAuth callback exactly `https://admin.mashallow.cloud/oauth/github`; a stable hostname should avoid a production callback change if already configured correctly (**UNVERIFIED**). Use a separate approved staging hostname and separate OAuth application/settings; do not redirect production callbacks into staging.

Before cutover, authorized operator records current DNS/routing/TLS and rollback values, checks conflicts and cookie behavior, and validates staging without exposing sensitive dashboards. Changing Custom Domain routing can alter DNS; treat it as a gated production change, not a harmless build step. Do not deploy another Worker onto public Ruxt's domain/routes. Production hostname ownership, current TTL/proxy state, and issuance readiness remain **UNVERIFIED**.

### CI dry-run design and release gates

In future authorized admin implementation, extend CI for pull requests/manual dispatch: Node 22, pnpm 11.25.0, frozen install, typecheck, synthetic unit/API/auth/concurrency tests, explicit `cloudflare_module` build with Deno storage selection removed, and a pinned Wrangler **local `deploy --dry-run --outdir <temporary-dir>`** against a synthetic no-route config. No provider token, production secrets, production data or remote bindings are needed or allowed in that job; no deploy step. Test request-scoped binding/secret injection and missing-config failures under local Workers emulation. Inspect emitted runtime imports for Deno/filesystem fallback, Node compatibility and accidental editor SSR inclusion.

**Hard size gate:** free Workers permit **3 MiB compressed Worker upload** (3 × 1024 × 1024 bytes). Record Wrangler's compressed/gzip upload size, fail if it exceeds that limit or the measurement is missing; do not substitute raw build-directory size or ignore bundled modules. Keep client assets separate and verify the exact upload with the pinned tooling. CPU/memory/subrequest behavior and local tests remain separate gates; a successful size check/dry-run proves neither deployment nor runtime parity.

Production remains **BLOCKED** pending authenticated read-only source topology, catalog/producer authority and conflict policy, explicit target provisioning/binding approval, public catalog reader/seeding integration, full isolated rehearsal/content verification, approved freshness/performance/security results, dedicated secrets/OAuth validation, and explicit deployment authorization. Pre-cutover workers.dev smoke uses an approved staging origin/OAuth app; the production canonical callback does not become workers.dev. Production workers.dev checks should test unauthenticated health/denial only until approved hostname routing. Custom Domain attachment additionally requires explicit cutover approval, recorded rollback DNS, removal of Deno conflicts, and writer freeze. No CI dry-run authorizes these steps.

## 6. Reuse/adaptation of `ruxt-new/scripts/migrate/`

Reuse the machinery, **not the current schema assumptions or production bindings**:

- `deno-kv-to-cloudflare.ts export`: read-only full KV listing with typed JSONL keys/values/versionstamps and private directory/file modes. Parameterize an explicitly verified admin source identity and a new isolated output directory, never the existing `migration-out`. The current exporter buffers the entire database and is not a cross-key snapshot while writes continue; assess size and freeze writers for a consistent final export.
- `transform`: already recognizes `cv`, `cv-pipeline`, `analytics`, reconstructs Deno chunks, and emits 24 KiB Workers chunks (8 MiB ceiling). `logic.ts` provides SQL quoting, hashes, owner digests, and fail-closed unknown-prefix classification.
- Do **not** run the unmodified transformer on admin and expect a valid result: it assumes public-user/billing prefixes and secondary indexes, emits public D1 tables, and knows nothing about a relational template catalog. A storage-only admin export may pass existing index count checks simply because both sides are zero; that is not schema validation.
- Add an explicit admin mode/profile in future authorized implementation: allowed families, source/database manifest, template-to-D1 conversion, shared-data conflict handling, approved binding/config/environment arguments, and deterministic full-content verification. Retain rejection of every unclassified prefix and validate duplicate template identity/version, tags, references, and chunk integrity.
- `check-kv-roundtrip.ts`: useful offline reconstruction through the production Workers KV driver; it currently prints logical keys and sizes, so redact identifiers for real-data runs. It validates generated import files via an in-memory map, **not remote imported bytes**.
- `verify`: currently hardcodes `RUXT_DB`/`RUXT_KV`, defaults to remote, permits some extra D1 rows, does owner digests only for selected public tables, and samples up to 20 nonbinary KV values. It does not verify every remote binary chunk or D1 template row. Require exact frozen-snapshot counts and full admin catalog hashes, deterministic logical hashes, destination provenance, and actual remote chunk reads before acceptance.
- `seed-rehearsal.ts` and `smoke-worker.mjs`: patterns for synthetic rehearsal and HTTP smoke coverage, not evidence of admin-specific tests. Add fixtures for all metric kinds, all job states/errors, template restrictions/conflicts, Unicode and chunk-boundary payloads, unknown prefixes, missing chunks, and auth/origin denial cases.
- `ruxt-new/server/storage/chunked-cloudflare-kv.ts` is a compatibility starting point for the admin metrics/job read mounts, not a D1 catalog replacement. Wire actual Workers bindings into Nitro context (the existing driver expects `globalThis.__env__`) without process-global cross-environment leakage; test missing binding failures. Do not assume copying the driver alone configures the Worker.

The existing public runbook's remote commands and D1 schema must not be applied wholesale to this second database. No migration script or real-data command was executed during this assignment.

## 7. Phased implementation, migration, validation, cutover

**Phase status:** source discovery is VERIFIED (`rxadmin/DISCOVERY.md`); phase-2 decisions in section 5 are recorded, not implemented. Provider discovery/topology remains BLOCKED. Offline implementation is AUTHORIZED NEXT but not yet implemented, with disabled/unprovisioned adapters; it does not clear production gates. The ordered execution runbook remains:

1. **Authorize provider discovery and settle topology (BLOCKED).** Confirm deployed admin revision/build, actual Deno KV selection, the separately identified database and all writers, public-source identity, production OAuth/canonical origin, and target ownership. Record nonsecret resource identities and resolve unknown families/conflicts. Gate: approved authoritative-data map and cutover owner; source correspondence remains blocked until verified.
2. **Implement offline in the admin repository (AUTHORIZED NEXT; not yet implemented).** Pin reviewed source/dependencies and implement section 5's dedicated Worker, `cloudflare_module` build/storage selection, disabled/configurable adapters, isolated Wrangler environments/bindings, runtime validation, compatibility tests, API/auth tests, synthetic fixtures, CI dry-run and mandatory 3 MiB compressed size gate. Implement D1 catalog transaction/audit behavior and coordinated public reader/seeding changes in separately scoped work. Gate: typecheck, tests, Worker bundle/CPU assessment, no filesystem/Deno calls in runtime, and least-privilege bindings. Do not modify this repository's public-worker configuration merely to host admin.
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
- Creating/changing Cloudflare Workers, D1, KV, bindings, service access, environments, domains, routes, DNS/TLS, paid-plan resources, or production data imports.
- Any GitHub/Cloudflare secret write or login; GitHub OAuth application/callback changes; real sign-in tests; session-key provisioning; any Clerk application, domain, credential, or administrator-policy change.
- Push, publish, deployment (including any `wrangler deploy`), merge, repository visibility changes, production writer freeze/restart, routing cutover, or rollback execution.
- Deno app retirement, deletion of either database, deletion of backups/exports, or credential revocation. None is implied by migration approval.

This assignment authorizes phases 1-3 offline discovery, design, and implementation/testing only; all provider and production actions above remain pending explicit approval.
