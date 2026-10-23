# Ruxt

A full-stack CV workspace and subscription platform built on [Nuxt 4](https://nuxt.com). Ruxt combines a Markdown/CSS CV editor, server-side CV import/extraction, realtime document collaboration, export and MCP automation with plans, subscription lifecycle, session auth, and attribute-based access control (ABAC).

## Documentation

| Document | Description |
|---|---|
| [Specs index](./specs/_readme.md) | Current implementation contracts and subsystem ownership |
| [Architecture](./docs/architecture.md) | Architecture guide (consult specs for current package boundaries) |
| [Extending](./docs/extending.md) | How to add handlers, deploy strategies, policies, and API routes |
| [CV Editor](./specs/cv-editor.md) | Editor routes, source/preview behavior, themes, and exports |
| [CV Documents](./specs/cv-documents-realtime.md) | Persistence, revisions, autosave, and realtime synchronization |
| [CV Server Workflows](./specs/cv-server-workflows.md) | Target CV workflows, MCP surface, core handlers, ports, and implementation order |
| [Cloudflare migration](./docs/MIGRATION.md) | Deno Deploy to Cloudflare Workers plan and verification status |

## Quick Start

The active private core dependency is the external fallback `file:vendor/tuankiettran-ruxt-core-0.3.0.tgz` because GitHub Packages read:packages access returned HTTP 403. Future registry mode uses `.npmrc` with `NODE_AUTH_TOKEN`; the fallback tarball remains outside this repository.

```bash
pnpm install --frozen-lockfile
pnpm cv:pipeline:setup  # Python extraction/OCR dependencies
pnpm dev                # http://localhost:3000
```

## Features

- **CV editor** — Markdown and CSS source editing with sanitized live preview, A4 pagination, zoom, and responsive panes
- **Realtime CV documents** — filesystem-backed Nitro storage, optimistic revisions, debounced autosave, and SSE updates
- **CV import** — authenticated PDF/image extraction into versioned profile snapshots composed with immutable templates
- **Local profiles** — browser-only profile editor with passphrase-encrypted (AES-256-GCM) import, export and copy-to-clipboard
- **Profile detection** — highlight profile information inside a CV session, save it to a local profile, and apply profiles to sessions
- **CV export and automation** — browser PDF, 2× PNG/JPEG output, and Streamable HTTP MCP tools
- **Subscription lifecycle** — trialing, active, paused, past-due, cancelled, expired with enforced state machine transitions
- **Plan catalog** — price, billing cycle, optional trial period, and feature list
- **ABAC access control** — composable deny-overrides policy evaluator with owner, service-account, and org policies
- **Multi-backend storage** — Deno KV in the cloud, SQLite on-premise; swap with zero core changes
- **CQRS mediator** — typed commands/queries routed through a central mediator
- **Session auth** — scrypt-hashed passwords, signed cookie sessions

## Tech Stack

| Concern | Technology |
|---|---|
| Full-stack framework | Nuxt 4 / Nitro |
| Frontend | Vue 3 |
| Language | TypeScript (ESM, ES2022) |
| On-prem database | SQLite via Drizzle ORM |
| Cloud database | Deno KV; Cloudflare D1/KV adapter is experimental |
| CV persistence | Nitro filesystem storage or Deno/Cloudflare KV |
| CV import persistence | Nitro filesystem jobs and artifacts |
| Editor and rendering | CodeMirror, unified/remark/rehype, html2canvas |
| Agent integration | MCP Streamable HTTP |
| Password hashing | Node scrypt; WebCrypto PBKDF2 in Cloudflare Workers |
| Package manager | pnpm |

## Project Layout

```
ruxt/
├── app/          # Vue 3 frontend (pages, components, composables)
├── packages/     # Legacy editor snapshot; active layer resolves from installed package
├── infra/        # Adapters: DB, crypto, deploy strategies
│   ├── deploy/   # Deno KV, SQLite, and Cloudflare D1 repository adapters
│   ├── db/       # Drizzle schema + SQLite connection
│   └── crypto/   # Runtime-specific password hashing
├── server/       # Nitro server: REST, SSE, sessions, CV storage, MCP
├── specs/        # Implementation contracts and ownership map
├── scripts/      # Build and headless CV rendering automation
└── docs/         # Architecture and migration guides
```

The separate `ruxt-core` workspace supplies public `@ruxt/shared` primitives and private `@ruxt/core` business/security handlers, domains, and ports. Browser code cannot import private core. See the specs index for package-consumption rules.

## API Overview

| Resource | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Plans | `GET /api/plans`, `GET /api/plans/:id`, `PUT /api/plans/:id`, `DELETE /api/plans/:id` |
| Subscriptions | `POST /api/subscriptions`, `GET /api/subscriptions`, `GET /api/subscriptions/:id` |
| IAM | `POST /api/iam/check-access`, `GET/PUT/DELETE /api/iam/subjects/:userId` |
| CV documents | `GET /api/cvs`, `GET/PUT /api/cvs/:id`, `GET /api/cvs/:id/events` |
| Automation | `POST /mcp` (MCP Streamable HTTP) |

## CV editor API and MCP

Markdown and CSS are persisted in Nitro storage (`.data/cv` locally). Browser and agent edits use revision-based optimistic concurrency and are broadcast to open editors over SSE.

```bash
pnpm dev
# Connect an MCP Streamable HTTP client to http://localhost:3000/mcp
```

The stateless Streamable HTTP endpoint exposes `list_cvs`, `open_cv`, `save_cv`, `patch_cv`, `switch_cv_profile`, `detect_cv_profile`, and `apply_cv_profile`.

The editor can export PDF through the browser print pipeline, or render every CV sheet as a 2× PNG/JPEG image from the header actions.

## Cloudflare Workers (experimental)

The optional Cloudflare target uses Nitro's Cloudflare Workers preset with Workers Static Assets, D1 for structured repositories, and KV for Nitro namespaces. It is not Cloudflare Pages. Workers do not provide the Python/Tesseract extraction pipeline, so `/api/cv-capabilities` reports extraction unavailable and imports return 503. The Cloudflare password adapter uses WebCrypto PBKDF2 because Node scrypt is unavailable in Workers.

Cloudflare setup is manual: create D1 and KV resources, replace placeholders in `wrangler.json`, apply migrations, and set Clerk/session secrets. Do not commit real IDs or secrets. KV has eventual consistency; CV updates and SSE events are currently isolate-local and require further runtime verification.

The owner must configure `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `NODE_AUTH_TOKEN` as workflow/environment secrets before manually dispatching the guarded deployment workflow. No provider action is performed locally.

## Development

```bash
pnpm dev          # start dev server with hot reload
pnpm build        # production/self-hosted build
pnpm build:cloudflare
pnpm cf:deploy:dry
pnpm preview      # preview production build locally
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NUXT_SESSION_SECRET` | `dev-only-secret-…` | Runtime secret used to sign session cookies; change in every deployed context |
| `CV_DATA_DIR` | `./.data/cv` | Filesystem location for persisted CV documents |
| `CV_URL` | `http://localhost:3000/` | Editor URL used by headless rendering |
| `CHROMIUM_PATH` | platform default | Chromium-compatible executable used by the PDF script |
