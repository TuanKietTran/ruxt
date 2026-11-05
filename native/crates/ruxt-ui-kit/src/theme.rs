//! Theme tokens mirroring the web app look.
//!
//! Values come from the design-token source of truth: this module includes
//! the generated Rust golden file (`design/golden/tokens.rs`, generated
//! from `design/tokens.json` by `design/tools/generate-tokens.mjs`) and
//! re-presents it as typed structs. Do not hand-copy token values here;
//! a token change is a `design/tokens.json` change plus regeneration.

/// The generated token constants, exactly as produced from
/// `design/tokens.json`. Layout: `generated::mocha` / `generated::latte` /
/// `generated::opencode` hold per-theme `&str` hex colors;
/// `generated::tokens` holds the shared numeric/string scales.
pub mod generated {
    include!("../../../../design/golden/tokens.rs");
}

/// One theme's color palette. All values are `#rrggbb` hex strings from
/// the generated tokens; use [`parse_hex_rgb`] (or the GPUI components)
/// to turn them into platform colors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Palette {
    pub bg_base: &'static str,
    pub bg_mantle: &'static str,
    pub bg_crust: &'static str,
    pub bg_surface0: &'static str,
    pub bg_surface1: &'static str,
    pub bg_surface2: &'static str,
    pub bg_overlay0: &'static str,
    pub bg_overlay1: &'static str,
    pub bg_overlay2: &'static str,
    pub fg_text: &'static str,
    pub fg_subtext1: &'static str,
    pub fg_subtext0: &'static str,
    pub accent: &'static str,
    pub accent_hover: &'static str,
    pub accent_muted: &'static str,
    pub on_accent: &'static str,
    pub pink: &'static str,
    pub mauve: &'static str,
    pub red: &'static str,
    pub peach: &'static str,
    pub yellow: &'static str,
    pub green: &'static str,
    pub teal: &'static str,
    pub sky: &'static str,
    pub sapphire: &'static str,
    pub warning: &'static str,
    pub danger: &'static str,
    pub success: &'static str,
    pub info: &'static str,
    pub border: &'static str,
    pub border_strong: &'static str,
}

macro_rules! palette {
    ($m:ident) => {
        Palette {
            bg_base: generated::$m::BG_BASE,
            bg_mantle: generated::$m::BG_MANTLE,
            bg_crust: generated::$m::BG_CRUST,
            bg_surface0: generated::$m::BG_SURFACE0,
            bg_surface1: generated::$m::BG_SURFACE1,
            bg_surface2: generated::$m::BG_SURFACE2,
            bg_overlay0: generated::$m::BG_OVERLAY0,
            bg_overlay1: generated::$m::BG_OVERLAY1,
            bg_overlay2: generated::$m::BG_OVERLAY2,
            fg_text: generated::$m::FG_TEXT,
            fg_subtext1: generated::$m::FG_SUBTEXT1,
            fg_subtext0: generated::$m::FG_SUBTEXT0,
            accent: generated::$m::ACCENT,
            accent_hover: generated::$m::ACCENT_HOVER,
            accent_muted: generated::$m::ACCENT_MUTED,
            on_accent: generated::$m::ON_ACCENT,
            pink: generated::$m::PINK,
            mauve: generated::$m::MAUVE,
            red: generated::$m::RED,
            peach: generated::$m::PEACH,
            yellow: generated::$m::YELLOW,
            green: generated::$m::GREEN,
            teal: generated::$m::TEAL,
            sky: generated::$m::SKY,
            sapphire: generated::$m::SAPPHIRE,
            warning: generated::$m::WARNING,
            danger: generated::$m::DANGER,
            success: generated::$m::SUCCESS,
            info: generated::$m::INFO,
            border: generated::$m::BORDER,
            border_strong: generated::$m::BORDER_STRONG,
        }
    };
}

/// A named theme. Ids and values are fixed by `specs/design/themes.md`:
/// a platform must not add or rename a theme locally.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum ThemeId {
    /// Catppuccin Mocha (dark). Default when no stored preference exists.
    #[default]
    Mocha,
    /// Catppuccin Latte (light). The only light theme.
    Latte,
    /// OpenCode (dark, terminal-style; accent is terminal green).
    OpenCode,
}

impl ThemeId {
    pub const ALL: [ThemeId; 3] = [ThemeId::Mocha, ThemeId::Latte, ThemeId::OpenCode];

    /// The stored/device id, as used by the web `theme` local-storage key.
    pub fn id(self) -> &'static str {
        match self {
            ThemeId::Mocha => "mocha",
            ThemeId::Latte => "latte",
            ThemeId::OpenCode => "opencode",
        }
    }

    /// The user-visible label (web `ThemeSelect` wording).
    pub fn label(self) -> &'static str {
        match self {
            ThemeId::Mocha => "Catppuccin Mocha",
            ThemeId::Latte => "Catppuccin Latte",
            ThemeId::OpenCode => "OpenCode",
        }
    }

    pub fn is_dark(self) -> bool {
        !matches!(self, ThemeId::Latte)
    }

    pub fn palette(self) -> Palette {
        match self {
            ThemeId::Mocha => palette!(mocha),
            ThemeId::Latte => palette!(latte),
            ThemeId::OpenCode => palette!(opencode),
        }
    }

    /// Parse a stored theme id. `None` for anything unrecognized.
    pub fn from_id(id: &str) -> Option<ThemeId> {
        ThemeId::ALL.into_iter().find(|t| t.id() == id)
    }

    /// Resolve a stored value the way the web does: an unset or
    /// unrecognized value falls back to Mocha.
    pub fn from_stored(stored: Option<&str>) -> ThemeId {
        stored.and_then(ThemeId::from_id).unwrap_or_default()
    }
}

/// What the user picked: a named theme, or `system` (planned in
/// `specs/design/themes.md`): follow the OS light/dark setting live,
/// mapping light to Latte and dark to Mocha, until a named theme is
/// picked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThemePreference {
    Named(ThemeId),
    System,
}

impl Default for ThemePreference {
    fn default() -> Self {
        ThemePreference::Named(ThemeId::default())
    }
}

impl ThemePreference {
    pub fn resolve(self, system_dark: bool) -> ThemeId {
        match self {
            ThemePreference::Named(id) => id,
            ThemePreference::System => {
                if system_dark {
                    ThemeId::Mocha
                } else {
                    ThemeId::Latte
                }
            }
        }
    }

    /// Stored form: a theme id, or `"system"`. Unset/unrecognized falls
    /// back to the named default (Mocha), as on the web.
    pub fn from_stored(stored: Option<&str>) -> ThemePreference {
        match stored {
            Some("system") => ThemePreference::System,
            other => ThemePreference::Named(ThemeId::from_stored(other)),
        }
    }
}

/// Control density. Persists device-local like the theme; default is
/// comfortable (planned in `specs/design/themes.md`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Density {
    #[default]
    Comfortable,
    Compact,
}

impl Density {
    pub fn id(self) -> &'static str {
        match self {
            Density::Comfortable => "comfortable",
            Density::Compact => "compact",
        }
    }

    pub fn from_id(id: &str) -> Option<Density> {
        match id {
            "comfortable" => Some(Density::Comfortable),
            "compact" => Some(Density::Compact),
            _ => None,
        }
    }

    pub fn scale(self) -> f32 {
        match self {
            Density::Comfortable => generated::tokens::DENSITY_COMFORTABLE_SCALE,
            Density::Compact => generated::tokens::DENSITY_COMPACT_SCALE,
        }
    }

    pub fn control_height(self) -> f32 {
        match self {
            Density::Comfortable => generated::tokens::DENSITY_COMFORTABLE_CONTROL_HEIGHT,
            Density::Compact => generated::tokens::DENSITY_COMPACT_CONTROL_HEIGHT,
        }
    }

    pub fn row_height(self) -> f32 {
        match self {
            Density::Comfortable => generated::tokens::DENSITY_COMFORTABLE_ROW_HEIGHT,
            Density::Compact => generated::tokens::DENSITY_COMPACT_ROW_HEIGHT,
        }
    }
}

/// One typography style from the token scale. Text must be set in one of
/// these styles; one-off sizes are not allowed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TextStyle {
    pub size: f32,
    /// Unitless line-height multiplier.
    pub line_height: f32,
    pub weight: f32,
}

pub const TEXT_CAPTION: TextStyle = TextStyle {
    size: generated::tokens::TEXT_CAPTION_SIZE,
    line_height: generated::tokens::TEXT_CAPTION_LINE_HEIGHT,
    weight: generated::tokens::TEXT_CAPTION_WEIGHT,
};
pub const TEXT_LABEL: TextStyle = TextStyle {
    size: generated::tokens::TEXT_LABEL_SIZE,
    line_height: generated::tokens::TEXT_LABEL_LINE_HEIGHT,
    weight: generated::tokens::TEXT_LABEL_WEIGHT,
};
pub const TEXT_BODY_SMALL: TextStyle = TextStyle {
    size: generated::tokens::TEXT_BODY_SMALL_SIZE,
    line_height: generated::tokens::TEXT_BODY_SMALL_LINE_HEIGHT,
    weight: generated::tokens::TEXT_BODY_SMALL_WEIGHT,
};
pub const TEXT_BODY: TextStyle = TextStyle {
    size: generated::tokens::TEXT_BODY_SIZE,
    line_height: generated::tokens::TEXT_BODY_LINE_HEIGHT,
    weight: generated::tokens::TEXT_BODY_WEIGHT,
};
pub const TEXT_BODY_LARGE: TextStyle = TextStyle {
    size: generated::tokens::TEXT_BODY_LARGE_SIZE,
    line_height: generated::tokens::TEXT_BODY_LARGE_LINE_HEIGHT,
    weight: generated::tokens::TEXT_BODY_LARGE_WEIGHT,
};
pub const TEXT_SUBTITLE: TextStyle = TextStyle {
    size: generated::tokens::TEXT_SUBTITLE_SIZE,
    line_height: generated::tokens::TEXT_SUBTITLE_LINE_HEIGHT,
    weight: generated::tokens::TEXT_SUBTITLE_WEIGHT,
};
pub const TEXT_TITLE: TextStyle = TextStyle {
    size: generated::tokens::TEXT_TITLE_SIZE,
    line_height: generated::tokens::TEXT_TITLE_LINE_HEIGHT,
    weight: generated::tokens::TEXT_TITLE_WEIGHT,
};
pub const TEXT_HEADING: TextStyle = TextStyle {
    size: generated::tokens::TEXT_HEADING_SIZE,
    line_height: generated::tokens::TEXT_HEADING_LINE_HEIGHT,
    weight: generated::tokens::TEXT_HEADING_WEIGHT,
};
pub const TEXT_DISPLAY: TextStyle = TextStyle {
    size: generated::tokens::TEXT_DISPLAY_SIZE,
    line_height: generated::tokens::TEXT_DISPLAY_LINE_HEIGHT,
    weight: generated::tokens::TEXT_DISPLAY_WEIGHT,
};

/// Spacing scale (px). Layout gaps and padding must come from this scale.
pub const SPACE_NONE: f32 = generated::tokens::SPACING_NONE;
pub const SPACE_XS: f32 = generated::tokens::SPACING_XS;
pub const SPACE_SM: f32 = generated::tokens::SPACING_SM;
pub const SPACE_MD: f32 = generated::tokens::SPACING_MD;
pub const SPACE_LG: f32 = generated::tokens::SPACING_LG;
pub const SPACE_XL: f32 = generated::tokens::SPACING_XL;
pub const SPACE_2XL: f32 = generated::tokens::SPACING_2XL;
pub const SPACE_3XL: f32 = generated::tokens::SPACING_3XL;
pub const SPACE_4XL: f32 = generated::tokens::SPACING_4XL;
pub const SPACE_5XL: f32 = generated::tokens::SPACING_5XL;
pub const SPACE_6XL: f32 = generated::tokens::SPACING_6XL;

/// Corner radius scale (px).
pub const RADIUS_NONE: f32 = generated::tokens::RADIUS_NONE;
pub const RADIUS_SM: f32 = generated::tokens::RADIUS_SM;
pub const RADIUS_MD: f32 = generated::tokens::RADIUS_MD;
pub const RADIUS_LG: f32 = generated::tokens::RADIUS_LG;
pub const RADIUS_FULL: f32 = generated::tokens::RADIUS_FULL;

/// Focus ring metrics (px); the ring color is the theme accent.
pub const FOCUS_RING_WIDTH: f32 = generated::tokens::FOCUS_RING_WIDTH;
pub const FOCUS_RING_OFFSET: f32 = generated::tokens::FOCUS_RING_OFFSET;

pub const FONT_SANS: &str = generated::tokens::FONT_SANS;
pub const FONT_MONO: &str = generated::tokens::FONT_MONO;
pub const FONT_BASE_SIZE: f32 = generated::tokens::FONT_BASE_SIZE;

/// Parse a `#rrggbb` token value into `0xRRGGBB`. Returns `None` for
/// anything else (tokens are always this shape; this is a guard, not a
/// general CSS parser).
pub fn parse_hex_rgb(hex: &str) -> Option<u32> {
    let digits = hex.strip_prefix('#')?;
    if digits.len() != 6 || !digits.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    u32::from_str_radix(digits, 16).ok()
}

/// The active theme: a named palette plus a density. Typography,
/// spacing, and radius are shared scales (see the associated consts and
/// the `generated::tokens` module).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Theme {
    pub id: ThemeId,
    pub palette: Palette,
    pub density: Density,
}

impl Theme {
    pub fn new(id: ThemeId, density: Density) -> Theme {
        Theme {
            id,
            palette: id.palette(),
            density,
        }
    }

    pub fn control_height(&self) -> f32 {
        self.density.control_height()
    }

    pub fn row_height(&self) -> f32 {
        self.density.row_height()
    }
}

impl Default for Theme {
    fn default() -> Theme {
        Theme::new(ThemeId::default(), Density::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_theme_is_mocha_comfortable() {
        let theme = Theme::default();
        assert_eq!(theme.id, ThemeId::Mocha);
        assert_eq!(theme.density, Density::Comfortable);
        assert_eq!(theme.palette.bg_base, "#1e1e2e");
        assert_eq!(theme.palette.accent, "#89b4fa");
    }

    #[test]
    fn stored_theme_falls_back_to_mocha() {
        assert_eq!(ThemeId::from_stored(None), ThemeId::Mocha);
        assert_eq!(ThemeId::from_stored(Some("bogus")), ThemeId::Mocha);
        assert_eq!(ThemeId::from_stored(Some("latte")), ThemeId::Latte);
        assert_eq!(ThemeId::from_stored(Some("opencode")), ThemeId::OpenCode);
    }

    #[test]
    fn system_preference_maps_light_to_latte_dark_to_mocha() {
        assert_eq!(ThemePreference::System.resolve(true), ThemeId::Mocha);
        assert_eq!(ThemePreference::System.resolve(false), ThemeId::Latte);
        assert_eq!(
            ThemePreference::from_stored(Some("system")),
            ThemePreference::System
        );
        assert_eq!(
            ThemePreference::Named(ThemeId::OpenCode).resolve(false),
            ThemeId::OpenCode
        );
    }

    #[test]
    fn latte_is_the_only_light_theme() {
        assert!(ThemeId::Mocha.is_dark());
        assert!(!ThemeId::Latte.is_dark());
        assert!(ThemeId::OpenCode.is_dark());
    }

    #[test]
    fn palettes_match_generated_tokens() {
        // Spot-check the normative JSON values (specs/design/tokens.md),
        // including Latte's darker status roles.
        assert_eq!(ThemeId::Latte.palette().fg_text, "#4c4f69");
        assert_eq!(ThemeId::Latte.palette().warning, "#7b4e10");
        assert_eq!(ThemeId::Latte.palette().danger, "#b00d30");
        assert_eq!(
            ThemeId::OpenCode.palette().accent_hover,
            generated::opencode::ACCENT_HOVER
        );
        assert_eq!(
            ThemeId::Mocha.palette().border_strong,
            generated::mocha::BORDER_STRONG
        );
    }

    #[test]
    fn density_metrics_match_tokens() {
        assert_eq!(Density::Comfortable.control_height(), 36.0);
        assert_eq!(Density::Comfortable.row_height(), 40.0);
        assert_eq!(Density::Compact.control_height(), 30.0);
        assert_eq!(Density::Compact.row_height(), 32.0);
        assert_eq!(Density::Compact.scale(), 0.875);
    }

    #[test]
    fn parse_hex_rgb_accepts_only_rrggbb() {
        assert_eq!(parse_hex_rgb("#89b4fa"), Some(0x89b4fa));
        assert_eq!(parse_hex_rgb("#FFFFFF"), Some(0xffffff));
        assert_eq!(parse_hex_rgb("89b4fa"), None);
        assert_eq!(parse_hex_rgb("#fff"), None);
        assert_eq!(parse_hex_rgb("#gggggg"), None);
    }
}
