# Ruxt

Nuxt 4 CV workspace with a Markdown/CSS editor, local profiles, browser exports, authenticated import, and subscription management.

## Setup

Use Node 22.12 or a newer Node 22 patch and pnpm 11.25.0.

~~~sh
pnpm install --frozen-lockfile
test -e .env || cp .env.example .env
~~~

Set matching Clerk development keys and a unique session secret in .env, then run pnpm dev at http://localhost:3000. Local Node development uses SQLite.

Sessions, profiles, and private template copies stay in browser storage. Server import uses optional Python/OCR tools. Cloud consent exists; session/template synchronization is planned. MCP requires authentication and currently reports document tools unavailable.

## Documentation

- [Specifications](specs/_readme.md)
- [Setup and verification](specs/testing-devops.md)
- [Architecture](specs/architecture-runtime.md)
- [Extension guide](docs/extending.md)
- [Cloudflare deployment](specs/cloudflare-migration-runbook.md)

Private core uses the included vendor tarball; shared/editor use exact package versions. The separate ruxt-core repository owns those packages; ruxt-admin owns administration.

The Cloudflare target uses D1/KV and cannot run Python extraction. See deployment documentation before selecting a production target.
