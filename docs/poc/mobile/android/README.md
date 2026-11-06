# Ruxt — Android app PoC captures

## PROTOTYPE renders — not screenshots

Every image and clip in this directory is a **prototype HTML render**,
not a screenshot of the Android app. No Android SDK platforms or
build-tools are installed locally and there is no `gradlew` wrapper,
so the app cannot be built or run here. The renders in `prototype/`
mirror the Kotlin/Compose code — labels, destination order, the
reusable state views (`Common.kt`), and the code's own text from
`Screens.kt` / `RuxtNav.kt` — and are screenshot headless by
`gen.py`. Treat them as a picture of the screens, not as proof the
app renders this way on a device.

Navigation (from `RuxtNav.kt`): the phone bottom bar shows the 4
TopDests — Sessions, Templates, Profiles, More; at ≥600dp a rail
shows all 8 AllDests — Sessions, Templates, Profiles, Providers,
Dashboard, Settings, About, Login. Captures 01–18 follow the brief
order; additional real screens/states found in the code are appended
(19–27). Colours and typography come from the generated tokens in
`theme/Tokens.kt` (Mocha, the default fallback theme): background
`#1E1E2E`, text `#CDD6F4`, accent `#89B4FA`.

## Reproduce

```sh
python3 gen.py
```

Requires `ffmpeg` on PATH and a Chromium-family browser — the
Playwright cache under `~/Library/Caches/ms-playwright`, Brave, or
Chrome (override with `BROWSER_BIN`). All paths are relative to
`gen.py`; no network access is used. Python Playwright is not
required: the browser is driven headless directly.

## Captures (phone 412×915 unless noted)

| File | Screen / state | Dims | Bytes |
| --- | --- | --- | ---: |
| 01-login.png | Login gate placeholder (sign-in is Planned) | 412×915 | 29331 |
| 02-sessions.png | Sessions, content (sample local sessions) | 412×915 | 29078 |
| 03-sessions-empty.png | Sessions, empty ("No sessions yet") | 412×915 | 29394 |
| 04-editor.png | Editor, content (Sample CV) | 412×915 | 27250 |
| 05-editor-offline.png | Editor, offline state | 412×915 | 33107 |
| 06-templates.png | Templates, content (Classic / Modern sample data) | 412×915 | 32593 |
| 07-profiles.png | Profiles, content (Sample Profile) | 412×915 | 20626 |
| 08-providers.png | Providers, Planned placeholder, empty | 412×915 | 21262 |
| 09-dashboard.png | Dashboard, empty + Planned shortcuts | 412×915 | 27838 |
| 10-settings.png | Settings (theme mocha, density comfortable, save mode manual) | 412×915 | 42534 |
| 11-settings-consents.png | Settings, cloud consents (Session recovery / Templates, both off) | 412×915 | 22993 |
| 12-about.png | About | 412×915 | 24932 |
| 13-more.png | More (all remaining routes) | 412×915 | 29048 |
| 14-planned.png | Planned placeholder (Plans) | 412×915 | 18613 |
| 15-loading.png | Loading state ("Loading sessions") | 412×915 | 15135 |
| 16-error.png | Error state ("Sessions could not be loaded.", Retry) | 412×915 | 18529 |
| 17-wide-rail-sessions.png | Sessions with navigation rail | 800×1280 | 36575 |
| 18-wide-rail-editor.png | Editor with navigation rail | 800×1280 | 35351 |
| 19-templates-empty.png | Templates, empty ("No templates loaded") | 412×915 | 33185 |
| 20-profiles-empty.png | Profiles, empty ("No profiles yet") | 412×915 | 23302 |
| 21-editor-empty.png | Editor, empty ("No document open") | 412×915 | 24627 |
| 22-planned-billing.png | Planned placeholder (Billing) | 412×915 | 18822 |
| 23-planned-iam.png | Planned placeholder (Account & IAM) | 412×915 | 22290 |
| 24-offline.png | Offline state (Templates) | 412×915 | 22434 |
| 25-wide-rail-settings.png | Settings with navigation rail | 800×1280 | 50938 |
| 26-wide-rail-dashboard.png | Dashboard with navigation rail | 800×1280 | 35806 |
| 27-editor-edited.png | Editor, edited ("Unsaved changes") | 412×915 | 30944 |

## Flows

| File | Sequence | Duration | Bytes |
| --- | --- | --- | ---: |
| flow-login-list-edit-export.gif | Login → Sessions → Editor → edited Editor → Editor (Save) | 8.0 s | 140861 |
| flow-login-list-edit-export.mp4 | same | 8.10 s | 37631 |
| flow-offline.gif | Offline → Loading → Sessions (local data) → Editor | 9.0 s | 110184 |
| flow-offline.mp4 | same | 9.03 s | 36273 |
| flow-wide-rail.gif | Wide Sessions → Editor → Settings → Dashboard via the rail | 9.5 s | 74626 |
| flow-wide-rail.mp4 | same | 9.43 s | 54160 |

## Notes on fidelity

- Sample data only: no real people, credentials, or emails appear.
  Content lists use illustrative sample data (for example the two
  session entries in 02-sessions.png) because the shell's
  ViewModels return empty lists; the empty-state captures show the
  code's real initial state.
- The Android shell editor has no export or preview control, so no
  export screen was fabricated: the login→list→edit→export flow
  ends on the editor's Save action, which is the shell's only
  output action.
- Both cloud consent switches are off, as shipped in the shell
  (see 10-settings.png and 11-settings-consents.png).
- Phone MP4s are 412×914, one pixel shorter than the PNGs:
  H.264 requires an even height. GIFs keep 412×915 (the wide flow
  GIF is scaled to 400 wide).

## Verification

- `python3 gen.py` run twice; the second run reproduced all 27
  PNGs and the 3 flows with identical file sizes.
- PNG dimensions read back from the file headers: 23 at 412×915,
  the 4 wide-rail captures at 800×1280.
- Flow durations probed with ffprobe: 8.0–9.5 s for every GIF and
  MP4. Each GIF is ≤3 MB (largest 140861 bytes); the whole
  directory totals 1.4 MB (≤10 MB).
- Hygiene: no absolute paths, secrets, or personal data in any
  committed file; `git diff --check` clean.
- Not verified: the Android app itself — no SDK platforms or
  build-tools are installed and there is no `gradlew`, so nothing
  here was built or run from Kotlin.
