# Flutter platform

This specification describes the Flutter app in `mobile/flutter/` as it currently behaves. Behaviour that does not exist yet is labelled Planned.

## Architecture

The app is a single Flutter package (`ruxt`, Dart SDK ^3.3.0) with one dependency beyond the Flutter SDK, `shared_preferences`, plus `flutter_test` and `flutter_lints` for development. There is no state-management or HTTP package. State is held in plain Dart controllers and classes, persistence goes through an abstract key-value seam backed by `shared_preferences`, and network access goes through an abstract transport seam backed by `dart:io` by default. This keeps the data layer testable with in-memory fakes and no platform channels.

Startup is shared in `lib/app/bootstrap.dart`: it loads preferences and runs the root widget with a resolved `AppConfig`. `lib/app/ruxt_app.dart` builds the `MaterialApp` and follows OS brightness through the theme controller. `lib/app/ruxt_shell.dart` provides the shell chrome: header with theme control, bottom navigation or navigation rail depending on window width, and a skip link. Destinations are declared in governing order in `lib/app/destinations.dart`.

Code is organised as `lib/app/` for configuration and shell, `lib/theme/` for the token theme system, `lib/data/` for models, the contract API client, authentication and local stores, `lib/features/` for screens, and `lib/widgets/` for shared views including the reusable state views.

The data layer in `lib/data/` is implemented but not yet wired into the screens. Screens are still the shell placeholders described below. Planned: wiring sessions, profiles, templates and settings screens to the local stores and API client.

## Flavors and the canary channel

Two flavors ship from this tree, selected by dedicated entry points or by compile-time defines. Prod uses application and bundle id `cloud.mashallow.ruxt`, display name Ruxt, and API base `https://ruxt.mashallow.cloud`. Canary uses `cloud.mashallow.ruxt.canary`, display name Ruxt Canary, and API base `https://ruxt-canary.mashallow.cloud`. The API hosts are a build convention for this app and are referenced only in the flavor configuration and the native flavor files.

On Android, `productFlavors` in `android/app/build.gradle` uses the `channel` dimension; canary adds the `.canary` application id suffix and a `-canary` version name suffix, and the manifest label and API base come from flavor `resValue` entries. On iOS, `ios/Flutter/Prod.xcconfig` and `ios/Flutter/Canary.xcconfig` set the bundle id, display name and API base; the project defaults to the prod values and `Info.plist` uses the display name variable.

In Dart, `lib/app/app_config.dart` defines `AppConfig.prod`, `AppConfig.canary` and `AppConfig.fromEnvironment`, which reads the `FLAVOR` define (default prod) and an optional `API_BASE_URL` override. Entry points are `lib/main.dart` (environment-resolved, defaults to prod), `lib/main_prod.dart` and `lib/main_canary.dart`. Canary is a pre-release channel for validating builds before prod; it is distributed only as a CI artifact (see Tests and CI). There is no store publishing from this repository.

## Theme and token generator

The theme is generated from `design/tokens.json`. `lib/theme/generated_theme.dart` is generated output and must not be hand-edited. `mobile/flutter/tool/generate_theme.py` regenerates it, `tool/check_theme_drift.sh` fails when the generated file differs from the tokens, and `tool/validate_against_golden.py` cross-checks the generated values against a golden set of numbers, strings and colours. Theme selection, preferences, density and accessibility behaviour live in `lib/theme/` alongside the generated file: the controller resolves palette from selection and OS brightness, preferences persist theme and density choices, and the Settings screen theme and density controls are the one functional control in the shell.

## Screens and states

Primary destinations cover the editor, sessions, profiles and templates, with secondary destinations for supporting screens and settings. Each screen is a placeholder that demonstrates the content and states the real screen must handle, using the shared views in `lib/widgets/state_views.dart` for empty, loading, error and offline states instead of per-screen copies. Loading always carries a text label in a live region rather than a bare spinner, and under reduced motion the spinner is replaced by a static placeholder. No placeholder screen performs input or output. Planned: replacing placeholder bodies with live data from the local stores while keeping the same state coverage (data, empty, loading and error) for every list and detail view.

## API contract usage

CV sessions, profiles and private templates are local-only. They mirror the web storage keys `cv-sv:session-backup:<id>`, `cv-sv:local-profiles:v1`, `cv-sv:local-templates:v1` and `cv-sv:preferences:v1`, held by the local stores in `lib/data/local_stores.dart`. Local saves carry a revision and a saved-at timestamp; a draft is the unsaved working copy of a session, and forking a profile or template copies it under a new id without mutating the original.

The API client in `lib/data/api_client.dart` covers only health, authentication, preferences, consent, the public template catalog, capabilities, application and artifact reads, and CV import (create, poll until terminal, preview, cancel and retry). Authentication is the legacy sealed `auth_session` cookie: the client captures it from `set-cookie` on login, persists it through the key-value store, sends it on later requests, and clears it on logout or when the server clears it. There is no bearer token and no refresh; a 401 response means signed out and is surfaced as an unauthorized error, which the cookie auth service maps to no current user. A second auth implementation for Clerk exists behind the same interface as a stub that reports itself unavailable. Planned: enabling Clerk behind that interface.

Legacy plans, subscriptions and IAM routes are deliberately omitted: there are no screens and no clients for them. Identity always comes from the session; no request carries a caller-chosen user id.

## Tests and CI

Tests live in `mobile/flutter/test/` and run with `flutter test`. `theme_test.dart` covers palette resolution, preferences, density and window classes, the theme controller and the Material theme. `shell_test.dart` covers the app shell. `data_models_test.dart` covers model JSON mapping against the contract (CV documents and title extraction, auth users in both provider shapes, templates, profiles, preferences and consent, capabilities, health and import jobs) and `AppConfig` flavor values. `api_client_test.dart` covers the contract client with a fake transport: cookie capture, persistence and clearing, 401 handling, preference and consent envelopes, template envelopes, import creation and polling, and a security guard asserting that no library source calls the legacy plans, subscriptions or IAM routes, uses bearer auth, or sends a caller-chosen user id. `local_stores_test.dart` covers local session create, save and revision behaviour, drafts, and profile forking. `session_list_test.dart` covers the session list against the real local store (not a server mock) and the sessions screen preview states: data, empty, loading and error.

CI is `.github/workflows/mobile-flutter-canary.yml`. It runs on pushes and pull requests that touch `mobile/flutter/**`, on `v*` tags, and on manual dispatch. The verify job installs dependencies and runs the drift check, the golden validation, `flutter analyze` and `flutter test`. The canary job then builds the canary APK and app bundle and uploads them as workflow artifacts only; it does not publish to any store and uses no secrets beyond the default workflow token. The prod job builds the prod APK and app bundle as artifacts only and runs solely on manual dispatch when its `build_prod` input is set. Planned: no store submission is planned from this workflow.

## Verified and unverified

Verified without the Flutter toolchain: the theme drift check passes with no drift against `design/tokens.json`, and the golden validation passes (66 doubles, 12 strings, colours verified). The workflow file is validated as YAML. The new tests are hand-written against the data layer interfaces and reviewed against the contract shapes.

Unverified: `flutter` and `dart` were not on PATH in the environment that produced this work, so `flutter pub get`, `flutter analyze` and `flutter test` have not been run for this change and the canary and prod builds have not been run locally. Those commands are expected to run first in CI. Until a CI run is green, the test suite and builds should be treated as unverified rather than passing.
