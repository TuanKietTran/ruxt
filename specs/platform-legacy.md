# Platform legacy providers

## Purpose

Clerk, Cloudflare and Deno Deploy are load-bearing today and are retired on a policy schedule: sunset in January 2027. No sunset date, deprecation flag or 2027 reference exists in the code of the application or the admin application today; the sunset is encoded as versioned data by this specification (Planned) so progress is tracked in one place. Each provider is a `ProviderAdapter` (platform-control-plane.md) with a `sunset` object, and no provider is removed before its checklist is complete and the replacement path is verified.

## Sunset tracker data model (Planned, schema)

File: `tools/platform/data/registries/legacy.json` — `{ providers: LegacyProviderRecord[] }`, one record per provider; this file is the `sunset` object of each legacy adapter, stored as data rather than code.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `provider` | `'clerk' \| 'cloudflare' \| 'deno'` | yes | |
| `sunsetDate` | string | yes | `'2027-01'` for all three |
| `dependents` | string[] | yes | Surfaces that depend on the provider today (below) |
| `checklist` | ChecklistItem[] | yes | `{ id: string, label: string, state: 'pending' \| 'in-progress' \| 'done' }` |
| `replacement` | string | yes | Name of the native replacement path (below) |

CLI (module `tools/platform/src/commands/legacy.ts`): `platform legacy list` renders the tracker; `platform legacy plan-checklist --provider <id>` produces a plan whose items are checklist state changes. Checklist changes are registry writes through the plan/apply flow, never direct edits by the admin UI in this phase.

## Clerk — identity

Coupling: 9 files, including `app/components/AuthDialog.vue`, `app/composables/useAppAuth.ts`, `server/routes/api/auth/me.get.ts`, `server/plugins/analytics.ts` (owner resolution), both deployment-env validation plugins, and the seam `server/utils/auth-user.ts`, where `AuthProvider` is `clerk | legacy` and broker ids are namespaced `clerk:<id>` so stored owner keys carry the provider prefix. The admin application gates every request through Clerk: `requireAdmin` rechecks `privateMetadata.role === 'admin'` on each request. There is no Clerk webhook route.

What breaks if removed today: every authenticated application route loses its identity source (CV imports, template writes, cloud data, subscriptions, MCP), analytics owner resolution fails, the admin application is unreachable, and stored data keyed `clerk:<id>` is orphaned.

Checklist: promote the shipped local session authentication (`server/routes/api/auth/{login,register,logout}.post.ts` with `NUXT_SESSION_SECRET`) to primary; migrate or re-key `clerk:`-prefixed owner ids; replace the `clerkClient` user lookup in `me.get.ts` and the admin role check with local role records; remove `@clerk/nuxt` from both applications; retire the `CLERK_*` environment names and the telemetry flag.

Replacement: local session authentication as primary through the same `auth-user.ts` seam, with admin roles held as local records and the per-request server-side role recheck preserved (see [Authentication and IAM](auth-iam-security.md)).

## Cloudflare — hosting and data

Coupling: 19 files. One Worker (`wrangler.json`: name `ruxt`, compatibility date 2026-10-18, `nodejs_compat`, `workers_dev`, the `ruxt.mashallow.cloud` custom domain, observability logging), bindings `ASSETS`, `RUXT_DB` (D1 database `ruxt-dev`, migrations in `infra/deploy/cloudflare/migrations/`) and `RUXT_KV` (one KV namespace); no R2, queues or cron. Build and deploy run through `scripts/build-cloudflare.mjs` and the tag-gated workflow job. Coupling is through Nitro storage drivers and D1 repository adapters, not Workers APIs in route handlers.

What breaks if removed today: the production hosting target, the custom domain, the D1 production data path and the KV storage path all disappear, and the tag-gated deploy job has no target.

Checklist: stand up the native hosting target and verify it on the domain registry's verification flow (platform-domains.md); migrate D1 and KV data with the platform-data.md plan/apply/verify flow and matching manifest checksums; move the domain binding to the native adapter; retire the `wrangler.json` bindings and resource identifiers; retire `cf:build` / `cf:deploy`.

Replacement: the native/self-hosted adapter (`tools/platform/src/adapters/native.ts`) serving the same build output, with SQLite as the data path.

## Deno Deploy — hosting and data

Coupling: 23 files. The default build is the Deno path (`RUXT_DENO_STORAGE=1 nuxt build`, deno-server preset); `infra/kv.ts` calls `Deno.openKv` and throws without it; seven KV repositories live in `infra/deploy/deno/`; the chunked driver `server/storage/chunked-deno-kv.ts` (format `ruxt-chunked-json-v1`, 24 KB chunks, 8 MB cap) is shared with the admin application, which builds with the same Deno preset. Deno KV is the highest-weighted strategy (10), so it is the default runtime data path today.

What breaks if removed today: the default build output has no working storage, removing the KV repositories silently drops strategy selection to D1 (weight 5) or SQLite (weight 1), and the admin build breaks the same way.

Checklist: flip the strategy weights and default to SQLite (or D1 while Cloudflare remains) first, and verify — this order is mandatory; port the seven KV repositories; replace `Deno.openKv` in `infra/kv.ts`; change the build presets in both applications; keep or replace the `deploy/celld/` local emulation stack (celld with MinIO) for local development.

Replacement: SQLite via `infra/db/sqlite.ts` as the native data path, with the strategy registry selecting it by default.
