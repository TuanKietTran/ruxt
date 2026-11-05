//! Cloud-data consent (session-derived owner only).

use serde::{Deserialize, Serialize};

use crate::client::{ApiClient, ApiResult};

pub const CLOUD_DATA_POLICY_VERSION: &str = "2026-09-20";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CloudDataCategory {
    CloudSessions,
    CloudTemplates,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryConsent {
    pub granted: bool,
    pub changed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDataConsentView {
    pub policy_version: String,
    pub cloud_sessions: CategoryConsent,
    pub cloud_templates: CategoryConsent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetConsentRequest {
    pub category: CloudDataCategory,
    pub granted: bool,
}

impl ApiClient {
    /// GET /api/cloud-data/consent
    pub async fn get_consent(&self) -> ApiResult<CloudDataConsentView> {
        self.get_json("/api/cloud-data/consent").await
    }

    /// PUT /api/cloud-data/consent for one category.
    pub async fn set_consent(
        &self,
        category: CloudDataCategory,
        granted: bool,
    ) -> ApiResult<CloudDataConsentView> {
        self.put_json(
            "/api/cloud-data/consent",
            &SetConsentRequest { category, granted },
        )
        .await
    }
}
