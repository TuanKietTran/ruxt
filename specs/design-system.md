# Design system

## Source of truth

The design system is tokens plus rules. The machine-readable tokens live in one file, `design/tokens.json` (version field inside the file), and the rules live in this specification and the files under `specs/design/`. No platform keeps its own palette, type scale, spacing scale, or breakpoint set.

`design/tokens.json` covers: color roles per theme, typography, spacing, radius, elevation, motion (durations and easings), breakpoints and window classes, density, the focus ring, and the icon set. Token values originate from the shipping web app (`app/assets/theme/themes.css` and the values actually used in `app/`); where the JSON and the web CSS disagree, `specs/design/tokens.md` records the disagreement and which side is normative.

## Consumption and drift

Every platform consumes the same JSON through a small generator and never hand-edits the generated output:

| Platform | Consumption |
| --- | --- |
| Web (this repo) | CSS custom properties in `app/assets/theme/themes.css`, one `[data-theme]` block per theme, names mapped as described in `specs/design/tokens.md`. |
| Desktop GPUI (ruxt and ruxt-admin) | A build-time code generator (build.rs or equivalent) emits a Rust theme module from `design/tokens.json`. |
| Android (Kotlin) | A generator emits a Compose theme from `design/tokens.json`. |
| iOS (Swift) | A generator emits `Theme.swift` from `design/tokens.json`. |
| Flutter (Dart) | A generator emits `theme.dart` from `design/tokens.json`. |

Rules:

- A token change must be made in `design/tokens.json` first and then regenerated on every platform in the same change. Hand-editing a generated file is not allowed.
- A drift check must fail CI when a generated file does not match `design/tokens.json`. (Planned for platforms whose generator does not exist yet; the web CSS is currently maintained by hand and must be reviewed against the JSON in the same pull request that changes either side.)
- Screens and components must reference token roles, never raw hex colors, pixel values outside the spacing scale, or one-off durations. A value that is needed in two places must become a token first.
- Planned behavior is labelled "Planned" in these specifications. Anything not labelled is current behavior of the web app and must be mirrored as-is.

## Ownership

`specs/design-system.md` and `specs/design/*` are owned as one set together with `design/tokens.json`; a change to a token category updates the matching file under `specs/design/` in the same change. Platform specifications (`specs/platform-*.md`, `specs/api-mobile.md`) own platform implementation detail only and must not restate or fork token values.

## Spec map

| Specification | Covers |
| --- | --- |
| [Tokens](design/tokens.md) | Token categories, naming, per-theme color roles, typography, spacing, radius, elevation |
| [Themes](design/themes.md) | Named themes, runtime switching, density selection, preference persistence and defaults |
| [Layout](design/layout.md) | Window classes, breakpoints, navigation model, per-class layout rules, admin dense tables |
| [Screens](design/screens.md) | Routes, information architecture, and empty/loading/error/auth states per screen |
| [Accessibility](design/accessibility.md) | Focus order and ring, contrast, dynamic type, reduced motion, keyboard, skip links |
| [Motion](design/motion.md) | Duration and easing tokens, reduced-motion behavior |

The editor-specific layout and validation rules in `specs/cv-editor.md` and `specs/cv-sv-ui-validation.md` continue to apply and are not restated here; where they touch design tokens or window classes, this set governs.
