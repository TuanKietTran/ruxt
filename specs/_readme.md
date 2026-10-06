# Specs DocumentMap

Last updated: main@ff295d9 | 2026-09-20

This folder is the compact implementation-truth map for humans and coding agents working on `cv-sv`. Read this file first, then open only the subsystem specs relevant to the work.

The repository currently contains two product surfaces in one Nuxt application: a Markdown/CSS CV editor with HTTP, SSE, export, and MCP access, and a subscription/catalog/auth/IAM application. Specs describe that current hybrid shape rather than the older subscription-only framing in `README.md` and `docs/`.

The revision above is the repository base commit. This initial spec inspection also includes the uncommitted working-tree implementation present on the stated date.

Specs are living notes about current code shape and intended contracts. They are not product marketing, planning documents, templates, or a replacement for source inspection and executable checks.

This `_readme.md` is the DocumentMap and control document. It is intentionally exempt from subsystem `Scope` and `Current Gaps` sections.

## Quality Contract

Each subsystem spec should remain compact and useful under context pressure:

- Start with `Last updated: <branch>@<short-sha> | YYYY-MM-DD`, using the base revision inspected.
- Use a concrete `Scope` section naming real files, routes, stores, scripts, and integration points.
- Use domain-specific sections rather than forcing every subsystem into one template.
- State ownership and dependency direction clearly; distinguish enforcement from UI-only behavior.
- Name every new unauthenticated non-auth API under `/api/public/*`; `/api/auth/*` is the only naming exception.
- Include runtime behavior for important flows, including degraded and concurrent behavior.
- Record security, credentials, personal data, persistence, optional dependencies, and platform constraints where relevant.
- End with `Current Gaps` only for known, source-supported gaps.

If source and specs disagree, source is ground truth. During ordinary implementation or review, treat specs as read-only context and report drift. Update them only when spec maintenance is explicit or a change intentionally alters an implementation contract.

## Working Rules

- Paths written as `core/<path>` refer to `<path>` inside the pinned `@ruxt/core` package (source in the `ruxt-core` repository, imported as `@core/...`); this repository has no `core/` folder. Change shared contracts there, publish, then bump the pin here.

- Start here before substantial work and read the owning subsystem spec before editing that area.
- For cross-cutting work, also read architecture/runtime, auth/security, persistence/deployment, and testing/devops as applicable.
- Keep specs dense and factual; put proposals, audits, branch notes, and exploratory plans elsewhere.
- Every non-index Markdown file under `specs/` must appear exactly once in the Subsystem Map.
- Do not commit `.data/`, `local.db`, exported CVs, credentials, or other local/user artifacts.
- The CV Markdown and generated exports are user data. Avoid copying their content into logs, fixtures, or specs.

## Subsystem Map

- [architecture-runtime.md](architecture-runtime.md): Nuxt/Nitro shape, dependency direction, aliases, CQRS boot, and route ownership.
- [cv-editor.md](cv-editor.md): browser editor, CodeMirror, Markdown rendering, themes, page layout, and image/print export.
- [cv-documents-realtime.md](cv-documents-realtime.md): CV document schema, Nitro storage, REST API, revisions, autosave, and SSE updates.
- [cv-server-workflows.md](cv-server-workflows.md): intended CV lifecycle, import, transformation, tailoring, validation, rendering, job, handler, and port contracts.
- [mcp-automation.md](mcp-automation.md): current Streamable HTTP MCP endpoint/tools, headless PDF script, and extraction-worker status.
- [subscriptions-catalog.md](subscriptions-catalog.md): plan and subscription domain behavior, handlers, API routes, and management UI.
- [auth-iam-security.md](auth-iam-security.md): account sessions, password custody, route protection, ABAC policies, and trust boundaries.
- [authenticated-cloud-data.md](authenticated-cloud-data.md): intended opt-in consent, cloud-template quota, seven-day session recovery, sync efficiency, and local-data safety.
- [domain-foundations.md](domain-foundations.md): shared value objects, date/time, email/password, phone, and payment primitives.
- [persistence-deployment.md](persistence-deployment.md): SQLite and Deno KV adapters, CV filesystem storage, strategy selection, and deployment configuration.
- [testing-devops.md](testing-devops.md): package commands, build/export prerequisites, CI status, generated artifacts, and validation gaps.

## Cross-Cutting Spec Update Triggers

Use these triggers during explicit spec work, and use them to select reading context during ordinary work:

- New Nuxt page/layout/plugin, Nitro plugin, alias, raw asset, or route family: update [architecture-runtime.md](architecture-runtime.md) and the owning subsystem spec. Any new unauthenticated non-auth route must use `/api/public/*`.
- New CV field, route, persistence key, revision rule, update source, or streaming behavior: update [cv-documents-realtime.md](cv-documents-realtime.md), [cv-server-workflows.md](cv-server-workflows.md), [cv-editor.md](cv-editor.md), and [mcp-automation.md](mcp-automation.md) when tool behavior changes.
- New editor control, Markdown/CSS rule, pagination rule, theme, export format, or browser API dependency: update [cv-editor.md](cv-editor.md) and [testing-devops.md](testing-devops.md).
- New MCP tool, resource, prompt, API credential/header, agent workflow, or rendering command: update [mcp-automation.md](mcp-automation.md), [cv-server-workflows.md](cv-server-workflows.md), [auth-iam-security.md](auth-iam-security.md), and the owning data spec.
- New CV command/query, repository/service port, job, artifact, import, validation, tailoring, or template contract: update [cv-server-workflows.md](cv-server-workflows.md) plus architecture, persistence, security, MCP, editor, and testing specs as applicable.
- New non-CV command/query, repository port, aggregate, transition, or public API payload: update [architecture-runtime.md](architecture-runtime.md), [subscriptions-catalog.md](subscriptions-catalog.md), and [persistence-deployment.md](persistence-deployment.md) as applicable.
- New session field, auth gate, policy, subject attribute, secret, or sensitive return path: update [auth-iam-security.md](auth-iam-security.md) and the owning route/domain spec.
- New cloud-data consent, synchronized session/template behavior, retention rule, cloud quota, conflict rule, export, or cloud deletion path: update [authenticated-cloud-data.md](authenticated-cloud-data.md), [auth-iam-security.md](auth-iam-security.md), [persistence-deployment.md](persistence-deployment.md), and the owning editor/workflow spec.
- New value object or validation/serialization contract: update [domain-foundations.md](domain-foundations.md) and any consuming subsystem.
- New database table/column/index, KV key/index, Nitro storage driver, migration, or data directory: update [persistence-deployment.md](persistence-deployment.md) and the owning subsystem.
- New dependency, package script, CI workflow, browser/runtime prerequisite, or verification gate: update [testing-devops.md](testing-devops.md) and the owning subsystem.
