# CV workflows

## Current implementation

Browser sessions, local templates, and standalone profiles stay in local storage. Public catalog templates are server-readable; private template save/override returns 403 and server clone returns 404 after authentication.

Authenticated import accepts PDF/images, validates MIME/extension and size, stores an owner-scoped source artifact, and creates a durable job. The Python adapter extracts text/OCR, classifies the CV, produces structured profile facts, and renders Markdown/CSS/HTML. Poll, preview, retry, cancel, and artifact reads are owner-scoped.

The browser import dialog commits preview output to a local session/profile. The legacy server commit handler still depends on document creation, which the retired server store rejects. It is not an active cloud-save path.

Default upload limit is 15 MiB; artifact TTL is 24 hours. Workers report extraction unavailable and reject uploads before starting Python work.

## Reusable transformations

Public @ruxt/shared/cv owns pure profile extraction, skeleton generation, detection, composition, and backup reconciliation.

- Extraction supports Harvard tables and pipeline heading layouts; unknown input yields empty fields rather than throwing.
- Skeleton generation preserves structural Markdown, directives, breaks, alignment, and attribute blocks while replacing personal facts. It is idempotent.
- Detection returns profile fields with section/entry identity, UTF-16 ranges, and line metadata. Matches stay within the relevant entry; unlocated values retain empty ranges.
- Composition preserves skeleton structure, fills profile facts, escapes table cells, and can append missing sections. Placeholder skeletons use named fields.
- Section merge replaces only selected profile sections.

The current editor uses these transformations locally. Old HTTP profile-switch/detect/apply paths are removed. Core handlers remain reusable, but their presence does not establish an available application endpoint.

## Planned server capabilities

| Area | Intended operations |
| --- | --- |
| Lifecycle | Explicit create/fork, metadata, archive/restore, soft delete/purge |
| History | Checkpoints, revision comparison, restore as a new head, audit events |
| Source editing | Revision-protected save/unique patch, atomic patch sets, previews, conflict resolution |
| Templates | Apply/rebase pinned versions, stylesheet validation |
| Structured content | Read/update concept sections, provenance, translation |
| Tailoring | Job briefs, requirement matching, evidence-linked proposals, accepted application variants |
| Review | Deterministic validation, ATS/content/consistency/link checks, layout findings |
| Rendering | Pinned HTML/PDF/image artifacts, thumbnails, source bundles |
| Operations | Durable job state, progress/cancel/retry, capabilities, retention cleanup |

These capabilities are targets, not active REST/MCP functionality. MCP document tools currently report unavailable.

## Planned invariants

- Derive owner/workspace from verified authentication; ids alone grant no access.
- Use optimistic revisions and idempotency for mutations.
- Preserve claim provenance; unsupported facts become warnings, never invented experience.
- Preview broad/generated edits and require acceptance before commit.
- Run long operations as cancellable durable jobs with stable errors.
- Deliver binary data through authorized artifact URLs; return concise metadata/resource links through MCP.
- Pin document/template/renderer revisions and checksum artifacts.
- Emit application events only after committed writes.

REST and MCP are sibling adapters over core handlers. Core owns use-case rules; adapters own transport, uploads, subprocesses, repositories, and rendering.

## Gaps

Import claiming and application writes are process-local, without durable multi-instance leases. Profile parsing is heuristic. Cloud document history, tailoring, server artifact rendering, and workflow resources/prompts remain planned. See [cloud data](authenticated-cloud-data.md) and [MCP](mcp-automation.md).
