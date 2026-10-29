# Deno Deploy to Cloudflare Workers

## Runtime mapping

| Concern | Target | Limit |
| --- | --- | --- |
| Users, IAM, consent, preferences, plans, subscriptions | D1 | Apply checked-in migrations and verify adapter parity |
| Catalog, pipeline metadata, analytics | RUXT_KV | Eventual consistency; bounded chunking |
| Browser sessions/profiles/private templates | Browser storage | Not migrated as server documents |
| Python/OCR/import execution | Node/self-hosted runtime | Unavailable on Workers |
| R2 / Durable Objects | Not implemented | No artifact or coordination guarantee |

The retired ownerless documents:* keys must not become visible through migration. Deno exports and generated artifacts may contain personal data and require restricted storage.

## Readiness

Build/dry-run success does not establish runtime acceptance. Verify built Worker health, Clerk integration, D1/KV contracts, bundle size, representative CPU/request/read/write budgets, multi-instance behavior, and restore rehearsal.

Old request/polling measurements describe the former server-document implementation. Current local-first editing sends no session autosave/SSE/probe requests.

## Package and configuration

Private core uses vendor/tuankiettran-ruxt-core-0.3.0.tgz. Registry mode remains configured in .npmrc. wrangler.json contains D1/KV identifiers and custom-domain routing; review the actual target before deployment.

The workflow verifies code before tag/manual-main deployment. Secrets and runtime bindings are environment-specific.

## Procedures

- [Deployment runbook](../specs/cloudflare-migration-runbook.md)
- [Data migration](data-migration.md)
- [Cutover and rollback](cutover-checklist.md)
- [Local celld fleet](../deploy/celld/README.md)

Keep the prior deployment/data until validation and the rollback window are complete. After target writes, routing rollback also requires reconciling authoritative data changes.

