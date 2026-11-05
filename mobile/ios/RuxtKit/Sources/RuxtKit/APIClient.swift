import Foundation
#if canImport(Security)
import Security
#endif

/// Single switch point for the API origin. Canary is a client build convention;
/// no separate canary host exists in the server repo.
public enum RuxtEnvironment: String, CaseIterable, Sendable {
    case canary
    case prod
    public var baseURL: URL {
        switch self {
        case .canary: return URL(string: "https://ruxt-canary.mashallow.cloud")!
        case .prod: return URL(string: "https://ruxt.mashallow.cloud")!
        }
    }
}

/// h3/Nitro error envelope: branch on HTTP status first, then `data.code`.
public struct RuxtAPIError: Error, Equatable, Sendable {
    public var status: Int
    public var code: String?
    public var message: String
    public var isUnauthenticated: Bool { status == 401 }
    public init(status: Int, code: String? = nil, message: String) {
        self.status = status; self.code = code; self.message = message
    }
    private struct Envelope: Decodable {
        var statusCode: Int?
        var statusMessage: String?
        var message: String?
        var data: DataBody?
        struct DataBody: Decodable { var code: String? }
    }
    public static func make(data: Data, status: Int) -> RuxtAPIError {
        if let envelope = try? JSONDecoder().decode(Envelope.self, from: data) {
            return RuxtAPIError(status: status, code: envelope.data?.code,
                                message: envelope.message ?? envelope.statusMessage ?? "Request failed")
        }
        return RuxtAPIError(status: status, message: "Request failed")
    }
}

/// Stores the sealed `auth_session` cookie value. There is no bearer token and
/// no refresh: the cookie lives 7 days and a 401 means sign in again.
public protocol SessionCookieStore: AnyObject {
    var cookieValue: String? { get set }
    func clear()
}

public final class InMemorySessionCookieStore: SessionCookieStore {
    public var cookieValue: String?
    public init(cookieValue: String? = nil) { self.cookieValue = cookieValue }
    public func clear() { cookieValue = nil }
}

#if canImport(Security)
public final class KeychainSessionCookieStore: SessionCookieStore {
    private let service = "cloud.mashallow.ruxt.session"
    private let account = "auth_session"
    public init() {}
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    public var cookieValue: String? {
        get {
            var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
            var item: CFTypeRef?
            guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            SecItemDelete(query as CFDictionary)
            guard let value = newValue, let data = value.data(using: .utf8) else { return }
            var q = query; q[kSecValueData as String] = data
            SecItemAdd(q as CFDictionary, nil)
        }
    }
    public func clear() { cookieValue = nil }
}
#endif

public protocol HTTPTransport: Sendable {
    func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

extension URLSession: HTTPTransport {
    public func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw RuxtAPIError(status: 0, message: "Non-HTTP response")
        }
        return (data, http)
    }
}

public final class RuxtAPIClient: @unchecked Sendable {
    public let environment: RuxtEnvironment
    public let cookieStore: SessionCookieStore
    private let transport: HTTPTransport
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(environment: RuxtEnvironment = .prod,
                cookieStore: SessionCookieStore = InMemorySessionCookieStore(),
                transport: HTTPTransport = URLSession.shared) {
        self.environment = environment; self.cookieStore = cookieStore; self.transport = transport
    }

    // MARK: - Request plumbing

    private func request(path: String, method: String, body: Data? = nil) -> URLRequest {
        var req = URLRequest(url: environment.baseURL.appendingPathComponent(path))
        req.httpMethod = method
        if body != nil { req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        req.httpBody = body
        if let cookie = cookieStore.cookieValue, !cookie.isEmpty {
            req.setValue("auth_session=\(cookie)", forHTTPHeaderField: "Cookie")
        }
        return req
    }

    private func captureCookie(from response: HTTPURLResponse) {
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { acc, pair in
            if let key = pair.key as? String, let value = pair.value as? String { acc[key] = value }
        }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: environment.baseURL) where cookie.name == "auth_session" {
            cookieStore.cookieValue = cookie.value.isEmpty ? nil : cookie.value
        }
    }

    private func send<T: Decodable>(_ req: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await transport.perform(req)
        captureCookie(from: response)
        guard (200..<300).contains(response.statusCode) else {
            throw RuxtAPIError.make(data: data, status: response.statusCode)
        }
        return try decoder.decode(T.self, from: data)
    }

    private func jsonBody<T: Encodable>(_ value: T) throws -> Data { try encoder.encode(value) }

    private struct Credentials: Encodable { var email: String; var password: String }

    // MARK: - Auth (cookie session, 7 days, no refresh)

    public func register(email: String, password: String) async throws -> UserIdResponse {
        try await send(request(path: "api/auth/register", method: "POST", body: jsonBody(Credentials(email: email, password: password))), as: UserIdResponse.self)
    }
    public func login(email: String, password: String) async throws -> UserIdResponse {
        try await send(request(path: "api/auth/login", method: "POST", body: jsonBody(Credentials(email: email, password: password))), as: UserIdResponse.self)
    }
    public func logout() async throws -> OkResponse {
        let result = try await send(request(path: "api/auth/logout", method: "POST"), as: OkResponse.self)
        cookieStore.clear()
        return result
    }
    public func me() async throws -> AuthUser {
        try await send(request(path: "api/auth/me", method: "GET"), as: AuthUser.self)
    }

    // MARK: - Templates (server catalog, public only; private templates stay local)

    public func listTemplates() async throws -> [CvTemplate] {
        try await send(request(path: "api/cv-templates", method: "GET"), as: CvTemplateList.self).templates
    }
    public func listPublicTemplates() async throws -> [CvTemplate] {
        try await send(request(path: "api/public/templates", method: "GET"), as: CvTemplateList.self).templates
    }

    // MARK: - Preferences & consent

    public func getPreferences() async throws -> UserPreferences {
        try await send(request(path: "api/preferences", method: "GET"), as: UserPreferencesView.self).preferences
    }
    public func updatePreferences(_ preferences: UserPreferences) async throws -> UserPreferences {
        try await send(request(path: "api/preferences", method: "PUT", body: jsonBody(UserPreferencesUpdate(preferences: preferences))), as: UserPreferencesView.self).preferences
    }
    public func getConsent() async throws -> CloudDataConsent {
        try await send(request(path: "api/cloud-data/consent", method: "GET"), as: CloudDataConsent.self)
    }
    public func setConsent(category: ConsentCategory, granted: Bool) async throws -> CloudDataConsent {
        try await send(request(path: "api/cloud-data/consent", method: "PUT", body: jsonBody(ConsentUpdate(category: category, granted: granted))), as: CloudDataConsent.self)
    }

    // MARK: - Misc

    public func capabilities() async throws -> CvCapabilities {
        try await send(request(path: "api/cv-capabilities", method: "GET"), as: CvCapabilities.self)
    }
    public func health() async throws -> HealthStatus {
        try await send(request(path: "api/health", method: "GET"), as: HealthStatus.self)
    }
}
