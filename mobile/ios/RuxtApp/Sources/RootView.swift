import RuxtKit
import SwiftUI

/// Main destinations, mirroring the web information architecture:
/// dashboard sessions, CV editor, templates, profiles, and settings,
/// plus the secondary providers and about screens.
enum AppDestination: String, CaseIterable, Identifiable {
    case sessions
    case editor
    case templates
    case profiles
    case providers
    case settings
    case about

    var id: String { rawValue }
    var title: String {
        switch self {
        case .sessions: return "Sessions"
        case .editor: return "Editor"
        case .templates: return "Templates"
        case .profiles: return "Profiles"
        case .providers: return "Providers"
        case .settings: return "Settings"
        case .about: return "About"
        }
    }
    var systemImage: String {
        switch self {
        case .sessions: return "doc.on.doc"
        case .editor: return "pencil.and.outline"
        case .templates: return "doc.richtext"
        case .profiles: return "person.crop.circle"
        case .providers: return "cloud"
        case .settings: return "gearshape"
        case .about: return "info.circle"
        }
    }
    /// The five destinations shown as bottom tabs on a phone.
    static var mainTabs: [AppDestination] { [.sessions, .editor, .templates, .profiles, .settings] }
}

struct RootView: View {
    @AppStorage("ruxt.theme.choice") private var themeChoiceRaw = AppThemeChoice.system.rawValue
    @AppStorage("ruxt.density") private var densityRaw = AppDensity.comfortable.rawValue
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selection: AppDestination = .sessions

    private var themeChoice: AppThemeChoice { AppThemeChoice(rawValue: themeChoiceRaw) ?? .system }
    private var density: AppDensity { AppDensity(rawValue: densityRaw) ?? .comfortable }
    private var palette: RuxtThemeTokens { themeChoice.palette(systemScheme: systemScheme) }

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                splitLayout
            } else {
                tabLayout
            }
        }
        .environment(\.ruxtPalette, palette)
        .environment(\.ruxtDensity, density.tokens)
        .preferredColorScheme(themeChoice.preferredColorScheme)
        .animation(reduceMotion ? nil : .easeInOut(duration: RuxtMotion.standard), value: selection)
        .tint(Color(hex: palette.colors.accent))
    }

    private var tabLayout: some View {
        TabView(selection: $selection) {
            ForEach(AppDestination.mainTabs) { destination in
                NavigationStack {
                    detail(for: destination)
                }
                .tabItem { Label(destination.title, systemImage: destination.systemImage) }
                .tag(destination)
                .accessibilityLabel(destination.title)
            }
        }
    }

    private var splitLayout: some View {
        NavigationSplitView {
            List(AppDestination.allCases, selection: $selection) { destination in
                Label(destination.title, systemImage: destination.systemImage)
                    .font(.body)
                    .tag(destination)
            }
            .navigationTitle("Ruxt")
        } detail: {
            NavigationStack {
                detail(for: selection)
            }
        }
    }

    @ViewBuilder
    private func detail(for destination: AppDestination) -> some View {
        switch destination {
        case .sessions: SessionsView()
        case .editor: EditorView()
        case .templates: TemplatesView()
        case .profiles: ProfilesView()
        case .providers: ProvidersView()
        case .settings: SettingsView()
        case .about: AboutView()
        }
    }
}
