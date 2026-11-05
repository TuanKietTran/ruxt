# Penpot sync

## Source of truth

- The single source is `design/tokens.json` (version 1.0.0). Penpot is a mirror only: tokens are never edited in Penpot and never flow back into the repo. A value that disagrees with `design/tokens.json` is fixed in Penpot, or changed in `design/tokens.json` first and then re-synced.
- The target is the local Penpot instance at `http://127.0.0.1:9001` (integrated MCP deployment), reached only through Penpot MCP (`penpot_api_info`, `penpot_high_level_overview`, `penpot_execute_code`, `penpot_export_shape` via `http://127.0.0.1:9001/mcp/stream`). Hosted Penpot files (penpot.app) are not the target.
- Token values and counts in this spec are taken from `design/tokens.json` as shipped in the design-system PR; the narrative token spec is `specs/design/tokens.md` and the theme spec is `specs/design/themes.md`.

## Sync status

Not synced yet (2026-11-05). Verified state:

- Read tools work without a token: `penpot_api_info` and `penpot_high_level_overview` both return.
- Write access is blocked: `penpot_execute_code` fails with `No userToken found in session context. Multi-user mode requires authentication.` The MCP client URL in `~/.config/mcp/mcp.json` carries no `?userToken=`, and no Penpot MCP plugin session is connected in an open file on the local instance.
- No token, style, or library entry has been created, changed, or deleted in Penpot by this sync. Nothing below is marked done until the completion steps have run and the read-back verification passes.

## What gets mirrored

| Group | Source in `design/tokens.json` | Count | Penpot target |
| --- | --- | --- | --- |
| Colors | `themes.<theme>.color.<role>` for mocha, latte, opencode | 31 roles x 3 themes = 93 | Token set `color/<theme>` (TokenColor) + library color `color/<theme>/<role>` |
| Typography | `typography.scale.<style>` + `typography.fontFamily` | 9 styles + 2 families | Token set `typography` (TokenTypography / TokenFontFamilies) + library typography `type/<style>` |
| Spacing | `spacing.<name>` | 11 | Token set `spacing` (TokenSpacing) |
| Radii | `radius.<name>` | 5 | Token set `radius` (TokenBorderRadius) |
| Elevation | `elevation.<name>` | 5 | Token set `elevation` (TokenShadow) |

Core mirrored tokens: 93 + 9 + 11 + 5 + 5 = 123, plus 2 font-family tokens. Not mirrored: `motion`, `breakpoints`, `density`, `focusRing`, and `icons` have no Penpot token target in this sync; they stay governed by `design/tokens.json` and `specs/design/motion.md`, `specs/design/layout.md`, and `specs/design/themes.md`.

## Mapping: colors

Token name: `color.<theme>.<role>` (role spelling preserved exactly, e.g. `color.mocha.bgBase`). Library color name: `color/<theme>/<role>`. Value: the hex string from `design/tokens.json`, copied verbatim, including the Latte WCAG AA status variants (`warning` #7b4e10, `danger` #b00d30, `success` #28631b, `info` #135f6d) — never the raw palette equivalents.

| Role | Role | Role |
| --- | --- | --- |
| bgBase | bgMantle | bgCrust |
| bgSurface0 | bgSurface1 | bgSurface2 |
| bgOverlay0 | bgOverlay1 | bgOverlay2 |
| fgText | fgSubtext1 | fgSubtext0 |
| accent | accentHover | accentMuted |
| onAccent | pink | mauve |
| red | peach | yellow |
| green | teal | sky |
| sapphire | warning | danger |
| success | info | border |
| borderStrong | | |

Themes: `mocha` (dark, default), `latte` (light), `opencode` (dark). All three are synced; a theme is never added or renamed in Penpot locally.

## Mapping: typography

Token name: `typography.<style>`; library typography name: `type/<style>`. Font family for every style: the `sans` stack (`Inter, Geist, system-ui, sans-serif`); the `mono` stack (`ui-monospace, SFMono-Regular, Menlo, monospace`) is mirrored as `typography.fontFamily.mono` for code text. Base size 16px; weights regular 400, medium 500, semibold 600, bold 700, extrabold 800.

| Style | Size (px) | Line height | Weight |
| --- | --- | --- | --- |
| caption | 11 | 1.4 | 500 |
| label | 12 | 1.4 | 600 |
| bodySmall | 13 | 1.5 | 400 |
| body | 14 | 1.55 | 400 |
| bodyLarge | 16 | 1.5 | 400 |
| subtitle | 18 | 1.4 | 600 |
| title | 24 | 1.24 | 700 |
| heading | 28 | 1.15 | 700 |
| display | 40 | 1.05 | 800 |

## Mapping: spacing, radii, elevation

| Group | Token name | Values (px unless noted) |
| --- | --- | --- |
| Spacing | `spacing.<name>` | none 0, xs 4, sm 6, md 8, lg 12, xl 16, 2xl 20, 3xl 24, 4xl 32, 5xl 40, 6xl 48 |
| Radius | `radius.<name>` | none 0, sm 6, md 10, lg 16, full 9999 |
| Elevation | `elevation.<name>` | none = no shadow; sm `0 1px 4px rgb(0 0 0 / 0.18)`; md `0 12px 32px rgb(0 0 0 / 0.35)`; lg `0 20px 60px rgb(0 0 0 / 0.35)`; xl `0 24px 80px rgb(0 0 0 / 0.38)` |

Elevation strings are CSS shadow values from `design/tokens.json`; when creating a TokenShadow, parse offset, blur, and color/alpha from the string — do not approximate or substitute a platform shadow.

## Sync method

1. Idempotent upsert by name, in group order: colors (mocha, then latte, then opencode), typography, spacing, radius, elevation. Create an entry that is absent, update an entry whose value differs, and leave an identical entry untouched. Remove a mirrored entry only when its name is inside the Ruxt sets above and it has no counterpart in `design/tokens.json`.
2. Tokens and library entries for the same source value are generated in the same pass from the same read of `design/tokens.json`; neither is hand-edited afterwards.
3. All writes go through `penpot_execute_code` against the open target file. Before writing token code, re-check the token API surface with `penpot_api_info` (TokenCatalog, TokenSet, TokenColor, TokenTypography, TokenSpacing, TokenBorderRadius, TokenShadow, LibraryColor, LibraryTypography); do not guess API members.
4. After each group lands, record a checkpoint naming the group and its entry count, then continue to the next group.

## Completion steps (once the plugin is connected)

1. Open `http://127.0.0.1:9001`, sign in to the local Penpot, and open (or create) the Ruxt design file that will hold the mirror. Files on hosted Penpot do not count.
2. In Penpot, create an MCP access token under Settings > Integrations, and connect the workspace MCP plugin in the open file (the workspace MCP connect action, which talks to `/mcp/ws`), so the plugin session and the MCP client share the same user token.
3. Set the MCP client URL to `http://127.0.0.1:9001/mcp/stream?userToken=<token>` in the local MCP client config (`~/.config/mcp/mcp.json`, local file only). Never commit, print, or copy the token into the repo, this spec, logs, or notes. Reopen the agent session afterwards — already-running sessions do not pick up the adapter config or the plugin session.
4. Probe before writing: `penpot_api_info` and `penpot_high_level_overview` must return, and a `penpot_execute_code` probe returning `penpot.version`, `penpot.currentFile.name`, and `penpot.currentPage.name` must succeed with a non-null file and page. If the probe fails, stop, record the exact error as the blocker, and do not claim any part of the sync.
5. Re-read `design/tokens.json` at the current HEAD and check the counts (3 themes x 31 color roles, 9 typography styles, 11 spacing, 5 radii, 5 elevations). If the counts or values differ from the tables above, update this spec in the same change — `design/tokens.json` wins.
6. Run the sync method above, group by group, with a checkpoint after each group.
7. Verify by reading back through `penpot_execute_code`: per-set counts must equal the table above, and these spot values must match exactly — `color.mocha.accent` #89b4fa, `color.latte.accent` #164cc0, `color.latte.warning` #7b4e10, `color.opencode.accent` #22c55e, `typography.body` 14px / 1.55 / 400, `spacing.3xl` 24, `radius.full` 9999, `elevation.md` as listed above.
8. Update the Sync status section of this file in the same change: replace the blocked state with the sync date, the target file name, the per-group counts read back, and the probe result. Only then is the sync done.
