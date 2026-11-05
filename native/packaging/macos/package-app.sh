#!/usr/bin/env bash
# Package one native app binary as a macOS .app bundle and a .dmg.
# Usage: package-app.sh <binary-name> <app-name> [version]
#   <binary-name>  file name under native/target/release/ (or a path to a binary)
#   <app-name>     display name, e.g. "Ruxt" or "Ruxt Admin"
# Output: native/packaging/dist/macos/<app-name>.app and <app-name>.dmg
# Idempotent: the bundle and dmg staging dirs are rebuilt from scratch.
# The bundle is unsigned; signing/notarization is a release step, not done here.
set -euo pipefail

fail() { echo "error: $*" >&2; exit 1; }

[ $# -ge 2 ] || fail "usage: package-app.sh <binary-name> <app-name> [version]"
BINARY_NAME="$1"
APP_NAME="$2"
VERSION="${3:-0.1.0}"

command -v hdiutil >/dev/null 2>&1 || fail "hdiutil not found (macOS is required to build a .dmg)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$SCRIPT_DIR/Info.plist.template"
[ -f "$TEMPLATE" ] || fail "missing Info.plist template: $TEMPLATE"

if [ -f "$BINARY_NAME" ]; then
  BINARY_PATH="$BINARY_NAME"
  BINARY_FILE="$(basename "$BINARY_NAME")"
else
  BINARY_PATH="$NATIVE_DIR/target/release/$BINARY_NAME"
  BINARY_FILE="$BINARY_NAME"
fi
[ -x "$BINARY_PATH" ] || fail "release binary not found or not executable: $BINARY_PATH (build it first: cargo build --release)"

SLUG="$(printf '%s' "$BINARY_FILE" | tr '[:upper:]' '[:lower:]')"
BUNDLE_ID="cloud.mashallow.ruxt.$SLUG"
DIST="$NATIVE_DIR/packaging/dist/macos"
APP_BUNDLE="$DIST/$APP_NAME.app"
DMG_STAGING="$DIST/dmg-staging-$SLUG"
DMG_PATH="$DIST/$APP_NAME.dmg"

rm -rf "$APP_BUNDLE" "$DMG_STAGING" "$DMG_PATH"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$BINARY_PATH" "$APP_BUNDLE/Contents/MacOS/$BINARY_FILE"
chmod +x "$APP_BUNDLE/Contents/MacOS/$BINARY_FILE"
sed -e "s/__APP_NAME__/$APP_NAME/g" -e "s/__BINARY__/$BINARY_FILE/g" -e "s/__BUNDLE_ID__/$BUNDLE_ID/g" -e "s/__VERSION__/$VERSION/g" "$TEMPLATE" > "$APP_BUNDLE/Contents/Info.plist"
plutil -lint "$APP_BUNDLE/Contents/Info.plist" >/dev/null || fail "generated Info.plist is invalid"

mkdir -p "$DMG_STAGING"
cp -R "$APP_BUNDLE" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGING" -ov -format UDZO "$DMG_PATH" >/dev/null
rm -rf "$DMG_STAGING"

echo "built $APP_BUNDLE"
echo "built $DMG_PATH"
