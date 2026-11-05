import XCTest
@testable import RuxtKit

private func respondJSON(_ request: URLRequest, status: Int, json: String, headers: [String: String]? = nil) -> (Data, HTTPURLResponse) {
    (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!)
}

final class APIClientExtendedTests: XCTestCase {
    func testRegisterPostsCredentialsAndCapturesSessionCookie() async throws {
        let cookieStore = InMemorySessionCookieStore()
        let transport = MockTransport { request in
            respondJSON(request, status: 201, json: #"{"userId":"u9"}"#, headers: ["Set-Cookie": "auth_session=reg456; Path=/; HttpOnly"])
        }
        let client = RuxtAPIClient(environment: .prod, cookieStore: cookieStore, transport: transport)
        let result = try await client.register(email: "new@b.c", password: "secret")
        XCTAssertEqual(result.userId, "u9")
        XCTAssertEqual(cookieStore.cookieValue, "reg456")
        XCTAssertEqual(transport.requests.count, 1)
        let request = transport.requests[0]
        XCTAssertEqual(request.url!.path, "/api/auth/register")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as? [String: String]
        XCTAssertEqual(body, ["email": "new@b.c", "password": "secret"])
    }

    func testEnvironmentFromInfoPlistSwitching() {
        XCTAssertEqual(RuxtEnvironment.fromInfoPlist(["RuxtAPIBaseURL": "https://ruxt-canary.mashallow.cloud"]), .canary)
        XCTAssertEqual(RuxtEnvironment.fromInfoPlist(["RuxtAPIBaseURL": "https://ruxt-canary.mashallow.cloud/"]), .canary)
        XCTAssertEqual(RuxtEnvironment.fromInfoPlist(["RuxtAPIBaseURL": "https://ruxt.mashallow.cloud"]), .prod)
        XCTAssertEqual(RuxtEnvironment.fromInfoPlist(["RuxtAPIBaseURL": "https://example.invalid"]), .prod)
        XCTAssertEqual(RuxtEnvironment.fromInfoPlist([:]), .prod)
        XCTAssertEqual(RuxtEnvironment.fromInfoPlist(nil), .prod)
        XCTAssertEqual(RuxtEnvironment.allCases.count, 2)
    }

    func testInMemoryCookieStoreSetAndClear() {
        let store = InMemorySessionCookieStore()
        XCTAssertNil(store.cookieValue)
        store.cookieValue = "abc123"
        XCTAssertEqual(store.cookieValue, "abc123")
        store.clear()
        XCTAssertNil(store.cookieValue)
        XCTAssertEqual(InMemorySessionCookieStore(cookieValue: "seeded").cookieValue, "seeded")
    }

    func testUpdatePreferencesAndGetConsentRoundTrip() async throws {
        let cookieStore = InMemorySessionCookieStore(cookieValue: "abc123")
        let transport = MockTransport { request in
            switch (request.url!.path, request.httpMethod) {
            case ("/api/preferences", "PUT"):
                return respondJSON(request, status: 200, json: #"{"preferences":{"profileSaveMode":"manual"}}"#)
            case ("/api/cloud-data/consent", "GET"):
                return respondJSON(request, status: 200, json: #"{"cloudSessions":{"granted":true},"cloudTemplates":{"granted":false},"policyVersion":"2026-09-20"}"#)
            default:
                return respondJSON(request, status: 404, json: #"{"message":"not found"}"#)
            }
        }
        let client = RuxtAPIClient(environment: .prod, cookieStore: cookieStore, transport: transport)
        let updated = try await client.updatePreferences(UserPreferences(profileSaveMode: .manual))
        XCTAssertEqual(updated.profileSaveMode, .manual)
        let putBody = try JSONSerialization.jsonObject(with: transport.requests[0].httpBody!) as? [String: [String: String]]
        XCTAssertEqual(putBody, ["preferences": ["profileSaveMode": "manual"]])
        XCTAssertEqual(transport.requests[0].value(forHTTPHeaderField: "Cookie"), "auth_session=abc123")
        let consent = try await client.getConsent()
        XCTAssertTrue(consent.state(for: .cloudSessions).granted)
        XCTAssertFalse(consent.state(for: .cloudTemplates).granted)
        XCTAssertEqual(consent.policyVersion, "2026-09-20")
        XCTAssertEqual(transport.requests[1].httpMethod, "GET")
    }

    func testPublicTemplatesCapabilitiesAndHealth() async throws {
        let transport = MockTransport { request in
            switch request.url!.path {
            case "/api/public/templates":
                return respondJSON(request, status: 200, json: ##"{"templates":[{"id":"t1","version":2,"name":"Public","markdownSkeleton":"# P","css":"","capabilities":{"pageFormats":["a4"],"supportsPhoto":true,"atsFriendly":true},"builtIn":true,"tags":["public"],"createdAt":"2026-01-01T00:00:00.000Z"}]}"##)
            case "/api/cv-capabilities":
                return respondJSON(request, status: 200, json: #"{"available":false,"degradedReason":"renderer offline","maxUploadBytes":2048}"#)
            case "/api/health":
                return respondJSON(request, status: 200, json: #"{"status":"degraded","ts":1700000000001}"#)
            default:
                return respondJSON(request, status: 404, json: #"{"message":"not found"}"#)
            }
        }
        let client = RuxtAPIClient(environment: .canary, cookieStore: InMemorySessionCookieStore(), transport: transport)
        let templates = try await client.listPublicTemplates()
        XCTAssertEqual(templates.map(\.id), ["t1"])
        XCTAssertTrue(templates[0].isPublic)
        XCTAssertTrue(templates[0].capabilities.supportsPhoto)
        XCTAssertEqual(transport.requests[0].url!.absoluteString, "https://ruxt-canary.mashallow.cloud/api/public/templates")
        let capabilities = try await client.capabilities()
        XCTAssertFalse(capabilities.available)
        XCTAssertEqual(capabilities.degradedReason, "renderer offline")
        XCTAssertEqual(capabilities.maxUploadBytes, 2048)
        let health = try await client.health()
        XCTAssertEqual(health.status, "degraded")
        XCTAssertEqual(health.ts, 1700000000001)
    }

    func testErrorMappingStatusMessageFallback() {
        let forbidden = RuxtAPIError.make(data: Data(#"{"statusCode":403,"statusMessage":"Forbidden"}"#.utf8), status: 403)
        XCTAssertEqual(forbidden.status, 403)
        XCTAssertEqual(forbidden.message, "Forbidden")
        XCTAssertNil(forbidden.code)
        XCTAssertFalse(forbidden.isUnauthenticated)
        let empty = RuxtAPIError.make(data: Data(), status: 502)
        XCTAssertEqual(empty.message, "Request failed")
        XCTAssertNil(empty.code)
    }

    func testClientThrowsEnvelopeErrorOnNon2xx() async {
        let transport = MockTransport { request in
            respondJSON(request, status: 500, json: #"{"statusCode":500,"message":"boom","data":{"code":"INTERNAL"}}"#)
        }
        let client = RuxtAPIClient(environment: .prod, cookieStore: InMemorySessionCookieStore(), transport: transport)
        do {
            _ = try await client.health()
            XCTFail("expected RuxtAPIError")
        } catch let error as RuxtAPIError {
            XCTAssertEqual(error.status, 500)
            XCTAssertEqual(error.code, "INTERNAL")
            XCTAssertEqual(error.message, "boom")
        } catch {
            XCTFail("expected RuxtAPIError, got \(error)")
        }
    }

    func testLocalOnlyModelsDecode() throws {
        let decoder = JSONDecoder()
        let document = try decoder.decode(CvDocument.self, from: Data(##"{"id":"cv1","title":"My CV","markdown":"# Hi","css":"","revision":3,"updatedAt":"2026-01-01T00:00:00.000Z"}"##.utf8))
        XCTAssertEqual(document.summary.id, "cv1")
        XCTAssertEqual(document.summary.title, "My CV")
        XCTAssertEqual(document.summary.revision, 3)
        XCTAssertEqual(document.summary.updatedAt, "2026-01-01T00:00:00.000Z")
        let profile = try decoder.decode(CvProfile.self, from: Data(#"{"id":"p1"}"#.utf8))
        XCTAssertNil(profile.name)
        XCTAssertNil(profile.headline)
        XCTAssertNil(profile.updatedAt)
        let ok = try decoder.decode(OkResponse.self, from: Data(#"{"ok":true}"#.utf8))
        XCTAssertTrue(ok.ok)
        XCTAssertEqual(ProfileSaveMode.allCases.map(\.rawValue), ["auto", "manual"])
        XCTAssertEqual(ConsentCategory.allCases.map(\.rawValue), ["cloudSessions", "cloudTemplates"])
    }
}
