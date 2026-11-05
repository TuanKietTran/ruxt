# Ruxt — Flutter app

Flutter app for Ruxt (write your CV in Markdown), mirroring the web app's
information architecture and design system. Built on the app shell
(placeholder screens, the shared-token theme system, and navigation) with
the full-build additions below: a local-first data layer under `lib/data/`
and prod/canary flavors. The screens are still the shell placeholders —
the data layer is implemented but not yet wired into the screens.

Audit and governing specs: `../../notes/flutter-ux-audit.md`,
`specs/design/{tokens,themes,layout,screens,accessibility,motion}.md`
(via the design-spec worktree), and `design/tokens.json` v1.0.0 from
`design/tokens` @ `fed8d71` (provisional-real until `int/design` merges).

## Run / verify

```sh
flutter pub get
flutter run --flavor prod -t lib/main_prod.dart
flutter run --flavor canary -t lib/main_canary.dart
flutter run            # default entry point: prod, or --dart-define=FLAVOR=canary
flutter test           # theme_test.dart + shell_test.dart
flutter analyze
```

Toolchain note (2026-11-05 lab): `flutter`/`dart` were not on PATH in the
lab that produced this scaffold, and were still absent for the full build,
so the Dart code is hand-written and the commands above (including
`flutter pub get` / `analyze` / `test` for the data layer and flavors)
are unverified there. What was verified:

```sh
bash tool/check_theme_drift.sh        # OK — no drift vs design/tokens.json
python3 tool/validate_against_golden.py
# golden cross-check OK (66 doubles, 12 strings, colors verified)
```

## Platform identity and flavors

| Flavor | App name | Application / bundle id | API base |
| --- | --- | --- | --- |
| prod | Ruxt | `cloud.mashallow.ruxt` | `https://ruxt.mashallow.cloud` |
| canary | Ruxt Canary | `cloud.mashallow.ruxt.canary` | `https://ruxt-canary.mashallow.cloud` |

- Android: `productFlavors` in `android/app/build.gradle` (dimension
  `channel`); canary uses `applicationIdSuffix .canary` and
  `versionNameSuffix -canary`; the manifest label is `@string/app_name`
  from the flavor `resValue`, which also carries `api_base_url`.
- iOS: `ios/Flutter/Prod.xcconfig` and `ios/Flutter/Canary.xcconfig` set
  `APP_BUNDLE_ID` / `APP_DISPLAY_NAME` / `API_BASE_URL`;
  `project.pbxproj` defaults to the prod values with
  `PRODUCT_BUNDLE_IDENTIFIER = $(APP_BUNDLE_ID)`, and `Info.plist` uses
  `$(APP_DISPLAY_NAME)`.
- Dart: `lib/app/app_config.dart` (`AppConfig.prod` / `.canary` /
  `.fromEnvironment` for `FLAVOR` and `API_BASE_URL` defines), entry
  points `lib/main_prod.dart` / `lib/main_canary.dart` / `lib/main.dart`,
  shared startup in `lib/app/bootstrap.dart`; `RuxtApp` takes the config
  and uses its app name as the app title.
- The API hosts are the build convention for this app; no other API host
  is referenced in the repo.

## Structure

```
lib/
  main.dart                  default entry: AppConfig.fromEnvironment -> bootstrap
  main_prod.dart             prod entry point
  main_canary.dart           canary entry point
  app/
    app_config.dart          flavors: prod/canary ids, names, API base URLs
    bootstrap.dart           shared startup: loads prefs, runs RuxtApp with config
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
  data/
    models.dart              typed contract models (incl. CV import jobs)
    api_client.dart          contract API client over a transport seam (dart:io default, fake in tests)
    auth.dart                legacy cookie auth; Clerk stub behind the same interface
    kv_store.dart            key-value storage seam (shared_preferences + in-memory)
    local_stores.dart        local CV sessions / profiles / templates / preferences stores
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

## Data layer choices / security

- No state-management or HTTP package was added: the data layer is plain
  Dart classes over an abstract transport seam (`dart:io` by default) and
  the existing `shared_preferences` dependency, so nothing new needs
  resolving before the toolchain check can run.
- CV sessions, profiles and private templates are local-only, mirroring
  the web storage keys (`cv-sv:session-backup:<id>`,
  `cv-sv:local-profiles:v1`, `cv-sv:local-templates:v1`,
  `cv-sv:preferences:v1`). The API client covers health, auth,
  preferences, consent, templates, capabilities, application/artifact
  and CV-import (create, poll, preview, cancel, retry) routes only.
- Auth is the legacy sealed `auth_session` cookie (no bearer token, no
  refresh; a 401 means signed out). Clerk sits behind the same auth
  interface as a stub that reports itself unavailable.
- Legacy plans / subscriptions / IAM routes are deliberately omitted:
  no screens and no clients for them. Identity comes from the session
  only — never a caller-chosen user id.
- Still stubbed / unverified: Clerk auth, wiring the data layer into
  the placeholder screens, and all `flutter` toolchain commands above
  (no SDK in the lab, see the toolchain note).
