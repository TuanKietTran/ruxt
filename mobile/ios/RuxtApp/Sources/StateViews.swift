import SwiftUI

/// The three placeholder states every main destination can present.
enum ContentState: String, CaseIterable, Identifiable {
    case empty
    case loading
    case error
    var id: String { rawValue }
}

struct EmptyStateView: View {
    let title: String
    let message: String
    let systemImage: String
    var body: some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text(message))
            .accessibilityElement(children: .combine)
    }
}

struct LoadingStateView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading\u{2026}").font(.body).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Loading")
    }
}

struct ErrorStateView: View {
    let message: String
    var retry: () -> Void = {}
    var body: some View {
        ContentUnavailableView {
            Label("Something went wrong", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try again", action: retry).font(.body)
        }
        .accessibilityElement(children: .contain)
    }
}

/// Wraps a destination with a state preview switch, wired to the reusable state views.
/// Real content replaces the empty state when feature work lands.
struct StatefulDestination<Content: View>: View {
    let title: String
    let emptyTitle: String
    let emptyMessage: String
    let emptyImage: String
    @ViewBuilder var content: Content
    @State private var state: ContentState = .empty

    var body: some View {
        VStack(spacing: 0) {
            Picker("State", selection: $state) {
                Text("Empty").tag(ContentState.empty)
                Text("Loading").tag(ContentState.loading)
                Text("Error").tag(ContentState.error)
            }
            .pickerStyle(.segmented)
            .padding()
            .accessibilityLabel("Preview state")
            switch state {
            case .empty:
                EmptyStateView(title: emptyTitle, message: emptyMessage, systemImage: emptyImage)
            case .loading:
                LoadingStateView()
            case .error:
                ErrorStateView(message: "Could not load \(title.lowercased()). Check your connection and try again.") { state = .empty }
            }
        }
        .navigationTitle(title)
    }
}
