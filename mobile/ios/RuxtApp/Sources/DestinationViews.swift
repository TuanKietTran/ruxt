import SwiftUI

/// Placeholder destinations. Each main destination is wired to the reusable
/// empty/loading/error state views; real content replaces the empty state
/// when feature work lands. No networking: local placeholder data only.
struct SessionsView: View {
    var body: some View {
        StatefulDestination(
            title: "Sessions",
            emptyTitle: "No sessions yet",
            emptyMessage: "CV sessions you create or open will appear here, grouped like the web dashboard.",
            emptyImage: "doc.on.doc"
        ) { EmptyView() }
    }
}

struct EditorView: View {
    @State private var markdown = ""
    var body: some View {
        StatefulDestination(
            title: "Editor",
            emptyTitle: "No document open",
            emptyMessage: "Open a session to write your CV in Markdown and preview or export it.",
            emptyImage: "pencil.and.outline"
        ) { EmptyView() }
        .accessibilityLabel("CV editor")
    }
}

struct TemplatesView: View {
    var body: some View {
        StatefulDestination(
            title: "Templates",
            emptyTitle: "No templates available",
            emptyMessage: "No templates are available. Start with a blank CV.",
            emptyImage: "doc.richtext"
        ) { EmptyView() }
    }
}

struct ProfilesView: View {
    var body: some View {
        StatefulDestination(
            title: "Profiles",
            emptyTitle: "No profile yet",
            emptyMessage: "Create a profile with identity, experience, skills, and education to apply to sessions.",
            emptyImage: "person.crop.circle"
        ) { EmptyView() }
    }
}

struct ProvidersView: View {
    var body: some View {
        StatefulDestination(
            title: "Providers",
            emptyTitle: "No providers connected",
            emptyMessage: "Cloud providers you connect for sessions and templates will appear here.",
            emptyImage: "cloud"
        ) { EmptyView() }
    }
}

struct AboutView: View {
    var body: some View {
        List {
            Section {
                Text("Write your CV in Markdown").font(.headline)
                Text("Ruxt is local-first, with optional cloud sync.").font(.body).foregroundStyle(.secondary)
            }
            Section {
                Text("Local-first").font(.body)
                Text("Optional cloud").font(.body)
            }
        }
        .navigationTitle("About Ruxt")
    }
}
