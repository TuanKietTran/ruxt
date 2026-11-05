//! CV artifacts: raw bytes; the content type is derived server-side from
//! the artifact kind embedded in the id.

use crate::client::{encode_segment, ApiClient, ApiResult};

impl ApiClient {
    /// GET /api/cv-artifacts/{id} — owner is derived from the session.
    pub async fn get_artifact(&self, id: &str) -> ApiResult<Vec<u8>> {
        let path = format!("/api/cv-artifacts/{}", encode_segment(id));
        self.get_bytes(&path).await
    }
}
