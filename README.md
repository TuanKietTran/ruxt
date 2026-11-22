# Ruxt

Nuxt 4 CV workspace with a Markdown/CSS editor, local profiles, browser exports, authenticated import, and subscription management.

## Setup

Use Node 22.12 or a newer Node 22 patch and pnpm 11.25.0.

~~~sh
pnpm install --frozen-lockfile
test -e .env || cp .env.example .env
~~~

Set matching Clerk development keys and a unique session secret in .env, then run pnpm dev at http://localhost:3000. Local Node development uses SQLite.

Sessions, profiles, and private template copies stay in browser storage and keep working offline. Signing in uploads nothing: an account can opt in, record by record, to batched cloud copies that follow it across devices (see [cloud data](specs/authenticated-cloud-data.md)); conflicts keep both versions and are resolved piece by piece. Private templates can be saved from a CV, renamed, exported, imported and deleted. Signing out never deletes local work. Server import uses optional Python/OCR tools. MCP requires authentication and currently reports document tools unavailable.

Subscription, plan and IAM APIs are owner-scoped; catalog plans and IAM subjects are administrator-only (Clerk private metadata `role: admin`). Legacy email/password registration is closed unless `NUXT_LEGACY_AUTH_REGISTRATION=true`.

## Documentation

- [Specifications](specs/_readme.md)
- [Setup and verification](specs/testing-devops.md)
- [Architecture](specs/architecture-runtime.md)
- [Extension guide](docs/extending.md)
- [Functionality audit](docs/functionality-audit.md)
- [Cloudflare deployment](specs/cloudflare-migration-runbook.md)

Private core uses the included vendor tarball; shared/editor use exact package versions. The separate ruxt-core repository owns those packages; ruxt-admin owns administration.

The Cloudflare target uses D1/KV and cannot run Python extraction. See deployment documentation before selecting a production target.
