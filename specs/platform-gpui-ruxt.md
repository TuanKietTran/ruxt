# Desktop app (GPUI)

## Status and sources

This specification describes the planned native desktop app, `ruxt-desktop`. Nothing in this document is current behaviour: the app is not built yet, and every behaviour below is **Planned** unless a section says otherwise.

The navigation, screen, and state inventory is based on a read-only audit of the web app itself (`app/pages`, `app/layouts`, `app/components`, `app/composables`, and `app/assets/theme/themes.css`, including `ThemeSelect` and `useTheme`). No `specs/design/screens.md` exists, so the web app source is the audit source of record. Where desktop behaviour differs from the web, the difference is stated explicitly.

The desktop app is a thin GPUI shell over two shared crates: `ruxt-api`, a typed client for the existing HTTP API, and `ruxt-ui-kit`, the GPUI component and theme layer. It introduces no new server behaviour and mirrors the existing API contracts as they are.

## Scope

Planned, in scope:

- **Authentication.** Sign in, register, sign out, and current-user lookup against the existing auth endpoints. The server session is the `auth_session` cookie (seven days); there is no bearer token. The client keeps a cookie jar and maps the server error envelope to typed errors, preserving the status-mapped messages for 400, 404, 409, 413, and 500 responses.
- **Session and template lists.** A sidebar listing local CV sessions and the templates returned by the template endpoints (account templates when signed in, the public catalog when anonymous). Opening a template starts or previews a session in the same way the web editor does.
- **Markdown CV editor.** An editable Markdown source pane with a live preview, a source/preview split, and local autosave to a platform app-data file, with a visible dirty/saved state. Session titles stay independent of Markdown headings, as on the web.
- **Live preview.** Markdown is parsed once with pulldown-cmark and rendered to native elements. The same parse tree is reused for export, so preview and export share one layout model.
- **Template picker.** Browsing and selecting templates from the catalog, with the anonymous restriction to the public catalog preserved.
- **Profile.** A profile view backed by the current-user endpoint, showing the signed-in account; profile editing keeps the web semantics defined in the editor specification.
- **Settings.** Preferences read and written through the preferences endpoints when signed in and stored locally when signed out (the two stores stay independent, as on the web), plus desktop-only settings: theme, density, and the API base URL.
- **Import and applications.** CV import and application entries are reachable through the same endpoints the web app uses, with their existing states preserved.
- **PDF and export.** PDF is produced locally (see below), not by a server endpoint. Other document exports follow the web export behaviour where the format exists.
- **Offline and local-first use.** The app launches and remains usable with no reachable server: local sessions open, edit, autosave, preview, and export; account-backed views show their offline state instead of failing.

Out of scope:

- Administration. Analytics, jobs, and template administration belong to the separate admin app and its own sign-in; they are not part of this app.
- Plans, subscriptions, and IAM management surfaces. The API exposes them, but the desktop user app does not present them in v1.
- Cloud synchronisation of sessions or profiles beyond the existing consent-gated behaviour described in the cloud data specification.
- Honouring template CSS in the native preview or in PDF. Native rendering approximates template styling from the parse tree and design tokens; full CSS fidelity remains a web-only property.
- A public profile or CV page. None exists on the web, and the desktop app does not add one.

## PDF and export (Planned)

There is no server PDF option to mirror: the artifacts endpoint has no PDF kind, and web PDF export is a client-side print pipeline. Desktop PDF is therefore local: printpdf lays out the same pulldown-cmark parse tree used by the preview, producing real selectable text, A4 first (templates currently declare `pageFormats: ['A4']`). Until this is implemented, the export action must be shown as unavailable; it must never report a success that did not happen.

## Token consumption (Planned, provisional)

The design system owns a single JSON token source. That source has not landed on the integration branch for this app yet, so until it does:

- `ruxt-ui-kit` consumes the provisional token structure only, and that consumption is flagged provisional wherever it is recorded.
- The app crate contains no token copy and no hardcoded palette.
- When the real token file lands, the app rebases to it: the generator is re-run against the real file, the generated module is updated in the same change, and any provisional-only values are dropped. The rebase is a token change only; it must not require app code changes beyond regenerated values.

Once the real source is in place, consumption works as follows. A generator in `ruxt-ui-kit` (run from its build script or an explicit code generation step) reads the single JSON token file and produces a checked-in Rust theme module. Hand-editing the generated module is not allowed. Regenerating and confirming no difference (`git diff --exit-code` on the generated file) is part of verification for any change that touches tokens, the generator, or the theme module.

The token structure the generator consumes:

- **Themes:** `mocha` (dark), `latte` (light), and `opencode` (dark), each with a colour scheme flag and the same colour roles: background layers (`bgBase`, `bgMantle`, `bgCrust`, `bgSurface0-2`, `bgOverlay0-2`), foreground (`fgText`, `fgSubtext1`, `fgSubtext0`), `accent`, `accentHover`, `accentMuted`, `onAccent`, the named hues (pink, mauve, red, peach, yellow, green, teal, sky, sapphire), semantic roles (`warning`, `danger`, `success`, `info`), and `border` / `borderStrong`. These roles mirror the web CSS variables one to one.
- **Typography:** sans and mono families, a 16 px base size, weights 400-800, and a named scale from `caption` (11 px) through `body` (14 px) to `display` (40 px), each with line height and weight.
- **Spacing:** a 0-48 px scale (`none`, `xs` 4, `sm` 6, `md` 8, `lg` 12, `xl` 16, up to `6xl` 48).
- **Radius:** `none` 0, `sm` 6, `md` 10, `lg` 16, `full` 9999.
- **Elevation:** `none` through `xl` shadow definitions. Where the platform renderer cannot reproduce a shadow exactly, the nearest elevation step is used and the difference is accepted as a platform limitation, not restyled per view.
- **Motion:** durations `instant` 0, `fast` 150, `standard` 200, `emphasized` 280, `slow` 400, and `skeleton` 1200 ms, with standard, emphasized, and linear easing.
- **Focus ring:** 2 px solid ring in the `accent` role, offset by 2 px.
- **Density:** `comfortable` (scale 1, control height 36 px, row height 40 px) and `compact` (scale 0.875, control height 30 px, row height 32 px).
- **Breakpoints:** window classes `compact` (0-900 px), `medium` (901-1279 px), and `expanded` (1280 px and above), with named width values at 480, 640, and 900 px.
- **Icons:** the Lucide set, bundled at build time and never fetched at runtime, matching the web app's local icon rule.

## Themes, density, and layout (Planned)

### Theme switching

The user can switch theme at runtime, without restarting the app, between Latte (light), Mocha (dark), and OpenCode (dark) — the same three themes the web app offers through its theme select — plus a follow-system option that tracks the operating system's light/dark appearance and resolves to Latte or Mocha. Follow-system is desktop-only: the web app has no equivalent and stores an explicit theme (default Mocha) in local storage. On desktop the choice, including follow-system, persists across launches; an explicit choice survives until the user changes it.

Switching re-renders every view from the token values of the newly selected theme. No view keeps colours from the previous theme, and no view defines colours outside the token roles.

### Density

Density is user-selectable between comfortable and compact, applies at runtime without restart, and persists with the other desktop settings (locally, or through preferences where a preferences field fits). Density changes control height, row height, and the overall scale exactly as the density tokens define; it does not change font sizes independently of the typography scale and OS text scaling.

### Layout per window class

Layout follows the token window classes, measured on the app window width:

- **Expanded (1280 px and above):** three panes — sidebar (session/template list), editor, and live preview side by side, with a resizable source/preview split as in the web editor layout.
- **Medium (901-1279 px):** two panes — sidebar plus one main pane; editor and preview are toggled within the main pane rather than shown together.
- **Compact (0-900 px):** a single column. The sidebar becomes a dismissible overlay drawer, mirroring the web behaviour below 900 px, and editor and preview are toggled full-width.

### Navigation and information architecture

Navigation matches the web app, as audited: the editor is the home destination (a draft at the home route becomes a local session after editing, and a session opens by id); profiles and settings are top-level destinations alongside it; about and sign-in are secondary. Editor contexts remember their last route within the session, as the web workspace does. CV-only controls (formatting, export, page controls, document statistics) appear only in the CV context; the profile context reuses the same shell without them. The desktop app adds no destination that the web app does not have, and removes none.

### Keyboard shortcuts (Planned)

Standard editing shortcuts work as the platform expects (undo, redo, cut, copy, paste, select all, find). App shortcuts, using the platform primary modifier (Command on macOS, Control elsewhere):

- Primary+S: save the current session now (in addition to autosave).
- Primary+N: new session.
- Primary+O: focus the session/template list.
- Primary+P: toggle the preview (in medium and compact layouts, switch the main pane to the preview).
- Primary+Shift+T: open the template picker.
- Escape: close the topmost dialog or the sidebar drawer.
- Tab / Shift+Tab: move focus in the logical order; arrow keys move within lists.

Theme and density are settings, not shortcuts.

## Accessibility (Planned)

- Focus moves in a logical order that matches the visual layout in every window class, is always visible using the token focus ring, and returns to the invoking control when a dialog closes.
- Text and control contrast comes from the token colour roles, which are held to WCAG AA (4.5:1 for normal text, 3:1 for large text) in every theme; no view introduces ad-hoc colours below that bar.
- OS text scaling is respected: text sizes derive from the typography scale multiplied by the system factor where the platform exposes it; where GPUI does not expose it, that limitation is stated in the app rather than silently ignored.
- Reduced motion is respected: when the OS requests it, animation durations collapse toward zero, following the token reduced-motion rule; where the platform does not expose the setting, animations stay within the token durations and no essential information is carried by motion alone.
- Every control has an accessible label, matching the web rule for icon-only controls.

## States (Planned)

Every data view defines all four states; a single global banner is not a substitute.

- **Sessions/templates list:** loading shows placeholder rows using the skeleton motion token; empty shows an explicit no-sessions or no-templates message with the create/import action; error shows the failure with a retry action; offline shows the locally stored sessions in full and marks account templates as unavailable until connection returns.
- **Editor:** autosave state is always visible and, as on the web, says explicitly that saving is local; a storage failure keeps edits in memory and offers a retry action.
- **Preview:** an empty document shows an empty-preview state rather than a blank pane; a parse or render failure shows the error in place of the preview and leaves the source editable.
- **Profile:** signed-out shows the sign-in state; loading, error, and offline states each render in place, with offline keeping the last known profile read-only and marked stale.
- **Settings:** preferences that cannot be loaded show an error with retry and never overwrite server values with defaults; offline edits are kept locally and marked unsynced.
- **Sign-in:** connection failure is reported as a connection error in the dialog; the rest of the app, including local editing, stays usable.

## Build prerequisites

GPUI is pinned at 0.2.2 from crates.io; no git dependency is used. Per operating system:

- **macOS:** full Xcode plus the Metal Toolchain component. Without it, building any GPUI crate fails with `cannot execute tool 'metal'` while compiling GPU shaders. This is an environment prerequisite, not a code defect. Install it with `xcodebuild -downloadComponent MetalToolchain`. Command-line tools alone are not enough. Non-GPUI crates (for example the API client) build without it.
- **Windows:** the MSVC Rust toolchain; the Win32 backend is in-crate. Not yet verified on a Windows host.
- **Linux:** the X11 or Wayland backend, with the usual system development packages for xkbcommon, Wayland, and fontconfig/freetype. Not yet verified on a Linux host; verification belongs to continuous integration on a Linux runner.

Keeping the UI kit feature-gated so the API client checks cleanly on machines without the macOS Metal Toolchain or Linux GUI dependencies is part of the workspace design.
