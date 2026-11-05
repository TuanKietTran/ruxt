//! App configuration: plain key=value persistence, validated on load.
//! Device-local only (theme, density, admin service base URL, default
//! analytics window). No credentials are stored here: admin identity is
//! the Clerk session, rechecked by the admin service on every request.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub theme: String,
    /// `comfortable` or `compact`; the admin app defaults to compact.
    pub density: String,
    /// Base URL of the separate ruxt-admin service (Clerk-gated), never
    /// the main app: the two backends are not conflated.
    pub admin_base_url: String,
    /// Default analytics window in hours, 1..=720.
    pub analytics_hours: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "mocha".to_string(),
            density: "compact".to_string(),
            admin_base_url: "http://localhost:3001".to_string(),
            analytics_hours: 24,
        }
    }
}

impl AppConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.theme.trim().is_empty() {
            return Err("theme must not be empty".into());
        }
        if !matches!(self.density.as_str(), "comfortable" | "compact") {
            return Err("density must be comfortable or compact".into());
        }
        if !(self.admin_base_url.starts_with("http://")
            || self.admin_base_url.starts_with("https://"))
        {
            return Err("admin_base_url must be an http(s) URL".into());
        }
        if !(1..=720).contains(&self.analytics_hours) {
            return Err("analytics_hours must be 1..=720".into());
        }
        Ok(())
    }

    pub fn to_key_values(&self) -> String {
        let mut s = String::new();
        s.push_str(&format!("theme={}\n", self.theme));
        s.push_str(&format!("density={}\n", self.density));
        s.push_str(&format!("admin_base_url={}\n", self.admin_base_url));
        s.push_str(&format!("analytics_hours={}\n", self.analytics_hours));
        s
    }

    pub fn from_key_values(text: &str) -> Result<Self, String> {
        let mut c = AppConfig::default();
        for line in text.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            match key.trim() {
                "theme" => c.theme = value.trim().to_string(),
                "density" => c.density = value.trim().to_string(),
                "admin_base_url" => c.admin_base_url = value.trim().to_string(),
                "analytics_hours" => {
                    c.analytics_hours = value
                        .trim()
                        .parse()
                        .map_err(|_| "analytics_hours must be a number".to_string())?
                }
                _ => {}
            }
        }
        c.validate()?;
        Ok(c)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid_and_compact() {
        let c = AppConfig::default();
        assert!(c.validate().is_ok());
        assert_eq!(c.density, "compact");
        assert_eq!(c.analytics_hours, 24);
    }

    #[test]
    fn roundtrip() {
        let c = AppConfig {
            theme: "latte".into(),
            density: "comfortable".into(),
            admin_base_url: "https://admin.example.test".into(),
            analytics_hours: 168,
        };
        assert_eq!(AppConfig::from_key_values(&c.to_key_values()).unwrap(), c);
    }

    #[test]
    fn rejects_bad_density_hours_and_url() {
        let c = AppConfig {
            density: "wide".into(),
            ..AppConfig::default()
        };
        assert!(c.validate().is_err());
        let c = AppConfig {
            analytics_hours: 0,
            ..AppConfig::default()
        };
        assert!(c.validate().is_err());
        let c = AppConfig {
            analytics_hours: 721,
            ..AppConfig::default()
        };
        assert!(c.validate().is_err());
        let c = AppConfig {
            admin_base_url: "localhost:3001".into(),
            ..AppConfig::default()
        };
        assert!(c.validate().is_err());
    }

    #[test]
    fn unknown_keys_ignored_missing_keys_default() {
        let c = AppConfig::from_key_values("unknown=1\ntheme=latte\n").unwrap();
        assert_eq!(c.theme, "latte");
        assert_eq!(c.admin_base_url, "http://localhost:3001");
    }
}
