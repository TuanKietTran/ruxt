# Cloudflare migration: local celld validation

Short operator guide. Full Cloudflare-side steps: [specs/cloudflare-migration-runbook.md](../specs/cloudflare-migration-runbook.md). Local fleet config: [deploy/celld/README.md](../deploy/celld/README.md).

## What is validated locally

- The isolated two-node celld/MinIO compose configuration is present, but it was not started and no Worker deployment or HTTP/restart/two-node test was run. No per-binding support is claimed.
- celld emulates Cloudflare Workers and Durable Objects. It does not reproduce Cloudflare free-plan CPU enforcement, the 1 MiB bundle limit, or live Clerk auth; the Wrangler dry-run bundle currently exceeds the 1 MiB target.

## Not done here

- No Cloudflare account, `wrangler login`, `wrangler deploy`, secrets, DNS, or D1/KV/R2 provisioning.
- No access to Deno Deploy KV or production data.

## Commands

See `deploy/celld/README.md` for the compose procedure. The celld CLI surface was checked against the pinned binary (`celld --help`, `celld deploy --help`).
