# Deno KV → Cloudflare data migration

Scripts live in `scripts/migrate/`. They need Deno (`--unstable-kv`) and `wrangler` logged in. Nothing here deletes or writes to Deno KV.

| Deno KV prefix | Target | Notes |
|---|---|---|
| `user`, `iam_sub`, `iam_subject`, `plan`, `sub`, `cloud_consent`, `cloud_consent_event`, `user_preferences` | D1 tables (`users`, `iam_subjects`, `plans`, `subscriptions`, `cloud_consent_states`, `cloud_consent_events`, `user_preferences`) | `iam_sub` wins over the older `iam_subject` |
| `user_email`, `iam_sub_org`, `plan_public`, `plan_user`, `sub_user` | not copied | secondary indexes; D1 has SQL indexes. Counts are cross-checked and a mismatch stops `transform` |
| `cv`, `cv-pipeline`, `analytics` (Nitro storage, chunked) | Workers KV `RUXT_KV` | chunks are reassembled and re-chunked at 24 KiB in the Workers layout |
| anything else | **fails `transform`** | decide per family; nothing is silently dropped |

Not carried over: key expiry (`list()` does not expose it, so only still-live entries are exported) and R2/asset blobs, which this app does not yet use on Cloudflare.

## Runbook

```sh
D="deno run -A --unstable-kv scripts/migrate/deno-kv-to-cloudflare.ts"
export DENO_KV_ACCESS_TOKEN=...            # only for a remote database
$D export "https://api.deno.com/databases/<id>/connect" ./migration-out   # read-only; keep the dir private
$D transform ./migration-out               # writes d1-*.sql, kv-bulk-*.json, manifest.json
deno run -A --unstable-kv scripts/migrate/check-kv-roundtrip.ts ./migration-out
for f in ./migration-out/d1-*.sql; do npx wrangler d1 execute RUXT_DB --remote --file "$f"; done
for f in ./migration-out/kv-bulk-*.json; do npx wrangler kv bulk put "$f" --binding RUXT_KV --remote; done
$D verify ./migration-out                  # counts and key presence on the remote resources
```

Imports are idempotent (`INSERT OR REPLACE`, KV put), so a rehearsal can be repeated. Use `ruxt-dev` first, then repeat for production at cutover after freezing writes on Deno. Rehearse locally with `scripts/migrate/seed-rehearsal.ts` and `--local` flags.
