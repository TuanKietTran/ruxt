# Ruxt Android

Kotlin / Jetpack Compose shell for Ruxt on Android. This is a UI shell only:
no real API client, no auth, and no CV editor are included.

- Package / applicationId: `cloud.mashallow.ruxt`
- compileSdk / targetSdk: 34, minSdk: 26
- AGP 8.5.2, Kotlin 2.0.20, Compose BOM 2024.09.00

## Layout

```
app/src/main/java/cloud/mashallow/ruxt/
  MainActivity.kt            entry point; collects DataStore prefs, applies RuxtTheme(theme), shows RuxtShell
  navigation/RuxtNav.kt      window-class shell: bottom bar on phone, navigation rail at >=600dp
  theme/Tokens.kt            GENERATED from design/tokens.json, do not edit by hand
  theme/RuxtTheme.kt         Material3 theme built from Tokens.kt (mocha/latte/opencode/system, mocha fallback)
  data/AppPreferences.kt     DataStore prefs: AppPrefs + PreferencesRepository, validated values
  ui/components/Common.kt    EmptyState, LoadingState, ErrorState, OfflineState, PlannedBadge
  ui/screens/Screens.kt      Sessions, Editor, Templates, Profiles, Providers, Dashboard, Settings, About, Login, Planned
tools/
  generate-tokens.mjs        regenerates theme/Tokens.kt from design/tokens.json
  check-token-drift.sh       fails if Tokens.kt is out of date with tokens.json
```

## Design tokens

`Tokens.kt` is generated from the real `design/tokens.json`. Regenerate and check:

```sh
node tools/generate-tokens.mjs
bash tools/check-token-drift.sh
```

## Preferences

Persisted locally with DataStore (`ruxt_prefs`): theme (`system`/`mocha`/`latte`/`opencode`, default and fallback `mocha`), density (`comfortable`/`compact`), profile save mode (`auto`/`manual`), and two cloud consent switches (session recovery, templates; both default off). Invalid saved values fall back to the defaults above. Settings wires every choice and switch to the repository, and MainActivity applies the saved theme. No preference is sent anywhere; there is no network code in this shell.

## Screens

- Sessions, Editor, Templates, Profiles, Providers, Dashboard, About, Login: shell screens with empty states (plus loading/error/offline states where a network surface will apply). Editor contexts are cv and profiles only; editor internals are not included.
- Plans, Billing, Account & IAM: **Planned-only placeholders** under More/Dashboard. They render a Planned badge and an empty state, and nothing else.
- Settings: theme, density and save-mode choices plus the two consent switches.
- Accessibility: 48dp minimum touch targets on actions, content descriptions on icon-only/switch controls, dynamic type via Material typography from token sizes.

## Build

```sh
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
```

Requires JDK 17+ and the Android SDK (compileSdk 34).

## Verified vs stubbed

Verified:

- Token drift check passes: `Tokens.kt` is up to date with `design/tokens.json` (exit 0).
- Source greps clean: no HTTP client, no caller-chosen user id, no absolute local paths, no hardcoded palette values in the theme (colours are read from `Tokens.kt`).

Not verified / stubbed:

- Gradle build and unit tests were not run to completion on the build machine: no Android SDK was installed (`ANDROID_HOME`/`ANDROID_SDK_ROOT` empty), so `assembleDebug` could not run. Run the commands above on a machine with the SDK installed.
- All screens are placeholders; no API, auth, or editor logic is included.
