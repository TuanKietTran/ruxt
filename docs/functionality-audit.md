# Functionality audit, November 2026

What the source implements versus what the product promises, with evidence. Every finding below was reproduced or read in the code; nothing is listed as confirmed from speculation. Status words: COMPLETE (implemented and verified end to end), PARTIAL, BROKEN, UI-ONLY, API-ONLY, STUB, MISSING, BLOCKED (needs infrastructure or credentials that were not available), DEPRECATED.

## Method and limits

- Source: `TuanKietTran/ruxt` (public), `ruxt-core` and `ruxt-admin` (private, cloned and tested), the full git history of `ruxt` main, TODO/stub markers, every server route, every page and layout, the mobile and native trees, the specs and the deployment configuration.
- Live checks: anonymous, read-only requests to https://ruxt.mashallow.cloud. No production account, Clerk dashboard, Cloudflare dashboard or database was accessed.
- Verification used a throwaway Clerk development instance (Nuxt keyless mode) and real browsers. Test users are created and removed through Clerk's backend API; sessions are genuine, not mocked.
- **BLOCKED** items need the production Clerk instance, Cloudflare account, Deno KV databases or provider settings. They are listed in [Remaining gaps](#remaining-gaps).

## Repository inventory

| Repository | Visibility | Inspected | Modified |
| --- | --- | --- | --- |
| ruxt | public | all of `app/ server/ shared/ packages/ infra/ mobile/ native/ deploy/ tests/ specs/ docs/ scripts/ tools/ vendor/`, workflows, git history | yes, branch `fix/auth-logout-audit` |
| ruxt-core | private | domain, handlers, repos, tests; run: 234 tests, lint, typecheck all pass | no |
| ruxt-admin | private | routes, guard, storage, specs; run: 31 tests pass | no |
| `packages/editor` (`@ruxt/editor` 0.1.2), `@ruxt/shared` 0.1.0 | published | consumed as pinned packages | no |

No change was needed in ruxt-core or ruxt-admin: the defects were at the application boundary (routing, layouts, sessions, route authorization), which belongs to ruxt. Where a rule is duplicated across deployments (the administrator role check) it is called out below.

## Findings fixed in this change

### F1. Authenticated users could not sign out of editor pages (P0, BROKEN) — fixed

- **Where**: ruxt. `app/composables/useAppAuth.ts`, `app/layouts/editor.vue`, `app/layouts/default.vue`.
- **Current behavior (before)**: after a reload the Logout button was visible; clicking it did nothing (console: `useClerk can only be used when the Vue plugin is installed`). After signing in without a reload there was no sign-out control at all, only "Sign in".
- **Root cause**: two defects. (1) `logout()` called `useClerk()` from a click handler; Clerk's composables read Vue's injection context, which exists only during setup, so the call threw before signing anyone out. (2) The account came only from a server-side `/api/auth/me` during SSR, but Clerk signs in on the client through a soft navigation, so the page kept "signed out" (and hid sign-out behind `v-if="user"`) until a reload.
- **Impact**: users could not end their session from the editor, the main surface of the product.
- **Fix**: Clerk handles are captured in setup; one sign-out path (`useSignOut`) behind one `AccountControl` used by both layouts at every width; `useAuthSession` keeps the account in step with Clerk. See [auth spec](../specs/auth-iam-security.md).
- **Behavior now**: sign-out works from `/`, `/?s=`, `/e/:id`, `/p`, `/jobs`, `/settings`, `/about`, `/settings/cloud-data`, `/settings/account` and at phone width; local sessions, drafts, templates and profiles are never touched; unsynchronised work produces a warning that never blocks; offline, an unreachable Clerk, or a missing Clerk client leaves the user signed in with a clear message (ClerkJS alone would clear the page while the session came back after reload); other tabs follow a sign-out; a tab follows an account switch made elsewhere; a session revoked on the server drops the account without a click.
- **Tests**: 16 live-Clerk browser tests (`tests/smoke/logout.test.ts`), 25 unit tests of the decisions, a real `@clerk/vue` injection-context test pinning the root cause, and server checks that `/api/auth/me`, `/api/cloud-data/*` and `/api/preferences` answer 401 afterwards.

### F2. Subscription, plan and IAM APIs had no authentication or ownership (P0, security) — fixed

- **Where**: ruxt. `server/routes/api/{subscriptions,plans,iam}/**` (new `server/utils/commercial-access.ts`).
- **Behavior (before)**: on the live site `GET /api/subscriptions?userId=…` answered anonymously and `PUT /api/iam/subjects/:id` (tier, org, service-account flag) had no guard; every write route trusted a caller-chosen `userId`. The specs listed this as a known gap.
- **Fix**: sessions required; callers act on their own subscriptions and plans; another owner's id answers like a missing one; catalog plans and IAM subject writes are administrator-only (Clerk private metadata `role: admin`, the rule ruxt-admin uses). `/d` shows a signed-in user their own subscriptions; the anonymous demo is read-only.
- **Tests**: `tests/smoke/commercial-access.test.ts` against a real server with real Clerk session tokens (anonymous, cross-account, administrator).
- **Note**: the administrator check is duplicated between ruxt and ruxt-admin because they deploy separately; moving `hasAdminRole` into `@ruxt/shared` in ruxt-core is the clean follow-up.

### F3. A tab that missed an account switch could write as the new account (P0, ownership) — fixed

- **Where**: ruxt. `server/middleware/expected-owner.ts`, `app/composables/useAccountFetch.ts`, `useCloudSync.ts`, `app/utils/cloudSync/engine.ts`.
- **Behavior (before)**: ClerkJS tells other tabs about a sign-out but not a sign-in or switch. A stale tab kept the old account's linked records and sync state while the shared cookie named another user; its next sync would upload them into the new account's cloud copies. The engine noticed the owner mismatch only after the server had written.
- **Fix**: requests name the account they act as; a mismatch answers 409 `OWNER_MISMATCH` before any handler. The engine halts on it and the app re-describes the real account.
- **Root cause also fixed**: Clerk's middleware was appended after the app's middleware, so every middleware saw no authenticated user. It is now installed first by name (`server/middleware/00-clerk.ts`) and a lint rule keeps it first.
- **Tests**: `tests/smoke/owner-guard.test.ts` (real server, including that nothing is written for the other account), an engine test, and `tests/smoke/logout.test.ts` (switch in another tab).

### F4. Legacy email/password registration was open on production (P0/P1, security) — closed by default

`/api/auth/register` had no email verification, bot protection, rate limit or strength check and returned an authenticated owner. It now answers 403 unless `NUXT_LEGACY_AUTH_REGISTRATION=true` (local test servers). Existing legacy sessions and logins keep working. **Consequence**: mobile and native clients register through this route (see M1); they cannot create accounts on a deployment where it is closed. Re-enable with the variable if that matters before they move to Clerk.

### F5. Conflicts could not be resolved from the UI; piece-by-piece merge was unreachable (P1, UI-ONLY/API-ONLY) — fixed

`/settings/cloud-data` rendered `<CloudSyncConflict>`, a component that never existed (it was referenced by the first sync commit and never added). The engine, the three-way merge and the hunk renderer were tested but unused. The new component shows each change both sides made differently with This device / Cloud / Both, shortcuts, and an Apply that waits for every choice; unconflicted changes from both sides are always kept. **Tests**: pure-logic unit tests and `tests/smoke/cloud-sync-ui.test.ts`, which drives two devices of one real Clerk account through upload, download, concurrent offline edits to the same line, the conflict, the merge, the merged result reaching the cloud copy, and restore-as-copy.

### F6. Private templates could not be created, edited, deleted or moved (P1, API-ONLY) — fixed (content editing remains)

The core `SaveCvTemplate` handler and `toCvTemplateSkeleton` existed; nothing used them. Added: Save as template (structure kept, personal text replaced by placeholders), Rename, Delete (confirmed), Export file and Import. All browser-local; writes are size-limited and leave the list unchanged on failure. **Tests**: store unit tests and a real-browser flow (`tests/smoke/templates.test.ts`).

### F7. No account management (P1, MISSING) — added

`/settings/account` renders Clerk's `UserProfile` (profile, email, password, two-step verification, sessions, and deletion where the Clerk instance allows it). One authentication implementation; tested with a real session.

### F8. Smaller defects fixed

| Finding | Status | Fix |
| --- | --- | --- |
| Every signed-in page load logged a Vue hydration mismatch at the sync status pill | BROKEN (UI) | pill renders client-only; asserted in the browser test |
| `pnpm measure:requests` created sessions through the retired `/api/cvs` routes and failed before measuring | BROKEN (tooling) | seeds a browser-local session; now runs |
| Polling guardrail watched only `/api/cvs` | PARTIAL (tooling) | also guards `/api/cloud-data`, `/api/auth/me`, `/api/preferences` |
| Sync simulation depended on CPU load (about 1 full-suite run in 6 failed: a conflict reported as "modified", a 24-hour scenario timing out) | BROKEN (tests) | waits for in-flight hashing; 12 of 12 runs pass under eight busy CPU loops |
| README and cloud-data spec still said synchronization was planned; auth spec listed fixed gaps | stale docs | rewritten to match the code |

### F9. Cloud sync needed clicks and shared one quota (P1, PARTIAL) — fixed

A second browser with empty storage and the same account showed "Only in the cloud" rows but an empty Editor and Profiles until each record was ticked and downloaded, and an upload of 19 mixed records was refused against one ten-copy cap shared by all kinds. Now, once a kind's consent is granted and the retention notice acknowledged, sync is automatic in both directions: cloud-only copies download on catch-up, local records upload while they fit, and the rest show "Not synced: over limit" with a reason. Differing local data becomes a conflict, local data is never deleted (a copy removed in the cloud marks the link "cloud-removed"), and the per-kind mode "Only records I select" remains. The header chip, Editor and Profiles state what sync is doing and a one-line banner offers Download when anything is cloud-only. Quota is per kind (20/20/20, 1 for job preferences), configurable with `NUXT_CLOUD_COPY_LIMITS_<KIND>`, and reported as an additive `quota.kinds` next to the unchanged `byKind`. Profiles without an id get a stable one on read. Job preferences are a new synced kind with their own default-off consent. The request budget is unchanged (idle device: 0 requests). Known limitation: the mode is stored per device, not per account.

## Open findings (not fixed here)

| ID | Area | Status | Priority | Evidence and recommendation |
| --- | --- | --- | --- | --- |
| O1 | Production identity | BLOCKED | P1 | Production answers with `x-clerk-auth-reason: dev-browser-missing`, which only a Clerk *development* instance sends, and `wrangler.json` sets `RUXT_DEPLOYMENT_ENV: development`. Production runs on development keys (strict limits, dev-browser handshake). Needs a live Clerk instance and keys set as Worker secrets. |
| O2 | Cloud sync on production | BLOCKED | P1 | Cloud saving is fail-closed until six `NUXT_CLOUD_RETENTION_*` values exist; the deploy workflow syncs job-automation secrets but not these, and production state could not be read. Confirm they are set in production (documented in `.env.example`); without them consent cannot be granted, so nothing syncs in either direction. The optional per-kind caps `NUXT_CLOUD_COPY_LIMITS_*` default sensibly and need no action. |
| O3 | ruxt-admin ↔ Ruxt data | BLOCKED | P2 | Ruxt writes hourly metrics and import jobs to Cloudflare KV; ruxt-admin reads Deno KV. The Cloudflare migration (`docs/ruxt-admin-migration-plan.md`) is planned, not done, so admin dashboards cannot show Ruxt data. Needs provider access. |
| O4 | Admin capabilities | MISSING | P2 | ruxt-admin has analytics, import jobs, template versioning and read-only platform views. No user management, subscription management, audit log of admin actions, or feature management (flags are deployment variables). |
| O5 | Mobile and native clients | PARTIAL / DEPRECATED path | P2 | Android, iOS, Flutter and GPUI clients authenticate with the legacy cookie API only (register/login/logout). They have no Clerk sign-in and no cloud sync; Flutter screens are placeholders with an unwired data layer; the desktop export is an explicit stub. The server already accepts Clerk session tokens as `Authorization: Bearer` (verified), so the path forward is Clerk's native SDKs. |
| O6 | Local CV safety | PARTIAL | P2 | Deleting a session is permanent after one confirmation; there is no trash or restore and no local revision history (history exists in the cloud after an upload). |
| O7 | Template content editing / apply to existing CV | MISSING | P2 | Private templates are renamed, exported, deleted and used to create CVs, but their content cannot be edited in place, and a template cannot be applied to an existing CV. |
| O8 | Phone layout | PARTIAL | P3 | At 760 px and below the preview pane is hidden with no toggle; export still works. |
| O9 | Subscriptions | PARTIAL by design | P2 | The ledger records subscriptions and lifecycle state; there is no payment provider, billing portal, payment status, or entitlement enforcement (IAM `tier` is not read by any product feature). Nothing was invented. |
| O10 | Server document import | BLOCKED on Cloudflare | P2 | Extraction needs Python/OCR tools the Worker cannot run; the dialog degrades with the capability message. Works on Node deployments. |
| O11 | `/api/cv-applications/:id`, `/api/cv-artifacts/:id`, retention extension (`extend-cloud-copy-retention`) | API-ONLY | P3 | No page or component calls them. |
| O12 | Account deletion | PARTIAL | P2 | Clerk deletes the identity (if enabled in the instance); the app does not receive the event, so server-side data waits for retention or the owner's removal. Needs a Clerk `user.deleted` webhook and a core erase handler. |
| O13 | Legacy sessions | PARTIAL | P3 | A legacy cookie is sealed and stateless; sign-out clears it in the browser but cannot revoke a copy for seven days. No rate limit, reset or verification on login. Retire after migration. |
| O14 | Observability | MISSING | P3 | No client error reporting (no error handler, no `onErrorCaptured`); Worker logs are sampled at 10 %; the only operation status is the sync status pill and the per-device network panel. |
| O15 | MCP | PARTIAL | P3 | Authenticated; document tools are unavailable; no host or origin allowlist (the spec notes it). |
| O16 | Local builds bake `.env` | risk | P3 | A local `nuxt build` embeds a local `.env` (including `NUXT_LEGACY_AUTH_REGISTRATION=true` and development keys). CI builds from a clean checkout; do not deploy a local build. |
| O17 | Worker boot test | test gap | P3 | `tests/workerd/worker-boot.test.ts` is skipped (Miniflare cannot serve the bundle). The built Worker was smoked with `wrangler dev --local` instead. |

## Feature inventory

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Account | Sign in / sign up (Clerk dialog) | COMPLETE | existing and re-verified |
| | Sign out, expiry, multi-tab, account switch | COMPLETE | F1, F3 |
| | Profile, email, password, 2FA, sessions | COMPLETE | F7 |
| | Account deletion | PARTIAL | O12 |
| | Legacy email/password | DEPRECATED | F4, O13 |
| CV workspace | Create, open, edit, autosave (local), rename, fork, preview | COMPLETE | local-first; save failures retry with backoff |
| | Delete | PARTIAL | O6 |
| | Restore deleted, local revision history | MISSING | O6 |
| | Export (PDF, images, HTML, Markdown, JSON Resume, YAML, DOCX) | COMPLETE | PDF has real-browser coverage |
| | Import (PDF/image extraction) | BLOCKED on Cloudflare | O10 |
| Editor | Markdown and CSS editing, separate undo history, split pane with keyboard resize | COMPLETE | |
| | Dirty state, save failure recovery | COMPLETE | |
| | Phone layout | PARTIAL | O8 |
| | Editor settings | PARTIAL | only theme and profile save mode |
| Templates | Browse, preview, public/private distinction | COMPLETE | |
| | Clone, create CV from template | COMPLETE | |
| | Save as template, rename, export, import, delete | COMPLETE | F6 |
| | Edit content, apply to an existing CV | MISSING | O7 |
| | Public catalog publication | COMPLETE in ruxt-admin; storage BLOCKED | O3 |
| Cloud sync | Consent, notice, automatic two-way sync of consented kinds (per-kind mode), batched upload/download, delta, hashing, push, adaptive fallback, per-kind quota, header chip and banners | COMPLETE | measured below; F9 |
| | Conflict preservation and piece-by-piece merge | COMPLETE | F5 |
| | History, restore as copy, make current, recovery | COMPLETE | verified in the browser |
| | Production configuration | BLOCKED | O1, O2 |
| Jobs | Job automation workspace | PARTIAL | single configured owner; needs an external service (503 otherwise) |
| Subscriptions | Ledger, `/d` dashboard | COMPLETE and now owner-scoped | F2 |
| | Billing, portal, payments, entitlements | MISSING by design | O9 |
| Admin | Guard (Clerk role), health, analytics, import jobs, template versions | COMPLETE | O3 for data |
| | Users, subscriptions, audit log, feature management | MISSING | O4 |
| Mobile and native | Local stores, themes, legacy-cookie client | PARTIAL | O5 |
| Infrastructure | Cloudflare build, D1/KV, Durable Object hub, CI deploy | COMPLETE; production configuration BLOCKED | O1, O2 |
| Observability | Sync status, per-device network use | COMPLETE | |
| | Error reporting | MISSING | O14 |

## Request budget (measured)

See the table in [cloud data](../specs/authenticated-cloud-data.md). Healthy push: 0 HTTP requests for an idle account for an hour (about 50 WebSocket pings); without push, 1 per device per hour (3 across three devices in the real-server suite), and none for a device with nothing to do; twenty rapid edits, 1 request; five tabs, 1; 24 hours offline, 0 until reconnect, then 1. An anonymous tab makes 0 Worker requests while idle, hidden or typing. WebSocket messages to the Durable Object are billed at a fraction of a request; the exact bill depends on the account's plan and was not measured.

## Verification

Run on 2026-11-23 on the branch that added automatic sync (F9).

| Command | Result |
| --- | --- |
| `pnpm lint` | passes |
| `pnpm test` | 979 passed, 104 skipped (skips are the opt-in browser/server suites below) |
| `pnpm test:workerd` | 29 passed, 1 skipped (O17) |
| `pnpm cf:build` and `wrangler dev --local` smoke from a clean checkout | builds; protected routes answer 401; registration answers 403 |
| `pnpm check:request-budget` | passes |
| `pnpm measure:requests` | runs; idle, hidden and typing tabs: 0 Worker requests |
| Live Clerk browser and API suites (`logout`, `commercial-access`, `owner-guard`, `cloud-sync-ui`, `templates`) | 25 passed, including the two-device `cloud-sync-ui` suite (empty second device, conflict-safe download, per-kind quota, profile id upgrade) |
| `tests/e2e` (real server, cloud-data API and request budget) | 13 passed, 1 skipped (unconfigured-server case), budget scenarios measured |
| ruxt-core: tests, lint, typecheck | 244 passed; clean |
| ruxt-admin: tests | 31 passed |

How to run the opt-in suites: [testing and operations](../specs/testing-devops.md).

## Remaining gaps

Blocked on credentials or infrastructure: O1, O2, O3, O10 (on Cloudflare). Unfinished functionality: O4 to O9, O11 to O15. Hardening: O16, O17. Mobile and native clients need Clerk-native authentication before the legacy registration route can stay closed without cost to them.
