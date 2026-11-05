import SwiftUI

/// App entry point. Sessions are local-only (LocalCvStore); networking is
/// cookie-session auth plus templates/preferences/consent via RuxtKit.
@main
struct RuxtApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
