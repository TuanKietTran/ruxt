#!/bin/sh
# Drift check: regenerate the theme module into a temp file and fail if
# it differs from the committed lib/theme/generated_theme.dart.
# Also cross-checks the generated values against design/golden/theme.dart.
set -e
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
python3 tool/generate_theme.py --output "$TMP/generated_theme.dart" >/dev/null
if ! diff -u lib/theme/generated_theme.dart "$TMP/generated_theme.dart"; then
  echo 'DRIFT: lib/theme/generated_theme.dart does not match design/tokens.json' >&2
  exit 1
fi
python3 tool/validate_against_golden.py
 echo 'theme drift check OK'
