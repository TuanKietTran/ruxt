# Accessibility

These rules apply on every platform. Where a platform mechanism differs (screen reader, focus system), the observable behavior must match.

## Focus

- Focus order must follow the visual and reading order of the screen. The first focusable element in both web layouts is the "Skip to content" link; it is visually hidden until focused and moves focus to the main content (`#main-content`). Every platform must provide an equivalent skip mechanism that bypasses navigation and toolbars.
- The focus ring is a token (`focusRing`): a 2px solid outline in the `accent` role with a 2px offset, shown on keyboard focus (`:focus-visible` on the web). A component must never remove the ring without replacing it with an equivalent visible indicator in the same interaction.
- Dialogs trap focus while open, close on Esc, and return focus to the element that opened them. This is implemented once in shared modal behavior on the web and must be implemented once per platform, not per dialog. The admin app follows the same rule, including its dialog keyboard handling.
- Route and screen changes must be announced to assistive tech (the web uses a route announcer in the app shell). Loading regions use `role="status"` with a text label (for example "Loading sessions"), never a bare spinner.
- Icon-only controls must have an accessible name (the web uses `aria-label`, for example "Toggle sidebar", "New session", "Resize document sidebar"). Resizable dividers must be keyboard-operable, not drag-only.
- Landmarks and navigation must be labelled where more than one exists ("Workspace navigation", "Primary navigation", "CV sessions", "Admin"), and the current destination must be exposed programmatically (`aria-current="page"`), not by color alone.
- A visually-hidden text utility (`.sr-only` on the web) is available and must be used for text that exists only for assistive tech, such as the document-link redirect placeholder.

## Contrast

- Text must meet WCAG AA in every theme: at least 4.5:1 for body text and 3:1 for large text and essential control boundaries. This applies to text on every surface role it can appear on (base, mantle, surface0), not only on `bgBase`.
- Token changes must be contrast-checked across all three themes before merge; a pairing that fails in one theme fails the change. The latte status roles are deliberately darker than the hue roles for this reason (see Tokens).
- State must never be conveyed by color alone: the active nav item is also `aria-current`, save and error states have text, and dialog outcomes have messages.

## Text scaling and dynamic type

- The web base font size is 16px and text styles come from the typography scale in Tokens. Layouts must survive browser zoom and enlarged text without clipped controls or hidden actions; in particular the header actions (Settings, theme select) must stay reachable at narrow widths and large text.
- Planned: native and mobile platforms must honor the operating system's text-size setting (dynamic type) across all screens, scaling the token type styles rather than fixing pixel sizes, with no truncation of labels or buttons at the largest OS size.

## Reduced motion

Every platform must honor the operating system's reduced-motion setting. On the web, `prefers-reduced-motion: reduce` collapses all animation and transition durations to 0.01ms in the global theme, and looping skeleton animations stop entirely in the editor. The detailed rules are in `specs/design/motion.md`.

## Keyboard shortcuts (desktop)

The web app has a deliberately small shortcut set, and it is the governing set for desktop platforms:

| Keys | Action | Where |
| --- | --- | --- |
| Tab / Shift+Tab | Move focus through controls in order | Everywhere |
| Enter | Save / commit the field being edited | Editable fields, settings fields |
| Ctrl/⌘+Enter | Save a long-text (multiline) field | Editable fields, settings fields |
| Esc | Cancel the current edit and restore the previous value | Editable fields |
| Esc | Close the open dialog, drawer, or menu | Dialogs, compact sidebar drawer |
| Arrow keys | Adjust a focused resizable divider; move within tab lists and menus | Editor shell, tab lists |

Rules: there is no global shortcut palette and no single-key shortcut may be added without updating this table. Platforms must not reassign these keys, and must keep the platform's standard shortcuts (copy, paste, undo in text fields) working. Field-level hints must state the commit keys where a field is edited (the web settings screen does this in text).
