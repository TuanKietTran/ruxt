import XCTest
@testable import RuxtKit

final class MockTransport: HTTPTransport, @unchecked Sendable {
    private(set) var requests: [URLRequest] = []
    private let handler: (URLRequest) -> (Data, HTTPURLResponse)
    init(handler: @escaping (URLRequest) -> (Data, HTTPURLResponse)) { self.handler = handler }
    func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        return handler(request)
    }
}

private func respond(_ request: URLRequest, status: Int, json: String, headers: [String: String]? = nil) -> (Data, HTTPURLResponse) {
    (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!)
}

final class ContractTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testAuthUserToleratesBothServerShapes() throws {
        let clerk = try decode(AuthUser.self, #"{"id":"clerk:u1","email":"a@b.c"}"#)
        XCTAssertEqual(clerk.effectiveId, "clerk:u1")
        let legacy = try decode(AuthUser.self, #"{"userId":"u2"}"#)
        XCTAssertEqual(legacy.effectiveId, "u2")
        XCTAssertNil(legacy.email)
    }

    func testTemplateDecodingAndPublicVisibility() throws {
        let json = ##"{"templates":[{"id":"t1","version":2,"name":"Modern","markdownSkeleton":"# Name","css":"body{}","capabilities":{"pageFormats":["a4"],"supportsPhoto":true,"atsFriendly":false},"builtIn":true,"tags":["public"],"createdAt":"2026-01-01T00:00:00.000Z"},{"id":"t2","version":1,"name":"Internal","markdownSkeleton":"# X","css":"","capabilities":{"pageFormats":["letter"],"supportsPhoto":false,"atsFriendly":true},"builtIn":false,"tags":["public","internal"],"createdAt":"2026-01-01T00:00:00.000Z"}]}"##
        let list = try decode(CvTemplateList.self, json)
        XCTAssertEqual(list.templates.count, 2)
        XCTAssertTrue(list.templates[0].isPublic)
        XCTAssertFalse(list.templates[1].isPublic)
        XCTAssertEqual(list.templates[0].capabilities.pageFormats, ["a4"])
    }

    func testPreferencesDefaultToAutoOnMissingOrUnknownValue() throws {
        XCTAssertEqual(try decode(UserPreferences.self, #"{}"#).profileSaveMode, .auto)
        XCTAssertEqual(try decode(UserPreferences.self, #"{"profileSaveMode":"weird"}"#).profileSaveMode, .auto)
        let view = try decode(UserPreferencesView.self, #"{"preferences":{"profileSaveMode":"manual"}}"#)
        XCTAssertEqual(view.preferences.profileSaveMode, .manual)
    }

    func testConsentDefaultsToDeniedAndUpdateEncodesCategory() throws {
        let consent = try decode(CloudDataConsent.self, #"{}"#)
        XCTAssertFalse(consent.state(for: .cloudSessions).granted)
        XCTAssertFalse(consent.state(for: .cloudTemplates).granted)
        XCTAssertNil(consent.policyVersion)
        let update = try JSONDecoder().decode(ConsentUpdate.self, from: JSONEncoder().encode(ConsentUpdate(category: .cloudTemplates, granted: true)))
        XCTAssertEqual(update.category, "cloudTemplates")
        XCTAssertTrue(update.granted)
    }

    func testCapabilitiesAndHealthDecode() throws {
        let caps = try decode(CvCapabilities.self, #"{"available":true,"degradedReason":null,"maxUploadBytes":1048576}"#)
        XCTAssertTrue(caps.available)
        XCTAssertEqual(caps.maxUploadBytes, 1048576)
        let health = try decode(HealthStatus.self, #"{"status":"ok","ts":1700000000000}"#)
        XCTAssertEqual(health.status, "ok")
    }

    func testErrorMappingReadsEnvelopeCodeAndMessage() {
        let body = Data(#"{"statusCode":401,"statusMessage":"Unauthorized","message":"Not authenticated","data":{"code":"AUTH_REQUIRED"}}"#.utf8)
        let error = RuxtAPIError.make(data: body, status: 401)
        XCTAssertEqual(error.status, 401)
        XCTAssertEqual(error.code, "AUTH_REQUIRED")
        XCTAssertEqual(error.message, "Not authenticated")
        XCTAssertTrue(error.isUnauthenticated)
        let plain = RuxtAPIError.make(data: Data("nope".utf8), status: 500)
        XCTAssertNil(plain.code)
        XCTAssertEqual(plain.message, "Request failed")
        XCTAssertFalse(plain.isUnauthenticated)
    }

    func testEnvironmentURLs() {
        XCTAssertEqual(RuxtEnvironment.prod.baseURL.absoluteString, "https://ruxt.mashallow.cloud")
        XCTAssertEqual(RuxtEnvironment.canary.baseURL.absoluteString, "https://ruxt-canary.mashallow.cloud")
    }

    func testLoginCapturesCookieAndMeSendsIt() async throws {
        let cookieStore = InMemorySessionCookieStore()
        let transport = MockTransport { request in
            switch request.url!.path {
            case "/api/auth/login":
                return respond(request, status: 200, json: #"{"userId":"u1"}"#, headers: ["Set-Cookie": "auth_session=abc123; Path=/; Max-Age=604800"])
            case "/api/auth/me":
                return respond(request, status: 200, json: #"{"id":"clerk:u1","email":"a@b.c"}"#)
            default:
                return respond(request, status: 404, json: #"{"message":"not found"}"#)
            }
        }
        let client = RuxtAPIClient(environment: .prod, cookieStore: cookieStore, transport: transport)
        let login = try await client.login(email: "a@b.c", password: "secret")
        XCTAssertEqual(login.userId, "u1")
        XCTAssertEqual(cookieStore.cookieValue, "abc123")
        let body = try JSONSerialization.jsonObject(with: transport.requests[0].httpBody!) as? [String: String]
        XCTAssertEqual(body, ["email": "a@b.c", "password": "secret"])
        XCTAssertEqual(transport.requests[0].httpMethod, "POST")
        let me = try await client.me()
        XCTAssertEqual(me.effectiveId, "clerk:u1")
        XCTAssertEqual(transport.requests[1].value(forHTTPHeaderField: "Cookie"), "auth_session=abc123")
    }

    func testLogoutClearsCookieAndErrorStatusThrows() async throws {
        let cookieStore = InMemorySessionCookieStore(cookieValue: "abc123")
        let transport = MockTransport { request in
            if request.url!.path == "/api/auth/logout" { return respond(request, status: 200, json: #"{"ok":true}"#) }
            return respond(request, status: 401, json: #"{"statusCode":401,"message":"Not authenticated"}"#)
        }
        let client = RuxtAPIClient(environment: .prod, cookieStore: cookieStore, transport: transport)
        _ = try await client.logout()
        XCTAssertNil(cookieStore.cookieValue)
        do {
            _ = try await client.me()
            XCTFail("expected RuxtAPIError")
        } catch let error as RuxtAPIError {
            XCTAssertTrue(error.isUnauthenticated)
            XCTAssertEqual(error.message, "Not authenticated")
        }
    }

    func testPreferencesConsentAndTemplatesRoundTrip() async throws {
        let transport = MockTransport { request in
            switch (request.url!.path, request.httpMethod) {
            case ("/api/preferences", "GET"):
                return respond(request, status: 200, json: #"{"preferences":{"profileSaveMode":"manual"}}"#)
            case ("/api/cloud-data/consent", "PUT"):
                return respond(request, status: 200, json: #"{"cloudSessions":{"granted":true},"cloudTemplates":{"granted":false},"policyVersion":"1"}"#)
            case ("/api/cv-templates", "GET"):
                return respond(request, status: 200, json: #"{"templates":[]}"#)
            default:
                return respond(request, status: 404, json: #"{"message":"not found"}"#)
            }
        }
        let client = RuxtAPIClient(environment: .canary, cookieStore: InMemorySessionCookieStore(), transport: transport)
        let prefs = try await client.getPreferences()
        XCTAssertEqual(prefs.profileSaveMode, .manual)
        let consent = try await client.setConsent(category: .cloudSessions, granted: true)
        XCTAssertTrue(consent.state(for: .cloudSessions).granted)
        let sent = try JSONDecoder().decode(ConsentUpdate.self, from: transport.requests[1].httpBody!)
        XCTAssertEqual(sent.category, "cloudSessions")
        XCTAssertEqual(transport.requests[1].url!.absoluteString, "https://ruxt-canary.mashallow.cloud/api/cloud-data/consent")
        let templates = try await client.listTemplates()
        XCTAssertEqual(templates, [])
    }
}
