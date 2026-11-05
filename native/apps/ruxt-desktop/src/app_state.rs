//! Shell state model (GPUI-free, unit-tested). The GPUI layer in main.rs
//! renders this state; all transitions live here.

use crate::config::AppConfig;
use crate::markdown;
use crate::session::{Session, SessionState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum View {
    Sessions,
    Editor,
    Templates,
    Profile,
    Settings,
    Login,
}

impl View {
    pub fn label(&self) -> &'static str {
        match self {
            View::Sessions => "Sessions",
            View::Editor => "Editor",
            View::Templates => "Templates",
            View::Profile => "Profile",
            View::Settings => "Settings",
            View::Login => "Login",
        }
    }
    pub fn all() -> [View; 6] {
        [
            View::Sessions,
            View::Editor,
            View::Templates,
            View::Profile,
            View::Settings,
            View::Login,
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
}

pub const EXPORT_UNAVAILABLE: &str =
    "Export is unavailable in the desktop build yet - use the web app to export.";

#[derive(Debug, Clone)]
pub struct AppState {
    pub view: View,
    pub document_title: String,
    pub source: String,
    pub templates: Vec<TemplateInfo>,
    pub selected_template: usize,
    pub profile_name: String,
    pub profile_headline: String,
    pub config: AppConfig,
    pub session: Session,
    pub export_message: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            view: View::Editor,
            document_title: "Untitled CV".to_string(),
            source: "# Your Name\n\n## Summary\n\n- First achievement\n- Second achievement\n"
                .to_string(),
            templates: vec![
                TemplateInfo {
                    id: "classic".into(),
                    name: "Classic".into(),
                },
                TemplateInfo {
                    id: "modern".into(),
                    name: "Modern".into(),
                },
                TemplateInfo {
                    id: "minimal".into(),
                    name: "Minimal".into(),
                },
            ],
            selected_template: 0,
            profile_name: "Your Name".to_string(),
            profile_headline: "Software Engineer".to_string(),
            config: AppConfig::default(),
            session: Session::new(),
            export_message: None,
        }
    }
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn select_view(&mut self, view: View) {
        self.view = view;
    }
    pub fn select_template(&mut self, id: &str) -> bool {
        if let Some(pos) = self.templates.iter().position(|t| t.id == id) {
            self.selected_template = pos;
            self.config.last_template_id = Some(id.to_string());
            true
        } else {
            false
        }
    }
    pub fn selected_template(&self) -> Option<&TemplateInfo> {
        self.templates.get(self.selected_template)
    }
    /// Plain-text preview lines: heading/list markers stripped, inline markers kept out.
    pub fn preview_lines(&self) -> Vec<String> {
        self.source
            .lines()
            .map(|line| {
                let t = line.trim();
                let t = t
                    .strip_prefix("### ")
                    .or_else(|| t.strip_prefix("## "))
                    .or_else(|| t.strip_prefix("# "))
                    .unwrap_or(t);
                let t = t.strip_prefix("- ").unwrap_or(t);
                t.replace("**", "").replace('`', "")
            })
            .collect()
    }
    pub fn preview_text(&self) -> String {
        self.preview_lines().join("\n")
    }
    pub fn preview_html(&self) -> String {
        markdown::render_markdown(&self.source)
    }
    /// Export is a stub in the desktop shell: never claims success.
    pub fn request_export(&mut self) -> &'static str {
        self.export_message = Some(EXPORT_UNAVAILABLE.to_string());
        EXPORT_UNAVAILABLE
    }
    pub fn status_line(&self) -> String {
        match self.session.state {
            SessionState::SignedIn => format!(
                "Signed in as {}",
                self.session.email.clone().unwrap_or_default()
            ),
            SessionState::Offline => "Offline - changes are saved locally".to_string(),
            SessionState::SignedOut => "Signed out - log in to sync".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_switches_views() {
        let mut s = AppState::new();
        assert_eq!(s.view, View::Editor);
        s.select_view(View::Templates);
        assert_eq!(s.view, View::Templates);
        assert_eq!(View::all().len(), 6);
    }
    #[test]
    fn template_picker_selects_known_only() {
        let mut s = AppState::new();
        assert!(s.select_template("modern"));
        assert_eq!(s.selected_template().unwrap().name, "Modern");
        assert_eq!(s.config.last_template_id.as_deref(), Some("modern"));
        assert!(!s.select_template("nope"));
    }
    #[test]
    fn export_is_unavailable_stub() {
        let mut s = AppState::new();
        assert_eq!(s.request_export(), EXPORT_UNAVAILABLE);
        assert_eq!(s.export_message.as_deref(), Some(EXPORT_UNAVAILABLE));
    }
    #[test]
    fn preview_strips_markers_and_html_matches() {
        let s = AppState::new();
        let lines = s.preview_lines();
        assert_eq!(lines[0], "Your Name");
        assert_eq!(lines[4], "First achievement");
        assert!(s.preview_html().contains("<h1>Your Name</h1>"));
    }
    #[test]
    fn status_line_follows_session() {
        let mut s = AppState::new();
        assert!(s.status_line().starts_with("Signed out"));
        s.session.sign_in("u1", "a@b.c");
        assert_eq!(s.status_line(), "Signed in as a@b.c");
        s.session.set_offline();
        assert!(s.status_line().starts_with("Offline"));
    }
}
