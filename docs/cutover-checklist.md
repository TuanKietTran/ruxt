# Deno → Workers cutover checklist

Run from the repository root and preserve the private export directory.

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
5. Smoke the workers.dev endpoint, then (after attaching custom domain) the custom domain:
   ```sh
   node scripts/migrate/smoke-worker.mjs https://<worker>.<account>.workers.dev
   node scripts/migrate/smoke-worker.mjs https://ruxt.mashallow.cloud --compare https://<deno-origin>
   ```
6. Lower the DNS TTL to the provider minimum and wait at least the prior TTL.
7. Owner-authorized DNS/custom-domain swap: delete the Deno CNAME, A, and AAAA records for `ruxt.mashallow.cloud`, then attach `ruxt.mashallow.cloud` as the Worker custom domain. Check authoritative DNS and rerun smoke. Do not do this before explicit cutover authorization.
8. Observe health, errors, API 401/5xx, CPU, D1/KV errors and DNS from multiple resolvers. Keep Deno frozen and available throughout the rollback window; never enable dual writes.
9. Rollback by detaching/turning off Worker routing and restoring Deno records: CNAME `alias.deno.net`, A `69.67.170.170`, AAAA `2602:f70f::1` (values observed today). Verify provider-side records and DNS/health, then resume writes only on Deno.
10. On data divergence, keep writes frozen. Snapshot/export both systems, compare per-owner records/timestamps, reconcile deliberately into the chosen authority, record repaired owners, re-verify, and only then reopen writes. Never blindly replay stale data or permit split-brain writers.
