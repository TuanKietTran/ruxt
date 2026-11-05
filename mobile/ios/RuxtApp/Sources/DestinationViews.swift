import RuxtKit
import SwiftUI

/// Sessions: the local CV documents from LocalCvStore (via SessionStore).
/// Local-only — creating, duplicating and deleting never leave the device.
struct SessionsView: View {
    @EnvironmentObject private var store: SessionStore

    var body: some View {
        Group {
            if store.summaries.isEmpty {
                VStack(spacing: 12) {
                    EmptyStateView(
                        title: "No sessions yet",
                        message: "CV sessions you create will appear here. They are stored only on this device.",
                        systemImage: "doc.on.doc"
                    )
                    Button("New session") { store.createNew() }
                        .accessibilityLabel("New session")
                }
            } else {
                List {
                    ForEach(store.summaries, id: \.id) { summary in
                        Button { store.open(summary.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(summary.title ?? "Untitled CV")
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text("Revision \(summary.revision) \u{00B7} \(summary.updatedAt)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityLabel(summary.title ?? "Untitled CV")
                        .swipeActions {
                            Button("Duplicate") { store.fork(summary.id) }
                            Button("Delete", role: .destructive) { store.delete(summary.id) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Sessions")
        .toolbar {
            Button { store.createNew() } label: { Label("New session", systemImage: "plus") }
                .accessibilityLabel("New session")
        }
        .alert("Something went wrong", isPresented: errorPresented) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
    }
}

/// Editor for the open session: title, Markdown with autosave drafts
/// (or manual save, following the Settings save mode), optional CSS,
/// and a rendered preview.
struct EditorView: View {
    @EnvironmentObject private var store: SessionStore
    @AppStorage("ruxt.profile.saveMode") private var saveMode = "auto"
    @State private var preview = false
    @State private var showCss = false

    private var autoSave: Bool { saveMode == "auto" }

    var body: some View {
        Group {
            if store.document == nil {
                VStack(spacing: 12) {
                    EmptyStateView(
                        title: "No document open",
                        message: "Open a session to write your CV in Markdown and preview it.",
                        systemImage: "pencil.and.outline"
                    )
                    Button("New session") { store.createNew() }
                        .accessibilityLabel("New session")
                }
            } else {
                VStack(spacing: 0) {
                    TextField("Title", text: $store.draftTitle)
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal)
                        .padding(.top, 8)
                        .accessibilityLabel("CV title")
                    Picker("Mode", selection: $preview) {
                        Text("Edit").tag(false)
                        Text("Preview").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .padding()
                    .accessibilityLabel("Editor mode")
                    if preview {
                        ScrollView {
                            Text(attributedMarkdown)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal)
                        }
                    } else {
                        TextEditor(text: $store.draftMarkdown)
                            .font(.system(.body, design: .monospaced))
                            .padding(.horizontal)
                            .accessibilityLabel("CV Markdown")
                    }
                    DisclosureGroup("Custom CSS", isExpanded: $showCss) {
                        TextEditor(text: $store.draftCss)
                            .font(.system(.footnote, design: .monospaced))
                            .frame(minHeight: 80)
                            .accessibilityLabel("Custom CSS")
                    }
                    .padding(.horizontal)
                    HStack {
                        Text(store.saveStatus).font(.footnote).foregroundStyle(.secondary)
                        Spacer()
                        if store.isDirty {
                            Button("Save") { store.saveNow() }
                                .accessibilityLabel("Save session")
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Editor")
        .onChange(of: store.draftMarkdown) { _, _ in store.scheduleAutosave(autoSave: autoSave) }
        .onChange(of: store.draftCss) { _, _ in store.scheduleAutosave(autoSave: autoSave) }
        .onChange(of: store.draftTitle) { _, _ in store.scheduleAutosave(autoSave: autoSave) }
        .alert("Something went wrong", isPresented: errorPresented) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }

    private var attributedMarkdown: AttributedString {
        (try? AttributedString(markdown: store.draftMarkdown)) ?? AttributedString(store.draftMarkdown)
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
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
