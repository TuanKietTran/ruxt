# Release channels

Releases move through three channels: dev, canary, and stable. Today, stable web releases are version tags (`v*`) that trigger the deployment workflow; a formal channel registry — each release a record carrying its version, channel, commit, and health — is Planned as part of the platform control plane. Mobile canary builds already exist as a separate build configuration with its own bundle identity, display name, and API base URL; the stable configuration uses the production identity and API.

## Channels

| Channel | Audience | Source | Purpose |
| --- | --- | --- | --- |
| Dev | Developers and operators only | The integration branch, built on demand | Verify work in progress; may be broken; holds no real user data |
| Canary | The owner and test devices | A release candidate cut from a green integration branch | Trial a complete build — web canary deployment, mobile canary configuration — against production-like configuration before users see it |
| Stable | All users | A `v*` version tag on the same commit that passed canary | The production web deployment at the public domain, and the store/production mobile builds |

## Promotion rules

1. Promotion is by commit, not by rebuild: the exact commit that passed canary is tagged for stable.
2. Gates block promotion: lint, typecheck, tests, the token drift check, and the contrast checker must pass; a failure is fixed and re-run, never waived.
3. Every stable release is recorded (Planned: as a release registry record with version, channel, commit, and post-deploy health; today: the version tag and deployment log).
4. Rollback follows the deployment runbook and returns to the previous stable tag; a rollback is recorded the same way as a release.
5. Data and configuration changes that a release depends on go through the platform plan/apply process (Planned) and are linked from the release record by plan hash.
6. Legacy-provider changes respect the sunset order in section 8: a release may not add a new dependency on Clerk, Cloudflare, or Deno Deploy outside the existing adapter seams.
