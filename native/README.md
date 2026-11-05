# Ruxt native

Cargo workspace for the native (GPUI) apps and their shared crates.

## Layout

```
native/
  Cargo.toml            workspace (resolver 2); all dependency pins live here
  crates/
    ruxt-api/           typed async client for the main API (server/routes/api/**);
                        cookie-session auth, no Bearer tokens
    ruxt-ui-kit/        GPUI theme tokens + button / text-input / list-row / panel
                        components; GPUI is feature-gated (`--features gpui`)
  apps/                 added by later labs — not part of this workspace yet:
    ruxt-desktop/         main editor app
    ruxt-admin-desktop/   admin app
  packaging/            per-OS bundling notes (future)
```

Workspace dependency pins: gpui 0.2.2 (crates.io), serde, serde_json,
reqwest (rustls + json + cookies), tokio, thiserror, url,
pulldown-cmark 0.13.6 (markdown preview), printpdf 0.12.8 (PDF export).

## Prerequisites

- Rust (verified with rustc/cargo 1.98.0).
- macOS: full Xcode **plus the Metal Toolchain component** — GPUI 0.2.2
  compiles Metal shaders at build time and fails with `cannot execute tool
  metal` without it. Install with:
  `xcodebuild -downloadComponent MetalToolchain`
  (Command Line Tools alone are not enough.)
- Windows: MSVC Rust toolchain (GPUI's Win32 backend is in-crate). Not
  verified in this lab.
- Linux: X11/Wayland backends are GPUI default features; expect system dev
  packages for xkbcommon, wayland, and fontconfig/freetype. Not verified in
  this lab — CI must verify on a Linux runner.

Machines without the GUI prerequisites can still build and test the API
client: `cargo check -p ruxt-api` does not build GPUI.

## Build and verify

```sh
cargo fmt --check
cargo clippy --workspace -- -D warnings
cargo test --workspace     # unit tests are serde fixtures; no network
cargo check --workspace
cargo check -p ruxt-api    # non-GPUI gate (e.g. CI without Metal Toolchain)
```

## API notes for clients

- Same-origin Nitro API, paths are `/api/...` with no version prefix.
- Auth is a cookie session (`auth_session`, max age 7 days). Keep a cookie
  jar; treat 401 as signed out. There are no Bearer tokens.
- Errors arrive in two shapes: the CQRS envelope
  `{statusCode, statusMessage, data: {code: NOT_FOUND | CONFLICT | BAD_REQUEST | INTERNAL_ERROR}}`
  (500 hides the message as `Internal server error`), and bare
  `{statusCode, statusMessage}` from routes that throw directly.
- Server limits that matter to clients: CV import max 15 MiB, CV artifact
  TTL 24 h. Live events are retired — poll, do not expect SSE.
