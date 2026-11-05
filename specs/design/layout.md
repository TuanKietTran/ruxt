# Layout

## Window classes

Layout is governed by window classes from `design/tokens.json` (`breakpoints`). Widths are the window (or app pane) width, not the device type.

| Window class | Width | Governing layout |
| --- | --- | --- |
| compact | 0-900px | Single column; navigation collapses (below) |
| medium | 901-1279px | Two panes |
| expanded | 1280px and up | Full multi-pane layout |

Named breakpoints in the tokens: phone 480px, small 640px, medium 900px. The 900px value is the compact boundary and must be the only width at which the navigation model changes.

Current web variance: component CSS uses additional one-off max-widths (400, 560, 599, 620, 720, 760px) for local stacking and header fitting. These are local adaptations, not window classes. New component breakpoints must use the token values (480, 640, 900); existing one-off values must converge to them when the owning component changes.

## Expanded and medium: the editor shell

The editor shell (`app/layouts/editor.vue`) is the primary layout for the CV editor and Profiles:

- Expanded: a fixed activity bar (icon rail) on the left, a document/profile sidebar next to it, then the source editor and the preview side by side with a draggable divider between them. The sidebar is resizable by drag and by keyboard, double-click on its divider resets it to its default width (232px), and its width persists across sessions.
- The preview has zoom controls from 25% to 200% in 10-point steps, with a one-click reset to 100%. Zoom is a view setting, not a content change.
- Medium (901-1279px): the same shell with two panes visible at once — sidebar plus the editor, or editor plus preview; the source/preview divider still applies when both are shown. (This is the governing rule for other platforms; the web keeps the docked sidebar above 900px and lets the split panes shrink.)
- The header must keep Settings and the theme select reachable at every width, including at and below 400px.

## Compact (900px and below)

Current web behavior, which other platforms must match in structure:

- The sidebar leaves the flow and becomes an overlay drawer anchored after the activity bar, width `min(300px, 100vw - 46px)`, with a backdrop; choosing an item or tapping the backdrop closes it. Its open state is separate from the persisted desktop sidebar state, so resizing across the boundary never leaves the layout in a mixed state.
- Content is a single column; source and preview are not shown side by side.
- The activity bar stays as the primary navigation rail (see Navigation model).

Planned for phone platforms: a bottom navigation bar presenting the same destinations as the activity bar (Editor, Profiles, Help, Settings, account) must replace the side rail where the platform convention requires it. Destinations, order, and labels must be identical; only placement changes.

## Default layout and navigation model

Non-editor screens use the default layout (`app/layouts/default.vue`): a top header with the product logo linking to the editor, a primary nav (Editor, Profiles) with the current route marked (`aria-current="page"`), and header actions for Settings, Cloud data, and the theme select.

Navigation model, all platforms:

- Primary destinations are the same everywhere and in the same order: Editor (`/`), Profiles (`/p`), Dashboard (`/d`), Providers (`/d/providers`), Settings (`/settings`), Cloud data (`/settings/cloud-data`), About/Help (`/about`).
- The editor shell reaches these through the activity bar (contexts for Editor and Profiles, Help, sign-in/sign-out) plus its header (Settings, theme select); the default layout reaches them through the header nav. A platform must not invent a different grouping.
- Exactly one destination is presented as current at a time, programmatically as well as visually.
- Sign-in state is part of navigation: signed-out users see a sign-in action; signed-in users see sign-out labelled with their account.

## Density in layout

Density tokens (comfortable: control 36px, row 40px; compact: control 30px, row 32px) apply to controls and list/table rows. Selection and persistence are specified in `specs/design/themes.md` (Planned on the web). Where a screen is intrinsically dense — editor toolbars, session lists, admin tables — it uses compact metrics locally regardless of the global setting, and must say so in its own spec section.

## Admin layout

The admin app (`ruxt-admin`) uses one default layout: a top header with the admin logo, a horizontal nav (aria-label "Admin"), and full-width content. It uses the same tokens and themes with an intrinsically dense presentation:

- Base text is 14px/1.5 in the system-ui stack; the Inter/Geist stack is not used.
- Data tables are the primary surface and must follow these metrics: full width, header and cell padding 6px 8px, header cells 12px medium in `fgSubtext0`, numeric columns right-aligned with tabular numerals, row separators in `border`.
- Summary statistics use cards (`bgMantle` surface, `border`, radius md, 16px padding) with a 12px uppercase label and a 24px bold value.
- Status is shown with pill badges (radius full, 11px) colored by the hue roles, and long content switches with tabs whose active tab is underlined in `accent`.
- Empty table areas show a muted placeholder line; errors are shown in the `danger` hue (admin CSS currently uses the `red` role for this).
- Admin screens must remain usable at the compact window class by allowing tables to scroll horizontally; columns must not be hidden to fit.
