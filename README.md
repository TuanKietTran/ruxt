# Ruxt

A full-stack CV workspace and subscription platform built on [Nuxt 4](https://nuxt.com). Ruxt combines a Markdown/CSS CV editor, server-side CV import/extraction, realtime document collaboration, export and MCP automation with plans, subscription lifecycle, session auth, and attribute-based access control (ABAC).

## Documentation

| Document | Description |
|---|---|
| [Architecture](./docs/architecture.md) | Layered architecture, module map, domain model, boot sequence |
| [Extending](./docs/extending.md) | How to add handlers, deploy strategies, policies, and API routes |
| [CV Editor](./specs/cv-editor.md) | Editor routes, source/preview behavior, themes, and exports |
| [CV Documents](./specs/cv-documents-realtime.md) | Persistence, revisions, autosave, and realtime synchronization |
| [CV Server Workflows](./specs/cv-server-workflows.md) | Target CV workflows, MCP surface, core handlers, ports, and implementation order |

## Quick Start

```bash
pnpm install
pnpm cv:pipeline:setup  # Python extraction/OCR dependencies
pnpm dev                # http://localhost:3000
```

## Features

- **CV editor** — Markdown and CSS source editing with sanitized live preview, A4 pagination, zoom, and responsive panes
- **Realtime CV documents** — filesystem-backed Nitro storage, optimistic revisions, debounced autosave, and SSE updates
- **CV import** — authenticated PDF/image extraction into versioned profile snapshots composed with immutable templates
- **Local profiles** — browser-only profile editor with passphrase-encrypted (AES-256-GCM) import, export and copy-to-clipboard
- **Profile detection** — highlight the profile information inside a CV session, save it to a new or existing local profile, and apply one profile to any number of sessions
- **CV export and automation** — browser PDF, 2× PNG/JPEG output, and Streamable HTTP MCP tools
- **Subscription lifecycle** — trialing, active, paused, past-due, cancelled, expired with enforced state machine transitions
- **Plan catalog** — price (minor-unit currency), billing cycle (weekly → yearly), optional trial period, feature list
- **ABAC access control** — composable deny-overrides policy evaluator with built-in owner, service account, and org policies
- **Multi-backend storage** — Deno KV in the cloud, SQLite on-premise; swap with zero core changes
- **CQRS mediator** — all business operations are typed commands/queries routed through a central mediator
- **Session auth** — scrypt-hashed passwords, signed cookie sessions

## Tech Stack

| Concern | Technology |
|---|---|
| Full-stack framework | Nuxt 4 / Nitro |
| Frontend | Vue 3 |
| Language | TypeScript (ESM, ES2022) |
| On-prem database | SQLite via Drizzle ORM |
| Cloud database | Deno KV |
| CV persistence | Nitro filesystem storage |
| CV import persistence | Nitro filesystem jobs and artifacts |
| Editor and rendering | CodeMirror, unified/remark/rehype, html2canvas |
| Agent integration | MCP Streamable HTTP |
| Password hashing | Scrypt |
| Package manager | pnpm |

## Project Layout

```
ruxt/
├── app/          # Vue 3 frontend (pages, components, composables)
├── core/         # Pure domain logic — framework-free
│   ├── cqrs.ts   # Mediator, Handler, Command, Query types
│   ├── domain/   # Value objects, entities, domain services
│   ├── handlers/ # One file per use-case (command or query)
│   └── repos/    # Repository interfaces (ports)
├── infra/        # Adapters: DB, crypto, deploy strategies
│   ├── deploy/   # Deno KV and SQLite repo implementations
│   ├── db/       # Drizzle schema + SQLite connection
│   └── crypto/   # Scrypt password hasher
├── server/       # Nitro server: REST, SSE, sessions, CV storage, MCP
│   ├── plugins/  # Boot: mount mediator, bootstrap infra
│   ├── routes/   # REST API, CV event streams, and MCP transport
│   └── utils/    # CV document store, API errors, sessions, MCP tools
├── shared/       # Browser/server CV transport types
├── scripts/      # Headless CV rendering automation
├── specs/        # Implementation-truth subsystem specifications
└── docs/         # Architecture and extension guides
```

## API Overview

| Resource | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Plans | `GET /api/plans`, `GET /api/plans/:id`, `PUT /api/plans/:id`, `DELETE /api/plans/:id` |
| Subscriptions | `POST /api/subscriptions`, `GET /api/subscriptions`, `GET /api/subscriptions/:id` |
| Lifecycle | `POST /api/subscriptions/:id/cancel`, `pause`, `resume`, `renew` |
| Plan change | `PUT /api/subscriptions/:id/plan-change`, `DELETE /api/subscriptions/:id/plan-change` |
| IAM | `POST /api/iam/check-access`, `GET/PUT/DELETE /api/iam/subjects/:userId` |
| CV documents | `GET /api/cvs`, `GET/PUT /api/cvs/:id`, `GET /api/cvs/:id/events` |
| CV profile switch | `POST /api/cvs/:id/profile/preview`, `PUT /api/cvs/:id/profile` |
| CV profile detection | `GET /api/cvs/:id/profile/detect`, `POST /api/cv-profiles/apply` |
| Automation | `POST /mcp` (MCP Streamable HTTP) |

## CV editor API and MCP

Markdown and CSS are persisted in Nitro storage (`.data/cv` locally). Browser and agent edits use revision-based optimistic concurrency and are broadcast to open editors over SSE.

| Endpoint | Purpose |
|---|---|
| `GET /api/cvs` | List documents |
| `GET /api/cvs/:id` | Open Markdown, CSS, and revision |
| `PUT /api/cvs/:id` | Save with optional `expectedRevision` |
| `GET /api/cvs/:id/events` | Subscribe to real-time updates |

```bash
pnpm dev
# Connect an MCP Streamable HTTP client to http://localhost:3000/mcp
```

The stateless Streamable HTTP endpoint exposes `list_cvs`, `open_cv`, `save_cv`, `patch_cv`, `switch_cv_profile`, `detect_cv_profile`, and `apply_cv_profile`.

The editor can export PDF through the browser print pipeline, or render every CV sheet as a 2× PNG/JPEG image from the header actions.

## Development

```bash
pnpm dev          # start dev server with hot reload
pnpm build        # production build
pnpm preview      # preview production build locally
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NUXT_SESSION_SECRET` | `dev-only-secret-…` | Runtime secret used to sign session cookies — **must be changed in every deployed context** |
| `CV_DATA_DIR` | `./.data/cv` | Filesystem location for persisted CV documents |
| `CV_URL` | `http://localhost:3000/` | Editor URL used by headless rendering |
| `CHROMIUM_PATH` | platform default | Chromium-compatible executable used by the PDF script |