# Platform data

## Current state

Persistence is defined in [Persistence](persistence-deployment.md). Three adapters exist today, selected by the weighted strategy registry in `infra/deploy/` (Deno KV weight 10, Cloudflare D1 weight 5, SQLite weight 1):

- Deno KV — seven repositories in `infra/deploy/deno/` over `infra/kv.ts` (`Deno.openKv`), plus the chunked driver `server/storage/chunked-deno-kv.ts`.
- Cloudflare D1 — `infra/deploy/cloudflare/repos.ts` and `repository-adapters.ts` against the D1 database `ruxt-dev`, with exactly one migration, `infra/deploy/cloudflare/migrations/0001_init.sql`.
- SQLite — `infra/db/sqlite.ts` and `schema.ts` (better-sqlite3/Drizzle, WAL, `local.db`), which self-creates the users, plans, subscriptions and iam_subjects tables. SQLite migrations have no rollback or version tracking today. No Postgres adapter exists.

The native/self-hosted target is the SQLite path, promoted from fallback to the default target by the control plane (Planned: flipping the strategy weights is a configuration change specced in platform-config.md, verified before any legacy adapter is retired per platform-legacy.md).

## Database environments registry (Planned, schema)

File: `tools/platform/data/registries/databases.json` — `{ databases: DatabaseRecord[] }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | e.g. `prod-sqlite`, `prod-d1`, `dev-kv` |
| `environment` | string | yes | Environment name from platform-config.md |
| `adapter` | `'sqlite' \| 'deno-kv' \| 'cloudflare-d1'` | yes | |
| `reference` | string | yes | Location by reference: a file path for SQLite, a binding name for D1 (`RUXT_DB`), a KV namespace binding name (`RUXT_KV`); never a connection string with credentials |
| `migrationState` | object | yes | `{ applied: string[], lastAppliedAt?: string (ISO 8601), checksum?: string }` — migration ids in apply order |
| `health` | `'unknown' \| 'ok' \| 'degraded' \| 'down'` | yes | Last health check result |

## Migrations

Today `scripts/migrate/` contains `deno-kv-to-cloudflare.ts`, `logic.ts`, `check-kv-roundtrip.ts`, `seed-rehearsal.ts` and `smoke-worker.mjs`, with the verbs `export | transform | verify` only. Transform emits SQL batches and KV bulk files plus `manifest.json` with per-table counts and checksums and per-owner checksums; there is no plan, apply, rollback or seed command, and applying is a manual step per the runbook.

Planned, built on top of the same transform and manifest code (module `tools/platform/src/commands/data.ts`):

```
platform data plan-migrate --from <dbId> --to <dbId>
platform data plan-seed --database <dbId>
platform data plan-rollback --database <dbId> --to-migration <id>
```

- `plan-migrate` runs export and transform in dry-run and turns the manifest into a Plan: one item per table with its count and checksum copied from the manifest, so a plan hash commits to exactly the data that would move.
- Apply executes the transform output against the target adapter, then runs the existing `verify` logic; a checksum mismatch on any table fails verification and records a `failed` audit entry.
- `plan-seed` replaces the rehearsal-only use of `seed-rehearsal.ts` with a plan whose items are the seed records by table and count; seed data contains no real user records.
- `plan-rollback` is defined only where the adapter supports it: for SQLite it restores the pre-migration backup (below) and resets `migrationState`; for D1 and Deno KV rollback is a new forward migration generated from the same transform, never an in-place undo. Rollback support is Planned for all three adapters.

## Backup and restore (Planned)

Backup and restore are unimplemented today; the runbook only instructs rehearsing a restore. Planned model:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | `backup-<dbId>-<yyyymmddhhmm>` |
| `databaseId` | string | yes | |
| `createdAt` | string (ISO 8601) | yes | |
| `kind` | `'manual' \| 'pre-migration' \| 'scheduled'` | yes | A `pre-migration` backup is a required plan item before any migrate or rollback apply |
| `location` | string | yes | Path or object reference; no credentials |
| `checksum` | string | yes | SHA-256 of the backup artifact |
| `counts` | object | yes | Per-table record counts, same shape as the migrate manifest |

Backup records are appended to the database record's registry file history via the registry module. `platform data plan-backup --database <dbId>` and `platform data plan-restore --backup <id>` produce plans; a restore plan requires the backup checksum to match at apply time and always records mode and result in the audit log. A restore is rehearsed against a scratch database and verified by counts and checksums before it may target a live database.

## Health checks

`platform data health --database <dbId>` (and the aggregate in platform-control-plane.md) checks: the adapter can open its store, the applied migration list matches the registry's `migrationState`, and a round-trip read of a known key or row succeeds — the same round-trip idea as `scripts/migrate/check-kv-roundtrip.ts`. Results update the record's `health` field only through an applied plan; a bare health run is read-only and writes an audit entry with mode `dry-run`.
