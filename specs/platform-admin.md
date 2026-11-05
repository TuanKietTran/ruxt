# Platform admin

## Patterns to follow

The platform pages are new pages in ruxt-admin and follow its audited patterns exactly:

- Pages never call the main application's HTTP APIs. A page fetches its own `server/api/*` routes with `useFetch`; the server routes read shared storage and the control plane's registry, plan and audit files directly (the same pattern by which the Jobs page reads the import queue and the Analytics page reads aggregate buckets through `@ruxt/core`).
- One layout (`app/layouts/default.vue`) with the navigation array extended by a Platform section; content width, sticky header, user chip and sign-out are unchanged.
- Styling uses the existing design tokens in `app/assets/admin.css` (`--bg-*`, `--fg-*`, `--accent`, `--border`, `--radius-*` and the `.card` / `.btn` / `.stat` classes). There is no theme switcher or density control in the admin application today, and the platform pages add none: they inherit the single token theme and the existing dense table styling.
- Every page and route is gated by the existing Clerk middleware and the per-request admin role recheck.
- Authentication and authorisation follow [Authentication and IAM](auth-iam-security.md): every mutating route authenticates the admin principal on the server and derives identity from the session only, through the `requireAdmin` pattern with the role rechecked on every request. Identity, owner and actor values are never taken from a request body, URL or query parameter, and caller-chosen user ids are never sent onward as authority. Plans, subscriptions and IAM information is reached only through authenticated admin server routes or the control plane's own registries.
- There is no live apply in the user interface in this phase. Applying a plan is owner-run from the command line (platform-control-plane.md); an in-UI apply is Planned and out of scope here.

## Pages

All routes are under `/platform`. Data sources are the files defined in the companion specifications under `tools/platform/data/`; the admin server reads them through Nitro storage mounts in the same style as the existing `cv` / `cvPipeline` / `analytics` mounts, with the mount names `platformRegistries`, `platformPlans` and `platformAudit` (exact mount configuration is part of the implementation, the names are contractual).

| Page | Route | Server route | Data source |
| --- | --- | --- | --- |
| Overview / health | `/platform` | `GET /api/platform/overview` | All registries + adapter `health()` results |
| Releases | `/platform/releases` | `GET /api/platform/releases` | `registries/releases.json`, `registries/deployments.json` |
| Release detail + plan viewer | `/platform/releases/:version` | `GET /api/platform/releases/:version` | Release record + its plans from `plans/` |
| Domains | `/platform/domains` | `GET /api/platform/domains` | `registries/domains.json` |
| Databases | `/platform/databases` | `GET /api/platform/databases` | `registries/databases.json` |
| Configuration / flags | `/platform/config` | `GET /api/platform/config` | `registries/environments.json`, `registries/flags.json`, secret presence by name |
| Audit log | `/platform/audit` | `GET /api/platform/audit` | `audit/audit.jsonl` (read-only) |
| Legacy sunset tracker | `/platform/legacy` | `GET /api/platform/legacy` | `registries/legacy.json` |
| Plan viewer (shared) | `/platform/plans/:planId` | `GET /api/platform/plans/:planId` | `plans/<planId>.json` + audit entries with that plan hash |

## JSON shapes

These shapes are shared with the CLI: they are the `tools/platform/src/types.ts` types serialized unchanged, so a value shown in the UI is byte-identical to the value the CLI produced.

```ts
// GET /api/platform/overview
{ generatedAt: string,
  health: { adapterId: string, status: 'ok' | 'degraded' | 'down' | 'unknown', detail: string }[],
  counts: { releases: number, domains: number, databases: number, openChecklistItems: number, plans: number } }

// GET /api/platform/releases  -> ReleaseRecord[] from platform-releases.md, newest first
// GET /api/platform/releases/:version
{ release: ReleaseRecord, deployments: DeploymentRecord[], planIds: string[] }

// GET /api/platform/domains    -> DomainRecord[] from platform-domains.md
// GET /api/platform/databases -> DatabaseRecord[] from platform-data.md

// GET /api/platform/config
{ environments: EnvironmentRecord[],
  flags: FlagRecord[],
  envPresence: { environment: string, name: string, present: boolean }[] }  // names and presence only, never values

// GET /api/platform/audit?limit=<n>
{ entries: AuditEntry[] }  // newest first; AuditEntry is defined in platform-control-plane.md

// GET /api/platform/legacy -> LegacyProviderRecord[] from platform-legacy.md

// GET /api/platform/plans/:planId
{ plan: Plan, audit: AuditEntry[] }  // Plan is defined in platform-control-plane.md
```

Read routes are `GET` only in this phase. Any future mutating admin route must authenticate the admin principal on the server with the role rechecked per request and derive the actor from the session, as above.

## Per-page states

Every page defines the same three states, using the existing card and table styling:

- Empty: the registry file exists and parses but holds no records. The page shows an empty card naming the data source (for example: no releases recorded yet; releases are created from the command line) — never a blank table.
- Loading: the existing page loading pattern, with the navigation and header stable.
- Error: the registry file is missing or fails schema validation, or the server route fails. The page shows the error detail returned by the server route (file name and validation message, no file contents beyond the failing field) and no partial table.

The audit page's empty state is an empty log (no actions recorded yet). The overview page treats an adapter health of `unknown` as a shown state, not an error.

## Plan viewer

The plan viewer is the centre of the review workflow and is shared by the release detail page and the standalone plan route:

- Header: plan id, adapter, action, target, creation time, actor, and the plan hash in a monospace block with a copy affordance.
- A dry-run badge is shown on every plan that has no `applied` audit entry; a plan with an applied entry shows the apply time, mode and result from that entry instead.
- Items table: one row per plan item with kind, summary, per-item checksum, and expandable before/after values. Values are rendered as data, never executed or linked as actions.
- Counts summary: total items and counts by kind, matching the plan's `counts` object.
- No apply control exists in this phase. The footer states that applying is owner-run from the command line with the plan id and hash, and shows the exact command shape `platform apply --plan <planId> --confirm <hash>` as text.

## Testing

Following platform-control-plane.md's testing strategy, the implementation of these pages and routes requires, for every mutating route (present or added later): anonymous requests return 401; authenticated non-admin requests return 403; and a request carrying a caller-chosen user or actor id in the body or URL is rejected, or the id is ignored in favour of the session identity. Read routes require the same 401/403 negative tests for unauthenticated and non-admin access. Fixtures are recorded registry, plan and audit files only; no live provider calls are made in tests.
