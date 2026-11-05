# Design tokens

Single source of truth for ruxt / ruxt-admin across web, GPUI desktop,
Kotlin, Swift and Dart. Edit `tokens.json` only — every platform file
is generated from it and must never be hand-edited.

## Layout

| File | What |
|---|---|
| `tokens.json` | The tokens (version 1.0.0). Values come from the web themes and the spacing, radius, type, motion and breakpoint values actually used in the app. |
| `tokens.schema.json` | JSON Schema for `tokens.json`; validated by the test suite. |
| `tools/generate-tokens.mjs` | Generator: `tokens.json` → CSS, Rust, Kotlin, Swift, Dart. |
| `tools/check-contrast.mjs` | WCAG AA contrast checker (see below). |
| `tools/generate-tokens.test.mjs` | Schema validation, contrast, and golden byte-identity tests. |
| `golden/` | Committed generator output. Regenerated, never edited by hand. |

## Tokens

- **Themes** — `mocha` (dark), `latte` (light), `opencode` (dark). Each
  defines `colorScheme` and the same colour roles: backgrounds
  (`bgBase`, `bgMantle`, `bgCrust`, `bgSurface0–2`, `bgOverlay0–2`),
  foregrounds (`fgText`, `fgSubtext1`, `fgSubtext0`), `accent`,
  `accentHover`, `accentMuted`, `onAccent`, the Catppuccin palette
  (`pink` … `sapphire`), semantic roles (`warning`, `danger`,
  `success`, `info`) and `border` / `borderStrong`.
- **Shared** — `typography` (families, base size, weights, scale),
  `spacing` (`none`…`6xl`, px), `radius`, `elevation`, `motion`
  (durations, easings, reduced-motion), `breakpoints`, `density`
  (`comfortable` / `compact`), `focusRing` and `icons`.

## Generated outputs

```sh
node design/tools/generate-tokens.mjs design/golden
```

| File | Consumer | Naming |
|---|---|---|
| `golden/tokens.css` | Web | `:root` shared vars + `[data-theme="<theme>"]` colour vars, kebab-case (`--spacing-2xl`, `--fg-text`) |
| `golden/tokens.rs` | GPUI / Rust | `pub mod <theme>` colour `&str` consts + `pub mod tokens`, `SCREAMING_SNAKE` (`SPACING_2XL: f32`) |
| `golden/Tokens.kt` | Kotlin | `<Theme>Tokens` objects + `Tokens`, camelCase `Double` / `String` consts |
| `golden/Theme.swift` | Swift | `<Theme>Theme` enums + `Tokens`, camelCase |
| `golden/theme.dart` | Dart / Flutter | `<Theme>Tokens` classes + `Tokens`, camelCase |

Units: numbers are px (CSS appends `px`, except weights, line-heights
and density scales; durations become `ms` in CSS and stay numeric
elsewhere). Colours stay hex strings on every platform — resolving
them to a native colour type is the consumer's job.

## Contrast (WCAG AA)

```sh
node design/tools/check-contrast.mjs   # optional arg: path to tokens.json
```

Checks, per theme: text roles (`fgText`, `fgSubtext1`, `fgSubtext0`,
`accent`, `accentHover`, `warning`, `danger`, `success`, `info`) on
`bgBase`, `bgMantle` and `bgSurface0` at ≥ 4.5:1; `accent` on
`accentMuted` and `onAccent` on `accent` at ≥ 4.5:1; the focus ring
(`accent` on `bgBase`) at ≥ 3:1. Decorative `border` / `borderStrong`
are not checked: they equal the surface tokens by design and are
separators, not indicators (WCAG 1.4.11 does not cover them). Exits
non-zero and prints every failing pairing.

## Changing a token

1. Edit `tokens.json` (keep it valid against `tokens.schema.json`).
2. Run the contrast checker; fix any failing pairing in `tokens.json`.
3. Regenerate: `node design/tools/generate-tokens.mjs design/golden`.
4. Verify: `node --test design/tools/generate-tokens.test.mjs`
   (schema valid, contrast passes, regeneration is byte-identical
   to `golden/`).
5. Commit `tokens.json`, any tool changes, and `golden/` together.
