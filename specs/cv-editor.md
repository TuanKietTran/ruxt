# CV editor

## Layout and routes

app/layouts/editor.vue owns the header, activity bar, sidebar, source/preview split, resize controls, status, and print layout. Registered editor contexts select features and remember their last route. Other tools reuse workspace/sidebar slots rather than duplicating the shell.

The CV context provides formatting, export, import, templates, and document statistics. The public /p profile editor uses the same shell without CV-specific controls. Below 900 px, the sidebar becomes a dismissible drawer.

A draft at / becomes a local session after editing; /?s=<id> opens it. Session titles remain independent of Markdown headings and route ids. /?t=<id>&v=<version> previews a template; anonymous selection is restricted to the public catalog.

## Local profiles and preferences

Profiles use cv-sv:local-profiles:v1 and the shared CvProfileProps schema. Older partial records receive missing fields. Fields support auto-save or manual Save/Cancel according to profileSaveMode; incomplete required entries remain visibly unsaved. Switching profiles must preserve or explicitly discard dirty edits.

Profile transfer encrypts normalized data client-side with AES-256-GCM and a PBKDF2-SHA256 key, 310,000 iterations, random salt/IV, and an authenticated version header. Import/export does not upload profiles.

Preferences use local storage while signed out and authenticated /api/preferences while signed in. Stores are independent; signing in does not upload browser preferences. Preferences do not require CV cloud consent.

## Source and preview

The installed @ruxt/editor layer provides CodeMirror and CodePreview. Markdown/CSS language compartments reset undo history when switching tabs. External model updates do not enter undo history; formatting is enabled only in Markdown mode.

Markdown uses remark/GFM/directives, rehype sanitization, and HTML serialization. CSS is assigned through textContent, selectors are scoped to .cv-preview-scope, and unscopable global at-rules are removed. User CSS may still load remote resources.

A4 sheets support explicit breaks and pagination, zoom from 25–200%, and fit-to-viewport. Preview zoom does not affect printed size. See [local sessions](cv-documents-realtime.md) for persistence.

## Export and accessibility

PDF uses browser print after closing the export dialog. Print rules hide editor chrome and render at 100%.

PNG/JPEG export waits for fonts, captures only the active preview sheets at the chosen scale/quality, restores zoom after errors, and downloads one image or a multi-page ZIP. Other document exports use app/utils/exportCvDocument.ts.

Lucide icons are bundled locally through AppIcon; runtime icon API fallback is disabled. Controls have accessible labels, keyboard resize/navigation, and reduced-motion support. Themes are Mocha, Latte, and OpenCode.

## Workspace shell and local save status

Shared workspace navigation uses the editor and profiles destinations and no longer adds a legacy Ruxt/Dashboard header or internal `app:*` status label. Navigation remembers each editor context's last route within the tab. CV-only formatting, export, page, and document statistics remain gated by the registered CV context; profile editing does not present CV document status.

Session save status is explicitly local: saving/saved states say they are local, storage failures keep edits in memory and announce automatic retry. The editor layout exposes an explicit retry action for views that supply a local retry handler. Preferences remain local when signed out and should fit a 390px viewport without horizontal document overflow. Creating a profile opens Full name for keyboard input; incomplete required data remains unsaved and the configured auto/manual save mode is preserved.

## Limitations

Remote assets depend on browser CORS/canvas behavior. Export and responsive coverage is incomplete. Source CSS cannot be treated as a network sandbox.
