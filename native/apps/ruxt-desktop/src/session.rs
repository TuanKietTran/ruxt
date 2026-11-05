//! Session state, mirroring ruxt-api: identity comes only from the
//! server cookie session; a 401 means signed out. No tokens are stored.

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum SessionState {
    #[default]
    SignedOut,
    SignedIn,
    Offline,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Session {
    pub state: SessionState,
    pub user_id: Option<String>,
    pub email: Option<String>,
}

impl Session {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn is_authenticated(&self) -> bool {
        self.state == SessionState::SignedIn && self.user_id.is_some()
    }
    pub fn sign_in(&mut self, user_id: impl Into<String>, email: impl Into<String>) {
        self.user_id = Some(user_id.into());
        self.email = Some(email.into());
        self.state = SessionState::SignedIn;
    }
    pub fn sign_out(&mut self) {
        self.user_id = None;
        self.email = None;
        self.state = SessionState::SignedOut;
    }
    /// 401 from the API: session is gone, drop identity (per ruxt-api contract).
    pub fn on_unauthorized(&mut self) {
        self.sign_out();
    }
    /// Connectivity lost: keep identity for display, but not authenticated for writes.
    pub fn set_offline(&mut self) {
        if self.state == SessionState::SignedIn {
            self.state = SessionState::Offline;
        }
    }
    pub fn set_online(&mut self) {
        if self.state == SessionState::Offline {
            self.state = SessionState::SignedIn;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sign_in_out_cycle() {
        let mut s = Session::new();
        assert!(!s.is_authenticated());
        s.sign_in("u1", "a@b.c");
        assert!(s.is_authenticated());
        s.sign_out();
        assert!(!s.is_authenticated());
        assert_eq!(s.email, None);
    }
    #[test]
    fn unauthorized_clears_identity() {
        let mut s = Session::new();
        s.sign_in("u1", "a@b.c");
        s.on_unauthorized();
        assert_eq!(s.state, SessionState::SignedOut);
        assert_eq!(s.user_id, None);
    }
    #[test]
    fn offline_keeps_identity_but_not_authenticated() {
        let mut s = Session::new();
        s.sign_in("u1", "a@b.c");
        s.set_offline();
        assert!(!s.is_authenticated());
        assert_eq!(s.user_id.as_deref(), Some("u1"));
        s.set_online();
        assert!(s.is_authenticated());
    }
}
