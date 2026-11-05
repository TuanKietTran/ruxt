# Ruxt Android

Kotlin / Jetpack Compose app for Ruxt on Android: local-first CV documents and profiles, a cookie-auth API client for the routes the mobile contract offers, DataStore preferences, and a design-token Material 3 UI.

- Package / applicationId: `cloud.mashallow.ruxt` (canary adds the `.canary` suffix)
- compileSdk / targetSdk: 34, minSdk: 26, JVM 17
- AGP 8.5.2, Kotlin 2.0.20, Compose BOM 2024.09.00, OkHttp 4.12.0, kotlinx-serialization 1.7.3, DataStore 1.1.1

## Flavors

One dimension (`channel`), one `BuildConfig.API_BASE_URL` field per flavor — no other environment branching anywhere in the code.

| Flavor | applicationId | versionName | API_BASE_URL |
|---|---|---|---|
| prod | `cloud.mashallow.ruxt` | `0.1.0` | `https://ruxt.mashallow.cloud` |
| canary | `cloud.mashallow.ruxt.canary` | `0.1.0-canary.1` | `https://ruxt-canary.mashallow.cloud` |

## Layout

```
app/src/main/java/cloud/mashallow/ruxt/
  MainActivity.kt            entry point; collects DataStore prefs, applies RuxtTheme(theme), shows RuxtShell
  navigation/RuxtNav.kt      window-class shell: bottom bar on phone, navigation rail at >=600dp
  theme/Tokens.kt            GENERATED from design/tokens.json, do not edit by hand
  theme/RuxtTheme.kt         Material3 theme built from Tokens.kt (mocha/latte/opencode/system, mocha fallback)
  data/ApiModels.kt          contract DTOs (auth, consent, preferences, templates, cv-import, artifacts)
  data/ApiClient.kt          OkHttp client; legacy `auth_session` cookie only, via SessionCookieJar
  data/RemoteRepositories.kt auth / preferences / consent / templates / cv-import / artifact repositories
  data/LocalCvStore.kt       CvDocumentStore (pure, testable) + LocalCvRepository (file cv-documents.json)
  data/LocalRepositories.kt  LocalSessionsRepository (file-backed session metadata, split from CV documents)
  data/AppPreferences.kt     DataStore prefs: AppPrefs + PreferencesRepository, validated values
  ui/ViewModels.kt           Sessions / Editor / Profiles / Templates view models (StateFlow UI state)
  ui/components/Common.kt    EmptyState, LoadingState, ErrorState, OfflineState, PlannedBadge
  ui/screens/Screens.kt      Sessions, Editor, Templates, Profiles, Providers, Dashboard, Settings, About, Login, Planned
app/src/test/java/cloud/mashallow/ruxt/
  data/CvDocumentStoreTest.kt   local store semantics (10 tests)
  data/ApiModelsJsonTest.kt     contract JSON mapping (8 tests)
  ui/EditorViewModelTest.kt     editor autosave debounce (3 tests)
  FlavorConfigTest.kt           per-flavor API_BASE_URL (2 tests)
tools/
  generate-tokens.mjs        regenerates theme/Tokens.kt from design/tokens.json
  check-token-drift.sh       fails if Tokens.kt is out of date with tokens.json
```

## Local-first data

CV documents, sessions, profiles and templates are local to the device — there is no server CRUD for them. `CvDocumentStore` mirrors the web local store semantics: session ids are UUIDs independent of titles, a save bumps `revision` (and the timestamp) only when markdown or css actually changed, rename changes the title only, and fork creates `<title> (copy)` at revision 1. The editor autosaves a local draft after 800 ms idle (debounced in `EditorViewModel`); no cloud sync is performed.

The API client is used only for the routes the contract offers (auth, preferences, consent, templates, cv-imports with 202 + poll, artifacts). Auth is the sealed legacy session cookie only; a 401 means the user must sign in again.

## Design tokens

`Tokens.kt` is generated from the real `design/tokens.json`. Regenerate and check:

```sh
node tools/generate-tokens.mjs
bash tools/check-token-drift.sh
```

## Preferences

Persisted locally with DataStore (`ruxt_prefs`): theme (`system`/`mocha`/`latte`/`opencode`, default and fallback `mocha`), density (`comfortable`/`compact`), profile save mode (`auto`/`manual`), and two cloud consent switches (session recovery, templates; both default off). Invalid saved values fall back to the defaults above. Settings wires every choice and switch to the repository, and MainActivity applies the saved theme.

## Screens

- Sessions, Templates and Profiles: view-model driven list screens with loading / error (with retry) / empty / content states.
- Editor: view-model driven; title + markdown state, manual Save, and the 800 ms debounced local-draft autosave. Contexts are cv and profiles only.
- Providers, Dashboard, About, Login: shell screens with empty/loading/offline states where a network surface will apply; Login is a gate placeholder — sign-in itself is planned.
- Plans, Billing, Account & IAM: **Planned-only placeholders** under More/Dashboard. They render a Planned badge and an empty state, and nothing else.
- Settings: theme, density and save-mode choices plus the two consent switches.
- Accessibility: 48dp minimum touch targets on actions, content descriptions on icon-only/switch controls, dynamic type via Material typography from token sizes.

## Build and test

Requires JDK 17 and the Android SDK (compileSdk 34). A Gradle wrapper is not committed; use a local Gradle 8.x if `./gradlew` is absent.

```sh
gradle :app:assembleProdDebug
gradle :app:assembleCanaryDebug
gradle :app:testProdDebugUnitTest
gradle :app:testCanaryDebugUnitTest
bash tools/check-token-drift.sh
```

## Verified vs stubbed

Verified:

- Token drift check passes: `Tokens.kt` is up to date with `design/tokens.json` (exit 0).
- Security greps clean in app + test sources: no legacy plans/subscriptions/iam route calls and no bearer-token auth; auth is the session cookie only.
- `git diff --check` clean on every commit in this phase; 23 unit tests written against the pure store, the JSON DTOs, the flavor config and the editor debounce.

Not verified / stubbed:

- Gradle build and unit tests were NOT run on the build machine: no Gradle, no kotlinc and no Android SDK were installed (`ANDROID_HOME` empty, no `~/Library/Android/sdk`), so `assemble*Debug` and `test*DebugUnitTest` could not run. Run the commands above on a machine with the SDK installed.
- ViewModels expose the full UI state flow, but the Sessions/Templates/Profiles view models still return empty lists — binding them to `LocalCvRepository` / the template repository is the remaining wiring step, and the Editor draft write is marked at the persistence point in `EditorViewModel` rather than calling the store yet.
- `LocalSessionsRepository` uses `org.json`, which is stubbed in JVM unit tests, so its file semantics are covered by code review only, not by the unit suite.
- No live network call, sign-in, or cv-import run has been performed from the app.

## Verification

Local verification on the development machine (2026-11-05) is UNVERIFIED, with this exact toolchain blocker: OpenJDK 21.0.12.1 is present, but there is no Gradle wrapper in `mobile/android` (`gradlew` missing) and no Android SDK (`ANDROID_HOME` is empty, `~/Library/Android/sdk` does not exist), so the gradle attempt exits 127 before any code compiles; no unit test has run locally. Static checks performed locally instead: token drift script (`mobile/android/tools/check-token-drift.sh`), security grep for `/api/(plans|subscriptions|iam)` and `Bearer` in `app/src/main`, YAML parse of the canary workflow, and `git diff --check`. Compile and unit tests run in CI via `.github/workflows/mobile-android-canary.yml` (`gradle :app:testCanaryDebugUnitTest :app:assembleCanaryDebug`).
