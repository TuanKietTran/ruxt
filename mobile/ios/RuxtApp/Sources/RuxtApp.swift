import SwiftUI

/// App entry point. No networking in this shell: every destination uses
/// local placeholder view models and reusable empty/loading/error states.
@main
struct RuxtApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
