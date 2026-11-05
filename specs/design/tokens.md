# Tokens

Token source: `design/tokens.json`. This file describes the categories, the naming rule, and the normative values. The JSON is the source of truth; this document is its readable form.

## Naming

- JSON names are camelCase role names (`bgBase`, `fgSubtext0`, `accentHover`). Web CSS custom properties are the same names in kebab-case prefixed with `--` (`--bg-base`, `--fg-subtext0`, `--accent-hover`). Generated platform code uses the idiomatic casing of the same role names (for example `bgBase` in Swift and Dart, `BgBase` where the language requires it). A role must keep one meaning on every platform.
- Color roles are semantic (`bg*`, `fg*`, `accent*`, `border*`) plus a fixed hue set (`pink`, `mauve`, `red`, `peach`, `yellow`, `green`, `teal`, `sky`, `sapphire`) and status roles (`warning`, `danger`, `success`, `info`). Components must use semantic roles for surfaces, text, and borders; hue roles are for content accents and status only.
- `onAccent` is the foreground for content placed on `accent` or `accentHover` fills.

## Color roles per theme

Three themes exist: `mocha` (dark, default), `latte` (light), `opencode` (dark). Every theme must define every role; a missing role in a theme is a defect.

| Role | mocha | latte | opencode |
| --- | --- | --- | --- |
| bgBase | #1e1e2e | #eff1f5 | #0a0a0a |
| bgMantle | #181825 | #e6e9ef | #111111 |
| bgCrust | #11111b | #dce0e8 | #050505 |
| bgSurface0 | #313244 | #ccd0da | #1a1a1a |
| bgSurface1 | #45475a | #bcc0cc | #242424 |
| bgSurface2 | #585b70 | #acb0be | #2e2e2e |
| bgOverlay0 | #6c7086 | #9ca0b0 | #404040 |
| bgOverlay1 | #7f849c | #8c8fa1 | #525252 |
| bgOverlay2 | #9399b2 | #7c7f93 | #737373 |
| fgText | #cdd6f4 | #4c4f69 | #fafafa |
| fgSubtext1 | #bac2de | #505268 | #d4d4d4 |
| fgSubtext0 | #a6adc8 | #53566e | #a3a3a3 |
| accent | #89b4fa | #164cc0 | #22c55e |
| accentHover | #b4befe | #1445b0 | #4ade80 |
| accentMuted | #313244 | #ccd0da | #1a2e1a |
| onAccent | #11111b | #ffffff | #0a0a0a |
| pink | #f5c2e7 | #ea76cb | #f472b6 |
| mauve | #cba6f7 | #8839ef | #a78bfa |
| red | #f38ba8 | #d20f39 | #f87171 |
| peach | #fab387 | #fe640b | #fb923c |
| yellow | #f9e2af | #df8e1d | #fbbf24 |
| green | #a6e3a1 | #40a02b | #4ade80 |
| teal | #94e2d5 | #179299 | #2dd4bf |
| sky | #89dceb | #04a5e5 | #38bdf8 |
| sapphire | #74c7ec | #209fb5 | #60a5fa |
| warning | #f9e2af | #7b4e10 | #fbbf24 |
| danger | #f38ba8 | #b00d30 | #f87171 |
| success | #a6e3a1 | #28631b | #4ade80 |
| info | #74c7ec | #135f6d | #60a5fa |
| border | #313244 | #ccd0da | #1a1a1a |
| borderStrong | #45475a | #bcc0cc | #2e2e2e |

Notes on the web CSS mirror (`app/assets/theme/themes.css`):

- In the web CSS, `--warning` and `--danger` currently equal the theme's `yellow` and `red` in all three themes. The JSON values above are normative: in `latte`, the status roles are darker text variants (`warning` #7b4e10, `danger` #b00d30, `success` #28631b, `info` #135f6d) so status text meets WCAG AA on light surfaces. Platforms must use the JSON values, and the web CSS must be brought in line with them.
- The web CSS does not yet define `--success`, `--info`, or `--on-accent` custom properties; components that need them must use the JSON roles through their platform theme, and the web mirror must add the properties rather than fall back to hex values.
- `--error` is not a token. Two settings screens currently style errors with `var(--error, #e55)`, which always falls back. Error text must use the `danger` role; occurrences of `--error` must be removed.

## Typography

Font families: sans is `Inter, Geist, system-ui, sans-serif`; mono is `ui-monospace, SFMono-Regular, Menlo, monospace`. Base size is 16px. Weights: regular 400, medium 500, semibold 600, bold 700, extrabold 800.

| Style | Size | Line height | Weight |
| --- | --- | --- | --- |
| caption | 11px | 1.4 | 500 |
| label | 12px | 1.4 | 600 |
| bodySmall | 13px | 1.5 | 400 |
| body | 14px | 1.55 | 400 |
| bodyLarge | 16px | 1.5 | 400 |
| subtitle | 18px | 1.4 | 600 |
| title | 24px | 1.24 | 700 |
| heading | 28px | 1.15 | 700 |
| display | 40px | 1.05 | 800 |

Text must be set in one of these styles; one-off sizes are not allowed. The admin app is the recorded exception for its base: it sets body text at 14px/1.5 in the system-ui stack (see Layout, admin dense tables).

## Spacing, radius, elevation

Spacing scale (px): none 0, xs 4, sm 6, md 8, lg 12, xl 16, 2xl 20, 3xl 24, 4xl 32, 5xl 40, 6xl 48. Layout gaps and padding must come from this scale.

Radius (px): none 0, sm 6, md 10, lg 16, full 9999. Web CSS names match (`--radius-sm` etc.).

Elevation: none `none`; sm `0 1px 4px rgb(0 0 0 / 0.18)`; md `0 12px 32px rgb(0 0 0 / 0.35)`; lg `0 20px 60px rgb(0 0 0 / 0.35)`; xl `0 24px 80px rgb(0 0 0 / 0.38)`. Dialogs use md or above; menus and popovers use sm or md.

## Other categories

Breakpoints, window classes, and density are specified in `specs/design/layout.md`; their token values are in the JSON (`breakpoints`, `density`). The focus ring token (`focusRing`: 2px width, 2px offset, solid, `accent` color) is specified in `specs/design/accessibility.md`. Motion tokens are specified in `specs/design/motion.md`.

Icons: the set is Lucide, delivered as Iconify codes from the locally bundled lucide collection at build time; icons must never be fetched at runtime. On the web, every icon used must first be registered in `app/utils/icons.ts` (currently registered: circle-help, circle-user-round, file-text, id-card, log-in, settings). Other platforms must use the same Lucide glyphs from the token icon set.
