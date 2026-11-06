#!/bin/sh
# Regenerate the PoC assets for all three mobile platforms.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$DIR/capture-android.sh"
"$DIR/capture-ios.sh"
"$DIR/capture-flutter.sh"
echo 'PoC capture complete: see docs/poc/mobile/INDEX.md'
