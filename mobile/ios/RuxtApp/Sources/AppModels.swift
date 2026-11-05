import Foundation
import RuxtKit
import SwiftUI

/// Observable wrapper around the local-only CV store. Sessions never leave
/// the device: there is no server CRUD route for CV documents.
@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var summaries: [CvDocumentSummary] = []
    @Published var selectedId: String?
    @Published private(set) var document: CvDocument?
    @Published var draftTitle = ""
    @Published var draftMarkdown = ""
    @Published var draftCss = ""
    @Published private(set) var saveStatus = ""
    @Published var errorMessage: String?

    private let store: LocalCvStore
    private var autosaveTask: Task<Void, Never>?

    init(store: LocalCvStore = LocalCvStore()) {
        self.store = store
        reload()
        if let first = summaries.first { open(first.id) }
    }

    var isDirty: Bool {
        guard let document else { return false }
        return draftMarkdown != document.markdown || draftCss != document.css
            || draftTitle != (document.title ?? "")
    }

    func reload() {
        summaries = store.list()
        if let selectedId, document == nil { open(selectedId) }
    }

    func open(_ id: String) {
        autosaveTask?.cancel()
        guard let doc = store.get(id) else {
            errorMessage = "That session could not be read. It may be corrupted and was left untouched."
            return
        }
        selectedId = id
        document = doc
        draftTitle = doc.title ?? ""
        draftMarkdown = doc.markdown
        draftCss = doc.css
        saveStatus = "Saved \u{00B7} revision \(doc.revision)"
        errorMessage = nil
    }

    @discardableResult
    func createNew() -> String {
        let id = UUID().uuidString.lowercased()
        let markdown = "# Untitled CV\n\n## Summary\n\n\n## Experience\n\n"
        guard let doc = store.create(id: id, markdown: markdown, css: "") else {
            errorMessage = "Could not create a new session."
            return id
        }
        reload()
        open(doc.id)
        return doc.id
    }

    func scheduleAutosave(autoSave: Bool) {
        guard document != nil else { return }
        guard isDirty else { saveStatus = "Saved"; return }
        saveStatus = "Unsaved changes"
        guard autoSave else { return }
        autosaveTask?.cancel()
        autosaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            self?.saveNow()
        }
    }

    func saveNow() {
        guard let current = document else { return }
        autosaveTask?.cancel()
        guard let saved = store.save(id: current.id, markdown: draftMarkdown, css: draftCss) else {
            errorMessage = "Could not save this session. It was left untouched."
            saveStatus = "Save failed"
            return
        }
        var result = saved
        let title = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if title != (saved.title ?? ""), let renamed = store.rename(id: saved.id, title: title) {
            result = renamed
        }
        document = result
        draftTitle = result.title ?? ""
        saveStatus = "Saved \u{00B7} revision \(result.revision)"
        errorMessage = nil
        reload()
    }

    func delete(_ id: String) {
        store.remove(id: id)
        if selectedId == id {
            selectedId = nil; document = nil; draftTitle = ""; draftMarkdown = ""; draftCss = ""
        }
        reload()
        if document == nil, let first = summaries.first { open(first.id) }
    }

    func fork(_ id: String) {
        let newId = UUID().uuidString.lowercased()
        guard store.fork(sourceId: id, newId: newId) != nil else {
            errorMessage = "Could not duplicate that session."
            return
        }
        reload()
        open(newId)
    }
}

/// Cookie-session auth. Only the sealed `auth_session` cookie is stored
/// (Keychain where available); there is no bearer token and no refresh.
@MainActor
final class AuthModel: ObservableObject {
    @Published private(set) var user: AuthUser?
    @Published private(set) var isBusy = false
    @Published var errorMessage: String?

    let client: RuxtAPIClient

    init(client: RuxtAPIClient? = nil) {
        if let client { self.client = client } else {
            #if canImport(Security)
            self.client = RuxtAPIClient(cookieStore: KeychainSessionCookieStore())
            #else
            self.client = RuxtAPIClient()
            #endif
        }
    }

    var isSignedIn: Bool { user != nil }
    var accountLabel: String { user?.email ?? user?.effectiveId ?? "Signed in" }

    func restore() async {
        guard client.cookieStore.cookieValue != nil else { return }
        do { user = try await client.me(); errorMessage = nil }
        catch let error as RuxtAPIError where error.isUnauthenticated { user = nil }
        catch { errorMessage = (error as? RuxtAPIError)?.message ?? "Could not restore your session." }
    }

    func login(email: String, password: String) async {
        await run { _ = try await client.login(email: email, password: password); user = try await client.me() }
    }

    func register(email: String, password: String) async {
        await run { _ = try await client.register(email: email, password: password); user = try await client.me() }
    }

    func logout() async {
        await run { _ = try await client.logout(); user = nil }
    }

    private func run(_ action: () async throws -> Void) async {
        isBusy = true; errorMessage = nil
        do { try await action() }
        catch let error as RuxtAPIError { errorMessage = error.message; if error.isUnauthenticated { user = nil } }
        catch { errorMessage = "Something went wrong. Check your connection and try again." }
        isBusy = false
    }
}
