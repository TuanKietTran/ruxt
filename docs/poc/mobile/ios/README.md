# Ruxt iOS — PoC capture set

> **PROTOTYPE — not app screenshots.** No iOS simulator runtimes exist on
> the build machine, so every screen below is an HTML prototype render
> (`prototype/*.html` + shared `prototype/style.css`) mirroring the
> SwiftUI code in `mobile/ios/` (RuxtKit + app views, Mocha/Latte
> tokens), shot headless. Sample data only. No Swift/Xcode build is
> claimed by this PoC.

## Regenerate

```sh
cd docs/poc/mobile/ios
python3 gen.py
```

`gen.py` uses relative paths only: Brave/Chromium headless if present,
else the Playwright-cache Chromium; `ffmpeg` builds the flow clips
(H.264, even-height scale fix). Frame hold is 2s per frame.

## Screens (24 PNGs)

Phone frames are 393x852; iPad split frames are 820x1180.

| # | File | Size (bytes) | Notes |
|---|------|--------------|-------|
| 01 | `01-sessions.png` | 26385 | Sessions list |
| 02 | `02-sessions-empty.png` | 30331 | Sessions empty state |
| 03 | `03-editor.png` | 27758 | Editor |
| 04 | `04-editor-manual-save.png` | 37324 | Editor, manual-save mode |
| 05 | `05-templates.png` | 30058 | Templates list |
| 06 | `06-templates-loading.png` | 20677 | Templates loading |
| 07 | `07-templates-error.png` | 31966 | Templates error |
| 08 | `08-profiles.png` | 29757 | Profiles list |
| 09 | `09-providers.png` | 30560 | Providers list |
| 10 | `10-settings.png` | 54311 | Settings |
| 11 | `11-settings-account-login.png` | 32073 | Account, signed out / login |
| 12 | `12-about.png` | 27436 | About |
| 13 | `13-offline-or-error-state.png` | 29420 | Offline / error state |
| 14 | `14-ipad-split-sessions.png` | 36858 | iPad split, Sessions (820x1180) |
| 15 | `15-ipad-split-editor.png` | 38905 | iPad split, Editor (820x1180) |
| 16 | `16-profiles-loading.png` | 19946 | Profiles loading |
| 17 | `17-profiles-error.png` | 30646 | Profiles error |
| 18 | `18-providers-loading.png` | 20468 | Providers loading |
| 19 | `19-providers-error.png` | 31545 | Providers error |
| 20 | `20-editor-preview.png` | 28989 | Editor preview |
| 21 | `21-editor-css-expanded.png` | 28076 | Editor, Custom CSS expanded |
| 22 | `22-settings-account-signed-in.png` | 30713 | Account, signed in |
| 23 | `23-ipad-split-about.png` | 38408 | iPad split, About (820x1180) |
| 24 | `24-settings-latte.png` | 50609 | Settings, Latte theme |

## Flows (3 x GIF + MP4)

| Flow | Frames | Duration | GIF | MP4 |
|------|--------|----------|-----|-----|
| `flow-login-list-edit-save` | 11, 01, 03, 04, 20 | 10.04s | 71776 B | 36759 B |
| `flow-offline` | 13, 01, 03 | 6.04s | 45505 B | 23117 B |
| `flow-ipad-split` | 14, 15, 23 | 6.04s | 83808 B | 27915 B |

## Verification

- `python3 gen.py` exit 0; run twice — PNG byte sizes identical on
  the second run (`PNG_SIZES_IDENTICAL`).
- PNG dimensions read from PNG headers: 21x 393x852, 3x 820x1180
  (14/15/23).
- `ffprobe` durations: login-list-edit-save 10.04s, offline 6.04s,
  ipad-split 6.04s (GIF and MP4 agree).
- Total capture set: 1.2M (24 PNG + 3 GIF + 3 MP4 + 24 prototype HTML
  + `style.css` + `gen.py`).

## Fidelity notes

- Screens mirror the SwiftUI views/states inventoried from
  `mobile/ios/`: Sessions (list/empty), Editor (autosave/manual-save,
  preview, Custom CSS), Templates / Profiles / Providers
  (list/loading/error), Settings (account signed-out/signed-in,
  Latte variant), About, offline/error, and iPad split layouts.
- Any wording, counts or values visible in the renders are sample
  data from the prototype, not live account data.
