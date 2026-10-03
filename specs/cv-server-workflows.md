# CV Server Workflows

Last updated: main@6c64d4f | 2026-09-20

## Scope

This spec defines the intended application contract and staged handler map for:

- CV REST and SSE adapters under `server/routes/api/cvs/`;
- the MCP adapter in `server/routes/mcp.ts` and `server/utils/mcp.ts`;
- current CV persistence/realtime ownership in `server/adapters/cv/document-store.ts`;
- future CV domain types, handlers, repository ports, service ports, jobs, and artifacts under `core/` and server/infra adapters;
- browser editor, import/extraction, validation, tailoring, template, rendering, and automation call sites.

Current implemented behavior remains specified in [cv-documents-realtime.md](cv-documents-realtime.md), [cv-editor.md](cv-editor.md), and [mcp-automation.md](mcp-automation.md). Sections below are intended contracts unless explicitly identified as current.

## Current Implementation Boundary

The server supports list, lazy open/create, complete save, unique patch, revision checks, process-local update publication, and SSE through one-purpose core handlers and a `CvDocumentPort`. REST and MCP dispatch those handlers independently.

The first server import slice is also implemented. Authenticated multipart upload creates an owner-scoped durable job and source artifact; the bundled `cv-pipeline` Python adapter performs PDF text extraction or OCR, CV classification, concept extraction, and Markdown/HTML/CSS rendering. Callers poll, preview, cancel/retry, download artifacts, and explicitly commit. Commit creates a CV application composed from an immutable template version and an embedded profile snapshot; there is no standalone profile persistence API. Client-side version-control behavior remains a later client concern.

## Target Architecture

The CV server is the application layer for CV lifecycle, transformation, validation, collaboration, and rendering. REST and MCP are sibling inbound adapters. Neither adapter calls the other:

```text
Browser REST/SSE ─┐
                  ├─> core CV command/query handlers ─> repository/service ports
MCP Streamable HTTP┘                                  ├> document store
                                                      ├> job/artifact store
                                                      ├> extraction/OCR
                                                      └> renderer/LLM adapters
```

MCP should expose intent-level workflows and progress-friendly jobs, not merely mirror CRUD endpoints. REST remains useful for browser transport, uploads, downloads, and low-level document operations.

## Cross-Workflow Invariants

- Every read and mutation is scoped to an authenticated owner/workspace.
- Every mutation supports optimistic concurrency through `expectedRevision`.
- Commands are idempotent when a caller supplies an idempotency key.
- Generated content never silently invents employment, education, dates, metrics, credentials, or skills.
- Imported and generated claims retain provenance back to source text, user input, or an explicitly accepted suggestion.
- Destructive and broad generated changes support preview/diff before commit.
- Long extraction, tailoring, validation, and rendering operations run as cancellable jobs with durable status and progress.
- Binary uploads and artifacts travel through HTTP/resource URLs; MCP tool results return metadata, text, and resource links rather than large base64 payloads.
- Markdown, CSS, structured concept JSON, templates, and rendered artifacts are versioned independently where their lifecycles differ.
- Browser SSE and MCP notifications consume application events emitted after committed writes.

## 1. Document Lifecycle

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| List documents | `ListCvDocuments` query | `list_cvs` | Filter by kind, tag, status, and updated time. |
| Open document | `GetCvDocument` query | `open_cv` or `cv://documents/{id}` resource | Return content, metadata, and revision. |
| Create blank CV | `CreateCvDocument` command | `create_cv` | Explicit creation replaces accidental create-on-read. |
| Create from template | `CreateCvFromTemplate` command | `create_cv_from_template` | Pins template/version used. |
| Clone/fork CV | `ForkCvDocument` command | `fork_cv` | Primary flow for job-specific variants. |
| Rename/update metadata | `UpdateCvMetadata` command | `update_cv_metadata` | Title, kind, tags, application link. |
| Archive/restore | `ArchiveCvDocument` / `RestoreCvDocument` commands | `archive_cv`, `restore_cv` | Reversible lifecycle. |
| Delete/purge | `DeleteCvDocument` command | `delete_cv` | Soft delete first; purge is separately privileged. |
| Compare revisions | `CompareCvRevisions` query | `compare_cv_revisions` | Returns semantic/source diff. |
| Restore revision | `RestoreCvRevision` command | `restore_cv_revision` | Creates a new head revision; does not rewrite history. |

Suggested document kinds are `master`, `application`, and `template-derived`. Lifecycle states are `active`, `archived`, and `deleted`.

## 2. Source Editing And Collaboration

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Save complete source | `SaveCvSource` command | `save_cv` | Replaces Markdown/CSS fields under one revision check. |
| Patch one unique range | `PatchCvSource` command | `patch_cv` | Exact unique replacement, protected by revision. |
| Apply patch set | `ApplyCvPatchSet` command | `apply_cv_patch_set` | Atomic ordered edits across Markdown/CSS. |
| Preview patch set | `PreviewCvPatchSet` query | `preview_cv_patch_set` | Diff without mutation. |
| Resolve conflict | `ResolveCvConflict` command | `resolve_cv_conflict` | Accept local, remote, or caller-supplied merge. |
| Create checkpoint | `CreateCvCheckpoint` command | `checkpoint_cv` | Named stable point before broad agent edits. |
| Watch updates | application event subscription | MCP resource updates/SSE | Emits revision, source, actor, and changed fields. |

Server history should retain actor/source (`browser`, `mcp`, `import`, `tailor`, `restore`), parent revision, timestamp, and optional workflow/job id.

## 3. Templates And Styles

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| List templates | `ListCvTemplates` query | `list_cv_templates` or `cv://templates` | Includes capabilities and latest version. |
| Get template | `GetCvTemplate` query | `get_cv_template` | Markdown skeleton, CSS, metadata, version. |
| Clone public template locally | `CloneCvTemplate` command | — | Authenticated POST creates immutable v1 with a unique id, `builtIn: false`, and a persisted `local` tag. Editing is deferred. |
| Create/update template | `SaveCvTemplate` command | — | Implemented. Authenticated `POST /api/cv-templates` returns 201. Without `overrideId` it writes a new local template at version 1 with a generated `local-<uuid>` id, `builtIn: false`, and `tags: ["local"]`. With `overrideId` it writes `currentVersion + 1` of that template, leaving earlier versions readable. Names are trimmed and capped at 120 characters; `markdownSkeleton` and `css` are required strings capped at 500 000 and 100 000 characters. Built-in or `public`-tagged templates cannot be overridden. No MCP tool is exposed. |
| Apply template | `ApplyCvTemplate` command | `apply_cv_template` | Preview CSS/structure changes before commit. |
| Rebase template version | `RebaseCvTemplate` command | `rebase_cv_template` | Preserves CV content while upgrading template style. |
| Validate stylesheet | `ValidateCvStylesheet` query | `validate_cv_stylesheet` | Syntax, unsafe/global selectors, remote resources, print rules. |

Templates should be immutable by version. Applying a template records template id/version in document metadata.

The `GET /api/public/templates` catalog requires no session and returns templates whose persisted data contains the `public` tag. The full `GET /api/cv-templates` catalog and `POST /api/cv-templates/:id/clone` remain authenticated. The current template catalog is seeded from versioned JSON blobs in `server/data/cv-templates/` and copied lazily into the configured `cv` Nitro storage under `templates:*` keys. Existing persisted versions win. Narrow, idempotent soft migrations update a persisted version whose CSS still targets the old app-owned `.cv-sheet` hook or intermediate `.cv-document` contract so each Markdown page uses `:::resume`, its first heading uses `{.cv-name}`, and its stylesheet targets those explicit indicators; they also replace the former `public` tag of `pipeline-default` with `internal`. These seeds and migrations run when the server boots (`server/plugins/init-cv.ts`), so every deployment rewrites its persisted copy on startup rather than on the first catalog request. The former `documents:template-harvard` value is retained for rollback. Template discovery/visibility labels are persisted directly as each blob's `tags` array: Harvard is public; `internal` templates are excluded from both the public and the authenticated catalog and stay usable only by the server, so `pipeline-default` remains the CV import fallback. An editor link to a template outside the catalog (for example `/?t=pipeline-default&v=1`) redirects to `/`.

## 4. Import And Extraction

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Register upload | `CreateCvImport` command | `start_cv_import` with uploaded resource id | HTTP owns multipart/binary upload. |
| Detect input | `InspectCvImport` query/job step | included in import status | MIME, size, page count, text density. |
| Extract text | `ExtractCvText` job handler | `get_cv_import` | PDF text first; OCR for images/scanned pages. |
| Classify CV-likeness | `ClassifyCvInput` job handler | included in import result | Explicit `EMPTY_OR_UNREADABLE` / `NOT_CV_ALIKE`. |
| Build concept | `ExtractCvConcept` job handler | `extract_cv` | Produces schema-valid identity/sections plus provenance. |
| Refine extraction | `RefineCvConcept` job handler | `refine_cv_extraction` | Optional LLM adapter; heuristic output remains available. |
| Preview conversion | `PreviewCvImport` query | `preview_cv_import` | Concept, generated Markdown/CSS, warnings, confidence. |
| Commit import | `CommitCvImport` command | `commit_cv_import` | Creates a new document only after accepted preview. |
| Retry/cancel import | `RetryCvJob` / `CancelCvJob` commands | generic job tools | Reuses durable source artifact. |

The canonical concept schema should cover identity, summary, skills, experience, education, projects, certifications, languages, and source spans/raw text. The server should preserve original uploads according to an explicit retention policy.

## 5. Structured Concept And Content Transformation

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Read concept | `GetCvConcept` query | `get_cv_concept` or resource | Stable structured view for agents. |
| Update concept | `UpdateCvConcept` command | `update_cv_concept` | Schema validation and revision check. |
| Concept → Markdown | `RenderCvConceptToMarkdown` query/command | `render_cv_markdown` | Deterministic renderer where possible. |
| Markdown → concept | `ParseCvMarkdownToConcept` job/query | `parse_cv_markdown` | Reports lossy/ambiguous fields. |
| Rewrite section | `RewriteCvSection` job command | `rewrite_cv_section` | Scope, tone, length, and evidence constraints. |
| Reorder sections/items | `ReorderCvContent` command | `reorder_cv_content` | Structured operation instead of brittle text patches. |
| Normalize dates/contact | `NormalizeCvContent` command | `normalize_cv` | Preview changes; preserve intended precision. |
| Translate CV | `TranslateCv` job command | `translate_cv` | Preserve names, links, facts, dates, and layout constraints. |

Structured operations should be preferred over raw Markdown edits when the concept can express the requested change.

## 6. Job Application Tailoring

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Store job brief | `CreateJobBrief` command | `create_job_brief` | Text or an already-fetched source artifact. |
| Extract requirements | `ExtractJobRequirements` job handler | `analyze_job` | Skills, duties, seniority, keywords, constraints. |
| Match CV to job | `MatchCvToJob` query/job | `match_cv_to_job` | Evidence-linked strengths, gaps, and unsupported asks. |
| Propose tailoring | `ProposeCvTailoring` job handler | `tailor_cv` preview mode | Returns ranked patch set and rationale. |
| Apply tailoring | `ApplyCvTailoring` command | `apply_cv_tailoring` | Fork by default; applies accepted proposal under revision check. |
| Generate application variant | `CreateApplicationCv` workflow | `create_application_cv` | Orchestrates fork, analysis, proposal, validation, and render. |
| Refresh against changed job/CV | `RefreshApplicationCv` workflow | `refresh_application_cv` | Recomputes from pinned source revisions. |

Tailoring may emphasize, reorder, condense, or rephrase supported facts. Unsupported requirements become gap warnings, never fabricated experience.

## 7. Review, Validation, And Scoring

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Validate document | `ValidateCvDocument` query/job | `validate_cv` | Aggregates deterministic validators. |
| ATS review | `ReviewCvForAts` query/job | `review_cv_ats` | Heading, parsing, keyword, table/layout cautions. |
| Content review | `ReviewCvContent` query/job | `review_cv_content` | Clarity, repetition, grammar, weak bullets. |
| Fact consistency | `CheckCvConsistency` query | `check_cv_consistency` | Dates, duplicates, contact values, section conflicts. |
| Link/contact check | `CheckCvLinks` job/query | `check_cv_links` | Network access must use SSRF-safe fetch policy. |
| Layout review | `InspectCvLayout` render job | `inspect_cv_layout` | Overflow, clipping, blank pages, density, page count. |
| Score against job | `ScoreCvForJob` query/job | `score_cv_for_job` | Explainable dimensions and evidence, not one opaque score. |
| Suggest fixes | `ProposeCvFixes` job handler | `suggest_cv_fixes` | Returns selectable patch set; does not auto-write. |

Validation results should use stable codes, severity, field/source location, explanation, and suggested remediation so browser and MCP clients can present the same findings.

## 8. Render And Artifact Delivery

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Render HTML preview | `RenderCvHtml` query/job | `render_cv` with `html` | Sanitized Markdown plus pinned CSS/template. |
| Render PDF | `RenderCvArtifact` job command | `render_cv` with `pdf` | Server-owned Chromium pipeline. |
| Render PNG/JPEG | `RenderCvArtifact` job command | `render_cv` with image format | One artifact per page or archive. |
| Render thumbnails | `RenderCvThumbnails` job command | usually implicit | Used by document/template lists. |
| Inspect artifact | `InspectCvArtifact` query | `inspect_cv_artifact` | Format, size, checksum, pages, dimensions. |
| Download artifact | artifact HTTP route/resource | resource link in MCP | Bounded retention and authorization. |
| Export source bundle | `ExportCvBundle` job command | `export_cv_bundle` | Markdown, CSS, concept, metadata, and requested renders. |

Rendering inputs must pin document revision, template/CSS revision, renderer version, page format, and font/assets. Artifacts should be content-addressed or carry checksums so retries are deterministic and cacheable.

## 9. Jobs, Audit, And Operations

| Workflow | Core handler | MCP shape | Notes |
|---|---|---|---|
| Get/list jobs | `GetCvJob` / `ListCvJobs` queries | `get_cv_job`, `list_cv_jobs` | State, progress, stage, warnings, artifacts. |
| Cancel/retry job | `CancelCvJob` / `RetryCvJob` commands | matching tools | Retry from safe checkpoint. |
| Get audit trail | `ListCvAuditEvents` query | `get_cv_history` | Actor, source, command, revisions, artifacts. |
| Clean expired artifacts | scheduled application command | admin-only | Retention policy, not ad hoc deletion. |
| Health/capabilities | `GetCvCapabilities` query | `cv://capabilities` | OCR, renderer, LLM, formats, limits, degraded state. |

Suggested job states are `queued`, `running`, `awaiting_input`, `succeeded`, `failed`, and `cancelled`. Jobs should return stable error codes and preserve partial diagnostics without publishing partial document mutations.

## MCP Surface Design

MCP should expose three complementary primitives:

1. **Resources** for read-heavy context: document heads/revisions, concepts, templates, job briefs, validation reports, capabilities, and artifact metadata.
2. **Tools** for commands and expensive queries: create/fork/save/patch, import, tailor, validate, render, restore, and job control.
3. **Prompts** for repeatable user-facing flows: create from source, tailor to a job, review without editing, shorten to N pages, and produce an application package.

High-level tools should return workflow/job ids, affected document ids/revisions, concise summaries, warnings, diffs, and resource links. Low-level `save_cv` and `patch_cv` remain available for precise agent control but are not the main orchestration interface.

## Handler And Port Boundaries

Core handlers should depend on explicit ports, not Nitro or MCP types:

- `CvDocumentRepository`: heads, revisions, metadata, lifecycle, atomic expected-revision writes;
- `CvTemplateRepository`: immutable template versions;
- `CvJobRepository`: durable state, progress, cancellation, idempotency;
- `CvArtifactRepository`: source uploads and generated artifacts;
- `CvEventPublisher`: committed document/job events;
- `CvExtractor`, `CvOcr`, `CvConceptRefiner`: import pipeline services;
- `CvTailoringService`: requirement matching and evidence-bound proposals;
- `CvValidator`: deterministic and optional model-backed findings;
- `CvRenderer`: HTML/PDF/image rendering and layout inspection;
- `SafeExternalFetcher`: bounded, SSRF-safe job/link ingestion.

Nitro adapters own HTTP bodies, streams, status codes, authentication extraction, uploads, and artifact responses. MCP adapters own schemas, resources, progress/notifications, and protocol errors. Core owns use-case validation, authorization requests, idempotency, revisions, orchestration, and result types.

## Recommended Build Order

1. **Core migration:** add CV domain types/repository port and move current list/open/save/patch behavior behind `ListCvDocuments`, `GetCvDocument`, `SaveCvSource`, and `PatchCvSource` handlers. Make REST and MCP call the mediator independently.
2. **Lifecycle and history:** explicit create/fork/archive/delete, revisions, checkpoints, diffs, audit events, and ownership.
3. **Jobs and artifacts:** durable job model, upload/artifact stores, progress/cancel/retry, and capabilities.
4. **Import:** PDF text, OCR fallback, CV classification, concept schema, preview, and commit.
5. **Server rendering:** deterministic HTML/PDF/image artifacts and layout inspection.
6. **Validation:** deterministic checks first, then optional model-backed review.
7. **Tailoring:** job briefs, evidence-linked matching, proposal/diff, user acceptance, and application variants.
8. **Templates and advanced transforms:** immutable versions, rebase, structured edits, and translation.

## Splitting A Session Into Template And Profile

`core/domain/cv/split.ts` is pure domain code with no I/O. It divides one rendered CV session into the two halves the application model already uses: a `CvProfileProps` of personal facts and a `markdownSkeleton` of reusable presentation.

`extractCvProfile` tokenizes Markdown into headings, tables, list items, and paragraphs, ignoring fenced code, directive fences, and thematic breaks. Section kind is inferred from `#`/`##` heading text by an ordered pattern list, so `Skills & Interests` classifies as skills and `Technical Projects` as projects. Both current authoring shapes are supported: the Harvard two-column table layout and the pipeline `###` heading plus italic metadata line. Leadership, activities, and volunteer sections are folded into experiences. Labelled skill lines split into named groups, and a `Languages:` label whose items look like spoken-language proficiencies is routed to `languages` rather than `skills`. Extraction is heuristic and total: it never throws, and unrecognized input yields empty fields rather than an error.

`toCvTemplateSkeleton` preserves structure byte-for-byte where it carries presentation — directives, page breaks, `##` section headings, table alignment rows, list markers, and heading attribute blocks such as `{.cv-name}` — while replacing personal text with placeholders drawn from the same vocabulary as `app/data/reference-cv.md`. The line count of the skeleton equals the line count of the source. It is idempotent: applying it to its own output is a no-op, which lets the editor re-derive a skeleton from an already-generalized session. Fenced code is passed through untouched.

Tables may have more than two columns: the first cell is the entry name, the first date-like cell after it gives the dates, the last other cell of the name row gives the location, and remaining cells of the second row become education details (for example `GPA: 3.6`). Alignment rows with a single dash (`:-:`) are separators. An experience table whose only row starts with an italic cell (`| *Senior Engineer* | Jan 2025 – Present |`) is another role at the previous company and inherits its company and location. Skill lines may label a group with a bold label and spacing instead of a colon (`**Languages** &nbsp; Go, Rust`), and `&nbsp;` and basic HTML entities are decoded in extracted text.

`splitCvApplication` returns both halves together. It is the intended input to `SaveCvTemplate`, which persists only the skeleton and CSS; profile facts stay in the `CvApplication` snapshot and are never written into a template.

## Detecting Profile Information In A Session

`core/domain/cv/detect.ts` maps extraction back onto the source. `detectCvProfile(markdown)` returns the extracted profile and one `CvDetectedField` per leaf value (dotted `path` into `CvProfileProps`, `section`, `entry`, `key`, `value`, and UTF-16 `ranges` with the first range's 1-based `line`). Each value is searched only in sections of the matching kind. List entries are confined to their own block, from the table or heading that holds the entry's anchor (title, school, or project name) up to the next entry's block, so a value never matches inside a neighbouring entry. A value inherited from an enclosing table, such as the company of a sub-role, shares that earlier occurrence. Raw matches respect word boundaries and grow to the whole Markdown link or autolink that contains them. Values rewritten by Markdown (inline emphasis inside a bullet, multi-line descriptions) fall back to matching whole lines or table cells by plain text. A value that cannot be located keeps an empty `ranges` list rather than failing.

`mergeCvProfileSections(base, detected, sections)` overwrites only the chosen sections of a saved profile.

| Workflow | Core request | HTTP / MCP | Behavior |
|---|---|---|---|
| Detect | `DetectCvProfile` query | `GET /api/cvs/:id/profile/detect`, MCP `detect_cv_profile` | Returns `{ documentId, revision, profile, fields }`. Writes nothing. |
| Apply to sessions | `ApplyCvProfile` command | `POST /api/cv-profiles/apply`, MCP `apply_cv_profile` | Body: `profile`, `documentIds` (1–50, deduplicated), optional `profileId`, `template`, `sourceId`. Validates the profile once, then runs one `SwitchCvProfile` saga per session, in order. Returns `{ results, applied, failed }`; one session's failure is reported for that session and never rolls back the others. |

In the CV editor, **Detect profile** next to the source tabs highlights every located value in `content.md`, color-coded by section, and opens a panel under the source listing the values by section. Clicking a value selects and scrolls to it. Section checkboxes choose what **Save to profiles** writes: a new local profile (which needs the identity section with a name) or an update of an existing one through `mergeCvProfileSections`. Detection re-runs 250 ms after edits. On `/p`, a saved profile's **Apply to sessions…** dialog lists the sessions, optionally switches all of them to a template, calls `POST /api/cv-profiles/apply`, and shows each session's outcome.

## Switching Profiles On A Session

`core/domain/cv/compose.ts` is the pure inverse of splitting. `composeCvMarkdown(skeleton, profile)` renders a `CvProfileProps` into a skeleton. The skeleton decides structure, and the profile supplies every personal value:

- The `#` name line keeps its attribute block (`{.cv-name}`). The first header line containing contacts becomes `location · contacts`. The first other header line becomes the headline, keeping its emphasis.
- Each `##` section keeps its heading text and position and is classified with the same patterns as extraction. Entry shape is inferred from the section body: Harvard table rows (first-cell emphasis and alignment row preserved), `###` headings with an emphasis metadata line, or flat lists and paragraphs, reusing the skeleton's list marker. Table cells escape `|`.
- Only the first section of each kind receives data. Sections without matching profile data, including `other` and duplicate kinds such as `Leadership & Activities` after `Experience`, are dropped. Their trailing directives and page breaks are kept.
- When the skeleton has no `Languages` section, languages render as a `**Languages:**` line inside skills. Profile kinds with no section are appended in the `###` layout before the final closing directive, and summary goes first. Pass `includeMissingSections: false` to disable this.
- Skeletons with `{{field}}` placeholders (for example, `pipeline-default`) are filled by name: `fullName`/`name`, `headline`, `location`, `summary`, `contacts`, and `content` (all sections).

Composition is total for a valid profile and deterministic. Composing a Harvard profile, re-deriving the skeleton with `toCvTemplateSkeleton`, and composing again gives the same Markdown, and extraction recovers the composed profile fields.

| Workflow | Core handler | Transport | Notes |
|---|---|---|---|
| Preview a profile | `ComposeCvProfile` query | `POST /api/cvs/:id/profile/preview` | Composes into `template` (id, optional version) if given, else into `toCvTemplateSkeleton(session.markdown)`. Uses template CSS or keeps session CSS. Writes nothing. |
| Re-snapshot an application | `UpdateCvApplicationProfile` command | — | Replaces the owner's `CvApplication` profile snapshot (ref `profileId` or the existing id, version = profile version) and re-pins the template when it changed, under an expected revision. Returns `null` when the document has no application for the owner. |
| Switch profile | `SwitchCvProfile` saga command | `PUT /api/cvs/:id/profile`, MCP `switch_cv_profile` | Body: `profile`, optional `profileId`, `template`, `expectedRevision`, `sourceId`. Returns `{ document, application, template? }`. |

Profiles stay unpersisted on the server. Callers send the profile payload, for example a browser-local profile from `/p`. The payload is normalized (missing collections become empty, unknown contact kinds become `other`), then validated. A blank `identity.fullName` is a 400 `Invalid profile`. Anonymous callers, and all MCP calls, can only compose into `public`-tagged templates. Other templates report `CV template not found`. Session documents have no owner scope yet, so the session variant is open like `PUT /api/cvs/:id`.

`SwitchCvProfile` is orchestrated by `runSaga` (`@ruxt/core` `saga.ts`, imported as `@core/saga`) through the mediator, because the document store and the application store cannot share a transaction:

1. `compose`: `GetCvDocument`, check `expectedRevision` (409 on mismatch), then `ComposeCvProfile` against that exact read. No side effects.
2. `document`: `SaveCvSource` with the composed Markdown/CSS under the read revision, published to SSE with the caller's `sourceId`. The compensation writes the previous Markdown/CSS back under the new revision with `sourceId` `<sourceId>:compensate`.
3. `application`: when the caller is authenticated, `UpdateCvApplicationProfile`. This is the final step, so it has no compensation.

On failure, completed steps are compensated in reverse. A `SagaError` keeps the failed step's message, so HTTP status mapping is unchanged, and lists `compensated` steps and `compensationFailures`. If a newer edit lands between the write and its compensation, the compensation's revision check fails. The newer edit wins, and the failure is reported rather than overwriting it.

The CV editor (`/?s=<id>`) has a `Current layout`/template picker and a `Switch profile…` picker next to the source tabs. Choosing a local profile calls `PUT /api/cvs/:id/profile` with the editor's revision and `sourceId`. The editor then adopts the returned document without re-saving it. Switching is refused while a local edit is unsaved.

## Current Gaps

- Lifecycle/history, validation, tailoring, resources/prompts, apply/rebase, and server PDF/image artifact rendering remain target contracts.
- Session splitting is heuristic. Layouts other than the Harvard table and pipeline heading shapes may mis-assign sections or leave fields empty, and the skeleton placeholder vocabulary is English-only.
- `SaveCvTemplate` authenticates the caller but does not scope templates by owner, so any authenticated user can override any `local` template.
- Import jobs/artifacts are durable and owner-scoped, but claiming is process-local and lacks an atomic multi-instance lease.
- Imported profile facts are versioned snapshots inside `CvApplication`; standalone profile saving is intentionally absent.
- The `SwitchCvProfile` saga is in-process with no durable saga log. A crash between the document write and the application snapshot leaves the application on the previous profile until the next switch. Composing into a session only reuses entry shapes of sections the current session still has, so a kind that was dropped for an earlier profile comes back in the default `###` layout rather than the original table layout.
- Current document storage has no owner/workspace scope, durable revision history, audit trail, or multi-instance concurrency control. Client-side version control is not implemented in this server slice.
- Current MCP transport is stateless and cannot retain workflow state or send unsolicited notifications across requests.
