# Capture Inventory — Ruxt Penpot Design System

Planned captures for Phase B, derived from penpot-client-lab
`briefs/ds-library.md` (component list + page list) and the Ruxt app
routes (index, e/[id], profiles, login, d/index, d/providers,
settings/index, settings/cloud-data, about = 9 screens).

Repo copies land in `design/penpot/png/`; identical copies plus the
GIFs land in penpot-client-lab `poc/ruxt-ds/`. Every poc asset is
labelled REAL CAPTURE or RENDER in `poc/ruxt-ds/README.md`.

## Component groups — 16 PNGs (one per group, on the Components page)

1. `png/components-button.png` — Button (primary/ghost/danger x default/hover/disabled)
2. `png/components-icon-button.png` — IconButton
3. `png/components-text-field.png` — TextField
4. `png/components-editable-field.png` — EditableField
5. `png/components-select-theme-select.png` — Select / ThemeSelect
6. `png/components-dialog.png` — Dialog (incl. AuthDialog + confirm)
7. `png/components-toast.png` — Toast (success/info/warning/danger)
8. `png/components-chip-technologies-input.png` — Chip / TechnologiesInput
9. `png/components-profile-card.png` — ProfileCard
10. `png/components-session-card.png` — SessionCard
11. `png/components-nav-sidebar-item.png` — Nav / Sidebar item
12. `png/components-table-row.png` — TableRow
13. `png/components-editor-toolbar.png` — EditorToolbar
14. `png/components-card.png` — Card
15. `png/components-badge.png` — Badge
16. `png/components-skip-link-focus.png` — SkipLink / focus state

## Pages — 11 PNGs (one per Penpot page)

17. `png/page-tokens.png` — Tokens page (93 colors, 9 typographies + 2 families, spacing/radius/elevation boards)
18. `png/page-components.png` — Components page (all groups)
19. `png/page-screen-editor.png` — Screen: CV Editor (`/`)
20. `png/page-screen-document.png` — Screen: Document link (`e/[id]`)
21. `png/page-screen-profiles.png` — Screen: Profiles
22. `png/page-screen-login.png` — Screen: Login (sample placeholder data only)
23. `png/page-screen-dashboard.png` — Screen: Dashboard (`d/`)
24. `png/page-screen-providers.png` — Screen: Providers (`d/providers`)
25. `png/page-screen-settings.png` — Screen: Settings (`settings/`)
26. `png/page-screen-cloud-data.png` — Screen: Cloud Data (`settings/cloud-data`)
27. `png/page-screen-about.png` — Screen: About

## Theme variants — 3 PNGs (Latte frames required for these screens)

28. `png/page-screen-editor-latte.png` — Editor, Latte variant frame
29. `png/page-screen-dashboard-latte.png` — Dashboard, Latte variant frame
30. `png/page-screen-login-latte.png` — Login, Latte variant frame

## poc/ruxt-ds/ totals

- 30 PNGs above (poc copies) — target met on PNGs alone
- `library-open.png` — by ds-library, REAL CAPTURE, not overwritten
- 3 GIFs (real Penpot UI flows, captured not rendered where possible):
  - `flow-open-library-browse-components.gif` — open library file, browse components
  - `flow-page-switch.gif` — switch Tokens -> Components -> a screen page
  - `flow-theme-switch.gif` — switch Mocha page/frame to Latte variant
- Total poc assets: >= 34 (30 PNG + library-open.png + >=3 GIF)

## Capture method (Phase B, in preference order)

1. `penpot_export_shape` / UI export of the board/frame per item
2. Browser screenshot of the open file page per item
3. A labelled RENDER only if 1-2 are impossible for that item, with
   the reason recorded in `poc/ruxt-ds/README.md`
