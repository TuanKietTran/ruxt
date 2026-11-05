# Requirements per surface

Priorities: Must means the surface is not releasable without it; Should means it ships in the same release unless explicitly deferred. Behaviour labelled Planned is not yet present on that surface.

## Shared (all surfaces)

| Priority | Requirement |
| --- | --- |
| Must | Consume the single design-token source; generated token output must not drift (a drift check fails the build) |
| Must | Named themes with runtime switching; WCAG AA contrast in every theme |
| Must | Every screen presents empty, loading, and error states; a read-only surface may not drop a state |
| Must | Accessibility: skip link or equivalent first focus, focus order and visible focus ring, text scaling, reduced-motion behaviour, route/screen announcements |
| Should | Density control (comfortable/compact); admin surfaces default to compact |
| Should | System theme option (Planned on surfaces that do not have it yet) |

## Web application

| Priority | Requirement |
| --- | --- |
| Must | Editor at `/`: session sidebar, Markdown source with file tabs, live preview, template picker; works fully signed-out on local storage |
| Must | Save states saved / saving / conflict / offline are always visible; conflicts and offline state are never silently overwritten |
| Must | Profiles at `/p` with all sections, import/export of profile payloads with invalid payloads rejected inline, and the auto/manual save-mode preference |
| Must | Export dialog with progress, inline failure (for example preview not ready), and success; PDF export |
| Must | Sign-in dialog is global in the editor shell and opens automatically when a screen requires an account; signing in uploads nothing |
| Must | Settings: field-level commit keys (Enter, or Ctrl/Cmd+Enter in long text, saves; Esc cancels); a failed save keeps the entered value and shows an inline error plus a toast |
| Must | Cloud-data settings: independent per-category consent, default off; controls reflect pending state while loading; a failed change restores the previous state with an error |
| Must | Dashboard `/d` and providers `/d/providers`: active/trial counts, nominal monthly spend per currency, earliest period end, search and status filtering, create/cancel/delete subscription |
| Should | Dashboard controls for pause, resume, renew, and plan change (Planned; the APIs exist without UI controls) |
| Should | Cloud sessions and cloud templates: per-item opt-in upload, checkpoint restore into a new local session, export and delete of cloud copies (Planned) |

## Admin application

| Priority | Requirement |
| --- | --- |
| Must | Own sign-in; every route rechecks the admin role server-side; non-GET requests require a trusted origin |
| Must | Overview: statistics cards and metric tables for routes, CQRS, users, and tasks |
| Must | Jobs: snapshot with state filtering and failure badges |
| Must | Templates: list, create, edit with source and preview, save as a new version, publish/unpublish; delete is confirmed and blocked for published or built-in templates |
| Must | Pages load data through the admin application's own server routes; `GET /api/health` is the only public route |
| Should | Platform pages (Planned, read-only): releases, domains, databases, config, audit log, legacy sunset tracker, plan viewer with dry-run/applied state |

## Native desktop (Planned)

| Priority | Requirement |
| --- | --- |
| Must | Editor application with the web IA: local sessions sidebar, Markdown editor with local autosave (state always visible, and the UI states that saving is local), preview, templates, profiles, settings, sign-in |
| Must | PDF is produced locally; there is no server export endpoint |
| Must | Offline behaviour: local sessions remain fully usable; account templates are marked unavailable; settings load failure never overwrites server values with defaults, and offline edits are marked unsynced |
| Must | Admin application mirrors the admin web surfaces (analytics, jobs, templates, me, health) against the admin backend only |
| Should | Keyboard shortcuts, window-class layouts (wide split, compact single pane), theme from the shared tokens with no hard-coded palette |

## Mobile (canaries, Planned)

| Priority | Requirement |
| --- | --- |
| Must | Same IA in compact form: sessions, editor with autosave debounce and local draft persistence, preview, templates, profiles, providers, settings with save-mode and cloud consent |
| Must | Theme (system / light / dark named themes) and density persisted on device; reusable empty/loading/error states on every screen |
| Must | Sign-in, preferences, and consent through the same authenticated API contract as the web; no surface may call the legacy plans, subscriptions, or IAM routes (see security requirements) |
| Should | Canary configuration is a build-time switch (bundle identity, display name, API base URL) with a stable configuration using the production API |

## Platform control plane (Planned)

| Priority | Requirement |
| --- | --- |
| Must | ProviderAdapter interface (id, capabilities, plan, apply, verify, health); native/self-hosted adapters first, Clerk/Cloudflare/Deno as legacy adapters carrying sunset data |
| Must | Plan/apply split: plan is pure, deterministic, serialisable, and checksummed; apply consumes a plan hash, requires explicit confirmation, defaults to dry-run, and refuses a hash mismatch |
| Must | Append-only audit log per action (actor, action, target, plan hash, dry-run/applied, result), rendered read-only in the admin application |
| Must | Secrets by reference only: adapters receive environment variable names and resolve values at apply time; values never enter plans, logs, or audit records |
| Must | Registries as versioned data: releases/channels, domains with verification and TLS state, database environments with migration state, feature flags, and the legacy sunset tracker |
