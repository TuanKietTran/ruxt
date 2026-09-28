# CV-SV UI validation

**Date:** 2026-09-13

## Scope and method

This validation used the extension's registered tools directly. Agent handlers controlled a real Brave page.

Each state-changing action was followed by a selector/state assertion or a new observation. Editor formatting was tested with the temporary text `Sample`; the canonical Markdown and CSS were restored after the run. Screenshots were also visually inspected to confirm that the source editor, preview, sidebars, toolbars, and status bar rendered without overlap at 1280 × 720.

The development server already on port 3000 remains unusable for this test: it returns HTTP 500 while two stale Nuxt development process trees are present. The production output itself ran without server errors.

## Result summary

The dedicated check column uses `[x]` only for behavior that was exercised and fully verified as working; all other rows remain `[ ]`.

- **Working:** editor input and live preview, all seven Markdown formatting actions, source tabs, all three themes, sidebar toggle, keyboard and pointer-drag resize/reset for both dividers, all four zoom controls, PNG/JPEG downloads, page count, save/revision feedback, and sign-in navigation.
- **Not working:** nothing outstanding. The 2026-09-23 re-check confirmed every previously failing control now works: the Split button was removed, the activity buttons are real routed links, create/refresh are wired to layout handlers, the document tree is bound to `/api/cvs` and `/api/cv-templates`, the formatting select resets to `More`, Help routes to `/about`, and cursor position and word count track CodeMirror.
- **Partially verified:** PDF export trigger, internal-pane scrolling, external CV links, and responsive layouts.

## Detailed UI results

### Header and editor tools

| UI | Check | Status | What was tested and observed |
|---|:---:|---|---|
| Toggle document sidebar | [x] | **Working** | Clicking changed `aria-expanded` from `true` to `false`, hid the sidebar/divider, and a second click restored them with `aria-expanded="true"`. |
| Bold | [x] | **Working** | Selecting `Sample` and clicking Bold changed the editor source to `**Sample**`. Undo restored `Sample`. |
| Italic | [x] | **Working** | Changed selected text to `_Sample_`; undo worked. |
| Insert link | [x] | **Working** | Changed selected text to `[Sample](url)`; undo worked. |
| Heading | [x] | **Working** | Selecting `heading` changed the line to `## Sample`; undo worked. |
| Quote | [x] | **Working** | Selecting `quote` changed the line to `> Sample`; undo worked. |
| Bullet list | [x] | **Working** | Selecting `bullet` changed the line to `- Sample`; undo worked. |
| Inline code | [x] | **Working** | Selecting `code` changed the selection to `` `Sample` ``; undo worked. |
| More-formatting neutral state | [x] | **Working** | `formatFromSelect` emits the format and then clears `select.value`, so the combobox returns to the disabled `More` placeholder after every use. |
| Theme: Catppuccin Latte | [x] | **Working** | Selecting `latte` set `html[data-theme="latte"]`; the light palette appeared. |
| Theme: OpenCode | [x] | **Working** | Selecting `opencode` set `html[data-theme="opencode"]`. |
| Theme: Catppuccin Mocha | [x] | **Working** | Selecting `mocha` set `html[data-theme="mocha"]`; the original dark palette returned. |
| Split | [x] | **Removed** | The dead button no longer exists; the layout owns the source/preview split and exposes it through the resizable divider instead. |
| PNG | [x] | **Working** | With `expect_download: true`, the extension captured two download events and returned filenames, blob URLs, local paths, and empty failure states. Both files existed and had valid PNG signatures; page 1 was 642,597 bytes and page 2 was 697,258 bytes. |
| JPEG | [x] | **Working** | The extension captured two `.jpg` downloads with complete metadata. Both files existed and had valid JPEG start/end signatures; page 1 was 659,992 bytes and page 2 was 774,527 bytes. |
| PDF | [x] | **Partially verified** | Clicking called `window.print()` and returned in headless Brave. A native print dialog or generated PDF cannot be observed through this extension, so final output was not verified. |

### Navigation and document sidebar

| UI | Check | Status | What was tested and observed |
|---|:---:|---|---|
| Documents activity button | [x] | **Working** | The activity bar now holds two `NuxtLink` entries (CV editor and Profile editor) that navigate to the remembered CV/profile route and mark the active one. |
| Create document — activity bar | [x] | **Working** | `createSession` clears the selected template, emits `createDocument`, and navigates to `/`; the index page listens and resets the draft. |
| Create document — sidebar header | [x] | **Working** | The sidebar `＋` calls the same `createSession` handler. |
| Refresh documents | [x] | **Working** | `refreshDocuments` re-runs the `/api/cvs` fetch through `reloadCvDocuments` before emitting, so the tree refreshes from the layout itself. |
| Help | [x] | **Working** | The activity-bar `?` is a `NuxtLink` to `/about`, the product overview page. |
| Sign in | [x] | **Working** | The unauthenticated `Sign in` link navigated to `/login`, where the login form was present. |
| Document tree | [x] | **Working** | Sessions come from `/api/cvs` and templates from `/api/cv-templates` (or `/api/public/templates` anonymously), with revision labels, active-route highlighting, and a context menu for rename/fork/delete. |
| Sidebar keyboard resize | [x] | **Working** | Focusing the separator and pressing ArrowRight changed `aria-valuenow` from 232 to 248. Double-click reset it to 232. |
| Sidebar pointer resize | [x] | **Working** | `web_ui_act` dragged the separator 80 px right using 12 pointer-move steps. Its observed x-position changed from 278 to 361, and double-click reset remained functional. |

### Source editor and preview

| UI | Check | Status | What was tested and observed |
|---|:---:|---|---|
| `content.md` tab | [x] | **Working** | Clicking selected the tab and enabled the Markdown formatting controls. |
| `style.css` tab | [x] | **Working** | Clicking selected the tab, displayed CSS source, and disabled Bold, Italic, Insert link, and More formatting as expected. |
| Direct source editing | [x] | **Working** | Filling the CodeMirror content with `Sample` updated the editor immediately. |
| Live preview | [x] | **Working** | After the edit, `.cv-sheet` displayed `Sample` without a reload. The screenshot showed the same content in source and preview. |
| Document title | [x] | **Working** | With the reference Markdown, the browser title was `Trần Hà Tuấn Kiệt — CV`; when no level-one heading was present, it fell back to `CV`. |
| Editor/preview keyboard resize | [x] | **Working** | ArrowRight changed the separator's `aria-valuenow` from 46 to 48. Double-click reset it to 46. |
| Editor/preview pointer resize | [x] | **Working** | The new `web_ui_act` drag action moved the separator 100 px right using 12 pointer-move steps. Its observed x-position changed from 742 to 844, proving that the app handled the real pointer-down/move/up sequence. Double-click then reset the split. |
| Zoom in | [x] | **Working** | Changed the displayed zoom from 100% to 110%. |
| Zoom out | [x] | **Working** | From 110%, changed the displayed zoom back to 100%. |
| Reset zoom | [x] | **Working** | After zooming to 110%, clicking the percentage restored 100%. |
| Fit | [x] | **Working** | Clicking Fit set `aria-pressed="true"` and calculated a fitted scale. Clicking Reset zoom exited fit mode and restored 100%. |
| Preview page count | [x] | **Working** | The toolbar and status bar both reported `1 page` for the tested document. The count is backed by a mutation observer. |
| Preview rendering at 1280 × 720 | [x] | **Working** | The page canvas rendered cleanly with no header/sidebar/editor overlap. The preview is intentionally clipped vertically and uses its own scroll container. |
| Preview/internal scrolling | [ ] | **Not tested through the extension** | `web_ui_act` scrolls the browser viewport, while CV-SV scrolls `.source-editor` and `.preview-canvas` internally. The extension cannot currently target a particular scroll container. |
| Visible CV links | [ ] | **Rendered; navigation not tested** | Mail and LinkedIn links were visible and appeared in the interactive map. They were not opened to avoid leaving the target or invoking an external application/site. |

### Status bar

| UI | Check | Status | What was tested and observed |
|---|:---:|---|---|
| Save state | [x] | **Working** | After editing, the state progressed back to `saved`. |
| Revision | [x] | **Working** | The displayed revision increased after persisted edits. |
| Page count | [x] | **Working** | Matched the preview toolbar's `1 page`. |
| Cursor position (`Ln 1, Col 1`) | [x] | **Working** | `useCodeMirror` reports line/column on every `docChanged` or `selectionSet` update through `onStatsChange`; the layout renders it. Verified live on `/?s=<id>`: click moved it to `Ln 4, Col 19`, typing to `Ln 4, Col 30`, two ArrowLeft presses to `Ln 4, Col 28`, and Enter to `Ln 5, Col 2` on both dev and the production build. |
| Word count (`0 words`) | [x] | **Working** | The same stats channel counts whitespace-delimited tokens in the active document and singularizes at one word. Verified live: `8 words` on a fresh draft, `11 words` after typing, and `271 words` after switching to the `style.css` tab. |
| A4 indicator | [ ] | **Static but accurate for this template** | It is hard-coded to `A4`; no alternate page-size UI exists. |
| Context label | [ ] | **Working as a derived label** | It displayed `app:cv` for the fallback title and derives from the editor title. It is informational, not interactive. |

## Extension validation

| Area | Check | Result | Evidence |
|---|:---:|---|---|
| Extension load | [x] | **Working** | All four tools registered: `web_ui_pages`, `web_ui_open`, `web_ui_observe`, and `web_ui_act`. |
| Browser launch/navigation | [x] | **Working** | The extension launched headless Brave and loaded the production UI. |
| Vision payload | [x] | **Working** | Every observation returned a text element map and a native `image/png` item. |
| Element references/selectors | [x] | **Working** | Role/name, text, CSS selectors, and observed references resolved against the real page. |
| Post-action observation | [x] | **Working** | Fresh observations supplied updated states and screenshots. |
| Pointer drag action | [x] | **Working** | `web_ui_act` now accepts `action: "drag"`, resolves a source element or coordinate, and moves to either absolute `target_x`/`target_y` coordinates or relative `delta_x`/`delta_y` distances. Real CV-SV divider drags passed. |
| Download capture | [x] | **Working** | Setting `expect_download: true` waits for the browser download event and returns artifact count, suggested filename, source URL, temporary local path, and failure state. Two-page PNG and JPEG exports were captured and validated. |
| Tab management | [x] | **Working** | Earlier validation created `/about` as `p2`, reselected `p1`, and closed `p2`. |
| URL restriction | [x] | **Working** | Earlier validation rejected `file:///etc/passwd`; only HTTP(S) and `about:blank` are accepted. |
| Static type check | [x] | **Working** | `npm run check` completed successfully on 2026-09-13. |

## Environment limitations

| Area | Check | Finding | Follow-up |
|---|:---:|---|---|
| CV-SV dev server on port 3000 | [x] | **Working** as of 2026-09-23 — `http://localhost:3000/` returns HTTP 200 and the editor loads with no page or console errors. | None; the earlier HTTP 500 is stale. |
| Download verification | [x] | **Supported and verified**. | `web_ui_act` now captures expected downloads and returns artifact metadata. Both two-page PNG and JPEG exports passed filename, existence, nonzero-size, and binary-signature checks. |
| Print verification | [ ] | **Not supported in headless interaction**. | Add a PDF-generation test or a print-specific Playwright harness. |
| Container scrolling | [ ] | **Not supported by the extension's scroll action**. | Add `ref`/`selector` targeting to the scroll action. |
| Pointer drag | [x] | **Supported and verified**. | Added source-element/source-coordinate resolution, absolute or relative destinations, configurable movement steps, and guaranteed mouse-up cleanup. Both CV-SV dividers passed. |
| Responsive layouts | [ ] | **Not tested** because the extension has no viewport-resize action. | Add viewport sizing and test the 900 px, 760 px, and 560 px breakpoints. |
| Authenticated controls | [ ] | **Not tested**. | Validate sign-out and authenticated document behavior with a dedicated test account/profile. |

## Extension fixes retained from the earlier validation

1. Excluded 1 × 1 hidden status elements from the interactive-element map; the CV UI map begins with a visible button.
2. Corrected `web_ui_pages new` for extension-owned browsers by using `browser.newPage()`.
3. Added `web_ui_act({ action: "drag" })` with element or coordinate sources, absolute or relative destinations, configurable steps, coordinate-pair validation, and mouse-up cleanup.
4. Added `expect_download` handling to `web_ui_act`, including event waiting, multi-download capture, suggested filenames, source URLs, temporary local paths, and failure metadata.

## Reproduction

```bash
cd /Users/handlerone/Downloads/cv-sv
PORT=3011 HOST=127.0.0.1 node .output/server/index.mjs

cd /Users/handlerone/Downloads/pi-web-ui-vision
PI_WEB_UI_URL=http://127.0.0.1:3011 PI_WEB_UI_HEADLESS=true \
  pi -e /Users/handlerone/Downloads/pi-web-ui-vision
```

Then run `web_ui_observe`, act on an observed reference or accessible role/name, and observe again after each state change.
