# Deno to Workers cutover

## Before cutover

- Confirm target account/resources, deployment secrets, canonical origin, and current DNS records.
- Use isolated staging bindings and routing; current wrangler.json already includes a custom-domain route.
- Verify health, auth rejection/ownership, D1/KV behavior, import degradation, and storage budgets.
- Rehearse [migration and restore](data-migration.md); preserve restricted exports and rollback configuration.

## Cutover

1. Freeze all source writers, including background jobs; record the freeze time.
2. Export, transform, and validate the final snapshot.
3. Import into the intended D1/KV resources and verify counts, logical content, and owner boundaries.
4. Smoke the target before routing traffic.
5. Record existing DNS/TLS configuration, resolve conflicting records, and apply reviewed Worker/custom-domain routing.
6. Verify DNS, HTTPS, health, authentication, and application behavior on the canonical domain.
7. Resume one authoritative set of writers and monitor errors, data freshness, CPU, and storage limits.

Never run independent source/target writers for the same logical data.

## Rollback

Keep the source deployment and database through the rollback window. Restore recorded routing and verify the selected authority before resuming writes.

If the target accepted writes, freeze both sides first, export differences, reconcile per-owner data and template versions/publication, then restore routing. DNS reversal alone does not recover new data. On unexplained divergence, keep writes frozen.
