//! CV pipeline capabilities.

use serde::{Deserialize, Serialize};

use crate::client::{ApiClient, ApiResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvPipelineCapabilities {
    pub available: bool,
    pub formats: Vec<String>,
    pub max_upload_bytes: u64,
    pub ocr: bool,
    pub renderer: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub degraded_reason: Option<String>,
}

impl ApiClient {
    /// GET /api/cv-capabilities
    pub async fn cv_capabilities(&self) -> ApiResult<CvPipelineCapabilities> {
        self.get_json("/api/cv-capabilities").await
    }
}
