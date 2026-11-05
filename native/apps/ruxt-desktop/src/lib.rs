//! Ruxt desktop app: logic modules (UI shell in main.rs / gpui views).
//! Logic is GPUI-free and unit-tested so it compiles/tests without a window.

pub mod autosave;
pub mod config;
pub mod markdown;
pub mod session;
pub mod storage;
