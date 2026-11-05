# Admin desktop app (GPUI)

## Status and sources

This specification describes the planned native admin app, `ruxt-admin-desktop`. The app is not built yet: every desktop behaviour below is **Planned** unless a section says otherwise. Statements about endpoints, pages, and fields describe the existing services as they are.

The inventory is based on a read-only audit of the admin web app (its pages, layout, components, composables, and server routes) and, for plans, subscriptions, and IAM, of the main application's API route files and the subscriptions and authentication specifications in this folder. No `specs/design/screens.md` exists in this tree, so the admin web app source is the audit source of record for admin screens.

The desktop app is a thin GPUI shell over two shared crates: `ruxt-api`, a typed client for the existing HTTP APIs, and `ruxt-ui-kit`, the GPUI component and theme layer. It introduces no new server behaviour. Administration endpoints are exposed through a dedicated admin client module in `ruxt-api`.

## Two backends, kept separate

The admin web app is its own service with its own Clerk-based authentication and its own API (`/api/analytics`, `/api/jobs`, `/api/templates`, `/api/me`, `/api/health`). Plans, subscriptions, and IAM subjects are not part of that service: they are routes of the main application, governed by [Subscriptions](subscriptions-catalog.md) and [Authentication and IAM](auth-iam-security.md). The desktop app talks to both backends and never conflates them: the admin service's Clerk session does not authenticate main-application calls, and the main application's session cookie does not authenticate admin-service calls.

## Authentication and health (admin service)

Current behaviour of the admin web app:

- Sign-in is Clerk's hosted component on a `/login` page, using hash routing and redirecting to the analytics page after sign-in. There is no registration surface; accounts are provisioned outside the app.
- Every admin API route except health requires an admin. The guard re-checks the signed-in user's Clerk private metadata role (`role` must be `admin`) on every request, including live sessions, and rejects anonymous requests with 401. Private metadata is writable only through trusted backend or dashboard access, so a user cannot grant themselves the role.
- Mutations (any non-GET request) additionally require a trusted `Origin` header; requests from untrusted origins are rejected before the handler runs.
- `GET /api/me` returns the current admin user as resolved by the guard; the web shell uses it to show the signed-in user and to sign out through Clerk.
- `GET /api/health` is the only public route. It returns `{ status: "ok", service: "ruxt-admin" }` and needs no sign-in.

Planned desktop behaviour: the app opens on the health check, presents Clerk sign-in (the exact native presentation of the hosted Clerk flow is an open decision), loads `/api/me` before showing any data view, and treats a 401 from any admin call as session loss: it returns to the sign-in state and discards cached admin data. Sign-out ends the Clerk session and clears local caches.

## Analytics

Current behaviour:

- `GET /api/analytics` accepts an `hours` query parameter, clamped server-side to 1–720 and defaulting to 24 when missing or invalid. It returns `{ hours, routes, cqrs, users, tasks }`: one metric report per kind.
- The underlying samples are hourly aggregates written by the main application and flushed about every 30 seconds.
- The page offers four time windows — last hour, last 24 hours, last 7 days (168), and last 30 days (720) — plus a manual refresh that is disabled while a load is pending.
- Each report is shown as summary stat cards, an hourly chart, and a per-key summary table. Four tabs switch the report kind: routes, cqrs, users, and tasks; only the routes, users, and tasks reports carry latency figures in the table.

Planned desktop behaviour: the analytics view mirrors this page — window selector with the same four values, the same four tabs, stat cards, chart, and table — and re-fetches on window change and on manual refresh. Values are never cached across windows.

## Jobs

Current behaviour:

- `GET /api/jobs` returns a live snapshot of the durable CV-import queue: a total count, an average run duration, counts by state, counts by error code, and the recent jobs. Each recent row carries the job id, file name, state, stage, progress percentage, attempt count, owner id, last-updated time, and duration, plus an error code when the job failed.
- States are succeeded, failed, cancelled, running, and queued, shown as colour-coded badges (green, red, yellow, blue, and neutral respectively).
- The page's stat cards double as a state filter: selecting a card filters the recent-jobs table to that state, selecting it again clears the filter. Failure reasons appear as a separate badge row when any job has an error code. An empty table reads "No jobs."

Planned desktop behaviour: the jobs view mirrors the snapshot, the filter cards, the failure-reason row, and the eight table columns (File, State, Stage, Progress, Attempt, Owner, Updated, Duration). The view is read-only; there is no endpoint to retry, cancel, or delete a job, and the desktop app adds none.

## Templates

Current behaviour:

- `GET /api/templates` returns `{ templates }`, a list of template summaries. The list page shows each template's name, status, latest version number, and tags, with a row action to open it and a command to create a new template.
- `POST /api/templates` creates a template and returns its id; the editor then opens on the new template.
- `GET /api/templates/[id]` returns one template at its latest version, or at the version named by the optional `version` query parameter.
- Editing never mutates a version in place: `POST /api/templates/[id]/versions` saves the edit as a new, unpublished version and returns it.
- `PUT /api/templates/[id]/versions/[version]/publish` with `{ published }` publishes or unpublishes that version; a published version is marked public. Publishing is disabled for internal or local templates.
- `DELETE /api/templates/[id]/versions/[version]` deletes a version. It is disabled for published and built-in versions and always asks first, with a confirmation dialog that names the version and states the deletion cannot be undone.
- Each version is badged public and/or built-in in the version list, newest first, with its creation date. Validation and conflict errors from the template store surface as HTTP errors with the store's message.

Planned desktop behaviour: the templates section mirrors the list, the create flow, and the editor with its version list, save-as-new-version, publish/unpublish, and confirmed delete, including the same disabled rules. Closing an editor with unsaved changes asks before discarding them.

## Plans, subscriptions, and IAM (main application API)

No admin web page exists for these surfaces; the desktop views in this section are Planned, designed from the main application's route files, and grouped in the desktop navigation separately from the admin-service sections above. The endpoints, mirrored exactly:

- **Plans:** `GET /api/plans` lists plans; `GET /api/plans/[id]` reads one; `PUT /api/plans/[id]` creates or replaces one; `DELETE /api/plans/[id]` deletes one. There is no `POST /api/plans` — creation uses the `[id]` PUT shape.
- **Subscriptions:** `GET /api/subscriptions` lists subscriptions; `POST /api/subscriptions` creates one; `GET /api/subscriptions/[id]` reads one; `DELETE /api/subscriptions/[id]` deletes one. Lifecycle actions are `POST /api/subscriptions/[id]/cancel`, `/pause`, `/resume`, and `/renew`. A plan change is `PUT /api/subscriptions/[id]/plan-change`; removing a scheduled plan change is `DELETE` on the same path.
- **IAM subjects:** `POST /api/iam/check-access` answers an access check. `GET /api/iam/subjects/[userId]` reads one subject, `PUT` creates or replaces it, and `DELETE` removes it.

Planned desktop behaviour: dense tables for plans and subscriptions with an editor for plan fields, lifecycle actions on subscriptions presented with their consequences stated, an access-check form for IAM, and a subject editor. Cancel, delete, plan change, and subject removal always ask for confirmation first and name the affected plan, subscription, or subject. A 401 or 403 from the main application returns the operator to that backend's sign-in state without touching the admin-service session.

## Navigation and layout

The admin web app has one shell: a sidebar with Analytics, Jobs, and Templates, and the signed-in user with a sign-out command. The desktop app keeps this information architecture and adds the Planned Plans, Subscriptions, and IAM entries as a second, clearly separated navigation group, because they belong to the other backend.

Layout per window class (Planned):

- **Expanded (1280 and wider):** sidebar plus content; analytics shows stat cards, chart, and table together, and the template editor shows the version list beside the editing pane.
- **Medium (901–1279):** collapsible sidebar; analytics chart and table stack, and the template editor's version list becomes a pane above the editor.
- **Compact (900 and narrower):** single column; navigation collapses to a drawer, tables scroll horizontally rather than dropping columns, and the template editor shows either the version list or the editor, not both.

Density is an admin-specific setting: the default is compact, tuned for dense tables, and comfortable density is selectable and persisted. Density changes row height and spacing only, never which columns or actions are shown.

## Themes and tokens

The desktop admin app uses the same design tokens as the user desktop app, consumed from the shared token source through `ruxt-ui-kit` code generation. The token source is not part of this tree yet, so token consumption is provisional in structure: the generated names and roles follow the token specification, and values are regenerated when the source lands. Themes are Mocha (dark), Latte (light), and OpenCode (dark), switchable at runtime without restarting, plus a follow-system option that resolves to the matching light or dark theme. The admin web app has no theme switcher; themes are a desktop addition and change no server behaviour.

## Keyboard shortcuts

All Planned: `Cmd/Ctrl+1` through `Cmd/Ctrl+6` switch sections in navigation order; `Cmd/Ctrl+R` refreshes the current view; `Cmd/Ctrl+N` starts a new template from the templates section; arrow keys move within tables and the version list, and `Enter` opens the focused row. Shortcuts never trigger destructive actions; deletions and lifecycle changes still pass through their confirmation dialogs.

## Accessibility

All Planned: focus order follows the visual layout (navigation, then view controls, then content); every control is reachable and operable by keyboard, including the state filter cards on the jobs view, which are toggle buttons with a pressed state. Text and badge colours meet WCAG AA contrast in every theme, using the token pairs verified for the shared token set; state is never carried by colour alone, since every badge also has a text label. The app honours operating-system text scaling and reduced-motion settings, and confirmation dialogs return focus to the control that opened them.

## States

Every data view defines its empty, loading, error, and offline states (all Planned for the desktop app):

- **Analytics:** a failed load shows the error in place with retry, matching the web page's alert; an empty window shows zeroed cards and an empty table rather than an error.
- **Jobs:** loading shows the table skeleton; an empty queue shows the "No jobs" empty state; a failed refresh keeps the last snapshot visible and marks it stale.
- **Templates:** a missing template shows the load error with a route back to the list; a template with no versions beyond the current one shows the version list with only that version; save, publish, and delete failures keep the editor open with the error shown and no version state changed.
- **Plans, subscriptions, IAM:** a failed load shows the error with retry and no partial table; a failed action leaves the row unchanged and reports the server's message.
- **Sign-in and health:** if the health check fails, the app says the admin service is unreachable and offers retry; it does not present sign-in against an unreachable service.

## Build prerequisites

GPUI is pinned at 0.2.2 from crates.io; no git dependency is used. Per operating system:

- **macOS:** full Xcode plus the Metal Toolchain component. Without it, building any GPUI crate fails with `cannot execute tool 'metal'` while compiling GPU shaders. This is an environment prerequisite, not a code defect. Install it with `xcodebuild -downloadComponent MetalToolchain`. Command-line tools alone are not enough. Non-GPUI crates (for example the API client) build without it.
- **Windows:** the MSVC Rust toolchain; the Win32 backend is in-crate. Not yet verified on a Windows host.
- **Linux:** the X11 or Wayland backend, with the usual system development packages for xkbcommon, Wayland, and fontconfig/freetype. Not yet verified on a Linux host; verification belongs to continuous integration on a Linux runner.

Keeping the UI kit feature-gated so the API client checks cleanly on machines without the macOS Metal Toolchain or Linux GUI dependencies is part of the workspace design.
