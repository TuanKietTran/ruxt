# Ruxt — Flutter app shell

Flutter shell for Ruxt (write your CV in Markdown), mirroring the web app's
information architecture and design system. This is a shell only: placeholder
screens, the shared-token theme system, and navigation. No networking, no
API/auth implementation, no real session/profile data.

Audit and governing specs: `../../notes/flutter-ux-audit.md`,
`specs/design/{tokens,themes,layout,screens,accessibility,motion}.md`
(via the design-spec worktree), and `design/tokens.json` v1.0.0 from
`design/tokens` @ `fed8d71` (provisional-real until `int/design` merges).

## Run / verify

```sh
flutter pub get
flutter run            # Android / iOS, id com.ruxt.ruxt on both
flutter test           # theme_test.dart + shell_test.dart
flutter analyze
```

Toolchain note (2026-11-05 lab): `flutter`/`dart` were not on PATH in the
lab that produced this scaffold, so the Dart code is hand-written and the
commands above are unverified there. What was verified:

```sh
bash tool/check_theme_drift.sh        # OK — no drift vs design/tokens.json
python3 tool/validate_against_golden.py
# golden cross-check OK (66 doubles, 12 strings, colors verified)
```

## Platform identity

- Android: `namespace` / `applicationId` = `com.ruxt.ruxt`
  (`android/app/build.gradle`)
- iOS: `PRODUCT_BUNDLE_IDENTIFIER` = `com.ruxt.ruxt`
  (`ios/Runner.xcodeproj/project.pbxproj`; `Info.plist` uses the variable)
- Flavors / AppConfig / per-flavor entry points are out of scope here;
  they belong to the full app build (flu-build), not this shell.

## Structure

```
lib/
  main.dart                  entry: loads prefs, then runs RuxtApp
  app/
    ruxt_app.dart            MaterialApp, OS-brightness -> ThemeController
    ruxt_shell.dart          header + theme control, bottom nav / rail, skip link
    destinations.dart        primary + secondary destinations, in governing order
  theme/
    generated_theme.dart     GENERATED from design/tokens.json — do not hand-edit
    theme_selection.dart     choices, palette resolution, density metrics
    ruxt_theme_data.dart     palette + density -> ThemeData
    theme_controller.dart    ChangeNotifier: choice/density, load + persist
    theme_preferences.dart   ThemePreferencesStore seam (shared_preferences + in-memory)
    accessibility.dart       a11y helpers / contrast-aware helpers
  widgets/
    placeholder_screen.dart  placeholder scaffold for shell screens
    state_views.dart         reusable empty / loading / error states
    theme_select.dart        theme + density control (header / Settings)
  features/
    editor/  sessions/  templates/  profiles/  settings/
    secondary/               Providers, Cloud data, About, Sign in
test/
  theme_test.dart            palette resolution, prefs fallback/persist, ThemeData
  shell_test.dart            compact bottom nav, wide rail, destination switching
tool/
  generate_theme.py          design/tokens.json -> lib/theme/generated_theme.dart
  validate_against_golden.py generated vs design/golden/theme.dart
  check_theme_drift.sh       regenerate + diff + golden check; fails on drift
```

## Navigation / routing

Routing is state-based inside the shell, not URL-based: `RuxtShell` holds
one current destination (`RuxtDestination` in `app/destinations.dart`) and
renders its placeholder screen. That keeps the shell dependency-free and
lets the full build swap in a real router behind the same destination list.

- Primary (bottom `NavigationBar` <600dp, `NavigationRail` >=600dp,
  extended on expanded widths): Editor `/`, Sessions `/d`,
  Templates `/d/templates`, Profiles `/p`, Settings `/settings`
- Secondary (from Settings and the expanded rail): Providers `/d/providers`,
  Cloud data `/settings/cloud-data`, About `/about`, Sign in `/login`
- Paths above are the web routes each screen mirrors; they are labels in
  this shell, not deep links.
- A skip link moves focus to the main content; the theme control stays in
  the header at every width.

## Theme, density, preferences

- Themes: `latte` (light), `mocha` (dark, default), `opencode` (dark), plus
  `system` — light resolves to Latte, dark to Mocha, following OS brightness
  fed in from `RuxtApp`. Values come only from the generated token file.
- Density: `comfortable` (default) / `compact`, mapped to `VisualDensity`
  and the spacing metrics in `theme_selection.dart`.
- Persistence: `ThemeController` loads choice + density before first paint
  (a loading state is shown until then, so there is no wrong-theme flash)
  and persists changes immediately via `ThemePreferences`.
  The store seam is `ThemePreferencesStore` — `SharedPreferencesThemeStore`
  on device, `MemoryThemePreferencesStore` in tests.
- Theme prefs are device-local only, kept separate from any account or
  profile-save-mode preference, and are never sent to an API.
- Regenerate after a token change: `python3 tool/generate_theme.py`, then
  `bash tool/check_theme_drift.sh` must pass before committing.

## Screens

All screens are placeholders built on `PlaceholderScreen` +
`state_views.dart` (empty / loading / error), demonstrating the state each
real screen must handle — e.g. Editor's markdown field, Templates'
`Classic` entry, Settings' theme/density controls (the one functional
control in the shell). No screen performs I/O.

## Out of scope / security

- Out of scope: API and auth, Clerk/session wiring, real CV/profile data,
  PDF export, import pipeline, cloud sync, flavors.
- Legacy plans / subscriptions / IAM routes are deliberately omitted:
  no screens and no clients for them in this shell. Where identity ever
  applies in the full build, it comes from the session only — never a
  caller-chosen user id. This shell does no networking at all.
