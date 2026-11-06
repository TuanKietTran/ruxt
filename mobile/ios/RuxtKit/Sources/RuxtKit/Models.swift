import Foundation

/// Auth principal. The server has two shapes: Clerk `{id, email}` and the legacy
/// `getUserQuery` result (which carries `userId`); clients tolerate both.
public struct AuthUser: Codable, Equatable, Sendable {
    public var id: String?
    public var email: String?
    public var userId: String?
    public var effectiveId: String? { id ?? userId }
    public init(id: String? = nil, email: String? = nil, userId: String? = nil) {
        self.id = id; self.email = email; self.userId = userId
    }
}

public struct UserIdResponse: Codable, Equatable, Sendable {
    public var userId: String
    public init(userId: String) { self.userId = userId }
}

public struct OkResponse: Codable, Equatable, Sendable {
    public var ok: Bool
    public init(ok: Bool) { self.ok = ok }
}

/// One CV being edited. Local-only: no server CRUD route exists for CV documents.
public struct CvDocument: Codable, Equatable, Sendable {
    public var id: String
    public var title: String?
    public var markdown: String
    public var css: String
    public var revision: Int
    public var updatedAt: String
    public init(id: String, title: String? = nil, markdown: String, css: String, revision: Int, updatedAt: String) {
        self.id = id; self.title = title; self.markdown = markdown; self.css = css
        self.revision = revision; self.updatedAt = updatedAt
    }
    public var summary: CvDocumentSummary {
        CvDocumentSummary(id: id, title: title, revision: revision, updatedAt: updatedAt)
    }
}

public struct CvDocumentSummary: Codable, Equatable, Sendable {
    public var id: String
    public var title: String?
    public var revision: Int
    public var updatedAt: String
    public init(id: String, title: String? = nil, revision: Int, updatedAt: String) {
        self.id = id; self.title = title; self.revision = revision; self.updatedAt = updatedAt
    }
}

public struct CvTemplateCapabilities: Codable, Equatable, Sendable {
    public var pageFormats: [String]
    public var supportsPhoto: Bool
    public var atsFriendly: Bool
    public init(pageFormats: [String], supportsPhoto: Bool, atsFriendly: Bool) {
        self.pageFormats = pageFormats; self.supportsPhoto = supportsPhoto; self.atsFriendly = atsFriendly
    }
}

public struct CvTemplate: Codable, Equatable, Sendable {
    public var id: String
    public var version: Int
    public var name: String
    public var markdownSkeleton: String
    public var css: String
    public var capabilities: CvTemplateCapabilities
    public var builtIn: Bool
    public var tags: [String]
    public var createdAt: String
    /// Public catalog visibility: tagged `public` and not `internal`.
    public var isPublic: Bool { tags.contains("public") && !tags.contains("internal") }
    public init(id: String, version: Int, name: String, markdownSkeleton: String, css: String, capabilities: CvTemplateCapabilities, builtIn: Bool, tags: [String], createdAt: String) {
        self.id = id; self.version = version; self.name = name; self.markdownSkeleton = markdownSkeleton
        self.css = css; self.capabilities = capabilities; self.builtIn = builtIn; self.tags = tags; self.createdAt = createdAt
    }
}

public struct CvTemplateList: Codable, Equatable, Sendable {
    public var templates: [CvTemplate]
    public init(templates: [CvTemplate]) { self.templates = templates }
}

/// A reusable identity block. Local-only on device, like CV documents.
public struct CvProfile: Codable, Equatable, Sendable {
    public var id: String
    public var name: String?
    public var headline: String?
    public var updatedAt: String?
    public init(id: String, name: String? = nil, headline: String? = nil, updatedAt: String? = nil) {
        self.id = id; self.name = name; self.headline = headline; self.updatedAt = updatedAt
    }
}

public enum ProfileSaveMode: String, Codable, CaseIterable, Sendable {
    case auto
    case manual
}

public struct UserPreferences: Codable, Equatable, Sendable {
    public var profileSaveMode: ProfileSaveMode
    public init(profileSaveMode: ProfileSaveMode = .auto) { self.profileSaveMode = profileSaveMode }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let raw = try container.decodeIfPresent(String.self, forKey: .profileSaveMode)
        profileSaveMode = raw.flatMap(ProfileSaveMode.init(rawValue:)) ?? .auto
    }
}

public struct UserPreferencesView: Codable, Equatable, Sendable {
    public var preferences: UserPreferences
    public init(preferences: UserPreferences) { self.preferences = preferences }
}

public struct UserPreferencesUpdate: Codable, Equatable, Sendable {
    public var preferences: UserPreferences
    public init(preferences: UserPreferences) { self.preferences = preferences }
}

public enum ConsentCategory: String, Codable, CaseIterable, Sendable {
    case cloudSessions
    case cloudTemplates
}

public struct ConsentState: Codable, Equatable, Sendable {
    public var granted: Bool
    public init(granted: Bool = false) { self.granted = granted }
}

/// Per-category, default-deny. GET/PUT `/api/cloud-data/consent` return this view.
public struct CloudDataConsent: Codable, Equatable, Sendable {
    public var cloudSessions: ConsentState
    public var cloudTemplates: ConsentState
    public var policyVersion: String?
    public init(cloudSessions: ConsentState = ConsentState(), cloudTemplates: ConsentState = ConsentState(), policyVersion: String? = nil) {
        self.cloudSessions = cloudSessions; self.cloudTemplates = cloudTemplates; self.policyVersion = policyVersion
    }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        cloudSessions = try container.decodeIfPresent(ConsentState.self, forKey: .cloudSessions) ?? ConsentState()
        cloudTemplates = try container.decodeIfPresent(ConsentState.self, forKey: .cloudTemplates) ?? ConsentState()
        policyVersion = try container.decodeIfPresent(String.self, forKey: .policyVersion)
    }
    public func state(for category: ConsentCategory) -> ConsentState {
        category == .cloudSessions ? cloudSessions : cloudTemplates
    }
}

public struct ConsentUpdate: Codable, Equatable, Sendable {
    public var category: String
    public var granted: Bool
    public init(category: ConsentCategory, granted: Bool) {
        self.category = category.rawValue; self.granted = granted
    }
}

public struct CvCapabilities: Codable, Equatable, Sendable {
    public var available: Bool
    public var degradedReason: String?
    public var maxUploadBytes: Int
    public init(available: Bool, degradedReason: String? = nil, maxUploadBytes: Int) {
        self.available = available; self.degradedReason = degradedReason; self.maxUploadBytes = maxUploadBytes
    }
}

public struct HealthStatus: Codable, Equatable, Sendable {
    public var status: String
    public var ts: Int
    public init(status: String, ts: Int) { self.status = status; self.ts = ts }
}
