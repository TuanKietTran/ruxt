//! Legacy cookie-session auth: login, register, me, logout.

use serde::{Deserialize, Serialize};

use crate::client::{ApiClient, ApiResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OkResponse {
    pub ok: bool,
}

impl ApiClient {
    /// POST /api/auth/login — sets the session cookie on success.
    pub async fn login(&self, credentials: &Credentials) -> ApiResult<AuthResponse> {
        self.post_json("/api/auth/login", credentials).await
    }

    /// POST /api/auth/register — 201 + session cookie on success.
    pub async fn register(&self, credentials: &Credentials) -> ApiResult<AuthResponse> {
        self.post_json("/api/auth/register", credentials).await
    }

    /// GET /api/auth/me — the user behind the current session.
    pub async fn me(&self) -> ApiResult<User> {
        self.get_json("/api/auth/me").await
    }

    /// POST /api/auth/logout — clears the session.
    pub async fn logout(&self) -> ApiResult<OkResponse> {
        self.post_empty("/api/auth/logout").await
    }
}
