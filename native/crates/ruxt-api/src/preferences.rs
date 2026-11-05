//! Per-user editor preferences (session-derived owner only).

use serde::{Deserialize, Serialize};

use crate::client::{ApiClient, ApiResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileSaveMode {
    Auto,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub profile_save_mode: ProfileSaveMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferencesView {
    pub preferences: UserPreferences,
    pub updated_at: Option<String>,
}

/// Partial update; unknown keys are rejected by the server.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferencesPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_save_mode: Option<ProfileSaveMode>,
}

#[derive(Serialize)]
struct SetPreferencesRequest<'a> {
    preferences: &'a UserPreferencesPatch,
}

impl ApiClient {
    /// GET /api/preferences
    pub async fn get_preferences(&self) -> ApiResult<UserPreferencesView> {
        self.get_json("/api/preferences").await
    }

    /// PUT /api/preferences with `{ preferences: <patch> }`.
    pub async fn set_preferences(
        &self,
        patch: &UserPreferencesPatch,
    ) -> ApiResult<UserPreferencesView> {
        self.put_json(
            "/api/preferences",
            &SetPreferencesRequest { preferences: patch },
        )
        .await
    }
}
