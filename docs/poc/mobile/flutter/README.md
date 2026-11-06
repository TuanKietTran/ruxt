# Ruxt — Flutter app PoC captures

## PROTOTYPE renders — not screenshots

Every image and clip in this directory is a **prototype HTML render**,
not a screenshot of the Flutter app. The Flutter/Dart SDK is not
installed locally at all, so the app cannot be built or run here.
The renders in `prototype/` mirror the Dart code exactly — labels,
the governing destination order, the placeholder state views, and
the code's own sample text — and are screenshot headless by
`gen.py`. Treat them as a picture of the screens, not as proof the
app renders this way on a device.

Governing destination order (from `lib/app/destinations.dart`):
Editor, Sessions, Templates, Profiles, Settings, Providers,
Cloud data, About, Sign in. Captures are numbered in that order;
additional real states found in the code are appended (17–26).
Colours and typography come from the generated theme tokens
(Mocha by default; one Latte variant): Mocha background `#1E1E2E`,
text `#CDD6F4`, accent `#89B4FA`; spacing 4–48, radius 6/10/16.

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
| 01-editor.png | Editor, content, source pane | 412×915 | 26613 |
| 02-sessions.png | Sessions, content | 412×915 | 37714 |
| 03-sessions-empty.png | Sessions, empty (its initial state) | 412×915 | 22602 |
| 04-templates.png | Templates, content (Classic / Modern / Compact) | 412×915 | 28698 |
| 05-profiles.png | Profiles, content (8 sections, Add actions) | 412×915 | 39964 |
| 06-settings.png | Settings (theme Mocha, density Comfortable, More) | 412×915 | 33638 |
| 07-providers.png | Providers, content | 412×915 | 22072 |
| 08-cloud-data.png | Cloud data, content (consent switches off, as shipped in the shell) | 412×915 | 38019 |
| 09-cloud-data-consents.png | Cloud data, both consents on (full-app state) | 412×915 | 38437 |
| 10-about.png | About | 412×915 | 31160 |
| 11-login.png | Sign in (form shape only, as in the shell) | 412×915 | 23773 |
| 12-loading.png | Loading state ("Loading sessions") | 412×915 | 19725 |
| 13-error.png | Error state ("Sessions could not be loaded.") | 412×915 | 22528 |
| 14-offline.png | Offline state | 412×915 | 24649 |
| 15-wide-rail-editor.png | Editor with navigation rail | 800×1280 | 35290 |
| 16-wide-rail-sessions.png | Sessions with rail, list + no-session-selected detail | 800×1280 | 54753 |
| 17-editor-preview.png | Editor, preview pane (placeholder rendering, as in code) | 412×915 | 29112 |
| 18-editor-empty.png | Editor, empty ("No document open") | 412×915 | 23673 |
| 19-templates-empty.png | Templates, empty | 412×915 | 23439 |
| 20-profiles-empty.png | Profiles, empty | 412×915 | 23402 |
| 21-providers-empty.png | Providers, empty | 412×915 | 22704 |
| 22-wide-rail-settings.png | Settings with navigation rail | 800×1280 | 41959 |
| 23-settings-latte.png | Settings, Latte theme | 412×915 | 29361 |
| 24-editor-export.png | Editor preview after edit, export toast (flow end frame) | 412×915 | 39245 |
| 25-wide-rail-cloud-data.png | Cloud data with navigation rail | 800×1280 | 47294 |
| 26-editor-edited.png | Editor, source after editing the sample document (flow frame) | 412×915 | 34107 |

## Flows (~6–10 s each, GIF and MP4)

| File | Frames | Duration | Bytes |
| --- | --- | ---: | ---: |
| flow-login-list-edit-export.gif | Sign in → Sessions → Editor → edited source → preview → export | 9.5 s | 245901 |
| flow-login-list-edit-export.mp4 | same | 9.43 s | 63963 |
| flow-offline.gif | Offline → loading → Sessions (local data) → Editor | 9.0 s | 146071 |
| flow-offline.mp4 | same | 9.03 s | 41269 |
| flow-wide-rail.gif | Wide editor → wide sessions → Settings → Cloud data via the rail | 9.5 s | 83515 |
| flow-wide-rail.mp4 | same | 9.43 s | 61289 |

## Notes on fidelity

- Sample data only: the only document is the editor's own sample
  ("Your name" / "Write your CV in Markdown."), also shown as the
  single Sessions list item; template names are the code's Classic /
  Modern / Compact. No real people, credentials, or emails appear.
- Placeholder screens carry the code's state chip bar
  (Content / Empty / Loading / Error / Offline). Settings, About,
  and Sign in are not placeholder screens in the shell, so they
  have no chip bar.
- At 800 wide the navigation rail is collapsed (it is extended
  only at ≥1280 in the code) and the editor stays single-pane
  (compact window class), exactly as the Dart layout rules give.
- Phone MP4s are 412×914, one pixel shorter than the PNGs:
  H.264 requires an even height. GIFs keep 412×915 (the wide flow
  GIF is scaled to 400 wide).
- The export toast in 24-editor-export.png is a flow narration
  overlay for the full app's export step; the shell editor itself
  has no export control.

## Verification

- `python3 gen.py` run twice; the second run reproduced all 26
  PNGs with identical sizes, plus the 3 flows in both formats.
- PNG dimensions read back from the file headers: 22 at 412×915,
  the 4 wide-rail captures at 800×1280.
- Flow durations probed with ffprobe: 9.0–9.5 s for every GIF and
  MP4. Each GIF is ≤3 MB (largest 245901 bytes); the whole
  directory totals 1.6 MB (≤10 MB).
- Hygiene: no absolute paths, secrets, or personal data in any
  committed file; `git diff --check` clean.
- Not verified: the Flutter app itself — no SDK is installed, so
  nothing here was built or run from Dart.
