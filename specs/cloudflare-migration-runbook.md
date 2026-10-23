# Cloudflare migration runbook (design only, not executed)

Status: design. Nothing in this document is run by this repository. Every provider step is user-only.

## 1. Preconditions (user-only)

- Cloudflare account with Workers Paid decision recorded. The target is the free plan; limits are in the binding table in `CLOUDFLARE-MIGRATION-ACCEPTANCE.md` (LabA).
- Zone for the custom domain available.
- `wrangler` installed by the user on an admin machine. Login is done by the user only.

## 2. Resources (user-only; names from `wrangler.json`, not yet present)

- D1: create database, apply the Drizzle migrations in order with `wrangler d1 migrations apply <name> --remote`.
- KV: create the namespaces named in `wrangler.json`.
- R2: create buckets named in `wrangler.json` if the CV artifact path uses R2.
- Durable Objects: `migrations` tags in `wrangler.json` create SQLite-backed classes on first deploy.

## 3. Secrets (names only; values never in repo or logs)

Secret names are taken from LabA's env validation once it lands. Set each with `wrangler secret put <NAME>` by the user. Do not paste values into chat, commits, or logs.

## 4. Deploy and domain (user-only)

- First deploy with `wrangler deploy` by the user, after reviewing `wrangler deploy --dry-run` output.
- Attach the custom domain in the Cloudflare dashboard. DNS cutover is a user decision.

## 5. Rollback

- Keep the Deno Deploy deployment running until the Cloudflare deployment passes the acceptance checklist.
- Rollback = point DNS back to the Deno Deploy target. Do not delete the Deno deployment.
- Worker rollback: `wrangler rollback` to the prior version, by the user.

## 6. Data migration design (Deno KV to Cloudflare; design only)

- Export: read-only export script to be designed and run by the user against Deno KV with an explicit operator token. Output to an encrypted local directory.
- Transform: map each Deno KV key family to its D1 table or KV namespace per the binding choice table.
- Import: user-run import into the Cloudflare resources, after a dry-run count comparison.
- Verification: row counts and per-user checksum comparison between export and import.
- No production access is performed by this repository.

## 7. Local validation

Local celld procedure: `deploy/celld/README.md`. Local validation does not substitute for the live Clerk auth check or Cloudflare free-plan CPU measurement.
