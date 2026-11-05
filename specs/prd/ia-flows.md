# Information architecture and flows

## Shells and global elements

The web application has two shells. The editor shell serves the editor contexts (`cv` and `profiles`) as a full-height workspace; the default shell serves the account and information pages with standard page chrome. Every screen carries a "Skip to content" link as the first focusable element, a route announcer for assistive technology, a shared dialog host, and a toast host (success, error, neutral). The sign-in dialog is global in the editor shell and opens automatically when a screen requires an account. Native and mobile surfaces mirror these shells with their platform navigation idioms and the same global elements in equivalent form.

## Routes

| Route | Shell | Access | Content |
| --- | --- | --- | --- |
| `/` | Editor, `cv` context | Public, local-first | Session sidebar, Markdown source editor with file tabs, preview pane, template picker |
| `/e/:id` | Redirect | Public | Replaces the route with `/?s=<id>` (308) and opens that document; an unknown id is a 404 |
| `/p` | Editor, `profiles` context | Public | Profile list sidebar and profile sheet (identity, about, contact, experience, skills, education, projects, certifications, languages) |
| `/login` | Default | Public | Opens the sign-in dialog |
| `/d` | Default | Account | Subscriptions dashboard: counts, monthly spend per currency, earliest period end, subscription management |
| `/d/providers` | Default | Account | Plans grouped by provider |
| `/settings` | Default | Public | Settings, including the profile save-mode preference and the profile editor |
| `/settings/cloud-data` | Default | Account | Per-category cloud-data consent controls |
| `/about` | Default | Public | Static explanation with actions to open the editor and review cloud data |

Admin application (separate sign-in, admin-gated): Overview (statistics cards and metric tables), Jobs, Templates (list, new, editor), Sign-in. Platform pages in the admin application (Planned, read-only): Releases, Domains, Databases, Config, Audit, Legacy sunset tracker, and a plan viewer that renders a plan's items, counts, and dry-run/applied state without applying anything.

## Window classes and navigation

Layout follows window class, not device type. Wide (desktop): sidebar plus editor plus preview split. Medium (tablet): two panes. Compact (phone): single column with bottom navigation. The admin application uses the same classes with dense tables and an admin density default. Every surface offers runtime theme switching (named themes; a system option where not yet present is Planned), a density control (Planned where not yet present), keyboard shortcuts on desktop, and the accessibility behaviour in the accessibility specification. Navigation never changes the information architecture between surfaces: the same screens, in the same grouping, with the same states.

## Core flows

1. First CV, signed out: open `/`, choose a starting point in the template picker, write in the source editor with live preview, watch the save state move to saved, export. No account is requested at any point.
2. Profile reuse: maintain one profile on `/p`, then draw its sections into a CV; the profile save-mode preference (auto or manual) controls when profile edits commit.
3. Import: bring existing material into the editor or profiles; an invalid payload is rejected with an inline explanation and nothing is created.
4. Export: open the export dialog, which reports progress, an inline error if the preview is not ready, and success on completion; PDF is the primary export.
5. Sign-in and consent: sign in through the global dialog; local data stays local. In `/settings/cloud-data`, turn on cloud sessions or cloud templates independently; only items the user then selects are uploaded (Planned).
6. Subscriptions: on `/d`, review counts, spend, and period ends; create a subscription (optionally creating a user plan first), cancel, or delete with a typed confirmation.
7. Admin template lifecycle: sign in to the admin application, create or edit a template with source and preview, publish or unpublish it; a published or built-in template cannot be deleted.
8. Operator change (Planned): generate a plan, review its items and checksum, apply it with explicit confirmation (dry-run by default), and find the action afterwards in the append-only audit log with its plan hash and result.
