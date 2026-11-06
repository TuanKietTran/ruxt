#!/bin/sh
# Regenerate all Flutter PoC assets (PNG screens + flow GIF/MP4).
# Prototype renders: no Flutter/Dart SDK is required; the platform
# gen.py screenshots prototype/*.html headless and stitches the flows
# with ffmpeg. No secrets, no network, no app source touched.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec python3 "$ROOT/docs/poc/mobile/flutter/gen.py" "$@"
