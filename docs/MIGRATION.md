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

The checked-in workflow exposes `pnpm cf:deploy` only for a manually dispatched workflow on `main`. The owner must configure `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `NODE_AUTH_TOKEN` as repository/environment secrets; no values are present in this tree. Local verification uses only `pnpm cf:deploy:dry`.


Owner-only actions: `wrangler login`; create resources; apply migrations; set `CLERK_SECRET_KEY`, `NUXT_SESSION_SECRET`, and deployment-specific secrets; connect Workers Builds; review dry-run; deploy; attach custom domain/change DNS. Keep Deno serving until acceptance. Roll back by returning DNS/routing to Deno, preserving Cloudflare data for investigation; do not delete Deno or run split-brain writes.

## Package resolution

The active dependency is the vendored fallback `file:vendor/tuankiettran-ruxt-core-0.3.0.tgz` because GitHub Packages read:packages access returned HTTP 403 in this session. Future registry mode is retained in `.npmrc` and uses `NODE_AUTH_TOKEN`; the tarball is deliberately outside and untracked by this repository. Nothing was published.

## Auditor plan/checklist

- [x] confirm binding names match adapters and runtime env — source review of `wrangler.json`, `infra/deploy/cloudflare/repos.ts`, D1 adapter and chunked KV binding; no account-backed runtime test.
- [ ] add/test D1 migrations and KV optimistic-revision contracts — D1/KV unit coverage exists, but real workerd contract evidence is pending `ct` integration.
- [ ] implement and test R2/DO or retain exercised self-hosted fallbacks — neither is implemented; pipeline/artifact filesystem and cross-isolate realtime remain unsupported on Workers.
- [ ] measure the complete compressed Worker bundle and representative CPU/write budgets — dry-run measured gzip 930.94 KiB; CPU and daily quotas were not measured.
- [ ] record isolated celld fleet boot, HTTP, restart, and two-node evidence in the auditor record — not run by this manager.
- [x] verify Deno/self-hosted behavior remains green — final local `pnpm build` and `pnpm test` passed; this is not external Deno production regression evidence.
- [ ] scan secrets, AI traces, history, and worktree hygiene — tracked-path lint passed; no AI-trace/history scan evidence.
- [x] confirm no login, non-dry deploy, DNS, secret/resource creation, or production access — manager performed local commands only; dry-run only.

## Manager source audit (local)

- Worker plugin code does not start timers or access storage at module scope; analytics timer and startup writes remain guarded to non-Worker execution/deferred request hooks. Cloudflare env validation reads `globalThis.__env__`; Deno `process.env.DENO_TIMELINE` validation is Deno-only.
- CV import's Node `fs`/`child_process`/Python pipeline remains a self-hosted fallback: Worker capability detection returns unavailable before probing Python or running extraction. Artifact TTL and upload ceilings now use Nuxt runtime config (`NUXT_CV_ARTIFACT_TTL_HOURS`, `NUXT_CV_IMPORT_MAX_BYTES`), not `process.env`.
- Worker CV SSE is explicitly unavailable (HTTP 501) because there is no cross-isolate event hub; the browser falls back to three-second document polling. This is eventual refresh, not realtime/serialization.
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
| Tests | `pnpm test` | **PASS** | 200 passed / 40 skipped; local manager final job. |
| Production build | `pnpm build` | **PASS** | Complete sequential test job; no external artifact. |
| Cloudflare build | `pnpm cf:build` | **PASS** | Local manager test job; no external artifact. |
| Wrangler dry run | `pnpm cf:deploy:dry` | **PASS** | Dry-run only; warning recorded for duplicate `html2canvas` case. No login or deployment. |
| Bundle size | `pnpm cf:deploy:dry` local output: 930.94 KiB gzip (2026-10-23) | **PASS, narrow margin** | Below 1 MiB by ~93.06 KiB; no CPU/quota measurement. |
| CPU and quotas | Representative CPU, request, KV-write, and D1-write measurements | **NOT RUN** | No measurements were collected. |
| Binding contracts | D1/KV unit coverage in total suite; workerd contract suite; R2/DO status | **PARTIAL / BLOCKED** | D1/KV unit tests pass within the total suite. No workerd contract evidence; R2 and DO are not implemented. |
| Celld | Isolated boot, HTTP, restart, and two-node evidence | **NOT RUN** | No celld evidence is available. |
| Deno/self-hosted regression | Production-path regression evidence | **NOT RUN** | No external Deno production regression evidence is available. |
| Hygiene | Architecture lint scans tracked artifact paths; local manager worktree review | **PARTIAL** | No tracked `.data/`, `local.db`, `.env` credentials or secret-named files; no AI-trace/history scan or final identity/worktree review. |

Acceptance blockers: representative CPU and quota measurements; completed workerd contract evidence; R2/DO or exercised replacements; production-ready bounded imports/restore rehearsal (local Deno KV export/transform/verify tooling exists but was not exercised remotely); celld evidence; and external Deno production regression evidence. `pnpm cf:deploy:dry` measured 930.94 KiB gzip, leaving little bundle headroom.
