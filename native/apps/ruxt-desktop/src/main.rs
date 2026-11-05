//! Ruxt desktop binary. GPUI shell lands in todo #3; for now the binary
//! wires the tested logic modules and reports the effective config.

use ruxt_desktop::config::AppConfig;

fn main() {
    let cfg = AppConfig::default();
    if let Err(e) = cfg.validate() {
        eprintln!("invalid config: {e}");
        std::process::exit(1);
    }
    println!("ruxt-desktop scaffold (theme={}, autosave={}s)", cfg.theme, cfg.autosave_interval_secs);
}
