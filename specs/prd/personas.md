# Personas

Three personas cover every surface. A single person may act in more than one persona, but each surface is designed for one primary persona, and permissions follow the persona, not the person.

## End user

A job seeker (or anyone preparing a CV) who writes and maintains one or more CVs, often against application deadlines. They may never create an account.

- Surfaces: web editor and profiles, native desktop editor, mobile applications.
- Primary tasks: start a CV from a template; write and preview Markdown; keep a reusable profile current; import existing material; export a finished CV (including PDF); pick up the same documents on another surface (cloud recovery is Planned and consent-gated).
- Needs: the editor works signed-out; autosave and recovery mean a crash, a closed tab, or a network failure never loses work; save state is always visible; empty, loading, and error states explain what happened and what to do next.
- Constraints: no account, payment, or cloud consent may be required to write, save locally, or export. Signing in must not move, merge, or upload their local documents, profiles, or templates.

## Owner / administrator

The account owner who administers the shared catalog and their own subscriptions, using the admin application behind its own sign-in. Administrator status is a server-side property of the account (an admin role checked on every request), never something the client asserts.

- Surfaces: admin application (overview, jobs, templates), the subscriptions dashboard and providers views, account settings including cloud-data consent.
- Primary tasks: view usage statistics and background job state; create, edit, publish, unpublish, and delete catalog templates; manage their own plans and subscriptions; review and change cloud-data consent per category.
- Needs: dense, scannable tables at admin density; destructive actions confirmed, with published or built-in templates protected from deletion; clear separation between catalog (public) records and private records.
- Constraints: the admin application only exposes its own gated surfaces. Plans, subscriptions, and IAM records are managed through the main application's authenticated owner surfaces, not through admin pages. Mutations derive the acting identity from the server session on every request.

## Operator

The person who runs the platform: deployments, releases, domains, databases, configuration, and the legacy retirement programme. The operator works from the command line and the platform registries, not from a web UI.

- Surfaces: platform control-plane CLI (Planned), platform registries (releases, domains, databases, environments, flags, legacy tracker), the admin application's read-only platform pages (Planned), deployment tooling and runbooks.
- Primary tasks: cut and promote releases across dev, canary, and stable; verify domain bindings and TLS state; track database environments and migration state; produce a checksummed plan, review it, and apply it with explicit confirmation (dry-run by default); work the legacy sunset checklists for Clerk, Cloudflare, and Deno Deploy towards January 2027.
- Needs: plans that are deterministic and reviewable before anything changes; an append-only audit log attributing every applied action to an actor, a plan hash, and a result; secrets handled by reference (environment variable names) so values never appear in plans, logs, or audit records.
- Constraints: no live changes from the admin UI; no adapter performs network or credential work while planning; a plan whose hash does not match is refused.
