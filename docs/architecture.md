# Architecture

`Ruxt` is a full-stack CV workspace and subscription platform built on **Nuxt 4** (Vue frontend + Nitro server). The CV surface provides Markdown/CSS editing, revisioned filesystem documents, SSE collaboration, authenticated PDF/image import, export, and MCP automation. The subscription/catalog/IAM surface follows **Domain-Driven Design (DDD)** and **CQRS** with pluggable persistence.

---

## Layer Overview

```
┌──────────────────────────────────────────────┐
│                   app/                        │  Vue 3 SPA (Nuxt pages, composables)
├──────────────────────────────────────────────┤
│                  server/                      │  Nitro REST, SSE, MCP, sessions, CV store
├──────────────────────────────────────────────┤
│                   core/                       │  Pure business logic (no framework deps)
│   domain/   │   handlers/   │   repos/ (ports)│
├──────────────────────────────────────────────┤
│                   infra/                      │  Adapters: DB, crypto, deploy strategies
└──────────────────────────────────────────────┘
```

`core` has zero knowledge of `infra`, `server`, or `app`. Subscription, catalog, auth, IAM, CV document, template, and import routes dispatch through core handlers and repository/service ports. Nitro owns transport, filesystem, and Python subprocess adapters; core owns the CV domains and use cases.

---

## Directory Reference

```
ruxt/
├── app/                        # Nuxt frontend
│   ├── assets/theme/           # Global CSS / design tokens
│   ├── components/ui/          # Reusable UI components
│   ├── composables/            # Vue composables
│   ├── layouts/                # Nuxt layouts
│   ├── middleware/             # Client-side route guards
│   ├── pages/                  # File-based routing
│   │   ├── index.vue           # Query-driven draft/session/template editor
│   ├── components/
│   │   ├── CvSessionEditor.vue # Saved-session editor
│   │   ├── login.vue           # Auth page
│   │   └── d/index.vue         # Subscription dashboard
│   ├── plugins/                # Vue plugins
│   └── app.vue                 # Root Vue component
│
├── server/                     # Nitro server (API layer)
│   ├── plugins/
│   │   ├── init-cqrs.ts        # Mounts the CQRS Mediator singleton
│   │   └── init-infra.ts       # Bootstraps infra (resolves deploy strategy, wires repos)
│   ├── routes/api/
│   │   ├── health.get.ts
│   │   ├── auth/               # register, login, logout, me
│   │   ├── plans/              # CRUD for plans
│   │   ├── subscriptions/      # Create, read, list + lifecycle actions
│   │   │   └── [id]/           # cancel, pause, resume, renew, plan-change
│   │   ├── cvs/                # List/open/save CVs and SSE event streams
│   │   ├── cv-imports/         # Upload status, preview, retry/cancel, commit
│   │   ├── cv-artifacts/       # Owner-scoped artifact downloads
│   │   └── cv-templates/       # Immutable template catalog
│   │   └── iam/
│   │       ├── check-access.post.ts
│   │       └── subjects/       # Get, upsert, delete IAM subjects
│   ├── routes/mcp.ts           # MCP Streamable HTTP adapter
│   └── utils/                  # Sessions, CV store, MCP tools, HTTP error mapping
│
├── core/                       # Pure domain + application logic
│   ├── cqrs.ts                 # Mediator, Handler, Query, Command types
│   ├── domain/
│   │   ├── value-object.ts     # Base ValueObject<T>
│   │   ├── cv/                 # Profile, template, application, import contracts
│   │   ├── datetime/           # Instant, Duration, value objects
│   │   ├── catalog/            # Plan, PlanId
│   │   ├── subscription/       # Subscription, SubscriptionStatus, BillingCycle, Money
│   │   └── iam/                # UserId, SubjectAttributes, Policy, AccessDecision …
│   ├── handlers/               # One file per use-case command/query
│   └── repos/                  # Repository interfaces (ports)
│       ├── subscription.repo.ts
│       ├── plan.repo.ts
│       ├── iam.repo.ts
│       └── user.repo.ts
│
├── admin/                      # Dedicated Nuxt admin app (GitHub OAuth, metrics, templates)
├── infra/                      # Infrastructure adapters
│   ├── types.ts                # Repos aggregate interface
│   ├── registry.ts             # Wires all handlers + repos at boot
│   ├── kv.ts                   # Deno KV singleton accessor
│   ├── crypto/                 # ScryptHasher (password hashing)
│   ├── db/
│   │   ├── schema.ts           # Drizzle SQLite table definitions
│   │   └── sqlite.ts           # DB connection singleton
│   └── deploy/
│       ├── strategy.ts         # DeployStrategy interface + registry + resolver
│       ├── index.ts            # Imports all strategy registrations
│       ├── deno/               # Deno KV repo implementations (weight 10)
│       └── onprem/             # SQLite repo implementations (weight 1, fallback)
│
├── scripts/render-pdf.mjs      # Headless browser PDF automation
├── specs/                      # Current subsystem contracts
├── nuxt.config.ts              # Path aliases, CV storage, Nitro config
├── package.json
└── pnpm-workspace.yaml
```

The `admin/` workspace is served independently (locally on port 3001), not as a route inside ruxt. It has its own GitHub-only session and numeric-id allowlist, while reading the same `analytics`, `cvPipeline`, and `cv` Nitro storage namespaces. See [the admin dashboard spec](../specs/admin-dashboard.md).

---

## Core Concepts

### CV editor and documents

`/` opens a new draft, `/?s=<id>` edits a saved session, and `/?t=<id>&v=<version>` previews an allowed template. The session editor binds CodeMirror to `useCvDocument()`, which debounces complete Markdown/CSS replacements and sends the current revision to `PUT /api/cvs/:id`. `server/adapters/cv/document-store.ts` validates, serializes writes per document, persists through Nitro storage, increments revisions, and publishes process-local events consumed by `/api/cvs/:id/events`.

Imported facts form a versioned `CvProfile` snapshot. A `CvApplication` composes that snapshot with one immutable `CvTemplate` version. No standalone profile-saving API or browser profile store exists.

The editor renders sanitized Markdown with unified/remark/rehype, applies user-controlled CSS through a style element, prints PDF through the browser, and captures each rendered sheet as PNG/JPEG with html2canvas. `/mcp` exposes CV document operations through Streamable HTTP; REST and MCP independently dispatch the same core handlers without an internal HTTP hop.

### CQRS Mediator (`core/cqrs.ts`)

All business operations go through a central **Mediator** singleton. Callers construct a typed request object and call `mediator.send(request)` — the mediator routes it to the registered handler.

```
          ┌──────────────────┐
          │  API route / page │
          └────────┬─────────┘
                   │ mediator.send(request)
          ┌────────▼─────────┐
          │     Mediator      │  routes by requestName
          └────────┬─────────┘
                   │ handler.execute(payload)
          ┌────────▼─────────┐
          │     Handler       │  pure fn: payload → Result<T>
          └────────┬─────────┘
                   │ repo.save / repo.findById …
          ┌────────▼─────────┐
          │   Repository      │  interface (port)
          └────────┬─────────┘
                   │ SQL / KV / …
          ┌────────▼─────────┐
          │    Adapter        │  concrete implementation in infra/
          └──────────────────┘
```

**Commands** mutate state and are registered via `mediator.registerCommand()`.  
**Queries** are read-only and registered via `mediator.registerQuery()`.

Every handler module exports three things:
| Export | Purpose |
|---|---|
| `create*Handler(repo)` | Factory — returns a `Handler<I,O>` |
| `*Command(input)` / `*Query(input)` | Typed request builder for callers |
| `register*(repo)` | Convenience: creates the handler and registers it with the live mediator |

### Domain Model

#### Subscription lifecycle

```
trialing ──► active ──► past_due ──► active   (on renewal)
    │            │           │
    │            ▼           ▼
    └──────► cancelled   expired
                 ▲
             paused ──► active
```

State transitions are enforced by `SubscriptionStatus.transitionTo(next)`. Any invalid jump throws immediately.

Subscriptions are **immutable value objects** — every mutation method (`cancel`, `pause`, `renew`, …) returns a **new** `Subscription` instance. The handler then calls `repo.save(newSub)`.

Plan changes scheduled mid-cycle are applied atomically on the next `renew()` call via `nextIntervalPlanId`.

#### Plan (Catalog)

A `Plan` carries: price (`Money` — amount in minor units + ISO-4217 currency), `BillingCycle` (weekly / monthly / quarterly / biannual / yearly), optional `trialDuration`, a list of `features`, and an `isPublic` flag.

`Plan.annualCost` normalises any billing cycle to a yearly figure for pricing-page comparisons.

#### IAM (Access Control)

The system uses **ABAC** (Attribute-Based Access Control) instead of RBAC.

Access is evaluated by composing `Policy` objects inside a `PolicyEvaluator`. The combinator is **deny-overrides**:
1. Any explicit `deny` → deny.
2. No deny + at least one `allow` → allow.
3. All policies abstain → deny (default-deny).

Built-in policies:

| Policy | Rule |
|---|---|
| `OwnerFullAccessPolicy` | Subject owns the resource → allow all actions |
| `ServiceAccountReadOnlyPolicy` | Service account → allow `*:read`, deny everything else |
| `SameOrgPolicy` | Same org, human caller → allow `subscription:read` |

The `CheckAccess` query handler runs this evaluation on every incoming access check.

### Deploy Strategy

`infra/deploy/strategy.ts` implements a simple **strategy registry**. Each strategy registers itself with a `weight` and a `predicate`. At boot, `resolveStrategy()` picks the highest-weight strategy whose `predicate()` returns `true`.

| Strategy | predicate | weight |
|---|---|---|
| **DenoKV** | `typeof globalThis.Deno !== "undefined"` | 10 |
| **SQLite** (on-prem) | always true (fallback) | 1 |

Both strategies implement the same `Repos` interface (`{ sub, plan, iam, user }`), making the rest of the codebase completely storage-agnostic.

### Boot Sequence (Server)

Nitro plugins run in order at server startup:

1. **`init-cqrs`** — calls `mountVendor()` to create the `Mediator` singleton.
2. **`init-infra`** — calls `bootstrap()` in `infra/registry.ts`:
   - Resolves the active deploy strategy.
   - Instantiates all repository adapters.
   - Calls `registerAll(repos)` which wires every handler to the mediator.

After boot every API route can call `useMediator().send(request)` to dispatch work.

### Path Aliases

`nuxt.config.ts` registers two aliases available in both Nitro (server) and Vite (frontend):

| Alias | Resolves to |
|---|---|
| `@core` | `./core` |
| `@infra` | `./infra` |

---

## Data Flow — Example: Save And Broadcast A CV

```
CodeMirror edit
        │ complete Markdown/CSS after debounce
        ▼
PUT /api/cvs/:id with expectedRevision and sourceId
        │
        ▼
server/adapters/cv/document-store.ts
  validates input, checks revision, serializes the document write
        │
        ├──► Nitro filesystem storage (`cv` namespace)
        │
        └──► process-local cv:update publication
                     │
                     ▼
GET /api/cvs/:id/events (SSE) ──► clean peer editors
```

The writer receives the committed revision in the PUT response. A stale expected revision returns HTTP 409 with the current document; peers ignore their own `sourceId` and do not overwrite dirty local edits.

## Data Flow — Example: Create Subscription

```
POST /api/subscriptions
        │
        ▼
server/routes/api/subscriptions/index.post.ts
  reads body, calls mediator.send(createSubscriptionCommand(input))
        │
        ▼
core/handlers/create-subscription.ts
  builds Subscription domain object, calls repo.save(sub)
        │
        ▼
infra/deploy/onprem/subscription-repo-sqlite.ts   (or deno/)
  persists to SQLite / Deno KV
        │
        ▼
handler returns { success: true, data: { subscriptionId } }
        │
        ▼
API route responds 201 { subscriptionId }
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Full-stack framework | Nuxt 4 (Vue 3 + Nitro) |
| CV editor | CodeMirror, unified/remark/rehype, html2canvas |
| CV persistence | Nitro filesystem storage and SSE |
| Automation | MCP Streamable HTTP and browser rendering |
| Language | TypeScript (ESM, `target: es2022`) |
| Package manager | pnpm (workspace) |
| On-prem database | SQLite via Drizzle ORM |
| Cloud database | Deno KV |
| Password hashing | Scrypt |
| Session | Signed cookie (H3 `useSession`) |