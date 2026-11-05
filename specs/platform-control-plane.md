# Platform control plane

## Problem and goals

Platform operations are manual today. Deployment is a git-tag flow plus the Cloudflare runbook (see [Cloudflare runbook](cloudflare-migration-runbook.md)), releases have no version field, changelog or channels, domains and DNS are handled outside the repository, backup and restore are unimplemented, and there is no single record of what was planned, applied or verified. The seams to build on already exist: the identity seam in `server/utils/auth-user.ts`, the weighted repository strategy registry in `infra/deploy/`, and the checksummed transform manifest produced by `scripts/migrate/`.

Goals:

- One TypeScript control plane, `tools/platform/`, that describes releases, domains, databases, configuration and legacy-provider retirement in versioned data files.
- Every change is a plan first: deterministic, serializable, checksummed and reviewable before anything is applied.
- Every action leaves an append-only audit entry.
- Administration pages in ruxt-admin render the same registries, plans and audit records the command line produces.

Non-goals: replacing the application runtime, storage adapters or identity providers in this phase; performing live applies from the admin user interface; storing secret values anywhere in the control plane; a Rust implementation (see the future option at the end of this document).

## Principles

1. Dry-run first. Planning is the default and has no side effects. Applying is a separate, explicit step.
2. Plan/apply split. `plan()` is pure with respect to the outside world: it performs no network calls and resolves no credentials. `apply()` consumes a stored plan by id and confirmed hash only.
3. Secrets by reference only. Plans, registries, logs and audit records contain environment variable names, never values. Values are resolved at apply time from the process environment and are never echoed.
4. Append-only audit. Entries are never edited or deleted; a correction is a new entry that references the earlier one.
5. Native and self-hosted first. New capability targets the native/self-hosted path; hosted providers are adapters behind the same interface.
6. Legacy providers are adapters. Clerk, Cloudflare and Deno Deploy are modelled as adapters carrying a sunset date, their dependents and a retirement checklist (see [Platform legacy](platform-legacy.md)).
7. Registries are data. Versions, domains, database environments, configuration, flags and deployment history live in versioned data files with schemas defined in the companion specifications, so the command line and the admin pages read one source of truth.

## Authentication and authorisation

Authentication follows [Authentication and IAM](auth-iam-security.md). Every mutating admin route and every control-plane action that records an actor authenticates the admin principal on the server, with identity derived from the session only: the Clerk session resolved through the `server/utils/auth-user.ts` seam and the `requireAdmin` pattern (`privateMetadata.role === 'admin'`, rechecked on every request). Actor, owner and identity values never come from a request body, URL or query parameter, and caller-chosen user ids are never sent onward as authority to any application API. Where plans, subscriptions or IAM data is in scope, it is reached only through authenticated admin server routes or the control plane's own registries, as defined in [Platform admin](platform-admin.md) and [Platform configuration](platform-config.md).

## Architecture: `tools/platform/`

A new package in the pnpm workspace, library plus a thin command line. No existing package is restructured.

| Module | Responsibility |
| --- | --- |
| `tools/platform/package.json` | Package `@ruxt/platform`, bin `platform` -> `src/cli.ts` |
| `tools/platform/src/types.ts` | `ProviderAdapter`, `Plan`, `PlanItem`, `AuditEntry`, registry record types shared with the admin JSON shapes |
| `tools/platform/src/cli.ts` | Argument parsing and dispatch only; all logic lives in the library modules |
| `tools/platform/src/plan.ts` | Plan construction, canonical serialization, per-item and whole-plan checksums, plan hash |
| `tools/platform/src/registry.ts` | Load, validate and save registry data files against their schemas |
| `tools/platform/src/audit.ts` | Append and read audit entries (`audit.jsonl`) |
| `tools/platform/src/secrets.ts` | Presence checks for named environment variables, following the `server/plugins/validate-deployment-env.ts` and `server/plugins/validate-cloudflare-deployment-env.ts` pattern; returns names and presence only |
| `tools/platform/src/auth.ts` | Resolves the acting admin principal from the session for audit attribution; exposes no way to set an actor from input data |
| `tools/platform/src/health.ts` | Aggregates adapter `health()` results for the CLI and the admin overview page |
| `tools/platform/src/adapters/native.ts` | Native/self-hosted adapter (deployment target, SQLite data path) |
| `tools/platform/src/adapters/clerk.ts` | Legacy adapter, sunset 2027-01 (see platform-legacy.md) |
| `tools/platform/src/adapters/cloudflare.ts` | Legacy adapter: Worker, D1 `ruxt-dev`, KV namespace, `wrangler.json` bindings, custom domain |
| `tools/platform/src/adapters/deno.ts` | Legacy adapter: deno-server preset, Deno KV chunked driver |
| `tools/platform/src/commands/releases.ts` | `platform releases` subcommands (platform-releases.md) |
| `tools/platform/src/commands/domains.ts` | `platform domains` subcommands (platform-domains.md) |
| `tools/platform/src/commands/data.ts` | `platform data` subcommands (platform-data.md) |
| `tools/platform/src/commands/config.ts` | `platform config` subcommands (platform-config.md) |
| `tools/platform/src/commands/legacy.ts` | `platform legacy` subcommands (platform-legacy.md) |
| `tools/platform/src/commands/audit.ts` | `platform audit list` (read-only) |

### Data directory layout

All state lives under `tools/platform/data/`, committed except plans and audit, which are local records:

```
tools/platform/data/
  registries/
    releases.json      (platform-releases.md)
    domains.json       (platform-domains.md)
    databases.json     (platform-data.md)
    environments.json  (platform-config.md)
    flags.json         (platform-config.md)
    deployments.json   (platform-config.md)
    legacy.json        (platform-legacy.md)
  plans/
    <planId>.json      (one stored Plan per file, written by plan, read by apply/verify)
  audit/
    audit.jsonl        (append-only, one AuditEntry per line)
```

Registry files are validated on every load; an invalid file fails the command with the schema error and writes nothing.

## The ProviderAdapter interface

```ts
export interface SunsetInfo {
  date: string;              // ISO month, e.g. '2027-01'
  dependents: string[];      // surfaces that break if the provider is removed
  checklist: { id: string; label: string; state: 'pending' | 'in-progress' | 'done' }[];
}

export interface PlanContext {
  target: string;            // adapter-defined target name, e.g. a domain or environment
  actor: string;             // session-derived principal id, set by auth.ts only
  options?: Record<string, string>;
}

export interface ProviderAdapter {
  id: string;                // 'native' | 'clerk' | 'cloudflare' | 'deno'
  kind: 'hosting' | 'identity' | 'data' | 'delivery';
  capabilities: string[];    // e.g. ['plan', 'apply', 'verify', 'health']
  sunset?: SunsetInfo;       // present on legacy adapters only
  plan(ctx: PlanContext): Promise<Plan>;
  apply(planId: string, confirmHash: string): Promise<AuditEntry>;
  verify(planId: string): Promise<{ ok: boolean; detail: string }>;
  health(): Promise<{ status: 'ok' | 'degraded' | 'down' | 'unknown'; detail: string }>;
}
```

Rules:

- `plan()` performs no network calls and resolves no credentials. It reads registries and local files only, so a plan can be produced offline and in tests.
- `apply()` loads the stored plan, recomputes its hash, and refuses unless `confirmHash` equals that hash exactly. It writes one audit entry per run, including refused runs.
- `verify()` re-reads the target state through the adapter's read path and compares it with the plan items; it never mutates.
- Adapters declare capabilities honestly: an adapter without an apply implementation lists `plan` and `health` only, and its plans are labelled Planned where the companion specification says so.

## The Plan format

A plan is a single JSON object, serialized canonically (sorted keys, stable item order) so the same inputs always produce the same bytes and the same hash, exactly as `scripts/migrate/logic.ts` produces `manifest.json` with per-table counts and per-owner checksums.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | `plan-<yyyymmdd>-<slug>-<short-hash>` |
| `adapterId` | string | yes | Adapter that produced the plan |
| `action` | string | yes | e.g. `domains.dns-diff`, `data.migrate`, `releases.promote` |
| `target` | string | yes | Domain, environment, database or release the plan acts on |
| `createdAt` | string (ISO 8601) | yes | |
| `actor` | string | yes | Session-derived principal id (see Authentication) |
| `items` | PlanItem[] | yes | Ordered; order is part of the checksum |
| `counts` | object | yes | `{ items: number, byKind: Record<string, number> }` |
| `hash` | string | yes | SHA-256 of the canonical serialization without the `hash` field |

`PlanItem`: `{ id: string, kind: string, summary: string, before?: unknown, after?: unknown, checksum: string }`, where `checksum` is the SHA-256 of the item's canonical serialization. A plan with zero items is valid and means no change is required.

## The AuditEntry model

Append-only, one JSON object per line in `tools/platform/data/audit/audit.jsonl`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Monotonic sequence plus timestamp, e.g. `20261105T0001` |
| `timestamp` | string (ISO 8601) | yes | |
| `actor` | string | yes | Session-derived principal id, never supplied by the caller |
| `action` | string | yes | Same vocabulary as `Plan.action`, plus `plan.create` |
| `target` | string | yes | |
| `planHash` | string | yes | Hash of the plan the action used, or the plan it created |
| `mode` | `'dry-run' \| 'applied'` | yes | Planning and refused applies are `dry-run` |
| `result` | `'ok' \| 'refused' \| 'failed'` | yes | |
| `detail` | string | no | Human-readable summary; never contains secret values |

The audit log is surfaced read-only in the admin interface (platform-admin.md). There is no command or route that edits or truncates it.

## Error and confirmation model

- Planning errors (invalid registry, unknown target, missing named environment variable) fail before any plan file is written; the command exits non-zero and prints the failing check by name.
- Apply requires two explicit inputs: `--plan <planId>` and `--confirm <planHash>`. A mismatched hash, a stale plan whose registries changed after planning, or a missing required environment variable name each produce a `refused` audit entry and no mutation.
- Partial apply failure stops at the failing item, records a `failed` audit entry naming the item id, and leaves earlier items applied; re-planning shows the remaining diff. There is no silent retry.
- Verification failure is a result, not an exception: `verify()` returns `ok: false` with detail, and the CLI exits non-zero.

## Command summary

```
platform plan <adapter> <action> --target <name>   # writes a plan, audit mode dry-run
platform apply --plan <planId> --confirm <hash>    # owner-run only
platform verify --plan <planId>
platform health [--adapter <id>]
platform releases|domains|data|config|legacy ...  # see companion specifications
platform audit list [--limit <n>]                  # read-only
```

## Testing strategy

Tests use fake adapters and recorded fixtures only: no live provider calls, no real credentials, fixture registries under `tools/platform/test/fixtures/`. Required coverage: canonical serialization and hash stability; checksum mismatch and stale-plan refusal; audit append-only behaviour; secret presence checks returning names only; and, for every mutating admin or control-plane route defined in the companion specifications, negative tests — anonymous requests return 401, authenticated non-admin requests return 403, and a request carrying a caller-chosen user or actor id in the body or URL is rejected, or the id is ignored in favour of the session identity.

## Future option

If a native desktop or embedded daemon later needs the control plane in-process, a Rust implementation may be introduced behind this same `ProviderAdapter` interface, consuming the same registry, plan and audit formats. It is not part of this phase.
