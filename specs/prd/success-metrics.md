# Success metrics

Each goal in section 1 has at least one metric. Product metrics come from the server's own hourly analytics aggregates (routes, CQRS, users, tasks) and the admin overview; quality metrics come from the repository's automated checks. A metric that cannot be sourced from one of those two places is not used.

| Goal | Metric | Target |
| --- | --- | --- |
| 1. Local-first authoring | Verified data-loss incidents (local records blanked or deleted by sign-out, revocation, cloud deletion, error responses, offline start, or retention) | Zero; the destructive-safety checks in the cloud-data specification pass with seeded local bytes intact |
| 1. Local-first authoring | Export completion | Export dialog success rate tracked per release; every failure surfaces an inline error (no silent failures) |
| 2. One product per surface | Screen/state parity against the screens inventory (9 web screens, admin screens, platform pages) | Every screen present on its surfaces with empty, loading, and error states; gaps recorded as Planned, never omitted silently |
| 2. One product per surface | Token drift | Generated token outputs match the single token source on every platform; the drift check passes in CI |
| 2 / Accessibility | Contrast | The WCAG AA contrast checker passes every theme pairing; no known text below 4.5:1 |
| 3. Profiles and templates | Reuse | Profiles and the template picker are on the primary creation path; starting a CV from a template or profile is the default flow offered at the empty state |
| 4. Consent | Consent correctness | Default-off and per-category independence verified by tests; zero uploads without a current grant for that category; quota and revision rules for cloud templates (Planned) verified atomically |
| 5. Subscription visibility | Dashboard accuracy | Counts, per-currency monthly spend, and earliest period end match the underlying subscription records; calculations use the shared money formatter |
| 6. Operable platform (Planned) | Audit completeness | 100% of applied actions appear in the append-only audit log with actor, plan hash, and result; 100% of applies required explicit confirmation after a dry-run-capable plan |
| 6. Operable platform (Planned) | Secret hygiene | Zero secret values in plans, logs, audit records, or committed files, verified by the pre-push hygiene scan |
| 7. Legacy sunset | Sunset progress | Every checklist item in the legacy tracker (Clerk, Cloudflare, Deno) closed or explicitly carried past January 2027 with a recorded decision; no new code depends on a legacy provider outside its adapter seam |
| All | Release quality | `pnpm lint`, typecheck, and the test suite pass on the integration branch before any release promotion; failures block promotion rather than being waived |
