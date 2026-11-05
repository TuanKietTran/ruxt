# Screens

This is the screen inventory every platform mirrors. Routes, layout, and states are current web behavior (`app/pages`, `app/layouts`) unless labelled Planned. A platform screen must present the same information architecture and the same states; it may not drop a state because a surface is read-only there.

## Global shell elements

Every screen carries: the route announcer for assistive tech, the shared dialog host, the toast host (success, error, and neutral tones), and a "Skip to content" link as the first focusable element in both layouts, targeting `#main-content`. The sign-in dialog is global in the editor shell and opens automatically when a screen requires an account (notably the Dashboard).

## Editor — `/`

Layout: editor shell, context `cv`. Content: session (document) sidebar, source editor with file tabs, preview pane, template picker.

- Empty: with no document open, the main area shows the template picker headed "Choose a starting point"; formatting tools and Export are disabled until a document exists.
- Loading: session list and template grid show skeleton placeholders announced as loading (`role="status"`, "Loading sessions" / "Loading templates").
- Save states: the document save status distinguishes saved, saving, conflict (HTTP 409 from the server copy), and offline; conflict and offline are shown, never silently overwritten.
- Export: the PDF export dialog reports busy with a progress line, an inline error on failure (for example when the preview is not ready), and a success message on completion.
- Auth: the editor works signed-out with local storage; account features prompt through the global sign-in dialog.

## Document link — `/e/:id`

A redirect, not a screen: a valid id replaces the route with `/?s=<id>` (HTTP 308) and opens that document in the editor; an invalid id is a 404 "CV document not found". While redirecting it shows only an sr-only "Opening CV document…" placeholder.

## Profiles — `/p`

Layout: editor shell, context `profiles`, public (usable signed-out). Content: profile list sidebar and a profile sheet with sections Identity, About, Contact information, Experience, Skills, Education, Projects, Certifications, Languages.

- Empty: with no profile selected, the sheet shows a placeholder prompting selection; an unsaved new profile appears as a draft row in the list, with a pending-changes bar above the identity section and a cancel-all action guarded by a confirmation dialog.
- Editing states: fields follow the profile save mode (see Themes and preferences): auto-save commits while typing and on blur, manual mode commits only on Save. Esc cancels an edit and restores the previous value. Field validation errors appear after the field is committed (touched), not while typing.
- The toolbar shows the current save mode with a link to Settings, in both the populated sheet and the placeholder.
- Dialogs: delete confirmation names the profile (name and headline); import/export transfer dialog validates inline (file size limit 5 MB, passphrase minimum length, passphrase confirmation match, "contains no profiles" on empty exports); the apply-to-sessions dialog requires at least one chosen session and reports a result per session.

## Sign in — `/login`

Layout: default layout. A single card toggles between "Create your account" and "Sign in to cv-sv", with a link back to the editor. The same flow is available as the global sign-in dialog; outcomes (success, failure) must be identical in both presentations.

## Dashboard — `/d`

Layout: default layout, account required. Content: subscription overview with a Subscriptions panel and provider information.

- Auth: signed-out visitors get the global sign-in dialog before content.
- Destructive flows (terminate a subscription record, cancel) run through confirmation dialogs; a failed cancellation opens a dedicated error dialog ("Cancellation failed") rather than only a toast.

## Providers — `/d/providers`

Layout: default layout, account required. A grouped list of providers, one section per group headed by the provider name. Same auth behavior as the Dashboard.

## Settings — `/settings`

Layout: default layout, public. Content: Preferences, including the Profile editor section (save mode field with Save and Cancel) and a Cloud data section linking onward.

- Error: a failed save keeps the entered value, sets an inline error ("The setting could not be saved." or the server message), and raises an error toast.
- Every field states its own commit keys (Enter, or Ctrl/⌘+Enter in long text, saves; Esc cancels).

## Cloud data — `/settings/cloud-data`

Layout: default layout, account required. Content: consent controls for cloud session recovery and cloud templates, with an explanation of what turning a feature off does.

- Loading: consent state loads asynchronously and the controls reflect the pending status rather than a guessed default.
- Error: a failed consent change shows the server message or "The consent change could not be saved.", plus an error toast; the control returns to its previous state.

## About — `/about`

Layout: default layout, public. A static explanation page with primary actions to open the editor and to review cloud data settings. It has no loading, empty, or error states.

## Admin screens

The admin app mirrors the same shell rules with its own screens: Overview (statistics cards and metric tables), Jobs, and Templates (list, new, and editor screens), behind its own sign-in screen. Admin states follow `specs/design/layout.md` (dense tables, muted empty placeholder, danger-colored errors). Template editing reuses the editor shell concepts (source and preview) at admin density.
