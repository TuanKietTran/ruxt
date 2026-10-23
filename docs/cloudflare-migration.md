# Cloudflare migration: local celld validation

Short operator guide. Full Cloudflare-side steps: [specs/cloudflare-migration-runbook.md](../specs/cloudflare-migration-runbook.md). Local fleet config: [deploy/celld/README.md](../deploy/celld/README.md).

## What is validated locally

- The isolated two-node celld/MinIO compose configuration is present, but it was not started and no Worker deployment or HTTP/restart/two-node test was run. No per-binding support is claimed.
- celld emulates Cloudflare Workers and Durable Objects. It does not reproduce Cloudflare free-plan CPU enforcement, the 1 MiB bundle limit, or live Clerk auth; the Wrangler dry-run bundle currently exceeds the 1 MiB target.

## Deployment routing and production cutover

`wrangler.json` deliberately enables `"workers_dev": true` and omits the production custom-domain route. Pre-cutover deployments must remain on workers.dev while `ruxt.mashallow.cloud` points to Deno; attaching it with conflicting CNAME/A/AAAA records fails with Cloudflare error 100117.

Follow [the cutover checklist](cutover-checklist.md) for owner-authorized removal of the conflicting DNS records and addition/deployment of the production `routes` entry at cutover time. The checklist also identifies the missing GitHub Actions `CLOUDFLARE_API_TOKEN` secret as a repository-owner action; no secret is set here. A dry run verifies bundling/configuration only, not live custom-domain availability or deployment permissions.

## Not done here

- No Cloudflare account, `wrangler login`, `wrangler deploy`, secrets, DNS, or D1/KV/R2 provisioning.
- No access to Deno Deploy KV or production data.

## Commands

See `deploy/celld/README.md` for the compose procedure. The celld CLI surface was checked against the pinned binary (`celld --help`, `celld deploy --help`).
