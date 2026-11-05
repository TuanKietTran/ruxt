# Themes and preferences

## Named themes

The product ships three named themes, defined per theme in `design/tokens.json` and described in `specs/design/tokens.md`:

| Theme id | Label | Color scheme | Notes |
| --- | --- | --- | --- |
| mocha | Catppuccin Mocha | dark | Default when no stored preference exists |
| latte | Catppuccin Latte | light | The only light theme |
| opencode | OpenCode | dark | Terminal-style dark theme; accent is terminal green |

Every platform must offer all three named themes with the same ids and the same token values. A platform must not add or rename a theme locally; a new theme is a token change plus a spec change.

## Runtime switching

Current behavior (web, `app/composables/useTheme.ts`, `app/components/ThemeSelect.vue`):

- Switching must take effect immediately, without reload or navigation. On the web the switch sets the `data-theme` attribute on the document root; other platforms must apply the new theme to the whole window in the same frame budget.
- The theme control is a select listing every theme by its label, labelled for assistive tech (`aria-label="Select theme"` on the web). It must be reachable from the editor header and from the default layout header, and must stay reachable at compact widths.
- A successful switch shows a confirmation toast (`Theme changed to <label>.`); a failed save shows an error toast (`The theme could not be saved.`). Other platforms must give the same two outcomes, using their toast equivalent.
- The control renders only once the stored theme has been read, so the first paint must not flash a different theme's colors with a visible control in the wrong state.

## Light, dark, and system

- Named themes are the current mechanism; each named theme fixes its own color scheme (`color-scheme: dark` for mocha and opencode, `light` for latte).
- Planned: a `system` option must be offered alongside the named themes. It must follow the operating system's light/dark setting live (changing when the OS setting changes), mapping light to latte and dark to mocha, until the user picks a named theme. Picking a named theme must stop following the OS.

## Persistence and defaults

Current behavior (web):

- The theme choice is stored on the device only, under the local storage key `theme`, and is read once at startup by the theme plugin before first paint. An unset or unrecognized value falls back to mocha.
- The theme is not part of the account preferences. The account/local preference record (`UserPreferences`) currently contains only `profileSaveMode`, with values `auto` (default) and `manual`; it is stored locally under `cv-sv:preferences:v1` when signed out and through `/api/preferences` when signed in, and the two stores are independent. Platforms must keep the same separation: theme stays device-local, editor save behavior follows the preference record and its defaults.
- Planned: density (see below) must persist the same way as the theme, device-local, defaulting to comfortable.

## Density

Tokens define two densities: comfortable (scale 1, control height 36px, row height 40px) and compact (scale 0.875, control height 30px, row height 32px).

- The web app has no density control today; it renders at comfortable density, with locally denser surfaces where screens specify them (editor toolbars, admin tables).
- Planned: every platform must offer a user-selectable density (comfortable or compact) that applies to control heights and row heights across all screens without a restart, persists across launches, and defaults to comfortable. The admin app must default to compact-equivalent row metrics for its tables (see `specs/design/layout.md`).

## Admin

The admin app uses the same three themes and the same token values; it has no separate palette. Its stylesheet consumes the same CSS variable names (`--bg-base`, `--fg-text`, `--accent`, radii). Theme switching in admin must follow the same rules as above; an admin-only theme is not allowed.
