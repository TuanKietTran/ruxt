# Non-goals

The following are deliberately out of scope. Listing them here is a product decision, not a backlog: each would change the nature of the system.

- Not a general-purpose document editor. The product edits CVs in Markdown with CV templates and profiles; free-form documents, presentations, and spreadsheets are out of scope.
- No real-time collaboration. Documents are single-owner; there is no multi-user editing, commenting, or sharing of a live document. A document link (`/e/:id`) only opens the owner's document in the editor.
- No cloud by default. Local storage is the primary store. There is no bulk upload on sign-in or on granting consent, no background scanning of local records, and standalone local profiles are never synchronised.
- No account merging. Matching email addresses never merge two owners, and signing in never adopts or uploads pre-existing local data.
- No payment processing. Plans and subscriptions are catalogued and tracked (costs are nominal calculations from price and billing cycle); the system does not collect payments, run checkout, or act as a billing provider.
- No platform changes from a web UI. The admin application renders platform registries, plans, and the audit log read-only; applying a change is an operator action through the control-plane CLI (Planned).
- No new behaviour invented per platform. Native and mobile surfaces mirror the web information architecture and states; platform-specific features beyond parity (and platform idioms such as local PDF rendering on desktop) are out of scope.
- No public API platform. Server routes serve the applications themselves; the MCP surface is authenticated, and document tools are not exposed through it.
- No additional persistence backends. Storage is the weighted strategy registry (Deno KV, Cloudflare D1, SQLite) and the Nitro storage namespaces; there is no PostgreSQL adapter, and separate deployments do not synchronise with each other.
- No silent data repair. Migration and import tooling verifies with checksums and reports mismatches; it does not guess, merge dirty content, or overwrite local data to force consistency.
