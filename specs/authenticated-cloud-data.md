# Authenticated Cloud Data And Consent

Last updated: main@ff295d9 | 2026-09-20

## Scope And Status

This is the intended contract for a new authenticated, opt-in cloud-data feature group. It covers:

- explicit consent for storing CV data in the service;
- optional cloud copies of at most three user-owned templates;
- optional cloud backup and seven-day recovery history for editor sessions;
- synchronization, quotas, retention, deletion, and local-data safety;
- future core ports, handlers, authenticated HTTP routes, and persistence adapters.

The consent foundation is now partially implemented: core get/set handlers, SQLite and Deno KV projections plus append-only events, authenticated `GET/PUT /api/cloud-data/consent` routes, and `/settings/cloud-data` controls are present. Template/session cloud storage, export, cloud deletion, and retention are not implemented. Existing document/template APIs and browser-local profiles keep their current behavior until migrated deliberately. This design does not make standalone profiles cloud-saved.

## Product Boundary

Authentication is necessary but is not consent. Signing in, viewing a public template, cloning a template locally, editing a session, or accepting general terms must not enable cloud storage.

Cloud storage is disabled by default. The user enables consent independently for:

- `cloudSessions`: synchronize selected editor sessions and retain cloud recovery points;
- `cloudTemplates`: allow individually selected local templates to be synchronized.

Consent is account-scoped, versioned, and reversible. Each grant records policy version, category, grant time, and actor. Revocation records its own time and immediately blocks new uploads for that category. Revocation does not silently erase either local data or existing cloud data; the UI offers a separate, explicit **Delete cloud copies** action and explains its scope.

The consent screen must state the data categories, purpose (cross-device continuity and recovery), retention, quota, deletion behavior, and whether subprocess/model providers receive data. No optional category may be pre-checked. A policy-version change requiring renewed consent pauses uploads until accepted; reads and export/delete remain available.

## Local-First Safety Invariants

- Cloud state is a replica, never the authority for deleting local state.
- Disabling sync, revoking consent, signing out, quota rejection, cloud expiry, account deletion, a missing cloud record, or any network response must not delete or blank local sessions, templates, profiles, drafts, or browser storage.
- Remote tombstones are not applied as local deletes. Cloud deletion removes only the server copy unless the user performs a separate, clearly labelled local delete.
- Pulling a cloud value never overwrites a dirty local value automatically. A conflict creates a local fork or requires an explicit choice after preview.
- Initial enablement uploads only items the user selects. There is no bulk upload hidden behind authentication or consent.
- Browser unload is best effort only. Local persistence happens before enqueueing cloud work, and failed cloud writes remain retryable without blocking editing.
- Existing browser-local profiles under `cv-sv:local-profiles:v1` are outside this feature and must never be scanned or uploaded.

These rules apply even if a later implementation changes the local persistence technology. Migration from the current server-backed CV document routes must not reinterpret absence in the new owner-scoped store as permission to remove an existing record.

## Consent Contract

The implemented API projection is:

```ts
type CloudDataConsent = {
  userId: string;
  policyVersion: string;
  cloudSessions: { granted: boolean; changedAt: string };
  cloudTemplates: { granted: boolean; changedAt: string };
  updatedAt: string;
};
```

Consent checks belong in core command handlers as well as the UI. Every cloud write verifies the authenticated owner and current category grant. Read, export, and delete handlers remain available after revocation so users are not locked into stored data.

Implemented handlers are `GetCloudDataConsent` and `SetCloudDataConsent`; `ExportCloudData` and `DeleteCloudData` remain intended. Consent history is append-only for audit, while per-category current records form the projection used for fast enforcement. Logs and analytics record ids, sizes, outcomes, and policy versions, never Markdown, CSS, profile facts, or contact values.

## Optional Cloud Templates

Only a user-owned, non-built-in local template can be selected for cloud synchronization. Cloning or creating a template leaves cloud sync off. Each template has an explicit **Save to cloud** control that is available only after `cloudTemplates` consent.

The cloud quota is three template identities per user:

- all immutable versions of one template count as one identity;
- only cloud-enabled identities count toward the quota;
- public/built-in catalog templates do not count and are not copied merely because they were viewed or cloned;
- the fourth enable request is rejected atomically with a stable `CLOUD_TEMPLATE_LIMIT` error and no partial write;
- concurrent enables enforce the limit transactionally in the repository, not through a prior UI count.

Turning synchronization off stops future uploads but retains the cloud copy until the user explicitly removes it. This prevents a toggle mistake from becoming deletion. **Remove cloud copy** deletes all cloud versions of that identity but leaves every local version unchanged.

Template cloud records carry `ownerId`, stable template id, immutable version, name, tags, Markdown skeleton, CSS, content hash, created/updated timestamps, and an optimistic revision. Reads and writes are owner-scoped. The existing authorization hole in unscoped local-template override must be closed before this feature can reuse `SaveCvTemplate`.

## Saved Sessions And Seven-Day Recovery

Session cloud backup is opt-in twice: account consent enables the capability, and each session starts with cloud sync off. The UI must distinguish **Saved locally**, **Saving to cloud**, **Saved to cloud**, **Cloud paused**, **Conflict**, and **Cloud quota/error**. A newly created or existing session is never uploaded until selected.

For each selected session, the cloud keeps:

1. one mutable head containing the latest acknowledged complete Markdown/CSS state and metadata; and
2. at most one recovery checkpoint pointer for each UTC day that had an acknowledged change, retaining no more than the seven newest day buckets and none beyond 7 × 24 hours from its last write. The pointer may advance during that day, while referenced content blobs are immutable.

The mutable head provides current-device continuity; checkpoints provide recovery rather than a full keystroke audit log. A session not edited for more than seven days still retains its head while its old recovery checkpoints expire. Thus retention does not make a saved session disappear. Checkpoint cleanup affects cloud recovery blobs only and can never issue a local delete.

### Efficient Write Path

1. Persist the complete edit locally using the existing local save path.
2. Debounce cloud enqueue independently (target 2 seconds after idle, with a 30-second maximum delay while continuously editing).
3. Compute a SHA-256 content hash over a canonical envelope of Markdown, CSS, title, and schema version. Skip upload when it equals the acknowledged cloud hash.
4. Coalesce queued writes by `(ownerId, sessionId)` so only the newest unsent state remains. Never queue every keystroke.
5. Send the complete current envelope with `baseRevision`, `clientMutationId`, and content hash. Complete snapshots are preferred because current documents are bounded to 600,000 characters, are simple to validate, and avoid fragile patch-chain reconstruction.
6. In one owner-scoped transaction, reject a stale base revision or atomically update head and the current UTC-day checkpoint. Repeated writes that day replace that day's checkpoint rather than append blobs.
7. Store large content as content-addressed blobs keyed by owner plus hash; head/checkpoint rows reference blobs. Deduplicate identical content within one owner only. Reference-count or trace blobs during cloud-only garbage collection.
8. Retry transient failures with bounded exponential backoff and the same `clientMutationId`; idempotency makes ambiguous retries safe. Keep the local saved state and show cloud degradation.

This gives constant metadata writes per cloud save, at most eight live snapshot references per synchronized session (head plus seven daily checkpoints), no patch-chain read amplification, and bounded recovery storage. Compression may be applied at rest by the adapter, but size limits are enforced on decoded content and decompression is bounded.

### Conflicts And Restore

A base-revision conflict returns cloud head metadata and does not overwrite either side. If local content is dirty, the default safe action is **Keep both**, creating a new local session id from the remote or local side. Explicit overwrite requires a preview and a new compare-and-swap request.

Restoring a checkpoint never mutates history in place. It creates a new local session/fork first; the user may then choose to make it the synchronized head. Opening or previewing a checkpoint has no write side effect.

## Intended API And Core Boundaries

All routes require a verified Clerk request or the temporary legacy cookie session and derive `ownerId` only from server authentication context. Clerk subjects map to collision-safe `clerk:<user id>` owner ids; neither request bodies nor email matching can select or merge owners. The consent routes are implemented; the remaining routes are intended:

- `GET/PUT /api/cloud-data/consent`;
- `GET /api/cloud-data/export` and `DELETE /api/cloud-data`;
- `GET /api/cloud-templates`, `PUT/DELETE /api/cloud-templates/:id`;
- `GET /api/cloud-sessions`, `PUT/DELETE /api/cloud-sessions/:id`;
- `GET /api/cloud-sessions/:id/checkpoints`;
- `POST /api/cloud-sessions/:id/checkpoints/:checkpointId/restore`.

Request ids do not confer access. Cross-owner existence should not be disclosed. Mutation routes support idempotency and optimistic revisions; payload and decoded-size limits match or tighten the current CV limits.

Core should depend on `CloudConsentRepository`, `CloudTemplateRepository`, `CloudSessionRepository`, and `CloudBlobRepository`. Repository operations expose atomic quota reservation, compare-and-swap head writes, day-checkpoint replacement, and cloud-only garbage collection. Nitro routes own sessions and HTTP adaptation; adapters own SQLite/Deno-KV/blob details. A Deno deployment must not fall back to process-local or ephemeral filesystem storage while claiming cloud-save success.

## Persistence Shape And Indexes

Logical records:

- consent current projection and append-only consent events keyed by owner;
- cloud template identity plus immutable `(ownerId, templateId, version)` rows;
- cloud session metadata/head keyed by `(ownerId, sessionId)`;
- day checkpoint keyed by `(ownerId, sessionId, utcDay)` with expiry;
- owner-scoped content blobs keyed by `(ownerId, sha256)`;
- idempotency record keyed by `(ownerId, clientMutationId)` with bounded expiry.

Required indexes support owner listing by updated time, atomic count of enabled template identities, checkpoint expiry, and blob reachability. Cloud-data deletion first removes owner references transactionally, then garbage-collects unreferenced blobs. Retention workers operate only in the cloud namespaces and must have no dependency or capability that deletes browser/local records.

## Delivery Slices

1. **Consent foundation (in progress):** domain types, repositories, authenticated get/set routes, audit history, privacy copy, and denial tests are implemented; export/delete controls remain.
2. **Template cloud copies:** owner-scope existing template mutations, implement per-template opt-in and atomic three-template quota, then add conflict-safe sync UI.
3. **Session local safety:** establish an explicit local persistence interface and destructive-operation tests before any cloud reconciliation.
4. **Session cloud head:** owner-scoped idempotent complete-snapshot saves, status UI, retries, and keep-both conflict handling.
5. **Recovery:** daily checkpoints, seven-day cloud-only retention, restore-as-fork, and garbage collection.
6. **Operational hardening:** storage budgets, export/account deletion, metrics without content, multi-instance tests, and failure-injection coverage.

## Verification Gates

Tests must prove default-deny consent, independent category grants, owner isolation, atomic three-template enforcement under concurrency, hash no-op saves, queue coalescing, idempotent retry, stale-revision conflict behavior, seven-day checkpoint boundaries, restore-as-fork, and cloud garbage collection.

The current ownership suite covers anonymous rejection, independent default-deny projections, cross-owner isolation, Clerk/legacy namespace separation, ignored body-supplied owner ids, and authenticated UI persistence. `tests/core/data-ownership.test.ts`, `tests/core/auth-principal.test.ts`, and the opt-in HTTP/browser smoke suites carry these checks.

A destructive-safety suite must seed local sessions/templates/profiles, then exercise revocation, sign-out, remote deletion, retention cleanup, 404/409/413/429/5xx responses, offline startup, partial migration, and account cloud-data deletion. Byte-for-byte local records must remain present unless the test explicitly invokes a separate local-delete action.

## Current Gaps

- Consent get/set is implemented, but cloud export/delete, sync queues, quotas, cloud template/session stores, checkpoints, and retention workers are not.
- Consent event persistence exists, but no authenticated audit-history API is exposed.
- Current CV documents are not owner-scoped and cannot safely serve as this cloud store.
- Current local templates are not owner-scoped; the override authorization hole blocks cloud-template delivery.
- Browser CV sessions do not yet have a clearly separated local persistence abstraction suitable for proving cloud/local delete isolation.
- Product storage budgets beyond the three-template identity limit and seven-day checkpoint window remain to be selected before implementation.
