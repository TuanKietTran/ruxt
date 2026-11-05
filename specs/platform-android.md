# Platform: Android (Ruxt)

Native Android client for Ruxt, under `mobile/android/`. Package `cloud.mashallow.ruxt`, Jetpack Compose + Material 3, local-first.

## Flavors

Single `channel` product-flavor dimension; the only per-flavor difference is one `BuildConfig.API_BASE_URL` field (no other environment branching in code):

| Flavor | Application ID | Label | API base URL |
| --- | --- | --- | --- |
| prod | `cloud.mashallow.ruxt` | Ruxt | `https://ruxt.mashallow.cloud` |
| canary | `cloud.mashallow.ruxt.canary` | Ruxt Canary | `https://ruxt-canary.mashallow.cloud` |

## Theme

`theme/RuxtTheme.kt` builds palettes only from the generated `theme/Tokens.kt` (generated from `design/tokens.json`; drift is gated by `mobile/android/tools/check-token-drift.sh` and by CI). Valid theme names are `system`, `mocha`, `latte`, `opencode`; anything else falls back to `mocha`. `latte` is the only light scheme; `system` resolves to Mocha when the OS is dark and Latte when light. Typography sizes/weights also come from the tokens.

## Navigation

Start destination `sessions`. At widths >= 600dp a `NavigationRail` shows all 8 destinations (sessions, templates, profiles, providers, dashboard, settings, about, login); below that a bottom bar shows sessions, templates, profiles and `more`. The editor is a graph route reached from the session list, not a destination. `plans`, `billing` and `iam` are planned screens only (labelled Planned, no implementation).

## Data and contract rules

- Auth is the sealed `auth_session` cookie only: no bearer tokens, no refresh flow; a 401 means sign in again.
- CV documents and profiles are client-local only (`LocalCvStore`); there is no server CRUD route for them and none may be invented.
- The client never calls plans, subscriptions or IAM routes (CI security gate greps app sources for those prefixes and `Bearer`).
- API DTOs in `data/ApiModels.kt` mirror `notes/mobile-contract.md` tolerantly: unknown keys ignored, unread fields nullable/defaulted.

## ViewModels and known stubs

`ui/ViewModels.kt` holds the UI state models and ViewModels. The editor autosaves on an 800ms debounce and marks the result as a local draft (`lastSavedAt = "draft"`). List binding is still stubbed: the sessions/profiles/templates `refresh()` calls return empty lists with TODOs to collect from `LocalCvStore`, the editor `open()`/`save()` do not yet read/write the store, and the autosave does not yet persist the draft. These stubs are deliberate and tracked for the wiring pass; the unit tests pin the current state/debounce behaviour so the wiring change is visible in test diffs.

## Tests

JUnit unit tests under `mobile/android/app/src/test/` cover: JSON mapping of the contract DTOs (`ApiModelsJsonTest`), local CV store semantics (`CvDocumentStoreTest`), flavor base URLs (`FlavorConfigTest`), editor autosave debounce for markdown and title plus open/state behaviour (`EditorViewModelTest`, `ViewModelStatesTest`), empty/loading/error state rules for the list screens (`ViewModelStatesTest`), theme-name validation/fallback (`ThemeNamesTest`), and destination sets including the exclusion of planned routes from primary navigation (`NavigationDestsTest`).

## CI

`.github/workflows/mobile-android-canary.yml` is the verification path: token drift check, security grep gate, canary unit tests and a canary debug assemble (artifact only, never published) on push/PR touching `mobile/android/**`; the prod job runs only on manual `workflow_dispatch`.

## Local verification status

Local compile/test is UNVERIFIED on the current development machine — see the Verification section of `mobile/android/README.md` for the exact toolchain blocker. CI (above) is the compile/test path until a local Android SDK is installed.
