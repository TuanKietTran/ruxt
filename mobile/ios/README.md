# Ruxt for iOS

Native iOS app for Ruxt, mirroring the web app's information architecture: Sessions (dashboard), Editor, Templates, Profiles, Providers, Settings, and About. The app ships in two build configurations (flavors): **Ruxt** (Release / production) and **Ruxt Canary**. The shared logic lives in the `RuxtKit` Swift package (iOS 17 / macOS 14), which a future macOS app can reuse.

## Layout

```
mobile/ios/
  project.yml               XcodeGen spec for Ruxt.xcodeproj (generated project is committed)
  Config/
    Canary.xcconfig         Canary bundle id / display name / version / API origin
    Release.xcconfig        Release bundle id / display name / version / API origin
  Ruxt.xcodeproj/           Generated project + shared schemes Ruxt and Ruxt-Canary
  RuxtKit/                  Swift package: models, API client, local CV store, theme
    Package.swift           Library RuxtKit + test target RuxtKitTests
    Sources/RuxtKit/
      Models.swift          Codable models: auth user, CV session/document, template,
                            preferences, cloud-data consent, capabilities, health
      APIClient.swift       URLSession async/await client, RuxtEnvironment, typed errors,
                            session-cookie store (Keychain + in-memory for tests)
      LocalCvStore.swift    Local-first CV document store (see below)
      Theme.swift           GENERATED theme tokens (do not edit by hand)
    Tests/RuxtKitTests/     ContractTests, LocalCvStoreTests, ThemeTests
  RuxtApp/
    Info.plist              Receives RuxtAPIBaseURL from the active xcconfig
    Sources/
      RuxtApp.swift         @main entry point
      RootView.swift        Adaptive shell: TabView (compact) / NavigationSplitView (regular)
      AppModels.swift       SessionStore (local store + autosave) and AuthModel (sign-in state)
      AppTheme.swift        Theme choice (system / Latte / Mocha / OpenCode), density, palette
      StateViews.swift      Reusable Empty / Loading / Error state views
      DestinationViews.swift  Sessions list, Editor, and the remaining destinations
      LoginView.swift       Sign-in / register form (Settings > Account)
      SettingsView.swift    Account, theme + density, profile save mode, cloud data consent
  Tools/
    generate-theme.swift    Token generator (Foundation only), reads design/tokens.json
    check-theme-drift.sh    Regenerates Theme.swift to a temp file and diffs it
    provisional-tokens.json Legacy seed kept for reference; no longer the generator input
```

## Flavors

| | Ruxt (Release) | Ruxt Canary |
| --- | --- | --- |
| Scheme | `Ruxt` | `Ruxt-Canary` |
| Configuration | Release | Canary |
| Bundle ID | `cloud.mashallow.ruxt` | `cloud.mashallow.ruxt.canary` |
| Display name | Ruxt | Ruxt Canary |
| Marketing version | 1.0.0 | 1.0.0-canary.1 |
| API base URL | https://ruxt.mashallow.cloud | https://ruxt-canary.mashallow.cloud |

Both flavors build the same sources. The active xcconfig sets `RUXT_API_BASE_URL`; `project.yml` surfaces it in the app Info.plist as `RuxtAPIBaseURL`, and `RuxtEnvironment.current` (in `APIClient.swift`) reads that key at launch — unknown or missing values fall back to production. There is no in-app environment toggle. The canary host is a client build convention only: the server defines no separate canary origin (see Contract gaps).

To regenerate the project after editing `project.yml` or the xcconfigs:

```sh
cd mobile/ios
xcodegen generate --spec project.yml   # commit project.yml and Ruxt.xcodeproj together
```

## RuxtKit API client

`APIClient` covers exactly the routes the app is allowed to use:

- Auth: `register`, `login`, `logout`, `me` — legacy cookie auth. The server issues a sealed `auth_session` cookie (7 days, no bearer token, no refresh); the client captures it and stores it through the `SessionCookieStore` abstraction (Keychain in the app, in-memory in tests). A 401 means the session is gone: sign in again.
- Templates: `listTemplates`, `listPublicTemplates`
- Preferences: `getPreferences`, `updatePreferences`
- Cloud-data consent: `getConsent`, `setConsent`
- Meta: `capabilities`, `health`

Errors use the server's h3/Nitro envelope (`{ statusCode, statusMessage, message, data? }`). `RuxtAPIError` branches on the HTTP status first and then `data.code` when present (`NOT_FOUND` / `CONFLICT` / `BAD_REQUEST` / `INTERNAL_ERROR`); it never parses `statusMessage` for control flow.

The client deliberately does **not** call the plans, subscriptions, or IAM routes: those routes perform no route-level auth check and trust caller-supplied user ids, so a native client must not mirror them.

## Local-first CV documents

CV documents never go to the server (there is no server document CRUD). `LocalCvStore` is the primary store on device: list, get, create, save, rename, fork, delete, with revision metadata. Session ids are UUIDs, independent of titles; a save bumps `revision` only when the markdown or CSS actually changed, and corrupt stored data is never overwritten. The editor autosaves complete snapshots after 600 ms idle when the profile save mode is `auto` (Settings), and the preview renders the markdown locally. Everything else (auth, preferences, consent) is server-backed and needs a network connection.

## Theme and tokens

Theme tokens are generated from the shared `design/tokens.json`:

```sh
cd mobile/ios
swift Tools/generate-theme.swift   # writes RuxtKit/Sources/RuxtKit/Theme.swift
sh Tools/check-theme-drift.sh      # fails if Theme.swift is out of date
```

The app follows the system appearance by default, or pins Latte (light), Mocha (dark), or OpenCode (dark). Theme choice and density (comfortable / compact) persist in UserDefaults via `@AppStorage` keys `ruxt.theme.choice` and `ruxt.density`. Fonts are system fonts (Dynamic Type) and animations respect Reduce Motion.

## Commands

```sh
cd mobile/ios/RuxtKit && swift test

cd mobile/ios
xcodebuild -project Ruxt.xcodeproj -scheme Ruxt-Canary -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Ruxt.xcodeproj -scheme Ruxt -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build

No development team is configured for the project, so the documented builds disable code signing; select a team in Xcode to build for a device or to archive.
```

## Verified vs stubbed

| Area | Status |
| --- | --- |
| RuxtKit package tests | Verified: 24/24 pass (ContractTests 11, LocalCvStoreTests 9, ThemeTests 4) |
| Token generator + drift check | Verified: regeneration from design/tokens.json is byte-identical |
| App build, both flavors | Verified: `xcodebuild` BUILD SUCCEEDED for Ruxt-Canary and Ruxt; built app Info.plists checked (bundle id, display name, version, API URL per flavor) |
| Sessions list + Editor | Implemented on LocalCvStore: create/open/rename/fork/delete, autosave drafts, markdown preview |
| Sign-in / register | Implemented in Settings > Account via AuthModel + APIClient; not exercised against a live server |
| Templates / Profiles / Providers destinations | Shell screens with reusable empty/loading/error states; the RuxtKit client methods for templates/preferences/consent are contract-tested with a mock transport but not wired into these screens yet |
| CV import | Not in the app: the server flow is POST 202 + poll, with import commit / template clone disabled server-side (404) and template save forbidden (403) |
| Cloud sync of CV documents | Not implemented: specified for the web (opt-in consent, compare-and-swap) but no server route exposes it |
| Plans / subscriptions / IAM | Not called by the client, deliberately (see above) |

## Contract gaps

Open questions inherited from the mobile API contract; the app takes the conservative reading in each case:

1. Canary base URL: no canary host is defined server-side; the canary origin above is a client build convention only.
2. Clerk on mobile: the server also supports Clerk sessions, but how a native Clerk session is presented to the API routes is unspecified — the app uses the legacy cookie flow only.
3. Plans/subscriptions/IAM routes have no route-level auth check (see above): flagged, not mirrored.
4. Some response shapes (plan, subscription, import job, capabilities beyond the fields the routes read) are defined by server domain types outside the API layer; the client models them minimally from route usage.
5. Cloud sync (compare-and-swap with base revision and mutation ids) is specified but implemented by no route; local-first editing must not depend on it.
6. `GET /api/auth/me` returns a different shape for legacy sessions than for Clerk sessions; clients must tolerate both until the shapes are unified.
