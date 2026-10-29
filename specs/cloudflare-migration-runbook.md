# Cloudflare deployment runbook

## Configuration

wrangler.json declares Workers assets, RUXT_DB (D1), RUXT_KV, workers.dev, and a custom-domain route. It already contains resource identifiers and a route; verify the intended account/environment before deployment rather than assuming placeholders or staging-only routing.

D1 holds structured repositories; KV holds Nitro namespaces. No R2 binding or Durable Object implementation is configured. Python extraction is unavailable on Workers.

## Local verification

~~~sh
pnpm cf:build
pnpm check:request-budget
pnpm test:workerd
pnpm cf:deploy:dry
~~~

Dry run checks bundling/configuration, not deployed health, Clerk, DNS, CPU budgets, or storage permissions. Worker boot and cross-instance behavior need runtime tests. [Local celld procedure](../deploy/celld/README.md) provides a separate emulation path.

## Deployment

1. Confirm account, bindings, deployment environment, custom-domain routing, and rollback target.
2. Provision isolated D1/KV resources and apply the checked-in D1 migrations.
3. Supply Clerk keys and NUXT_SESSION_SECRET; workflow deployment uses CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
4. Verify health, authentication, preferences, catalog, subscriptions, and expected import unavailability.
5. Rehearse data migration and restore before moving traffic.
6. Deploy through the tag/manual workflow after verification; change routing only after target validation.

Use [data migration](../docs/data-migration.md) and the [cutover checklist](../docs/cutover-checklist.md) for migration and rollback. Do not treat R2, Durable Objects, strong KV transactions, or cross-isolate SSE as implemented.
