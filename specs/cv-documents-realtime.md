# Local CV sessions

## Storage

app/utils/localCvStore.ts is the primary session store for every visitor. It supports list, get, create, save, rename, fork, delete, and revision metadata. Session ids are independent of titles. New sessions use UUIDs.

Existing cv-sv:session-backup:* records and cv-sv:new-session-draft remain recoverable as local sessions. Browser storage is origin-specific; another hostname or device does not share it. Clearing site data removes local records.

## Autosave

app/composables/useCvDocument.ts saves complete Markdown/CSS snapshots after 500 ms idle, with a 3-second maximum wait. Failed browser writes preserve the stored copy and in-memory edits, show an error state, and retry after 5 seconds.

Pending edits flush on page hide, hidden visibility, editor deactivation, and unmount. Storage events adopt newer local revisions only while the editor is clean. Dirty content is never overwritten automatically. Deleted sessions are not recreated by pending saves.

## Server boundary

The ownerless server document store is retired. It does not open, seed, migrate, or serve documents:* keys. Its list returns empty; document operations fail with 404.

Nitro middleware requires authentication for /api/cvs and /api/cv-profiles paths even when their routes are absent. Anonymous callers receive 401; signed-in callers reach the removed route's 404. MCP CV tools also require authentication and report unavailable.

No server autosave, document SSE, or revision polling runs in the current browser editor. Local editing needs no CV network request.

## Cloud copies

Cloud synchronization is planned, separately consented, and owner-scoped. It must not delete local data or overwrite dirty edits. See [cloud data](authenticated-cloud-data.md).
