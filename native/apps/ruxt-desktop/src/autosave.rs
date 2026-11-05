//! Autosave controller: dirty tracking + interval gate (caller owns the timer).

use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct AutosaveController {
    interval: Duration,
    dirty: bool,
    last_saved: Option<Instant>,
}

impl AutosaveController {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            dirty: false,
            last_saved: None,
        }
    }
    pub fn from_secs(secs: u64) -> Self {
        Self::new(Duration::from_secs(secs))
    }
    pub fn interval(&self) -> Duration {
        self.interval
    }
    pub fn is_dirty(&self) -> bool {
        self.dirty
    }
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }
    pub fn mark_saved(&mut self, at: Instant) {
        self.dirty = false;
        self.last_saved = Some(at);
    }
    pub fn last_saved(&self) -> Option<Instant> {
        self.last_saved
    }
    /// True when there are unsaved changes and the interval has elapsed
    /// (or nothing was ever saved).
    pub fn due(&self, now: Instant) -> bool {
        if !self.dirty {
            return false;
        }
        match self.last_saved {
            None => true,
            Some(last) => now.duration_since(last) >= self.interval,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clean_is_never_due() {
        let c = AutosaveController::from_secs(2);
        assert!(!c.due(Instant::now()));
    }
    #[test]
    fn dirty_and_never_saved_is_due_immediately() {
        let mut c = AutosaveController::from_secs(60);
        c.mark_dirty();
        assert!(c.due(Instant::now()));
    }
    #[test]
    fn interval_gates_after_save() {
        let mut c = AutosaveController::from_secs(2);
        let t0 = Instant::now();
        c.mark_saved(t0);
        c.mark_dirty();
        assert!(!c.due(t0 + Duration::from_secs(1)));
        assert!(c.due(t0 + Duration::from_secs(2)));
        c.mark_saved(t0 + Duration::from_secs(2));
        assert!(!c.is_dirty());
    }
}
