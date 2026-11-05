//! CV templates. Templates are presentation only: they never carry
//! profile data. Private templates are browser-local today — the server
//! list returns public templates, and the create/clone routes reject
//! with 403/404 by design (surfaced here as `ApiError::Http`).

use serde::{Deserialize, Serialize};

use crate::client::{encode_segment, ApiClient, ApiResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvTemplateCapabilities {
    pub page_formats: Vec<String>,
    pub supports_photo: bool,
    pub ats_friendly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvTemplate {
    pub id: String,
    pub version: u32,
    pub name: String,
    pub markdown_skeleton: String,
    pub css: String,
    pub capabilities: CvTemplateCapabilities,
    pub built_in: bool,
    /// Data-owned discovery/visibility labels, e.g. "public".
    pub tags: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvTemplateRef {
    pub id: String,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateList {
    pub templates: Vec<CvTemplate>,
}

impl ApiClient {
    /// GET /api/cv-templates — public templates, session required.
    pub async fn list_templates(&self) -> ApiResult<TemplateList> {
        self.get_json("/api/cv-templates").await
    }

    /// GET /api/public/templates — public catalog, no session required.
    pub async fn list_public_templates(&self) -> ApiResult<TemplateList> {
        self.get_json("/api/public/templates").await
    }

    /// POST /api/cv-templates — currently 403: private templates stay in
    /// browser storage until an owner-aware cloud contract exists.
    pub async fn create_template(&self, template: &CvTemplate) -> ApiResult<serde_json::Value> {
        self.post_json("/api/cv-templates", template).await
    }

    /// POST /api/cv-templates/{id}/clone — currently 404 by design:
    /// clone templates in browser storage.
    pub async fn clone_template(&self, id: &str) -> ApiResult<serde_json::Value> {
        let path = format!("/api/cv-templates/{}/clone", encode_segment(id));
        self.post_empty(&path).await
    }
}
