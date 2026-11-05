//! Ruxt desktop GPUI shell: sidebar (sessions + navigation + session
//! status), editor + preview panes, and template / profile / settings /
//! login-offline panels. State and transitions live in `app_state`
//! (unit-tested); export is an explicit unavailable stub.

use gpui::*;
use ruxt_desktop::app_state::{AppState, View, EXPORT_UNAVAILABLE};
use ruxt_ui_kit::theme::{parse_hex_rgb, Palette, ThemeId};

/// A palette token (`#rrggbb`, from the generated design tokens) as a
/// GPUI color value. Tokens are always well-formed; the expect guards
/// against a broken token regeneration, never user input.
fn token(hex: &str) -> u32 {
    parse_hex_rgb(hex).expect("generated theme token must be #rrggbb")
}

/// The palette for the theme named in the app config (stored form;
/// unset/unrecognized falls back to Mocha, as on the web).
fn active_palette(state: &AppState) -> Palette {
    ThemeId::from_stored(Some(&state.config.theme)).palette()
}

struct DesktopApp {
    state: AppState,
}

impl DesktopApp {
    fn new() -> Self {
        Self {
            state: AppState::new(),
        }
    }
}

fn nav_item(label: &str, active: bool, palette: Palette) -> Div {
    let bg = if active {
        rgb(token(palette.bg_surface0))
    } else {
        rgb(token(palette.bg_mantle))
    };
    div()
        .px_3()
        .py_2()
        .rounded_md()
        .bg(bg)
        .child(label.to_string())
}

fn panel(title: &str, body: String, palette: Palette) -> Div {
    div()
        .flex_1()
        .h_full()
        .flex()
        .flex_col()
        .gap_2()
        .p_4()
        .rounded_md()
        .bg(rgb(token(palette.bg_mantle)))
        .child(div().font_weight(FontWeight::BOLD).child(title.to_string()))
        .child(div().child(body))
}

impl Render for DesktopApp {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let s = &self.state;
        let palette = active_palette(s);
        let nav = View::all()
            .iter()
            .map(|v| nav_item(v.label(), *v == s.view, palette))
            .collect::<Vec<_>>();
        let templates_body = s
            .templates
            .iter()
            .enumerate()
            .map(|(i, t)| {
                if i == s.selected_template {
                    format!("> {}", t.name)
                } else {
                    format!("  {}", t.name)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let profile_body = format!("{}\n{}", s.profile_name, s.profile_headline);
        let settings_body = format!(
            "Theme: {}\nAutosave: {}s\nEditor font: {}px",
            s.config.theme, s.config.autosave_interval_secs, s.config.editor_font_size
        );
        let login_body = format!(
            "{}\n\nLocal drafts stay available offline.",
            s.status_line()
        );
        div()
            .flex()
            .flex_row()
            .size_full()
            .bg(rgb(token(palette.bg_base)))
            .text_color(rgb(token(palette.fg_text)))
            .child(
                div()
                    .w(px(220.))
                    .h_full()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .p_4()
                    .bg(rgb(token(palette.bg_mantle)))
                    .child(div().text_xl().font_weight(FontWeight::BOLD).child("Ruxt"))
                    .children(nav)
                    .child(div().flex_1())
                    .child(div().text_sm().child(s.status_line())),
            )
            .child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .gap_4()
                    .p_4()
                    .child(
                        div()
                            .flex()
                            .flex_row()
                            .gap_4()
                            .child(
                                div()
                                    .text_lg()
                                    .font_weight(FontWeight::BOLD)
                                    .child(s.document_title.clone()),
                            )
                            .child(div().flex_1())
                            .child(
                                div()
                                    .px_3()
                                    .py_2()
                                    .rounded_md()
                                    .bg(rgb(token(palette.bg_surface0)))
                                    .child("Export"),
                            )
                            .child(div().text_sm().child(EXPORT_UNAVAILABLE.to_string())),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_row()
                            .gap_4()
                            .flex_1()
                            .child(panel("Editor", s.source.clone(), palette))
                            .child(panel("Preview", s.preview_text(), palette)),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_row()
                            .gap_4()
                            .h(px(180.))
                            .child(panel("Template", templates_body, palette))
                            .child(panel("Profile", profile_body, palette))
                            .child(panel("Settings", settings_body, palette))
                            .child(panel("Login / Offline", login_body, palette)),
                    ),
            )
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        cx.open_window(WindowOptions::default(), |_window, cx| {
            cx.new(|_cx| DesktopApp::new())
        })
        .expect("open window");
        cx.activate(true);
    });
}
