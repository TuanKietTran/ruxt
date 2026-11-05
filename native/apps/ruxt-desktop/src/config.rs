//! App configuration: plain key=value persistence, validated on load.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub theme: String,
    pub autosave_interval_secs: u64,
    pub editor_font_size: u16,
    pub last_template_id: Option<String>,
    pub last_profile_id: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "mocha".to_string(),
            autosave_interval_secs: 2,
            editor_font_size: 14,
            last_template_id: None,
            last_profile_id: None,
        }
    }
}

impl AppConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.theme.trim().is_empty() {
            return Err("theme must not be empty".into());
        }
        if self.autosave_interval_secs == 0 {
            return Err("autosave_interval_secs must be >= 1".into());
        }
        if !(8..=32).contains(&self.editor_font_size) {
            return Err("editor_font_size must be 8..=32".into());
        }
        Ok(())
    }
    pub fn to_key_values(&self) -> String {
        let mut s = String::new();
        s.push_str(&format!("theme={}\n", self.theme));
        s.push_str(&format!(
            "autosave_interval_secs={}\n",
            self.autosave_interval_secs
        ));
        s.push_str(&format!("editor_font_size={}\n", self.editor_font_size));
        if let Some(v) = &self.last_template_id {
            s.push_str(&format!("last_template_id={v}\n"));
        }
        if let Some(v) = &self.last_profile_id {
            s.push_str(&format!("last_profile_id={v}\n"));
        }
        s
    }
    pub fn from_key_values(text: &str) -> Result<Self, String> {
        let mut cfg = AppConfig::default();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let (k, v) = line
                .split_once('=')
                .ok_or_else(|| format!("bad config line: {line}"))?;
            match k.trim() {
                "theme" => cfg.theme = v.trim().to_string(),
                "autosave_interval_secs" => {
                    cfg.autosave_interval_secs = v
                        .trim()
                        .parse()
                        .map_err(|_| "bad autosave_interval_secs".to_string())?
                }
                "editor_font_size" => {
                    cfg.editor_font_size = v
                        .trim()
                        .parse()
                        .map_err(|_| "bad editor_font_size".to_string())?
                }
                "last_template_id" => cfg.last_template_id = Some(v.trim().to_string()),
                "last_profile_id" => cfg.last_profile_id = Some(v.trim().to_string()),
                _ => {}
            }
        }
        cfg.validate()?;
        Ok(cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_valid() {
        assert!(AppConfig::default().validate().is_ok());
    }
    #[test]
    fn roundtrip() {
        let c = AppConfig {
            last_template_id: Some("classic".into()),
            ..AppConfig::default()
        };
        assert_eq!(AppConfig::from_key_values(&c.to_key_values()).unwrap(), c);
    }
    #[test]
    fn rejects_zero_autosave_and_bad_font() {
        let c = AppConfig {
            autosave_interval_secs: 0,
            ..AppConfig::default()
        };
        assert!(c.validate().is_err());
        let c = AppConfig {
            editor_font_size: 100,
            ..AppConfig::default()
        };
        assert!(c.validate().is_err());
    }
    #[test]
    fn unknown_keys_ignored_missing_keys_default() {
        let c = AppConfig::from_key_values("unknown=1\ntheme=latte\n").unwrap();
        assert_eq!(c.theme, "latte");
        assert_eq!(c.editor_font_size, 14);
    }
}
