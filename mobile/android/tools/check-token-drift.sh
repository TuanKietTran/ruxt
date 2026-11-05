#!/bin/sh
# Drift check: regenerate Tokens.kt from design/tokens.json and fail if the
# committed generated file differs. Exit code is diff's exit code.
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
node tools/generate-tokens.mjs "$tmp/Tokens.kt" >/dev/null
diff -u app/src/main/java/cloud/mashallow/ruxt/theme/Tokens.kt "$tmp/Tokens.kt"
echo 'Tokens.kt is up to date with design/tokens.json'
