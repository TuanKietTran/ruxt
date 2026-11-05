# iOS platform

The native iOS app lives in `mobile/ios/` and mirrors the web app's information architecture: sessions, editor, templates, profiles, providers, settings and about. It has two parts. `RuxtKit` is a Swift package holding the Codable models, the API client, the local CV store and the generated theme tokens. `RuxtApp` is the SwiftUI app that renders the screens on top of RuxtKit. The app targets iOS 17; RuxtKit also supports macOS 14 so a future macOS app can reuse it. The Xcode project is described by `project.yml` (XcodeGen) and the generated `Ruxt.xcodeproj` is committed, so `xcodebuild` works without XcodeGen installed.

## Build configurations and API environment

Both flavors build the same sources and differ only through their xcconfig in `mobile/ios/Config/`:

| | Ruxt (Release) | Ruxt Canary |
| --- | --- | --- |
| Scheme | `Ruxt` | `Ruxt-Canary` |
| Configuration | Release | Canary |
| Bundle ID | `cloud.mashallow.ruxt` | `cloud.mashallow.ruxt.canary` |
| Display name | Ruxt | Ruxt Canary |
| Marketing version | 1.0.0 | 1.0.0-canary.1 |
| API base URL | https://ruxt.mashallow.cloud | https://ruxt-canary.mashallow.cloud |

The active xcconfig sets `RUXT_API_BASE_URL`; `project.yml` surfaces it in the app `Info.plist` as `RuxtAPIBaseURL`, and `RuxtEnvironment.current` in RuxtKit reads that key at launch. Unknown or missing values fall back to production. There is no in-app environment toggle. The canary host is a client build convention only: the server defines no separate canary origin.

## Theme and design tokens

Theme tokens come from the single shared source, `design/tokens.json` at the repository root. `mobile/ios/Tools/generate-theme.swift` generates `RuxtKit/Sources/RuxtKit/Theme.swift` from it; the generated file is committed and must not be edited by hand. `mobile/ios/Tools/check-theme-drift.sh` regenerates the theme into a temporary file and fails if it differs from the committed file. The generated API exposes the three palettes (Latte, Mocha and OpenCode) as `RuxtTheme` token sets with the shared colour roles, plus radius, spacing and the two density token sets (comfortable and compact).

At runtime the user picks System, Latte, Mocha or OpenCode in Settings, persisted under the `ruxt.theme.choice` key. System follows the device colour scheme, using Latte in light mode and Mocha in dark mode. The selected palette and density are passed to every screen through the SwiftUI environment. Density is user-selectable (comfortable or compact, persisted under `ruxt.density`) and drives row padding and section spacing.

## Navigation, layout and accessibility

`RootView` is an adaptive shell over seven destinations: Sessions, Editor, Templates, Profiles, Providers, Settings and About. On a compact width (phone) it shows a tab bar with the five main destinations (Sessions, Editor, Templates, Profiles, Settings). On a regular width it shows a `NavigationSplitView` with all seven destinations in the sidebar and the selected screen in a detail navigation stack.

Screens use the system text styles so they follow Dynamic Type, interactive elements carry accessibility labels, the shared state views combine their contents for assistive technologies, and shell animations respect the reduce-motion setting. Colour contrast comes from the shared design tokens.

## Screens and states

Sessions lists the local CV documents from `LocalCvStore` (title, revision and update time), with swipe actions to duplicate or delete a session and a button to create a new one. With no sessions it shows an empty state with the same create action. Deleting is a destructive swipe action; sessions never leave the device.

The Editor edits the open session: a title field, the Markdown source with an optional CSS field, and an Edit/Preview switch that renders the preview. With no document open it shows an empty state. Saving follows the Settings save mode: in auto mode edits are saved after a 600 ms debounce and the editor reports Saved with the new revision, Unsaved changes, or Save failed; in manual mode the user saves explicitly. Drafts are held in memory by the app model and written through `LocalCvStore` on save.

Templates, Profiles and Providers are placeholder destinations. Each presents the shared empty, loading and error state views (with a state preview switch) and no live data yet. Settings is a form with the account section, the theme and density pickers with palette swatches, the save-mode picker, and the cloud-data consent toggles (cloud session recovery and cloud templates, off by default, stored locally). About describes the local-first model. Every destination can present the shared `EmptyStateView`, `LoadingStateView` and `ErrorStateView` (the error state offers a retry action).

## Authentication and storage

Networking uses legacy cookie authentication only. The server issues a sealed `auth_session` cookie (seven days, no bearer token and no refresh); `APIClient` captures it from response headers and stores it through the `SessionCookieStore` abstraction, backed by the Keychain in the app and by an in-memory store in tests. A 401 response means the session is gone and the user signs in again. Sign-in (email and password, with registration) lives in the Settings account section and covers templates, preferences and consent only.

`APIClient` covers exactly the routes the app may use: authentication (register, login, logout, me), templates (list and list public), preferences (get and update), cloud-data consent (get and set), and the capabilities and health endpoints. Errors use the server envelope (`statusCode`, `statusMessage`, `message`, optional `data`) and are mapped to the typed `RuxtAPIError` by HTTP status first. The client deliberately never calls the plans, subscriptions or IAM routes.

CV sessions are local-only. `LocalCvStore` stores documents (id, title, Markdown, CSS, revision and timestamps) through a storage abstraction whose default implementation is `UserDefaults`-backed, and supports create, save, rename, fork and remove. Cloud synchronisation of sessions is specified on the server side but no route exposes it, so editing never depends on it.

## Testing and CI

RuxtKit has a test target, `RuxtKitTests`, run with `swift test` in `mobile/ios/RuxtKit`. ContractTests decode the model shapes from the API contract examples; APIClientExtendedTests exercise the client against a mock transport, including request shapes, session-cookie capture, error mapping, Environment URLs and the in-memory cookie store; LocalCvStoreTests cover the local store; ThemeTests pin palette values and the density tokens.

The `Mobile iOS Canary` workflow (`.github/workflows/mobile-ios-canary.yml`) runs on `workflow_dispatch` and on pushes that touch `mobile/ios/**` or the workflow itself. On `macos-latest` it runs the RuxtKit tests, the theme drift check, and an unsigned `xcodebuild` of the Ruxt-Canary scheme for a generic iOS destination. The workflow is a definition only: it uploads nothing and uses no signing secrets or store steps.

## Planned

- Real Templates, Profiles and Providers content replacing the placeholder state destinations.
- Cloud synchronisation of CV sessions, once a server route exposes the specified compare-and-swap protocol.
- Clerk-based sign-in on mobile, once the contract defines how a native Clerk session is presented to the API routes.
