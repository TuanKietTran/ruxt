//! GET /api/health.

use serde::{Deserialize, Serialize};

use crate::client::{ApiClient, ApiResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Health {
    pub status: String,
    /// Epoch milliseconds on the server.
    pub ts: u64,
}

impl ApiClient {
    pub async fn health(&self) -> ApiResult<Health> {
        self.get_json("/api/health").await
    }
}
