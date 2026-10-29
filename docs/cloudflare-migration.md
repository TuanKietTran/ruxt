# Local Cloudflare emulation

Use the [celld fleet procedure](../deploy/celld/README.md) for isolated two-node/MinIO emulation.

Local emulation does not reproduce Cloudflare CPU quotas, account permissions, DNS, or live Clerk configuration. Measure the actual Worker bundle and exercise binding behavior separately.

See the [deployment runbook](../specs/cloudflare-migration-runbook.md) and [cutover checklist](cutover-checklist.md). Current wrangler.json includes a production custom-domain route; a pre-cutover deployment needs an explicitly isolated routing configuration.
