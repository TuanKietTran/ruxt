//! Serde fixture round-trips for every ruxt-api model.
//! Fixtures mirror the JSON shapes of `server/routes/api/**`; no network.

use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};

use ruxt_api::applications::CvApplication;
use ruxt_api::auth::{AuthResponse, Credentials, OkResponse, User};
use ruxt_api::capabilities::CvPipelineCapabilities;
use ruxt_api::consent::{CloudDataConsentView, SetConsentRequest};
use ruxt_api::health::Health;
use ruxt_api::imports::{CvImportJob, CvImportPreview, CvImportState};
use ruxt_api::preferences::{UserPreferencesPatch, UserPreferencesView};
use ruxt_api::templates::TemplateList;

fn round_trip<T: DeserializeOwned + Serialize>(fixture: Value) {
    let parsed: T = serde_json::from_value(fixture.clone()).expect("fixture deserializes");
    let back = serde_json::to_value(&parsed).expect("model serializes");
    assert_eq!(back, fixture);
}

#[test]
fn health_round_trip() {
    round_trip::<Health>(json!({ "status": "ok", "ts": 1793800000000u64 }));
}

#[test]
fn auth_round_trips() {
    round_trip::<Credentials>(json!({ "email": "a@b.c", "password": "secret" }));
    round_trip::<AuthResponse>(json!({ "userId": "user-1" }));
    round_trip::<User>(json!({ "id": "user-1", "email": "a@b.c" }));
    round_trip::<OkResponse>(json!({ "ok": true }));
}

#[test]
fn capabilities_round_trip_without_degraded_reason() {
    round_trip::<CvPipelineCapabilities>(json!({
        "available": true,
        "formats": ["pdf", "png", "jpeg"],
        "maxUploadBytes": 5242880,
        "ocr": true,
        "renderer": "builtin"
    }));
}

fn template_fixture() -> Value {
    json!({
        "id": "classic",
        "version": 3,
        "name": "Classic",
        "markdownSkeleton": "# CV",
        "css": "body { margin: 0; }",
        "capabilities": {
            "pageFormats": ["a4", "letter"],
            "supportsPhoto": false,
            "atsFriendly": true
        },
        "builtIn": true,
        "tags": ["public"],
        "createdAt": "2026-09-20T00:00:00.000Z"
    })
}

#[test]
fn template_list_round_trip() {
    round_trip::<TemplateList>(json!({ "templates": [template_fixture()] }));
}

fn profile_fixture() -> Value {
    json!({
        "version": 1,
        "identity": {
            "fullName": "Ada Lovelace",
            "headline": "Engineer",
            "summary": "Builds things.",
            "location": "London"
        },
        "contacts": [
            { "kind": "email", "label": "Email", "value": "ada@example.com" },
            { "kind": "github", "label": "GitHub", "value": "ada" }
        ],
        "experiences": [{
            "title": "Senior Engineer", "company": "Acme", "location": "Remote",
            "start": "2022-01", "end": "present", "highlights": ["Shipped X"]
        }],
        "skills": [{ "name": "Languages", "skills": ["Rust", "TypeScript"] }],
        "certifications": [{ "name": "AWS SA", "issuer": "Amazon" }],
        "education": [{
            "degree": "BSc CS", "school": "Example University", "location": "London",
            "start": "2015", "end": "2019", "details": "First class"
        }],
        "projects": [{
            "name": "ruxt", "url": "https://example.com", "description": "CV builder",
            "technologies": ["Rust"]
        }],
        "languages": ["English"]
    })
}

#[test]
fn application_round_trip() {
    round_trip::<CvApplication>(json!({
        "id": "app-1",
        "ownerId": "user-1",
        "revision": 2,
        "template": {
            "ref": { "id": "classic", "version": 3 },
            "value": template_fixture(),
            "checksum": "abc123"
        },
        "profile": {
            "ref": { "id": "profile-1", "version": 1 },
            "value": profile_fixture(),
            "checksum": "def456"
        },
        "status": "draft",
        "createdAt": "2026-10-01T00:00:00.000Z",
        "updatedAt": "2026-10-02T00:00:00.000Z"
    }));
}

#[test]
fn import_job_round_trip() {
    round_trip::<CvImportJob>(json!({
        "id": "imp-1",
        "ownerId": "user-1",
        "template": { "id": "classic", "version": 3 },
        "state": "failed",
        "progress": 0.5,
        "stage": "extract",
        "source": {
            "id": "src-1", "filename": "cv.pdf", "mediaType": "application/pdf",
            "size": 1024, "checksum": "sha-1",
            "createdAt": "2026-10-01T00:00:00.000Z", "expiresAt": "2026-10-08T00:00:00.000Z"
        },
        "artifacts": [{
            "id": "art-1", "kind": "raw-text", "mediaType": "text/plain",
            "size": 42, "checksum": "sha-2",
            "createdAt": "2026-10-01T00:01:00.000Z", "expiresAt": "2026-10-08T00:01:00.000Z"
        }],
        "warnings": ["low confidence"],
        "error": {
            "code": "EXTRACTION_FAILED", "message": "could not extract",
            "reasons": ["blurry scan"]
        },
        "cancelRequested": false,
        "attempt": 1,
        "idempotencyKey": "key-1",
        "createdAt": "2026-10-01T00:00:00.000Z",
        "updatedAt": "2026-10-01T00:02:00.000Z"
    }));
}

#[test]
fn import_preview_round_trip() {
    round_trip::<CvImportPreview>(json!({
        "importId": "imp-1",
        "state": "succeeded",
        "concept": { "profile": { "identity": { "fullName": "Ada" } } },
        "markdown": "# Ada",
        "css": "body {}",
        "warnings": [],
        "confidence": 0.87
    }));
}

#[test]
fn import_state_terminal_flags() {
    assert!(CvImportState::Succeeded.is_terminal());
    assert!(CvImportState::Failed.is_terminal());
    assert!(CvImportState::Cancelled.is_terminal());
    assert!(!CvImportState::Queued.is_terminal());
    assert!(!CvImportState::Running.is_terminal());
    assert!(!CvImportState::AwaitingInput.is_terminal());
}

#[test]
fn consent_round_trips() {
    round_trip::<CloudDataConsentView>(json!({
        "policyVersion": "2026-09-20",
        "cloudSessions": { "granted": true, "changedAt": "2026-10-01T00:00:00.000Z" },
        "cloudTemplates": { "granted": false, "changedAt": null }
    }));
    round_trip::<SetConsentRequest>(json!({ "category": "cloudSessions", "granted": true }));
}

#[test]
fn preferences_round_trips() {
    round_trip::<UserPreferencesView>(json!({
        "preferences": { "profileSaveMode": "auto" },
        "updatedAt": "2026-10-01T00:00:00.000Z"
    }));
    assert_eq!(
        serde_json::to_value(UserPreferencesPatch::default()).expect("patch serializes"),
        json!({})
    );
    round_trip::<UserPreferencesPatch>(json!({ "profileSaveMode": "manual" }));
}
