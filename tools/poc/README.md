# PoC capture tools

One command per platform regenerates every PoC screen and flow under
`docs/poc/mobile/<platform>/`:

```sh
tools/poc/capture-android.sh   # 27 PNG + 3 GIF + 3 MP4
tools/poc/capture-ios.sh       # 24 PNG + 3 GIF + 3 MP4
tools/poc/capture-flutter.sh   # 26 PNG + 3 GIF + 3 MP4
tools/poc/capture-all.sh       # all platforms (77 PNG, 9 GIF, 9 MP4)
```

Each script is a thin, secret-free wrapper around the platform
generator `docs/poc/mobile/<platform>/gen.py`, which renders the
screens, screenshots them headless, and stitches the flow GIF/MP4
clips. The scripts never touch app source.

## Honest labelling

No mobile toolchain can produce real captures on the build machine
(no Flutter/Dart SDK, no iOS simulator runtimes, no Android SDK
platforms/build-tools), so every asset is a **prototype render**:
HTML mirrors of the actual app screens (in each platform's
`prototype/` directory, styled from the generated design tokens),
screenshot with a headless Chromium-family browser. Sample data
only. Each platform README under `docs/poc/mobile/` says the same.

## Requirements

- Python 3
- A Chromium-family browser: Brave/Chrome/Chromium, or the Chromium
  from a Playwright browser cache
- `ffmpeg` (flow stitching)

## Limits (from the PR brief)

- Each GIF <= 3 MB (current largest: ~246 KB)
- Total PoC assets <= 30 MB (current total: ~4.1 MB)
- Asset index: `docs/poc/mobile/INDEX.md`

## CI

`.github/workflows/poc-capture.yml` is a manual `workflow_dispatch`
workflow that runs `capture-all.sh` on a macOS runner and uploads
`docs/poc/mobile/` as an artifact for review before committing.
