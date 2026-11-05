//! UI state for the admin shell (GPUI-free, unit-tested).
//! Holds only view/selection state; wire types and endpoint rules live
//! in `admin`, device-local settings in `config`.

use crate::admin::clamp_hours;
use crate::config::AppConfig;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum View {
    Analytics,
    Jobs,
    Templates,
    Me,
    Health,
    Plans,
    Iam,
}

impl View {
    pub fn all() -> [View; 7] {
        [
            View::Analytics,
            View::Jobs,
            View::Templates,
            View::Me,
            View::Health,
            View::Plans,
            View::Iam,
        ]
    }
    pub fn label(&self) -> &'static str {
        match self {
            View::Analytics => "Analytics",
            View::Jobs => "Jobs",
            View::Templates => "Templates",
            View::Me => "Me",
            View::Health => "Health",
            View::Plans => "Plans (Planned)",
            View::Iam => "IAM (Planned)",
        }
    }
    /// Plans/IAM are disabled placeholders only: no backend surface.
    pub fn is_planned(&self) -> bool {
        matches!(self, View::Plans | View::Iam)
    }
}

#[derive(Clone, Debug)]
pub struct AppState {
    pub view: View,
    pub config: AppConfig,
    pub analytics_hours: u32,
    pub analytics_tab: String,
    pub jobs_filter: String,
    pub template_names: Vec<String>,
    pub selected_template: usize,
    pub profile_name: String,
    pub profile_role: String,
    pub health_status: String,
    pub health_service: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let config = AppConfig::default();
        Self {
            view: View::Analytics,
            analytics_hours: config.analytics_hours,
            config,
            analytics_tab: "routes".to_string(),
            jobs_filter: "all".to_string(),
            template_names: Vec::new(),
            selected_template: 0,
            profile_name: "Admin".to_string(),
            profile_role: "admin".to_string(),
            health_status: "ok".to_string(),
            health_service: "ruxt-admin".to_string(),
        }
    }
    pub fn set_analytics_hours(&mut self, hours: u32) {
        self.analytics_hours = clamp_hours(hours);
    }
    pub fn status_line(&self) -> String {
        format!("{} | health: {}", self.profile_role, self.health_status)
    }
    pub fn current_body(&self) -> String {
        match self.view {
            View::Analytics => format!(
                "Analytics (last {}h)\nTab: {}\nRoutes / CQRS / Users / Tasks",
                self.analytics_hours, self.analytics_tab
            ),
            View::Jobs => format!(
                "Jobs snapshot\nFilter: {}\nNo jobs loaded yet.",
                self.jobs_filter
            ),
            View::Templates => {
                if self.template_names.is_empty() {
                    "Templates\nNo templates loaded yet.".to_string()
                } else {
                    let lines: Vec<String> = self
                        .template_names
                        .iter()
                        .enumerate()
                        .map(|(i, n)| {
                            format!(
                                "{} {}",
                                if i == self.selected_template {
                                    ">"
                                } else {
                                    " "
                                },
                                n
                            )
                        })
                        .collect();
                    format!("Templates\n{}", lines.join("\n"))
                }
            }
            View::Me => format!("Me\n{}\nRole: {}", self.profile_name, self.profile_role),
            View::Health => format!(
                "Health\nStatus: {}\nService: {}",
                self.health_status, self.health_service
            ),
            View::Plans => "Plans\nPlanned - not available in this app yet.".to_string(),
            View::Iam => "IAM\nPlanned - not available in this app yet.".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::{analytics_path, health_path, jobs_path, me_path, templates_path};

    #[test]
    fn defaults_match_admin_contract() {
        let s = AppState::new();
        assert_eq!(s.view, View::Analytics);
        assert_eq!(s.analytics_hours, 24);
        assert_eq!(s.config.theme, "mocha");
        assert_eq!(s.config.density, "compact");
        assert_eq!(s.health_status, "ok");
        assert_eq!(s.health_service, "ruxt-admin");
    }

    #[test]
    fn analytics_hours_use_server_clamp() {
        let mut s = AppState::new();
        s.set_analytics_hours(0);
        assert_eq!(s.analytics_hours, 24);
        s.set_analytics_hours(9999);
        assert_eq!(s.analytics_hours, 720);
        s.set_analytics_hours(168);
        assert_eq!(s.analytics_hours, 168);
    }

    #[test]
    fn only_plans_and_iam_are_planned() {
        let planned: Vec<View> = View::all()
            .iter()
            .copied()
            .filter(|v| v.is_planned())
            .collect();
        assert_eq!(planned, vec![View::Plans, View::Iam]);
        assert_eq!(View::all().len(), 7);
        let mut s = AppState::new();
        s.view = View::Plans;
        assert!(s.current_body().contains("Planned"));
        s.view = View::Iam;
        assert!(s.current_body().contains("Planned"));
    }

    #[test]
    fn endpoint_paths_cover_only_admin_surfaces() {
        let paths = [
            health_path().to_string(),
            me_path().to_string(),
            analytics_path(24),
            jobs_path().to_string(),
            templates_path().to_string(),
        ];
        assert_eq!(
            paths,
            [
                "/api/health",
                "/api/me",
                "/api/analytics?hours=24",
                "/api/jobs",
                "/api/templates"
            ]
        );
    }

    #[test]
    fn templates_body_marks_selection() {
        let mut s = AppState::new();
        s.view = View::Templates;
        assert!(s.current_body().contains("No templates"));
        s.template_names = vec!["A".to_string(), "B".to_string()];
        s.selected_template = 1;
        let body = s.current_body();
        assert!(body.contains("  A"));
        assert!(body.contains("> B"));
    }
}
