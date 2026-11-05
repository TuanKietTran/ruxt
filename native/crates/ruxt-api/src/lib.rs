//! Typed async client for the Ruxt HTTP API.
//!
//! Mirrors `server/routes/api/**` in the main repo. Authentication is the
//! server's cookie session (`auth_session`, 7 days): the client keeps a
//! cookie jar, sends no Bearer token, and treats 401 as signed out.
//! Identity is derived from the session only.

pub mod applications;
pub mod artifacts;
pub mod auth;
pub mod capabilities;
pub mod client;
pub mod consent;
pub mod health;
pub mod imports;
pub mod preferences;
pub mod templates;
