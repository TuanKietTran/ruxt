# Platform configuration

## Environments

One environment marker exists today: `RUXT_DEPLOYMENT_ENV=development` in the `wrangler.json` variables, and deployment definitions do not by themselves establish production readiness (account, bindings, environment, routing and rollback target are confirmed manually per [Cloudflare runbook](cloudflare-migration-runbook.md)). The environment registry below is Planned.

File: `tools/platform/data/registries/environments.json` — `{ environments: EnvironmentRecord[] }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | `development`, `staging`, `production` |
| `deploymentEnv` | string | yes | Value carried by `RUXT_DEPLOYMENT_ENV` for this environment |
| `domain` | string | no | Domain record name (platform-domains.md) bound to this environment |
| `databaseId` | string | yes | Database record id (platform-data.md) |
| `adapterId` | string | yes | Primary hosting adapter: `native`, `cloudflare` or `deno` |
| `requiredEnv` | string[] | yes | Environment variable names that must be present (see below) |

## Configuration values and secrets by reference

Configuration splits into values, which may be recorded, and secrets, which are named references only (platform-control-plane.md, principle 3). Presence validation follows the existing pattern in `server/plugins/validate-deployment-env.ts` and `server/plugins/validate-cloudflare-deployment-env.ts`: at boot and in `platform config check`, each required name is reported present or missing; values are never printed, planned or audited.

Current environment variable names (from `.env.example` and the code):

| Name | Kind | Notes |
| --- | --- | --- |
| `DATABASE_URL` | secret reference | Named in `.env.example`; no Postgres adapter exists today |
| `NUXT_CLERK_SECRET_KEY` | secret | Clerk server key (legacy, platform-legacy.md) |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | config | Clerk public key |
| `NUXT_SESSION_SECRET` | secret | Local session auth |
| `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_DISABLED_HOSTS` | config | Input to the feature-flag middleware (below) |
| `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_ROUTES` | config | Input to the feature-flag middleware (below) |
| `RUXT_DENO_STORAGE` | switch | `1` selects the Deno storage path |
| `RUXT_CLOUDFLARE_STORAGE` | switch | `1` selects the Cloudflare storage path |
| `NITRO_PRESET` | switch | `deno-deploy` selects the Deno Deploy build |
| `RUXT_DEPLOYMENT_ENV` | config | Environment marker; `development` in `wrangler.json` today |
| `CLERK_TELEMETRY_DISABLED` | config | `1` in `wrangler.json` variables |

Resource identifiers in `wrangler.json` (account, D1 and KV ids) are configuration, not secrets, and are recorded in the Cloudflare adapter's registry data (platform-legacy.md), never copied into plans as values to change implicitly: a plan item names any identifier it would change explicitly.

CLI (module `tools/platform/src/commands/config.ts`): `platform config check --environment <name>` validates the environment record, the presence of every `requiredEnv` name, and that the domain and database references resolve. It is read-only and writes a `dry-run` audit entry.

## Feature flags

Feature segmentation already exists and is deployment-owned, not identity-owned: `server/middleware/feature-flags.ts` enforces the host and route patterns from `@ruxt/shared/features` (`authRoutes` crossed with `authDisabledHosts`, driven by the two `NUXT_PUBLIC_FEATURE_FLAGS_*` names above) and returns 404 where a feature is disabled.

Planned: flags become registry data rendered by the admin pages, keeping the same middleware semantics. File: `tools/platform/data/registries/flags.json` — `{ flags: FlagRecord[] }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | e.g. `auth.routes`, `auth.disabledHosts` |
| `kind` | `'host-list' \| 'route-list' \| 'boolean'` | yes | |
| `values` | string[] | yes | Host or route patterns, or `['true']` / `['false']` for booleans |
| `environment` | string | yes | Environment the flag applies to |
| `source` | `'env' \| 'registry'` | yes | `env` while the value still comes from the `NUXT_PUBLIC_FEATURE_FLAGS_*` names; `registry` is Planned |

Changing a flag is a plan-producing action (`platform config plan-flag --flag <id> --environment <name>`); the middleware change that reads the registry instead of the environment is Planned and ships with the flag plan/apply support.

## Deployment history and status

Deployment history today is the git-tag and workflow history only. Planned registry, file `tools/platform/data/registries/deployments.json` — `{ deployments: DeploymentRecord[] }`, appended by release and domain applies:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | |
| `environment` | string | yes | |
| `version` | string | yes | Release version deployed |
| `adapterId` | string | yes | |
| `deployedAt` | string (ISO 8601) | yes | |
| `planHash` | string | yes | Plan that produced the deployment |
| `status` | `'planned' \| 'applied' \| 'verified' \| 'failed' \| 'rolled-back'` | yes | `planned` is written at plan time; the later states are written by apply and verify |
| `auditId` | string | yes | Audit entry for the apply |

Status transitions are one-way in record order; a rollback appends a new record rather than rewriting history, matching the append-only audit rule.
