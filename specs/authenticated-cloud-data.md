# Authenticated cloud data

## Status

Implemented: independent consent, a retention notice, batched owner-scoped cloud copies of sessions, templates, profiles and job preferences, automatic two-way sync of every consented kind, a per-kind quota, a delta feed, push invalidation (Cloudflare), conflict preservation with a piece-by-piece review, cloud history with restore-as-copy, recovery entries, export, and per-device request metrics. Cloud saving is fail-closed until the six `NUXT_CLOUD_RETENTION_*` values are configured; without them consent cannot be granted and nothing uploads or downloads.

Browser-local sessions/templates/profiles remain primary. Authentication, public template viewing, and cloning do not enable cloud storage.

## Consent

cloudSessions, cloudTemplates, cloudProfiles and cloudJobPreferences are independent, default-off, account-scoped grants. The retention notice must be acknowledged first. Each category records policy version, actor and change time. Missing/outdated consent blocks new writes. A policy change can require renewal.

Revocation stops syncing of that kind in both directions but does not erase local or cloud data. Export/read/remove remain available after revocation. Removing cloud copies is a separate explicit action.

Every cloud writer checks the authenticated owner and current category grant in core as well as the UI. Clerk owners use clerk:<user id>; email matching never merges owners.

## Local safety

- Save locally before queueing cloud work; cloud failures cannot block editing.
- Never blank/delete local records because of sign-out, revocation, expiry, quota rejection, missing records, tombstones, or network responses.
- Never overwrite dirty local content automatically: an open editor with unsaved edits is skipped, and a divergence becomes a conflict.
- Nothing syncs until the kind's consent is granted and the retention notice acknowledged. After that, records of a consented kind sync automatically in both directions: local records upload while they fit the quota, and cloud-only copies download on the first catch-up and whenever another device adds one. Downloaded records are written as new local records or into clean ones.
- A cloud copy that differs from differing local data is a conflict, never an overwrite. Sync never deletes local data: when a copy disappears from the cloud the link becomes "cloud-removed" and the local record stays.
- Each kind has a mode. "Automatic" is the default for a newly consented kind. "Only records I select" uploads nothing by itself; records already linked keep syncing, and cloud-only copies show in the list and the banner with a Download action. Changing the mode deletes nothing.
- Restoring a checkpoint creates a new local record first; making an old version current is a separate, confirmed choice.
- The browser names the account it acts as; the server refuses a mismatch with 409 OWNER_MISMATCH before any write (see [authentication](auth-iam-security.md)).

## Protocol

One exchange does everything: `POST /api/cloud-data/sync` carries up to 20 mutations (save/remove, each with a client mutation id and an expected revision), the device's delta cursor, and optional requests for consent and a push ticket; the response carries per-mutation acknowledgements (applied, replayed, conflict, rejected), the changes since the cursor (paged), the new cursor, quota, and the owner fingerprint. Requests above 4 MiB answer 413. Mutations are idempotent by id; a stale expected revision is a conflict, never an overwrite. Content hashes skip unchanged records.

| Route | Purpose |
| --- | --- |
| GET/PUT /api/cloud-data/consent | Read and change one category's grant |
| POST /api/cloud-data/retention-acknowledgement | Acknowledge the current retention notice; grants nothing |
| POST /api/cloud-data/sync | The batched exchange above |
| GET /api/cloud-data/copies/:kind/:id | One copy's head and checkpoints (history) |
| GET /api/cloud-data/export | Consent, preferences, copies and quota in one response |
| GET /api/cloud-data/events | WebSocket push hub (Cloudflare Durable Object); 503 on Node |

Quota is a cap per kind: 20 sessions, 20 templates, 20 profiles and 1 job-preferences record per account. A deployment sets them with `NUXT_CLOUD_COPY_LIMITS_<KIND>` (`SESSION`, `TEMPLATE`, `PROFILE`, `JOB_PREFERENCES`); the maximum is 1000, and a missing, zero, negative, non-integer or too-large value falls back to the default. A copy beyond a kind's cap answers CLOUD_COPY_LIMIT without a partial write, and lowering a cap never removes stored copies. Quota is reported as `quota.byKind` (unchanged shape) plus an additive `quota.kinds` with each kind's used count and limit; the 512 KiB per-record cap is unchanged and the sync protocol stays at 1. A record that does not fit shows "Not synced: over limit" with the reason; it is never dropped silently, and it retries when room appears. A session copy keeps a head plus dated checkpoints; checkpoints and copies expire by the configured retention days. Removing a copy leaves a payload-free tombstone so other devices learn about it; it never touches local data.

## Client behavior

After consent and the retention notice, the first catch-up of a signed-in device downloads every cloud-only copy of each consented kind and uploads local records that fit the quota, so a second browser with empty storage shows all records after sign-in with no clicks. The header "Cloud sync" chip, the Editor session list and Profiles say what sync is doing. A one-line banner appears when anything is cloud-only (with a Download action when the kind is consented), when records could not sync, or on a conflict, so an empty list is never silent. Records the user removed from the cloud or unlinked are recorded in an opt-out map, and automatic sync never relinks them. The mode is kept per device (a fresh device starts on Automatic); it is not stored on the account, which is a known limitation.

Per-account bookkeeping lives in localStorage (`cv-sv:cloud-sync:v1:<owner fingerprint>`) and survives sign-out; signing back in resumes without uploading anything new. One tab per browser profile leads (election through the browser's cross-tab locks); other tabs only observe. Edits are batched: 10 s of quiet, never more than 45 s of delay. The leader opens the push connection when the server offers a ticket; without push it reconciles every 45 minutes. Offline periods and repeated triggers send nothing, and a tab that is hidden or closing sends its pending edits once and only when something changed.

Conflicts keep both sides. `/settings/cloud-data` > Conflicts shows each change both sides made differently (content, styles, name, structured fields) with This device / Cloud / Both per change, shortcuts for all of them, and an Apply that stays disabled until every change has a choice; changes only one side made are always kept. Whole-record choices (keep this device, keep the cloud, keep both as separate records) remain. The version not kept is saved to recovery first. History lists the head and checkpoints with Restore as copy, Compare with this device, and Make current (confirmed).

## Request budget (measured)

Measured with the real engine, adapters, coordinator and push client against the real core handler under simulated time (`tests/unit/cloud-sync-budget.test.ts`), and against a real running server (`tests/e2e/cloud-sync-budget.e2e.test.ts`):

| Scenario | HTTP requests |
| --- | --- |
| Idle hour, push healthy | 0 (about 50 WebSocket pings) |
| Idle hour, no push (Node) | 1 per device (3 for three devices) |
| A device with nothing to do, automatic sync on | 0 |
| Twenty records edited rapidly | 1 |
| Five tabs, one edit, one hour | 1 |
| Three devices, one edit | 3 (one upload, one pull per other device), then 0 idle |
| Dropped push socket, nothing missed | 0 |
| Push hub down for an hour | 1 |
| 24 hours offline | 0 while offline, 1 after reconnect |
| 50 no-op change notifications | 0 |

A real browser tab with no account makes 0 Worker requests while idle, hidden or typing (`pnpm measure:requests`); a page load is one Worker request plus static assets.

## Data inventory

Kinds are one registry (`app/utils/cloudSync/kinds.ts`, mirrored by core's `domain/cloud-copy/kinds.ts`, kept in step by a test): adapter, consent category, quota and schema tag per kind. A new kind needs its own default-off consent category, retention coverage and quota entry in both places; a kind the server does not know fails closed.

| Data | Where it lives | Cloud sync |
| --- | --- | --- |
| CV sessions | Browser storage | `session` kind (cloudSessions) |
| CV templates (private) | Browser storage | `template` kind (cloudTemplates) |
| Profiles | Browser storage | `profile` kind (cloudProfiles); every profile, including legacy ones without an id, gets a stable id on read |
| Job preferences | Browser storage | `jobPreferences` kind (cloudJobPreferences), one record |
| Editor preferences (theme, profile save mode) | Server, `/api/preferences` | Already server-backed |
| Job selection key, editor UI state | Browser storage | Deliberately not synced: device state, not user data |
| Subscription ledger | Server | Already server-backed |

## Verification

Engine, merge, conflict choices, adapters and consent are unit-tested; the cloud-data API has a real-server end-to-end suite (`tests/e2e`); push hub and D1/SQLite repositories run on real workerd (`pnpm test:workerd`); a browser test drives two devices of one real Clerk account through upload, download, concurrent offline edits, conflict review, per-change merge and restore-as-copy (`tests/smoke/cloud-sync-ui.test.ts`). Skipped suites establish no coverage.

## Gaps

Retention extension exists in core (`extend-cloud-copy-retention`) but no route or screen offers it, so copies simply expire. Account-wide erasure of cloud copies on account deletion is not wired (Clerk's user-deleted event does not reach the app); copies expire by retention or are removed by the owner first. The per-kind mode is stored per device, not per account. Storage budgets beyond the per-kind copy caps are undecided.
