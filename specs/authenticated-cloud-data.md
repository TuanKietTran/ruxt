# Authenticated cloud data

## Status

Consent get/set, independent category controls, current projections, append-only events, and owner-scoped adapters exist. Cloud sessions/templates, synchronization queues, export/delete, quotas, checkpoints, and retention are planned.

Browser-local sessions/templates/profiles remain primary. Authentication, public template viewing, and cloning do not enable cloud storage.

## Consent

cloudSessions and cloudTemplates are independent, default-off, account-scoped grants. Each category records policy version, actor, and change time. Missing/outdated consent blocks new writes. A policy change can require renewal.

Revocation stops uploads but does not erase local or cloud data. Export/read/delete remain available after revocation. Deleting cloud copies is a separate explicit action.

Every future cloud writer checks the authenticated owner and current category grant in core as well as the UI. Clerk owners use clerk:<user id>; email matching never merges owners.

## Local safety

- Save locally before queueing cloud work; cloud failures cannot block editing.
- Never blank/delete local records because of sign-out, revocation, expiry, quota rejection, missing records, tombstones, or network responses.
- Never overwrite dirty local content automatically. Offer a preview and Keep both/fork.
- Upload only individually selected sessions/templates; no bulk upload on sign-in or consent.
- Standalone local profiles are outside synchronization and must not be scanned/uploaded.
- Restore checkpoints into a new local session first; changing the synchronized head is a separate choice.

## Planned templates

Only selected user-owned, non-built-in templates are eligible. Quota is three cloud-enabled identities per owner; versions of one identity count once. Enabling the fourth returns CLOUD_TEMPLATE_LIMIT atomically, without partial writes.

Records include owner/id/version, name/tags, skeleton/CSS, hash, timestamps, and optimistic revision. Disabling sync retains the cloud copy until explicit deletion; cloud deletion leaves every local version intact.

## Planned sessions and recovery

Each selected session has one mutable head and at most one checkpoint pointer per changed UTC day. Keep no more than seven newest day buckets and none beyond 7 × 24 hours from its last write. Expired checkpoints do not remove an inactive session's head.

Save flow: local persistence → debounce cloud enqueue after 2 seconds idle, at most 30 seconds → hash canonical source/title/schema → skip unchanged hashes → coalesce latest unsent state per owner/session → idempotent compare-and-swap head/day-checkpoint update.

Requests carry baseRevision, clientMutationId, and content hash. Complete snapshots are bounded to the CV source limits. Content-addressed blobs deduplicate within one owner only. Cloud-only garbage collection removes unreachable blobs; decompression is bounded.

Retries use the same mutation id with exponential backoff. Conflicts preserve both sides; explicit overwrite requires preview and a fresh compare-and-swap. Opening a checkpoint is read-only.

## Planned API and persistence

All cloud routes derive owner from verified server context, reject cross-owner access without revealing existence, and enforce payload limits.

| API | State |
| --- | --- |
| GET/PUT /api/cloud-data/consent | Implemented |
| GET /api/cloud-data/export; DELETE /api/cloud-data | Planned; export excludes subscriptions |
| /api/cloud-templates and /api/cloud-sessions | Planned owner-scoped list/write/delete |
| Session checkpoint list/restore | Planned |

Export should return consent, preferences, cloud sessions/templates, applications, and quota in one response.

Repository operations must support atomic template quota reservation, head revision checks, daily checkpoint replacement, bounded idempotency records, and cloud-only cleanup. Indexes support owner lists, enabled template counts, expiry, and blob reachability. Ephemeral storage must not report durable cloud-save success.

## Verification

Cover default-deny/independent grants, owner isolation, concurrent quotas, hash no-op saves, queue coalescing, retries, revision conflicts, retention boundaries, and restore-as-fork.

Destructive-safety checks must preserve seeded local bytes through sign-out, revocation, cloud deletion, 404/409/413/429/5xx, offline startup, partial migration, and retention. Only an explicit local-delete action may remove them.

Storage budgets beyond the three-template quota and seven-day checkpoint window remain undecided.
