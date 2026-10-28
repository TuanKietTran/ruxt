# Deno Deploy → Cloudflare Workers

**Status: local preparation; no provider action has been run.** Deno and self-hosted SQLite strategies remain available.

## Plan and gates

1. Inventory Deno KV prefixes, traffic, jobs, secrets, exports, and rollback target. Exit: owner reviews inventory.
2. Validate the Worker build, bindings, storage adapter, auth, health, and existing paths locally. Exit: lint/typecheck/tests/build/dry-run pass.
3. Owner provisions isolated D1/KV/R2/DO resources and secrets, applies migrations, then runs auth, preferences, subscription, CV revision, realtime, and health smoke tests. Exit: acceptance evidence and budget review.
4. Export Deno KV read-only, transform by family, import in bounded batches, and compare counts plus per-user checksums. Exit: restore rehearsal has no unexplained differences.
5. Owner deploys after dry-run review, validates health, then changes DNS/custom domain. Exit: signed cutover checklist.
6. Observe CPU, errors, storage, KV writes, D1 writes, and auth; retain Deno until rollback window closes.

## Binding choices and limits

| Family | Binding | Fit and limit target | Fallback |
|---|---|---|---|
| Users/IAM/consent/plans/subscriptions/preferences | D1 `RUXT_DB` | relational queries; target 5 GB / 100k writes/day | self-hosted SQLite or Deno KV |
| CV documents/revisions | KV `RUXT_KV` | keyed snapshots; target 1 GB / 1k writes/day; revision checks required | self-hosted storage |
| Assets/artifacts | R2 (not yet wired in assembled config) | avoids Worker memory; lifecycle and egress require review | self-hosted artifacts |
| Sessions/realtime | DO only after implementation and contract tests | SQLite-backed DO; serialization/restart/two-node evidence required | existing session/polling path |
| Heavy/native pipeline, PDF/PNG | self-hosted | free-plan target 10 ms CPU/request, 100k requests/day, 1 MiB compressed code | documented self-hosted fallback |

`wrangler.json` currently declares D1 and KV; the assembled source includes a chunked KV driver and Cloudflare capability test. R2/DO are design choices, not claimed implementations. Do not silently treat them as accepted.

## Data migration (owner-run design only)

Export approved Deno KV prefixes read-only to an encrypted local directory, preserving keys, values, versions, expiry, ownership, and tombstones. Transform by the table above; dry-run bounded imports; compare family counts and per-user checksums, including expired entries and revision conflicts. No production data was accessed. Production-ready export/import scripts are not included yet; this is a migration design, not an executable or tested procedure.

## Cutover, DNS, rollback

The checked-in workflow exposes `pnpm cf:deploy` only for a pushed `v*` tag on a `main` commit or a manually dispatched workflow on `main`. The owner must configure `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `NODE_AUTH_TOKEN` as repository/environment secrets; no values are present in this tree. Local verification uses only `pnpm cf:deploy:dry`.


Owner-only actions: `wrangler login`; create resources; apply migrations; set `CLERK_SECRET_KEY`, `NUXT_SESSION_SECRET`, and deployment-specific secrets; connect Workers Builds; review dry-run; deploy; attach custom domain/change DNS. Keep Deno serving until acceptance. Roll back by returning DNS/routing to Deno, preserving Cloudflare data for investigation; do not delete Deno or run split-brain writes.

## Package resolution

The active dependency is the vendored fallback `file:vendor/tuankiettran-ruxt-core-0.3.0.tgz` because GitHub Packages read:packages access returned HTTP 403 in this session. Future registry mode is retained in `.npmrc` and uses `NODE_AUTH_TOKEN`; the tarball is deliberately outside and untracked by this repository. Nothing was published.

## Auditor plan/checklist

- [x] confirm binding names match adapters and runtime env — source review of `wrangler.json`, `infra/deploy/cloudflare/repos.ts`, D1 adapter and chunked KV binding; no account-backed runtime test.
- [ ] add/test D1 migrations and KV optimistic-revision contracts — `ct` workerd tests now apply the checked-in D1 migration and exercise D1 repositories plus KV chunking (17 passed, 1 skipped). This does not establish cross-isolate optimistic-revision serialization; that remains unimplemented.
- [ ] implement and test R2/DO or retain exercised self-hosted fallbacks — neither is implemented; pipeline/artifact filesystem and cross-isolate realtime remain unsupported on Workers.
- [ ] measure the complete compressed Worker bundle and representative CPU/write budgets — post-merge dry-run measured gzip 930.86 KiB; CPU and daily quotas were not measured.
- [ ] record isolated celld fleet boot, HTTP, restart, and two-node evidence in the auditor record — not run by this manager.
- [x] verify Deno/self-hosted behavior remains green — final local `pnpm build` and `pnpm test` passed; this is not external Deno production regression evidence.
- [ ] scan secrets, AI traces, history, and worktree hygiene — tracked-path lint passed; no AI-trace/history scan evidence.
- [x] confirm no login, non-dry deploy, DNS, secret/resource creation, or production access — manager performed local commands only; dry-run only.

## Manager source audit (local)

- Worker plugin code does not start timers or access storage at module scope; analytics timer and startup writes remain guarded to non-Worker execution/deferred request hooks. Cloudflare env validation reads `globalThis.__env__`; Deno `process.env.DENO_TIMELINE` validation is Deno-only.
- CV import's Node `fs`/`child_process`/Python pipeline remains a self-hosted fallback: Worker capability detection returns unavailable before probing Python or running extraction. Artifact TTL and upload ceilings now use Nuxt runtime config (`NUXT_CV_ARTIFACT_TTL_HOURS`, `NUXT_CV_IMPORT_MAX_BYTES`), not `process.env`.
- Worker CV SSE is explicitly unavailable (HTTP 501) because there is no cross-isolate event hub; the Cloudflare build does not open the stream and refreshes with conditional revision probes (on return after 30 s away, then every 60 s while visible). This is eventual refresh, not realtime/serialization.
- `cv-pipeline-maintenance` cron is omitted from the Cloudflare build because it invokes unsupported Python/filesystem work. No Worker-native background replacement is claimed.
- MCP remains a stateless Streamable HTTP endpoint; local Cloudflare build and dry-run include it, but no Worker runtime request/CPU test was produced.
- `node:crypto` remains in adapters for self-hosted execution; Worker password hashing uses WebCrypto PBKDF2. Free-plan CPU impact has not been measured.

## Verification results (2026-10-23)

Results below came from the manager's complete local sequential test job. Evidence was run locally; no external artifact was retained. Passing checks do not constitute Cloudflare acceptance where a blocker is explicitly recorded.

| Check | Command/evidence | Result | Evidence / blocker |
|---|---|---|---|
| Install | `pnpm install --frozen-lockfile --offline` | **PASS** | Local fallback `../package-artifacts/phase4/tuankiettran-ruxt-core-0.3.0.tgz`; GitHub Packages registry mode returned HTTP 403 without read:packages access. |
| Lint | `pnpm lint` | **PASS** | Local manager test job; no external artifact. |
| Typecheck | `pnpm exec nuxt typecheck` | **PASS** | Local manager test job; no external artifact. |
| Tests | `pnpm test` | **PASS** | 205 passed / 40 skipped; final post-merge local run. |
| Production build | `pnpm build` | **PASS** | Complete sequential test job; no external artifact. |
| Cloudflare build | `pnpm cf:build` | **PASS** | Local build completed; no deployment. |
| Worker boot | Built Worker `/api/health` via Miniflare workerd with test bindings/vars | **BLOCKED** | The Worker initializes, but Miniflare v5 reports `Network connection lost` on the request; health 200 not established. The boot test is explicitly skipped pending a compatible integration harness. |
| Wrangler dry run | `pnpm cf:deploy:dry` | **PASS** | Dry-run only; warning recorded for duplicate `html2canvas` case. No login or deployment. |
| Bundle size | `pnpm cf:deploy:dry` local output: 930.86 KiB gzip (2026-10-23) | **PASS, narrow margin** | Below 1 MiB by ~93.14 KiB; no CPU/quota measurement. |
| CPU and quotas | Representative CPU, request, KV-write, and D1-write measurements | **NOT RUN** | No measurements were collected. |
| Binding contracts | `pnpm test:workerd`; R2/DO status | **PARTIAL / BLOCKED** | Miniflare workerd D1 migration/repository and KV chunk-driver tests: 17 passed, 1 Worker-boot test skipped (`Network connection lost`); R2 and DO are not implemented; optimistic cross-isolate revisions remain untested. |
| Celld | Isolated boot, HTTP, restart, and two-node evidence | **NOT RUN** | No celld evidence is available. |
| Deno/self-hosted regression | Production-path regression evidence | **NOT RUN** | No external Deno production regression evidence is available. |
| Hygiene | Architecture lint scans tracked artifact paths; local manager worktree review | **PARTIAL** | No tracked `.data/`, `local.db`, `.env` credentials or secret-named files; no AI-trace/history scan or final identity/worktree review. |

Acceptance blockers: representative CPU and quota measurements; built Worker `/api/health` request not established (Miniflare reports `Network connection lost` and its boot test is skipped); R2/DO or exercised replacements; production-ready bounded imports/restore rehearsal (local Deno KV export/transform/verify tooling exists but was not exercised remotely); celld evidence; and external Deno production regression evidence. `pnpm cf:deploy:dry` measured 930.86 KiB gzip, leaving little bundle headroom.

## Request budget (Workers Free, 2026-10-28)

Free plan quotas: 100k Worker requests/day, 100k KV reads/day, 1k KV writes/day, 1k KV lists/day, 200k observability events/day. Measured with `scripts/measure-request-volume.js` against the Cloudflare build under `wrangler dev --local` (virtual clock, 10 minutes per idle phase, x144 per day):

| One open editor tab | Before (`main`@bf66288) | After |
|---|---|---|
| Idle, visible | 201 requests / 10 min (28,944/day) | 9 / 10 min (1,296/day) |
| Hidden | 200 / 10 min with emulated visibility; real Chrome throttles a tab hidden for 5 min to 1 timer wake-up/min (~1,440/day, as in the 10-26 overnight logs) | 0 |
| One tab after opening sessions A, B, C in turn (`<KeepAlive>` keeps each editor) | 61 GET/min (20 + 20 + 21) | 1 GET/min (active session only) |
| 40 words typed with 0.7 s pauses | 40 PUT + 17 GET | 4 PUT |
| Edit typed just before leaving the page | lost on the server (backup only) | saved (keepalive) |

`pnpm check:request-budget` (CI, after `pnpm cf:build`) fails on a client `setInterval` under 30 s reaching `/api/cvs`, live events enabled in the Worker build, `/_nuxt/*` without immutable caching, or `assets.run_worker_first`.

Follow-ups:

- [ ] Owner: redeploy, then confirm in Workers Logs/Metrics that `GET /api/cvs/:id` volume dropped by >90% and the 501 `/events` requests are gone; tabs opened before the deploy keep the old 3 s poll until reloaded.
- [ ] Owner: Cache API (`caches.default`) is a no-op on `*.workers.dev`; edge reuse of `/api/public/templates` and `/api/plans` applies only on `ruxt.mashallow.cloud`.
- [ ] Owner: Workers Logs head sampling (`head_sampling_rate` 0.1) is decided per request before it runs, so 90% of errored requests are dropped from logs too; raise it to 1 once daily volume is confirmed well under 200k events. Workers Metrics request/error counts are not sampled.
- [ ] Document listing reads every stored document (all owners) on each SSR page load: KV reads per load equal the stored document count. Writing summaries as KV key metadata on save would let one `list()` serve the sidebar.
- [ ] KV writes are the next binding quota: an inline save is 1 write (chunked: chunks + manifest writes and old-chunk deletes) plus 2 reads, and analytics flushes (now every 5 min per Worker isolate) write one bucket per metric kind. Consider Workers Analytics Engine for metrics.
- [ ] `pnpm test:session-continuity` needs the node-server build to resolve one `@ruxt/shared` copy: Nitro does not trace the `file:` alias `@ruxt/core`, so it loads its own `@ruxt/shared` from the store and the mediator is mounted on the other copy ("Mediator not mounted"). Locally, deleting `.output/server/node_modules/@ruxt/shared` after the build works around it.

