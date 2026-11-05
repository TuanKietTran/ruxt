# Ruxt for iOS (draft)

Native iOS/macOS shell for Ruxt, mirroring the web app's information architecture: Sessions (dashboard), Editor, Templates, Profiles, Providers, Settings, and About. This draft covers the app shell and theme system only; the Xcode project, API client, and models are added by later work.

## Layout

```
mobile/ios/
  RuxtKit/                  Swift package (theme only in this draft)
    Package.swift           Library RuxtKit + test target RuxtKitTests (iOS + macOS)
    Sources/RuxtKit/Theme.swift   GENERATED theme tokens (do not edit by hand)
    Tests/RuxtKitTests/     ThemeTests (palette lookup, seeded colors, scales, density)
  RuxtApp/Sources/          SwiftUI shell sources (no .xcodeproj yet)
    RuxtApp.swift           @main entry point
    RootView.swift          Adaptive shell: TabView (compact) / NavigationSplitView (regular)
    AppTheme.swift          Theme choice (system / Latte / Mocha), density, palette environment
    StateViews.swift        Reusable Empty / Loading / Error state views + state preview wrapper
    DestinationViews.swift  Placeholder Sessions / Editor / Templates / Profiles / Providers / About
    SettingsView.swift      Theme + density, profile save mode, cloud data consent
  Tools/
    provisional-tokens.json PROVISIONAL tokens seeded from the web themes (see below)
    generate-theme.swift    Token generator (Foundation only)
    check-theme-drift.sh    Regenerates Theme.swift to a temp file and diffs it
```

## Theme and tokens

No design-token JSON exists in this tree yet, so `Tools/provisional-tokens.json` is **PROVISIONAL**: color roles for Latte (light) and Mocha (dark) are seeded from `app/assets/theme/themes.css` in the web app (including the WCAG AA Latte values), and the typography, spacing, radius, elevation, motion, breakpoint, and focus-ring scales are conventional derivations. When a real token JSON lands in `design/` or `specs/design/`, point the generator at it and drop the provisional file.

```sh
cd mobile/ios
swift Tools/generate-theme.swift   # writes RuxtKit/Sources/RuxtKit/Theme.swift
sh Tools/check-theme-drift.sh      # fails if Theme.swift is out of date
```

The shell follows the system appearance by default, or pins Latte (light) / Mocha (dark). Theme choice and density (comfortable / compact) are persisted in UserDefaults via `@AppStorage` keys `ruxt.theme.choice` and `ruxt.density`, and Settings exposes both controls. Fonts are system fonts (Dynamic Type), animations respect Reduce Motion, and contrast comes from the token values above.

## Commands

```sh
cd mobile/ios/RuxtKit && swift test    # theme package tests
```

There is no `.xcodeproj` yet (a later worker owns project/configuration), so there is no `xcodebuild` command for the app in this draft. The shell sources were type-checked against the built RuxtKit module with `swiftc -typecheck` (macOS SDK), which is a compile check only, not a runnable app.

## Verified vs stubbed

| Area | Status |
| --- | --- |
| RuxtKit theme package + `swift test` | Verified (4 tests pass) |
| Token generator + drift check | Verified (regeneration is byte-identical) |
| SwiftUI shell sources | Type-checked only; no Xcode project, not run in a simulator |
| Destinations | Placeholder empty/loading/error states; no real content |
| Networking / API client / models | Not in this draft (owned by later work) |
| Settings persistence | `@AppStorage`/UserDefaults, local only |
