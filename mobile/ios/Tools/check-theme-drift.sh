#!/bin/sh
# Regenerates Theme.swift to a temp file and diffs it against the committed copy.
# Exit non-zero on drift. Run from anywhere: sh Tools/check-theme-drift.sh
set -eu
cd "$(dirname "$0")/.."
TMP="$(mktemp -t theme-drift.XXXXXX.swift)"
trap 'rm -f "$TMP"' EXIT
swift Tools/generate-theme.swift ../../design/tokens.json "$TMP" >/dev/null
if diff -u RuxtKit/Sources/RuxtKit/Theme.swift "$TMP"; then
  echo "Theme.swift is up to date."
else
  echo "Theme.swift has drifted from the token source; regenerate it." >&2
  exit 1
fi
