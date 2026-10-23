# Deno → Workers cutover checklist

Run from the repository root and preserve the private export directory.

## Pre-cutover prerequisites (user actions)

- The repository owner must add the missing GitHub Actions secret `CLOUDFLARE_API_TOKEN`, available to the `cloudflare` environment used by `.github/workflows/deploy.yml` (an environment secret or repository secret accessible to that job). Use an appropriately scoped Cloudflare API token; never put its value in source, command arguments, logs, or this checklist. This checklist does not create or set the secret.
- Keep `wrangler.json` on `"workers_dev": true` with no production custom-domain route until explicitly authorized cutover. Pre-cutover deployments target workers.dev and must leave Deno DNS unchanged; attaching `ruxt.mashallow.cloud` while its Deno records remain causes Cloudflare error 100117.
- An owner-authorized pre-cutover deployment and successful workers.dev smoke check are required before routing production traffic. A Wrangler dry run does not deploy or verify live DNS, token permissions, or endpoint health.

## Authorized cutover

1. Freeze Deno writes: enable maintenance/read-only mode and stop scheduled/background writers. Record the freeze time; do not proceed until all writers are stopped.
2. Final export and transform:
   ```sh
   export DENO_KV_ACCESS_TOKEN='<authorized token>'
   D='deno run -A --unstable-kv scripts/migrate/deno-kv-to-cloudflare.ts'
   $D export 'https://api.deno.com/databases/<id>/connect' ./migration-final
   $D transform ./migration-final
   deno run -A --unstable-kv scripts/migrate/check-kv-roundtrip.ts ./migration-final
   ```
3. Import to the intended account/resources (re-runnable):
   ```sh
   for f in ./migration-final/d1-*.sql; do npx wrangler d1 execute RUXT_DB --remote --file "$f"; done
   for f in ./migration-final/kv-bulk-*.json; do npx wrangler kv bulk put "$f" --binding RUXT_KV --remote; done
   ```
4. Verify and resolve every discrepancy before routing:
   ```sh
   $D verify ./migration-final
   ```
5. Smoke the deployed workers.dev endpoint before changing production routing:
   ```sh
   node scripts/migrate/smoke-worker.mjs https://<worker>.<account>.workers.dev
   ```
6. Lower the DNS TTL to the provider minimum and wait at least the prior TTL.
7. Only after explicit owner cutover authorization, perform the DNS/custom-domain swap:
   - Record the existing Deno DNS records for rollback, then remove the conflicting Deno CNAME, A, and AAAA records for `ruxt.mashallow.cloud`.
   - Add this top-level property to `wrangler.json`, retaining `"workers_dev": true`:
     ```json
     "routes": [{ "pattern": "ruxt.mashallow.cloud", "custom_domain": true }]
     ```
   - Review `pnpm cf:deploy:dry`, then run the separately authorized `pnpm cf:deploy` to attach the production custom domain. Do not add/deploy this route before the conflicting Deno records are removed.
   - Check authoritative DNS and smoke the custom domain:
     ```sh
     node scripts/migrate/smoke-worker.mjs https://ruxt.mashallow.cloud --compare https://<deno-origin>
     ```
8. Observe health, errors, API 401/5xx, CPU, D1/KV errors and DNS from multiple resolvers. Keep Deno frozen and available throughout the rollback window; never enable dual writes.
9. Rollback by detaching/turning off Worker routing (and removing the production `routes` property from `wrangler.json` so later deployments do not reattach it) and restoring Deno records: CNAME `alias.deno.net`, A `69.67.170.170`, AAAA `2602:f70f::1` (values observed today). Verify provider-side records and DNS/health, then resume writes only on Deno.
10. On data divergence, keep writes frozen. Snapshot/export both systems, compare per-owner records/timestamps, reconcile deliberately into the chosen authority, record repaired owners, re-verify, and only then reopen writes. Never blindly replay stale data or permit split-brain writers.
