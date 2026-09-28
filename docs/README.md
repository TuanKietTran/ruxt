# Ruxt — Documentation

**Ruxt** is a Nuxt 4 CV workspace and subscription platform. Its primary product surfaces are:

- a Markdown/CSS CV editor with live sanitized preview, A4 pagination, browser export, and responsive source/preview panes;
- revisioned CV documents persisted by Nitro and synchronized to other editors through SSE;
- authenticated PDF/image import into profile snapshots composed with immutable CV templates;
- an MCP Streamable HTTP endpoint for listing, opening, saving, and patching CVs;
- plan, subscription, account-session, and IAM management backed by SQLite or Deno KV.

## Contents

| Document | Description |
|---|---|
| [Architecture](./architecture.md) | Runtime surfaces, layers, storage ownership, CQRS, and boot sequence |
| [Extending](./extending.md) | How to add handlers, deploy strategies, policies, and API routes |
| [CV Editor](../specs/cv-editor.md) | Editor UI, rendering, themes, and export behavior |
| [CV Documents](../specs/cv-documents-realtime.md) | REST, persistence, revisions, autosave, conflicts, and SSE |
| [CV Server Workflows](../specs/cv-server-workflows.md) | Target CV workflows, MCP surface, ports, and staged implementation |
| [MCP Automation](../specs/mcp-automation.md) | Current tools, transport, and headless rendering |
| [Subscriptions](../specs/subscriptions-catalog.md) | Plans and subscription lifecycle |
| [Authentication and IAM](../specs/auth-iam-security.md) | Sessions, policies, and current trust boundaries |
| [Admin Dashboard](../specs/admin-dashboard.md) | Dedicated app, GitHub allowlist, analytics, and template publication |

## Quick Start

```bash
pnpm install
pnpm dev        # ruxt: http://localhost:3000
pnpm dev:admin  # dedicated admin app: http://localhost:3001
```

The editor uses `/` for a new draft, `/?s=<id>` for a saved session, and `/?t=<id>&v=<version>` for a template. The MCP endpoint is `/mcp`.

## Tech Stack

| Concern | Technology |
|---|---|
| Full-stack framework | Nuxt 4 / Nitro |
| Frontend | Vue 3, CodeMirror |
| CV rendering | unified/remark/rehype, html2canvas, browser print |
| CV persistence/realtime | Nitro filesystem storage, optimistic revisions, SSE |
| CV imports | Nitro filesystem jobs/artifacts + bundled Python pipeline |
| Business logic | TypeScript, DDD + CQRS |
| Auth | Session cookie with scrypt-hashed passwords |
| On-prem database | SQLite via Drizzle ORM |
| Cloud database | Deno KV |
| Automation | MCP Streamable HTTP, Playwright-compatible browser |
| Package manager | pnpm |

## Project Layout

```
ruxt/
├── app/          # Editor, subscription UI, composables, themes
├── core/         # Framework-free CV/subscription/catalog/IAM domain and handlers
├── infra/        # SQLite/Deno KV repositories, crypto, deployment strategies
├── server/       # Nitro REST/SSE/MCP adapters, CV pipeline and persistence
├── scripts/      # Headless rendering automation
├── specs/        # Compact implementation-truth subsystem contracts
└── docs/         # Architecture and extension guides
```

The specifications are authoritative documentation for current subsystem behavior. Start with [`specs/_readme.md`](../specs/_readme.md).
