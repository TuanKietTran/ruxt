//! CV applications: a versioned template snapshot plus a versioned
//! profile snapshot. Profile data is not mutated through a separate API.

use serde::{Deserialize, Serialize};

use crate::client::{encode_segment, ApiClient, ApiResult};
use crate::templates::CvTemplate;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvVersionRef {
    pub id: String,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvVersionedSnapshot<T> {
    #[serde(rename = "ref")]
    pub reference: CvVersionRef,
    pub value: T,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvIdentity {
    #[serde(rename = "fullName")]
    pub full_name: String,
    pub headline: String,
    pub summary: String,
    pub location: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CvContactKind {
    Email,
    Phone,
    Linkedin,
    Github,
    Website,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvContact {
    pub kind: CvContactKind,
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvExperience {
    pub title: String,
    pub company: String,
    pub location: String,
    pub start: String,
    pub end: String,
    pub highlights: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvSkillGroup {
    pub name: String,
    pub skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvCertification {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvEducation {
    pub degree: String,
    pub school: String,
    pub location: String,
    pub start: String,
    pub end: String,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvProject {
    pub name: String,
    pub url: String,
    pub description: String,
    pub technologies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvProfile {
    pub version: u32,
    pub identity: CvIdentity,
    pub contacts: Vec<CvContact>,
    pub experiences: Vec<CvExperience>,
    #[serde(rename = "skills")]
    pub skill_groups: Vec<CvSkillGroup>,
    pub certifications: Vec<CvCertification>,
    pub education: Vec<CvEducation>,
    pub projects: Vec<CvProject>,
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CvApplicationStatus {
    Draft,
    Ready,
    Submitted,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvApplication {
    pub id: String,
    pub owner_id: String,
    pub revision: u32,
    pub template: CvVersionedSnapshot<CvTemplate>,
    pub profile: CvVersionedSnapshot<CvProfile>,
    pub status: CvApplicationStatus,
    pub created_at: String,
    pub updated_at: String,
}

impl ApiClient {
    /// GET /api/cv-applications/{id} — owner is derived from the session.
    pub async fn get_application(&self, id: &str) -> ApiResult<CvApplication> {
        let path = format!("/api/cv-applications/{}", encode_segment(id));
        self.get_json(&path).await
    }
}
