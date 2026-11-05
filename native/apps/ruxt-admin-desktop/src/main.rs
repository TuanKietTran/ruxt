//! Ruxt admin GPUI shell: sidebar navigation over the admin-service
//! surfaces (analytics / jobs / templates / me / health) with Plans and
//! IAM as disabled Planned placeholders. State lives in `app_state`.

use gpui::*;
use ruxt_admin_desktop::app_state::{AppState, View};
use ruxt_ui_kit::theme::{parse_hex_rgb, Palette, ThemeId};

fn token(hex: &str) -> u32 {
    parse_hex_rgb(hex).expect("generated theme token must be #rrggbb")
}

fn active_palette(state: &AppState) -> Palette {
    ThemeId::from_stored(Some(&state.config.theme)).palette()
}

struct AdminApp {
    state: AppState,
}

impl AdminApp {
    fn new() -> Self {
        let mut state = AppState::new();
        let hours = state.config.analytics_hours;
        state.set_analytics_hours(hours);
        Self { state }
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

impl Render for AdminApp {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let s = &self.state;
        let palette = active_palette(s);
        let nav = View::all()
            .iter()
            .map(|v| nav_item(v.label(), *v == s.view, palette))
            .collect::<Vec<_>>();
        let note = if s.view.is_planned() {
            "Disabled placeholder - no backend call"
        } else {
            "Admin service"
        };
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
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .child("Ruxt Admin"),
                    )
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
                            .text_lg()
                            .font_weight(FontWeight::BOLD)
                            .child(s.view.label().to_string()),
                    )
                    .child(div().text_sm().child(note.to_string()))
                    .child(panel(s.view.label(), s.current_body(), palette)),
            )
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        cx.open_window(WindowOptions::default(), |_window, cx| {
            cx.new(|_cx| AdminApp::new())
        })
        .expect("open window");
        cx.activate(true);
    });
}
