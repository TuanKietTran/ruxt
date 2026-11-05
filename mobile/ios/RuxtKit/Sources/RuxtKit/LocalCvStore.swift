import Foundation

/// Key-value backing for local CV documents: the injection point the web
/// store gets from `localStorage`. A failed write reports `false` and leaves
/// the previously stored copy intact.
public protocol CvStorage: AnyObject {
    func string(forKey key: String) -> String?
    @discardableResult func setString(_ value: String?, forKey key: String) -> Bool
    var allKeys: [String] { get }
}

public final class InMemoryCvStorage: CvStorage {
    private var values: [String: String] = [:]
    public init() {}
    public func string(forKey key: String) -> String? { values[key] }
    @discardableResult public func setString(_ value: String?, forKey key: String) -> Bool {
        if let value { values[key] = value } else { values.removeValue(forKey: key) }
        return true
    }
    public var allKeys: [String] { Array(values.keys) }
}

public final class UserDefaultsCvStorage: CvStorage {
    private let defaults: UserDefaults
    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    public func string(forKey key: String) -> String? { defaults.string(forKey: key) }
    @discardableResult public func setString(_ value: String?, forKey key: String) -> Bool {
        if let value { defaults.set(value, forKey: key) } else { defaults.removeObject(forKey: key) }
        return true
    }
    public var allKeys: [String] { Array(defaults.dictionaryRepresentation().keys) }
}

/// Device-local CV documents, mirroring the web `localCvStore`: there is no
/// server CRUD route for CV documents, so every document lives in `CvStorage`
/// under the same key prefix the web session backups always used.
public final class LocalCvStore {
    public static let keyPrefix = "cv-sv:session-backup:"
    public static let placeholderTitle = "Untitled CV"

    private let storage: CvStorage
    private let now: () -> Date

    public init(storage: CvStorage = UserDefaultsCvStorage(), now: @escaping () -> Date = Date.init) {
        self.storage = storage; self.now = now
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// First `# ` heading in the markdown, `{...}` suffix stripped.
    public static func titleFromMarkdown(_ markdown: String) -> String? {
        for line in markdown.components(separatedBy: "\n") {
            guard line.hasPrefix("#") else { continue }
            let rest = line.dropFirst()
            guard let first = rest.first, first == " " || first == "\t" else { continue }
            var title = rest.trimmingCharacters(in: .whitespaces)
            if title.hasSuffix("}"), let brace = title.lastIndex(of: "{") {
                title = String(title[..<brace]).trimmingCharacters(in: .whitespaces)
            }
            if !title.isEmpty { return title }
        }
        return nil
    }

    private static func titleOf(_ document: CvDocument) -> String {
        let explicit = document.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let explicit, !explicit.isEmpty, explicit != placeholderTitle { return explicit }
        return titleFromMarkdown(document.markdown) ?? explicit ?? placeholderTitle
    }

    /// Stored shape: the web session-backup JSON (`savedAt` is epoch ms).
    private struct StoredBackup: Codable {
        var markdown: String
        var css: String
        var title: String?
        var revision: Int
        var pending: Bool?
        var savedAt: Double?
    }

    private func read(_ id: String) -> CvDocument? {
        guard let raw = storage.string(forKey: Self.keyPrefix + id),
              let data = raw.data(using: .utf8),
              let backup = try? JSONDecoder().decode(StoredBackup.self, from: data) else { return nil }
        return CvDocument(
            id: id,
            title: backup.title ?? Self.titleFromMarkdown(backup.markdown) ?? Self.placeholderTitle,
            markdown: backup.markdown,
            css: backup.css,
            revision: max(1, backup.revision),
            updatedAt: Self.isoFormatter.string(from: Date(timeIntervalSince1970: (backup.savedAt ?? 0) / 1000)))
    }

    public func get(_ id: String) -> CvDocument? { read(id) }

    public func list() -> [CvDocumentSummary] {
        let summaries = storage.allKeys.compactMap { key -> CvDocumentSummary? in
            guard key.hasPrefix(Self.keyPrefix) else { return nil }
            guard let document = read(String(key.dropFirst(Self.keyPrefix.count))) else { return nil }
            return CvDocumentSummary(id: document.id, title: Self.titleOf(document), revision: document.revision, updatedAt: document.updatedAt)
        }
        return summaries.sorted { $0.updatedAt != $1.updatedAt ? $0.updatedAt > $1.updatedAt : $0.id < $1.id }
    }

    @discardableResult public func put(_ document: CvDocument) -> Bool {
        let savedAt = Self.isoFormatter.date(from: document.updatedAt).map { $0.timeIntervalSince1970 * 1000 }
            ?? now().timeIntervalSince1970 * 1000
        let backup = StoredBackup(markdown: document.markdown, css: document.css, title: document.title,
                                  revision: document.revision, pending: false, savedAt: savedAt)
        guard let data = try? JSONEncoder().encode(backup), let raw = String(data: data, encoding: .utf8) else { return false }
        return storage.setString(raw, forKey: Self.keyPrefix + document.id)
    }

    public func create(id: String, title: String? = nil, markdown: String, css: String) -> CvDocument? {
        // Preserve even an unreadable legacy value rather than silently replacing it.
        guard storage.string(forKey: Self.keyPrefix + id) == nil else { return nil }
        let document = CvDocument(id: id,
                                  title: title?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? Self.placeholderTitle,
                                  markdown: markdown, css: css, revision: 1,
                                  updatedAt: Self.isoFormatter.string(from: now()))
        return put(document) ? document : nil
    }

    /// Save new source, bumping the revision only when it changed.
    public func save(id: String, markdown: String, css: String) -> CvDocument? {
        let raw = storage.string(forKey: Self.keyPrefix + id)
        let current = read(id)
        // A corrupt existing backup is still user data: never treat a failed parse as a missing session.
        if raw != nil && current == nil { return nil }
        if let current, current.markdown == markdown, current.css == css { return current }
        let next = CvDocument(id: id, title: current?.title ?? Self.placeholderTitle,
                              markdown: markdown, css: css, revision: (current?.revision ?? 0) + 1,
                              updatedAt: Self.isoFormatter.string(from: now()))
        return put(next) ? next : nil
    }

    public func rename(id: String, title: String) -> CvDocument? {
        guard let current = read(id) else { return nil }
        var next = current
        next.title = title.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? Self.placeholderTitle
        return put(next) ? next : nil
    }

    public func fork(sourceId: String, newId: String, title: String? = nil) -> CvDocument? {
        guard let source = read(sourceId), read(newId) == nil else { return nil }
        return create(id: newId, title: title ?? "\(Self.titleOf(source)) (copy)", markdown: source.markdown, css: source.css)
    }

    public func remove(id: String) {
        storage.setString(nil, forKey: Self.keyPrefix + id)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
