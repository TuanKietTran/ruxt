# CV Editor

Last updated: main@d1ae665 | 2026-09-13

## Scope

This spec covers:

- the query-driven editor page `app/pages/index.vue` and persisted-session component `app/components/CvSessionEditor.vue`;
- `app/layouts/editor.vue`;
- `app/components/CodePreview.vue` and `app/components/CodeMirror.vue`;
- local profile management at `app/pages/profiles.vue` (served at `/p`), consuming `CvProfileProps` from `@core/domain/cv`;
- `app/composables/useCodeMirror.ts` and the browser-facing parts of `useCvDocument.ts`;
- seed assets in `app/data/reference-cv.{md,css}`;
- themes in `app/assets/theme/themes.css`, `useTheme.ts`, and `theme.client.ts`;
- image export in `app/utils/exportCvImage.ts` and browser print behavior.

Document persistence and synchronization are specified in [cv-documents-realtime.md](cv-documents-realtime.md). Standalone headless PDF automation belongs to [mcp-automation.md](mcp-automation.md).

## Editor Routes And Ownership

`/` is an unpersisted placeholder session, analogous to a new-chat route. It starts with placeholder Markdown and reference CSS but does not call the document API or appear in Sessions. After the first source edit settles for 450 ms, the page creates exactly one document with a random UUID through `POST /api/cvs`, refreshes the sidebar, and replaces the route with `/?s=<uuid>`; ids never derive from the CV title. Edits arriving during creation are reconciled before navigation, client registration is single-flight, and repository creation rejects an improbable duplicate id. The `s` query parameter opens the persisted session. New and forked session ids are UUID route identifiers while sidebar and editor-header labels come from the independent persisted `title` field; after rename, the refreshed session index updates both labels without changing the Markdown heading. New drafts start as **Untitled CV**, never as the hash. Legacy title-slug records are soft-migrated to deterministic hashed route ids and old `s=<slug>` requests resolve and replace-navigate to the hashed query value. Both pages disable the default layout and provide source tabs, editor content, and preview content to `app/layouts/editor.vue`.

The editor layout owns the full-window shell, source/preview split, pointer and keyboard resizing, toolbar, activity bar, document/template sidebar, status bar, responsive behavior, and print-only layout. Products that share the layout are registered editor contexts (`app/utils/editorContexts.ts`, built-ins registered by `app/plugins/editor-contexts.ts`): each declares an id, activity-bar label and icon, a home route, and the layout features it uses (listed below). A page selects its context with `definePageMeta({ editorContext })` (default `cv`); the layout renders the activity bar from the registry, remembers the last route per context in session storage (`cv-sv:last-route:<id>`), and shows header and status-bar features only when the active context declares them, so it never branches on route paths (enforced by `pnpm lint`). A page that fills the `workspace` slot gets the whole workspace area instead of the source/preview split. Below 900px the layout turns the sidebar (default or slotted) into an overlay drawer opened from the header's sidebar button and closed by the backdrop, Esc, navigation, or choosing a link or button inside it, so pages never build their own narrow-screen navigation. Features are `formatting`, `export`, `import`, `templates` (the read-only `?t=` template viewer), and `documentStats` (save state, revision, and document stats in the status bar). The CV context declares every feature; the `profiles` context at the explicitly unauthenticated `/p` route declares none, so it has no formatting toolbar, CV Export, Import, or document stats; profile export lives in the page itself. It uses the editor layout's `workspace` slot and replaces the Sessions/Templates sidebar with its profile list through the `sidebar` slot rather than introducing a separate shell and provides local-only CRUD for the complete shared `CvProfileProps` shape: identity, contacts, experience, skills, certifications, education, projects, and languages. Records use browser-local storage under `cv-sv:local-profiles:v1`; legacy reduced records are hydrated with missing canonical fields instead of discarded. Selecting a profile clones its raw Vue value before editing so nested reactive proxies cannot cause `structuredClone` to fail and leave an empty form; saving clones the raw draft for the same reason. There is no form-wide Save button. Every field is click-to-edit (`app/components/EditableField.vue`): it reads like the CV (highlights as bullets, skills and technologies as chips, empty optional fields collapsed to a small "＋ label" button) until clicked or activated with Enter/Space. What happens while editing follows the `profileSaveMode` preference: `auto` (default) commits while typing (700 ms debounce), on leaving the field, and on `pagehide`, with Esc restoring the value from before the edit; `manual` shows Save/Cancel, saves on Enter (Ctrl/⌘+Enter in multi-line fields), cancels on Esc, keeps unsaved edits open when focus leaves, counts them in the toolbar, warns before unload, and asks before switching profiles. Each committed field shows a transient saved mark or an inline required-field error. A new profile is first stored once it has a full name; entries missing a required field (contact value, job title and company, skill group name, certification, institution, project name) stay in the form marked as not saved until completed. Fields grow with their content instead of clipping it, the form lays out by its own width through container queries, and below 900px the profile list is reached through the layout's sidebar drawer like any other context.

Editor preferences live at the public `/settings` page (linked from the activity bar and the default header). `usePreferences()` keeps them in localStorage under `cv-sv:preferences:v1` for signed-out visitors and hosts without the authenticated feature, and in the account through authenticated `GET/PUT /api/preferences` once signed in (`core/domain/preferences`, owner-keyed `user_preferences` SQLite table or `["user_preferences", ownerId]` Deno KV record). The stores are independent: signing in never uploads the browser copy. Preferences are settings, not CV data, so they need no cloud-data consent. `PUT` takes a partial `{ preferences }` object; unknown keys and invalid values are a 400. Profiles move between browsers through passphrase-encrypted transfer (`app/utils/profileTransfer.ts`): the sidebar offers Import and Export all, and a saved profile's form offers Copy encrypted and Export. Payloads are normalized `CvProfileProps` encrypted client-side with AES-256-GCM under a PBKDF2-SHA256 key (310k iterations, random salt and IV per export, versioned header bound as additional data). Files download as `<name>.cvsv` JSON envelopes; the clipboard carries the same envelope as a single-line `cvsv-profile:` token, and import accepts either form from a file or a paste. Passphrases must be at least 8 characters and never leave the browser; imports always append with fresh ids and never overwrite existing profiles. The CV editor's profile picker labels entries with name and headline so imported copies stay distinguishable. The CV editor can also detect the profile inside the session, highlight it in the source, and save it to a new or existing local profile, and a saved profile can be applied to any selection of sessions from `/p` (see `cv-server-workflows.md`). Local profile storage is shared through `app/utils/localProfiles.ts`. The source editor (`@ruxt/editor`) accepts host `highlights` (ranges that follow edits until replaced) and exposes `revealRange` to select and scroll to a range. Its Templates section uses `/api/public/templates` anonymously and the full `/api/cv-templates` catalog with a session. Selecting a template navigates to `/?t=<id>&v=<version>` and reuses the exact editor/preview split: `content.md` and `style.css` are visible in CodeMirror read-only mode, the rendered preview is also non-interactive, formatting is disabled, and the current CV is never mutated. Editing a cloned template is intentionally deferred. Pages own active Markdown/CSS tab state and export invocation.

A public template offers **Clone to local**. `POST /api/cv-templates/:id/clone` creates immutable version 1 with a unique id, `builtIn: false`, and persisted `tags: ["local"]`; the catalog refreshes and continues displaying the clone read-only.

The Sessions header `+` navigates to `/` without creating a record. On an already-unpersisted `/` draft it resets the placeholder unless registration is already in flight. Only a source edit registers the session, so abandoned placeholders never pollute the sidebar and `master` is never cleared or overwritten.

The split starts at 46%. Pointer resizing attempts to retain a minimum pane width; keyboard resizing clamps source width to 30–70%, and double-click resets it. The document sidebar can be collapsed and resized from 160–420px by pointer or keyboard; its open state and width persist in local storage. At widths below 900px the document sidebar is hidden; below 760px the preview and divider are hidden.

## Blob Import UI

The editor header exposes **Import** on CV/template routes. `app/components/CvImportDialog.vue` accepts one PDF, PNG, JPEG, WebP, TIFF, or BMP blob by picker or drag-and-drop, applies the lower of the server capability and 5 MB client limit, selects a public structure template, and posts multipart bytes to authenticated `POST /api/cv-imports`. That route persists the source artifact and immediately triggers the CV pipeline worker.

The dialog polls job state/progress, exposes warnings and extraction failures, supports cancellation/retry, and retrieves the generated Markdown/CSS preview after success. **Create CV and imported profile** commits with a random document UUID, producing both the template-built editable document and the structured profile snapshot inside its CV application; the sidebar refreshes and navigation moves to `/?s=<id>`. Closing before commit leaves the current document unchanged.

## Markdown Indicators And Style Isolation

CV Markdown supports the same trailing attribute indicators as `cv-editor`, including `# Name {.cv-name}`, and fenced directives such as `:::contacts`. The sanitized rendered element receives the declared class/id while the indicator remains visible in Markdown source. CodeMirror decorates both trailing `{.class}`/`{#id}` attributes and opening/closing `:::` directive markers. The `{·}` control responds independently in session and read-only template views, hiding or showing those decorated source markers without changing line content, persisted Markdown, or rendered class behavior. Hidden markers use CSS visibility rather than removal from layout, preserving CodeMirror line height and continuous, evenly aligned gutter numbers for directive-only lines.

Template styles target classes supplied explicitly by Markdown indicators, not private client mount classes such as `.cv-sheet` or `.cv-preview-scope`. For example, each reference page is wrapped in the visible `:::resume` directive, its name carries `{.cv-name}`, and `style.css` targets `.resume` and `.cv-name`. `.cv-sheet` remains an application-owned pagination/export hook only. On first read/list, persisted sessions whose CSS still targets `.cv-sheet` or the intermediate `.cv-document` contract are soft-migrated: each Markdown page gains `:::resume`, its first heading gains `{.cv-name}`, CSS selectors move to those indicator classes, unscoped legacy print rules are removed, and the document revision advances. Custom sources without a legacy selector remain byte-for-byte unchanged.

As a second isolation boundary, each preview stylesheet is rewritten through PostCSS so every selector is rooted at `.cv-preview-scope`; `html`, `body`, and `:root` selectors are mapped to that preview root. Global-only imports, namespaces, page/property registrations, font/counter definitions, keyframes, and cascade layers are discarded because they cannot be safely scoped to a DOM subtree. Template CSS therefore cannot style the editor shell or survive visually when switching templates.

## Edit, Autosave, And Realtime Sequence

```mermaid
sequenceDiagram
    actor User
    participant CM as CodeMirror
    participant Page as Editor page
    participant Doc as useCvDocument
    participant API as PUT /api/cvs/:id
    participant Store as Nitro CV storage
    participant SSE as CV event publisher
    participant Peer as Other browser editor

    User->>CM: Edit Markdown or CSS
    CM->>Page: Emit complete source with v-model
    Page->>Doc: Update markdown/css ref
    Doc->>Doc: Mark dirty and debounce 450 ms
    Doc->>API: PUT fields, sourceId, expectedRevision
    API->>Store: Validate revision and persist
    Store-->>API: Updated document and revision
    API->>SSE: Publish cv:update
    API-->>Doc: Return updated document
    Doc->>Doc: Mark saved or keep saving if source changed again
    SSE-->>Peer: Deliver committed update
    Peer->>Peer: Apply only if clean and revision is newer
```

Conflict responses set the originating editor to `conflict`; transport failures set it to `offline`.

## Source Editing

`CodeMirror` is a controlled `v-model` wrapper over `useCodeMirror()`. The composable owns the editor lifecycle and installs line numbers, history, standard/history keymaps, active-line highlighting, bracket matching, indentation, wrapping, the One Dark theme, and a transparent container theme.

CodeMirror `Compartment`s switch Markdown/CSS language support and reset history without recreating the editor. Markdown enables language data for fenced code and adds larger heading highlighting. External model/tab changes replace the complete CodeMirror document only when the text differs and are explicitly excluded from undo history. Switching tabs resets the history compartment, so Cmd/Ctrl+Z can never restore Markdown into `style.css` or CSS into `content.md`; CodeMirror document changes emit the complete active source string back to Vue. In Markdown mode, toolbar commands wrap selections as bold, italic, link, or inline code and prefix selected lines as headings, quotes, or bullet items. Formatting controls are disabled in CSS mode.

## Markdown And CSS Rendering

`CodePreview` runs Markdown synchronously through `remark-parse`, GFM, directive and attribute-indicator handling, `remark-rehype`, `rehype-sanitize`, and `rehype-stringify`. The sanitizer uses its default schema plus indicator-generated `className` and `id` attributes. Sanitized HTML is the only value passed to `v-html`.

The scoped document stylesheet is assigned to a `<style>` element through `textContent`, not HTML interpolation. CSS remains intentionally user-controlled presentation input, but its selectors are prefixed and its unscopable global at-rules are removed before mounting.

Pagination occurs after Markdown rendering: generated `<hr>` elements split the sanitized HTML into separate `.cv-sheet` articles, and empty segments are discarded. The reference stylesheet sizes sheets as A4 and uses print page breaks between adjacent sheets. Preview controls zoom from 25–200%, reset to 100%, or fit one sheet to the available viewport. Fit mode responds to viewport resizing, the page indicator tracks rendered sheets, and print always renders at 100%.

## Export

The PDF toolbar action closes its dialog, waits for Vue to remove the overlay, and then calls `window.print()`. Application-owned A4 `@page` and print-media rules hide editor chrome, reset preview zoom, and expose only the active preview sheets; final destination and PDF generation are browser-owned.

PNG/JPEG export calls `exportCvImages()`:

- waits for `document.fonts.ready` when available;
- receives the active preview root from the editor layout and finds `.cv-sheet` pages only inside it, preventing another document/template preview from being exported;
- temporarily resets the preview-only zoom to 100%, lazy-loads `html2canvas`, renders each sheet at the selected 1–3× scale on white, and restores the UI zoom even after failure;
- encodes PNG or JPEG at the selected quality and scale;
- downloads one image for a single sheet, or one ZIP containing `{base}-page-N` images for multiple sheets;
- sanitizes the requested base filename.

Image export throws if no sheets exist or encoding fails. Remote assets depend on browser canvas/CORS behavior.

```mermaid
sequenceDiagram
    actor User
    participant Header as Editor header
    participant Browser as Browser print pipeline
    participant Export as exportCvImages
    participant DOM as Rendered .cv-sheet pages

    alt Export PDF
        User->>Header: Choose PDF
        Header->>Browser: window.print()
        Browser->>DOM: Apply print media layout at 100%
        Browser-->>User: Print/save dialog
    else Export PNG or JPEG
        User->>Header: Choose image format
        Header->>Export: exportCvImages(format, name, css)
        Export->>DOM: Find sheets and wait for fonts
        loop Every sheet
            Export->>DOM: Render at 2x with html2canvas
            Export-->>User: Download encoded image
        end
    end
```

## Themes And Accessibility

The application defines Catppuccin Mocha, Catppuccin Latte, and OpenCode token sets. `useTheme()` applies `data-theme` to the root element and stores the id in `localStorage`; the client plugin restores it, defaulting to Mocha.

The editor labels its main regions and icon controls, exposes the divider as a keyboard-focusable separator, and globally reduces animation for `prefers-reduced-motion`. Preview pages receive numbered `aria-label` values.

## Current Gaps

- The A4 status indicator is static; there is no alternate page-size UI. (The former Split, create/refresh, help, line/column, and word-count gaps were closed on 2026-09-23: Split was removed, create/refresh and the document tree are layout-owned, Help routes to `/about`, and line/column plus word count come from the CodeMirror stats channel.)
- Scoped document CSS can still initiate external resource loads from declarations such as `background-image: url(...)`.
- Image export has no progress/error UI.
- There is no visual regression or browser export coverage.
