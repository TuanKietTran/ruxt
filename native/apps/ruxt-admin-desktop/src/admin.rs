//! Admin-service contracts (GPUI-free, unit-tested).
//!
//! Mirrors the separate ruxt-admin service (`ref/ruxt-admin`, read-only):
//! surfaces are analytics, jobs, templates, me and health ONLY, gated by
//! Clerk `requireAdmin` (role rechecked server-side per request; mutations
//! also need a trusted Origin). This module holds the wire types, the
//! endpoint paths and the UI rules; it performs no network I/O and never
//! touches the main app's cookie-session API.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

// --- Health / me -------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdminHealth {
    pub status: String,
    pub service: String,
}

impl AdminHealth {
    /// The only public route; a healthy admin service answers exactly
    /// `{status: "ok", service: "ruxt-admin"}`.
    pub fn is_ok(&self) -> bool {
        self.status == "ok" && self.service == "ruxt-admin"
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    pub id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

impl AdminUser {
    pub fn display_name(&self) -> &str {
        self.name.as_deref().unwrap_or(&self.login)
    }
}

// --- Analytics ---------------------------------------------------------

/// Server clamp: hours to 1..=720, defaulting to 24 when missing/invalid.
pub fn clamp_hours(hours: u32) -> u32 {
    if hours == 0 {
        24
    } else {
        hours.clamp(1, 720)
    }
}

/// The four web windows: last hour, 24 hours, 7 days, 30 days.
pub const ANALYTICS_WINDOWS: [u32; 4] = [1, 24, 168, 720];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportKind {
    Routes,
    Cqrs,
    Users,
    Tasks,
}

impl ReportKind {
    pub fn label(&self) -> &'static str {
        match self {
            ReportKind::Routes => "Routes",
            ReportKind::Cqrs => "CQRS",
            ReportKind::Users => "Users",
            ReportKind::Tasks => "Tasks",
        }
    }
    pub fn all() -> [ReportKind; 4] {
        [
            ReportKind::Routes,
            ReportKind::Cqrs,
            ReportKind::Users,
            ReportKind::Tasks,
        ]
    }
    /// Only routes, users and tasks reports carry latency figures.
    pub fn has_latency(&self) -> bool {
        !matches!(self, ReportKind::Cqrs)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricSummary {
    pub key: String,
    pub count: u64,
    pub errors: u64,
    pub total_ms: f64,
    pub max_ms: f64,
    pub statuses: BTreeMap<String, u64>,
    pub avg_ms: f64,
    pub error_rate: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HourlyTotal {
    pub hour: String,
    pub count: u64,
    pub errors: u64,
    pub avg_ms: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MetricReport {
    pub summary: Vec<MetricSummary>,
    pub hourly: Vec<HourlyTotal>,
}

impl MetricReport {
    pub fn total_count(&self) -> u64 {
        self.summary.iter().map(|s| s.count).sum()
    }
    pub fn total_errors(&self) -> u64 {
        self.summary.iter().map(|s| s.errors).sum()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalyticsResponse {
    pub hours: u32,
    pub routes: MetricReport,
    pub cqrs: MetricReport,
    pub users: MetricReport,
    pub tasks: MetricReport,
}

impl AnalyticsResponse {
    pub fn report(&self, kind: ReportKind) -> &MetricReport {
        match kind {
            ReportKind::Routes => &self.routes,
            ReportKind::Cqrs => &self.cqrs,
            ReportKind::Users => &self.users,
            ReportKind::Tasks => &self.tasks,
        }
    }
}

// --- Jobs --------------------------------------------------------------

pub const JOB_STATES: [&str; 5] = ["succeeded", "failed", "cancelled", "running", "queued"];

/// Badge colour name per state, matching the web page.
pub fn job_badge(state: &str) -> &'static str {
    match state {
        "succeeded" => "green",
        "failed" => "red",
        "cancelled" => "yellow",
        "running" => "blue",
        _ => "none",
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRow {
    pub id: String,
    pub owner_id: String,
    pub state: String,
    pub stage: String,
    pub progress: f64,
    pub attempt: u32,
    pub filename: String,
    pub error_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub duration_ms: Option<f64>,
}

impl JobRow {
    pub fn progress_percent(&self) -> f64 {
        self.progress.clamp(0.0, 100.0)
    }
    pub fn is_failed(&self) -> bool {
        self.state == "failed"
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobReport {
    pub total: u64,
    pub by_state: BTreeMap<String, u64>,
    pub by_error_code: BTreeMap<String, u64>,
    pub avg_duration_ms: Option<f64>,
    pub recent: Vec<JobRow>,
}

impl JobReport {
    /// Client-side state filter over the recent rows, as on the web page.
    pub fn filtered_recent(&self, state: Option<&str>) -> Vec<&JobRow> {
        match state {
            None => self.recent.iter().collect(),
            Some(s) => self.recent.iter().filter(|j| j.state == s).collect(),
        }
    }
    pub fn count_for_state(&self, state: &str) -> u64 {
        self.by_state.get(state).copied().unwrap_or(0)
    }
}

// --- Templates ---------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateVersionSummary {
    pub version: u32,
    pub name: String,
    pub created_at: String,
    pub published: bool,
    pub built_in: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    pub id: String,
    pub name: String,
    pub built_in: bool,
    /// Internal templates are stripped of the public tag by the main app,
    /// so publishing one would silently revert.
    pub internal: bool,
    /// User-owned editor templates: visible, but not publishable and not
    /// editable from admin (edited in the CV editor instead).
    pub local: bool,
    pub latest_version: u32,
    pub published_version: Option<u32>,
    pub tags: Vec<String>,
    pub versions: Vec<TemplateVersionSummary>,
}

impl TemplateSummary {
    pub fn can_publish(&self) -> bool {
        !self.local && !self.internal
    }
    pub fn version(&self, version: u32) -> Option<&TemplateVersionSummary> {
        self.versions.iter().find(|v| v.version == version)
    }
}

/// Why a version delete is blocked, or `None` when it may proceed (the UI
/// still asks for confirmation first). Mirrors the spec rule: confirmed
/// delete, blocked for published or built-in versions.
pub fn delete_block_reason(version: &TemplateVersionSummary) -> Option<&'static str> {
    if version.published {
        Some("Published versions cannot be deleted - unpublish first.")
    } else if version.built_in {
        Some("Built-in template versions cannot be deleted.")
    } else {
        None
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TemplateList {
    pub templates: Vec<TemplateSummary>,
}

// --- Endpoint paths (admin service only) -------------------------------

pub fn health_path() -> &'static str {
    "/api/health"
}
pub fn me_path() -> &'static str {
    "/api/me"
}
pub fn analytics_path(hours: u32) -> String {
    format!("/api/analytics?hours={}", clamp_hours(hours))
}
pub fn jobs_path() -> &'static str {
    "/api/jobs"
}
pub fn templates_path() -> &'static str {
    "/api/templates"
}
pub fn template_path(id: &str, version: Option<u32>) -> String {
    match version {
        Some(v) => format!("/api/templates/{id}?version={v}"),
        None => format!("/api/templates/{id}"),
    }
}
pub fn template_versions_path(id: &str) -> String {
    format!("/api/templates/{id}/versions")
}
pub fn template_publish_path(id: &str, version: u32) -> String {
    format!("/api/templates/{id}/versions/{version}/publish")
}
pub fn template_version_path(id: &str, version: u32) -> String {
    format!("/api/templates/{id}/versions/{version}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hours_clamp_like_server() {
        assert_eq!(clamp_hours(0), 24);
        assert_eq!(clamp_hours(1), 1);
        assert_eq!(clamp_hours(24), 24);
        assert_eq!(clamp_hours(720), 720);
        assert_eq!(clamp_hours(9999), 720);
        assert_eq!(analytics_path(9999), "/api/analytics?hours=720");
        assert_eq!(ANALYTICS_WINDOWS, [1, 24, 168, 720]);
    }

    #[test]
    fn health_requires_exact_service() {
        let ok: AdminHealth =
            serde_json::from_str(r#"{"status":"ok","service":"ruxt-admin"}"#).unwrap();
        assert!(ok.is_ok());
        let other: AdminHealth =
            serde_json::from_str(r#"{"status":"ok","service":"ruxt"}"#).unwrap();
        assert!(!other.is_ok());
    }

    #[test]
    fn me_display_name_falls_back_to_login() {
        let u: AdminUser = serde_json::from_str(
            r#"{"id":"u1","login":"kyle","name":null,"avatarUrl":"https://x/y.png"}"#,
        )
        .unwrap();
        assert_eq!(u.display_name(), "kyle");
        assert_eq!(u.avatar_url, "https://x/y.png");
    }

    #[test]
    fn analytics_shapes_and_report_selection() {
        let body = r#"{"hours":24,"routes":{"summary":[{"key":"/api/health","count":10,"errors":1,"totalMs":50.0,"maxMs":9.0,"statuses":{"200":9,"500":1},"avgMs":5.0,"errorRate":0.1}],"hourly":[{"hour":"2026-09-27T13","count":10,"errors":1,"avgMs":5.0}]},"cqrs":{"summary":[],"hourly":[]},"users":{"summary":[],"hourly":[]},"tasks":{"summary":[],"hourly":[]}}"#;
        let a: AnalyticsResponse = serde_json::from_str(body).unwrap();
        assert_eq!(a.report(ReportKind::Routes).total_count(), 10);
        assert_eq!(a.report(ReportKind::Routes).total_errors(), 1);
        assert!(ReportKind::Routes.has_latency());
        assert!(!ReportKind::Cqrs.has_latency());
    }

    #[test]
    fn jobs_filter_and_badges() {
        let body = r#"{"total":2,"byState":{"failed":1,"succeeded":1},"byErrorCode":{"E_PARSE":1},"avgDurationMs":120.0,"recent":[{"id":"j1","ownerId":"u1","state":"failed","stage":"parse","progress":40.0,"attempt":2,"filename":"a.pdf","errorCode":"E_PARSE","createdAt":"t0","updatedAt":"t1","durationMs":120.0},{"id":"j2","ownerId":"u2","state":"succeeded","stage":"done","progress":100.0,"attempt":1,"filename":"b.pdf","errorCode":null,"createdAt":"t0","updatedAt":"t1","durationMs":null}]}"#;
        let r: JobReport = serde_json::from_str(body).unwrap();
        assert_eq!(r.filtered_recent(None).len(), 2);
        assert_eq!(r.filtered_recent(Some("failed")).len(), 1);
        assert_eq!(r.count_for_state("failed"), 1);
        assert_eq!(r.count_for_state("running"), 0);
        assert_eq!(job_badge("failed"), "red");
        assert_eq!(job_badge("queued"), "none");
        assert!(r.recent[0].is_failed());
    }

    #[test]
    fn template_delete_rules_and_publishability() {
        let published = TemplateVersionSummary {
            version: 2,
            name: "T".into(),
            created_at: "t".into(),
            published: true,
            built_in: false,
        };
        assert!(delete_block_reason(&published).is_some());
        let built_in = TemplateVersionSummary {
            published: false,
            built_in: true,
            ..published.clone()
        };
        assert!(delete_block_reason(&built_in).is_some());
        let plain = TemplateVersionSummary {
            published: false,
            built_in: false,
            ..published.clone()
        };
        assert!(delete_block_reason(&plain).is_none());
        let local = TemplateSummary {
            id: "t1".into(),
            name: "T".into(),
            built_in: false,
            internal: false,
            local: true,
            latest_version: 1,
            published_version: None,
            tags: vec![],
            versions: vec![plain],
        };
        assert!(!local.can_publish());
        assert_eq!(local.version(2).unwrap().version, 2);
        assert_eq!(
            template_publish_path("t1", 1),
            "/api/templates/t1/versions/1/publish"
        );
        assert_eq!(template_path("t1", Some(2)), "/api/templates/t1?version=2");
    }
}
