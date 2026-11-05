//! CV import pipeline jobs (session-derived CV owner only).

use serde::{Deserialize, Serialize};

use crate::client::{encode_segment, ApiClient, ApiResult};
use crate::templates::CvTemplateRef;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CvImportState {
    Queued,
    Running,
    AwaitingInput,
    Succeeded,
    Failed,
    Cancelled,
}

impl CvImportState {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            CvImportState::Succeeded | CvImportState::Failed | CvImportState::Cancelled
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CvImportErrorCode {
    EmptyOrUnreadable,
    NotCvAlike,
    UnsupportedMediaType,
    FileTooLarge,
    ExtractionUnavailable,
    ExtractionFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvSourceArtifact {
    pub id: String,
    pub filename: String,
    pub media_type: String,
    pub size: u64,
    pub checksum: String,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CvGeneratedArtifactKind {
    Concept,
    Markdown,
    Css,
    Html,
    RawText,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvGeneratedArtifact {
    pub id: String,
    pub kind: CvGeneratedArtifactKind,
    pub media_type: String,
    pub size: u64,
    pub checksum: String,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvImportError {
    pub code: CvImportErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasons: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvImportJob {
    pub id: String,
    pub owner_id: String,
    pub template: CvTemplateRef,
    pub state: CvImportState,
    pub progress: f64,
    pub stage: String,
    pub source: CvSourceArtifact,
    pub artifacts: Vec<CvGeneratedArtifact>,
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<CvImportError>,
    pub cancel_requested: bool,
    pub attempt: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvImportPreview {
    pub import_id: String,
    pub state: CvImportState,
    /// The extracted CV concept; its profile matches the shared
    /// `CvProfile` shape but the server types it as opaque here.
    pub concept: serde_json::Value,
    pub markdown: String,
    pub css: String,
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
}

impl ApiClient {
    /// POST /api/cv-imports (multipart: file, templateId, templateVersion).
    /// Returns 202 with the queued job. The server enforces its capability
    /// limits (media type/extension match, max upload bytes).
    pub async fn create_import(
        &self,
        filename: &str,
        media_type: &str,
        bytes: Vec<u8>,
        template: &CvTemplateRef,
        idempotency_key: Option<&str>,
    ) -> ApiResult<CvImportJob> {
        let file_part = reqwest::multipart::Part::bytes(bytes)
            .file_name(filename.to_string())
            .mime_str(media_type)?;
        let form = reqwest::multipart::Form::new()
            .part("file", file_part)
            .text("templateId", template.id.clone())
            .text("templateVersion", template.version.to_string());
        self.post_multipart("/api/cv-imports", form, idempotency_key)
            .await
    }

    /// GET /api/cv-imports/{id}
    pub async fn get_import(&self, id: &str) -> ApiResult<CvImportJob> {
        let path = format!("/api/cv-imports/{}", encode_segment(id));
        self.get_json(&path).await
    }

    /// GET /api/cv-imports/{id}/preview
    pub async fn preview_import(&self, id: &str) -> ApiResult<CvImportPreview> {
        let path = format!("/api/cv-imports/{}/preview", encode_segment(id));
        self.get_json(&path).await
    }

    /// POST /api/cv-imports/{id}/cancel
    pub async fn cancel_import(&self, id: &str) -> ApiResult<CvImportJob> {
        let path = format!("/api/cv-imports/{}/cancel", encode_segment(id));
        self.post_empty(&path).await
    }

    /// POST /api/cv-imports/{id}/retry — 202 with the re-queued job.
    pub async fn retry_import(&self, id: &str) -> ApiResult<CvImportJob> {
        let path = format!("/api/cv-imports/{}/retry", encode_segment(id));
        self.post_empty(&path).await
    }

    /// POST /api/cv-imports/{id}/commit — currently 404 by design:
    /// imported CVs are created in browser storage, not the server store.
    pub async fn commit_import(&self, id: &str) -> ApiResult<serde_json::Value> {
        let path = format!("/api/cv-imports/{}/commit", encode_segment(id));
        self.post_empty(&path).await
    }
}
