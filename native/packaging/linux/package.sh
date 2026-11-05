#!/usr/bin/env bash
# Package one native app binary for Linux as an AppImage and/or a .deb.
# Usage: package.sh <binary-name> <app-name> [version] [all|appimage|deb]
#   e.g. package.sh ruxt-desktop Ruxt 0.1.0 all
# Output: native/packaging/dist/linux/
# Idempotent: staging dirs and outputs are rebuilt from scratch.
# Tools are checked up front and missing tools fail the run loudly:
#   AppImage needs linuxdeploy (https://github.com/linuxdeploy/linuxdeploy,
#   or set LINUXDEPLOY=/path/to/linuxdeploy-x86_64.AppImage).
#   .deb needs dpkg-deb. (cargo-deb config stubs live in packaging/deb/.)
set -euo pipefail

fail() { echo "error: $*" >&2; exit 1; }

[ $# -ge 2 ] || fail "usage: package.sh <binary-name> <app-name> [version] [all|appimage|deb]"
BINARY_NAME="$1"
APP_NAME="$2"
VERSION="${3:-0.1.0}"
MODE="${4:-all}"
case "$MODE" in all|appimage|deb) ;; *) fail "unknown mode: $MODE (use all, appimage or deb)" ;; esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -f "$BINARY_NAME" ]; then
  BINARY_PATH="$BINARY_NAME"
  BINARY_FILE="$(basename "$BINARY_NAME")"
else
  BINARY_PATH="$NATIVE_DIR/target/release/$BINARY_NAME"
  BINARY_FILE="$BINARY_NAME"
fi
[ -x "$BINARY_PATH" ] || fail "release binary not found or not executable: $BINARY_PATH (build it first: cargo build --release)"
DESKTOP_TEMPLATE="$SCRIPT_DIR/$BINARY_FILE.desktop"
[ -f "$DESKTOP_TEMPLATE" ] || fail "missing desktop file template: $DESKTOP_TEMPLATE"
DIST="$NATIVE_DIR/packaging/dist/linux"
mkdir -p "$DIST"
ARCH="$(uname -m)"
DEB_ARCH="amd64"; [ "$ARCH" = "aarch64" ] && DEB_ARCH="arm64"

build_appimage() {
  local linuxdeploy="${LINUXDEPLOY:-}"
  if [ -z "$linuxdeploy" ]; then
    linuxdeploy="$(command -v linuxdeploy || true)"
  fi
  [ -n "$linuxdeploy" ] || fail "linuxdeploy not found (set LINUXDEPLOY or put linuxdeploy on PATH); cannot build the AppImage"
  local appdir="$DIST/$BINARY_FILE.AppDir"
  local out="$DIST/$APP_NAME-$VERSION-$ARCH.AppImage"
  rm -rf "$appdir" "$out"
  mkdir -p "$appdir/usr/bin" "$appdir/usr/share/applications"
  cp "$BINARY_PATH" "$appdir/usr/bin/$BINARY_FILE"
  chmod +x "$appdir/usr/bin/$BINARY_FILE"
  sed "s/__BINARY__/$BINARY_FILE/g" "$DESKTOP_TEMPLATE" > "$appdir/usr/share/applications/$BINARY_FILE.desktop"
  cp "$appdir/usr/share/applications/$BINARY_FILE.desktop" "$appdir/$BINARY_FILE.desktop"
  # linuxdeploy needs an icon entry; the apps ship no icon yet, so stage an empty placeholder file.
  : > "$appdir/usr/share/icons/hicolor/256x256/apps/.keep" 2>/dev/null || { mkdir -p "$appdir/usr/share/icons/hicolor/256x256/apps"; : > "$appdir/usr/share/icons/hicolor/256x256/apps/.keep"; }
  (cd "$DIST" && "$linuxdeploy" --appdir "$appdir" --output appimage)
  # linuxdeploy names its output after the desktop entry; move the newest match into place.
  local produced
  produced="$(ls -t "$DIST"/*.AppImage 2>/dev/null | head -1 || true)"
  [ -n "$produced" ] || fail "linuxdeploy finished but produced no .AppImage in $DIST"
  [ "$produced" = "$out" ] || mv "$produced" "$out"
  rm -rf "$appdir"
  echo "built $out"
}

build_deb() {
  command -v dpkg-deb >/dev/null 2>&1 || fail "dpkg-deb not found (install dpkg-dev); cannot build the .deb"
  local control_template="$NATIVE_DIR/packaging/deb/control.template"
  [ -f "$control_template" ] || fail "missing deb control template: $control_template"
  local staging="$DIST/deb-staging-$BINARY_FILE"
  local out="$DIST/${BINARY_FILE}_${VERSION}_${DEB_ARCH}.deb"
  rm -rf "$staging" "$out"
  mkdir -p "$staging/DEBIAN" "$staging/usr/bin" "$staging/usr/share/applications"
  cp "$BINARY_PATH" "$staging/usr/bin/$BINARY_FILE"
  chmod 755 "$staging/usr/bin/$BINARY_FILE"
  sed "s/__BINARY__/$BINARY_FILE/g" "$DESKTOP_TEMPLATE" > "$staging/usr/share/applications/$BINARY_FILE.desktop"
  sed -e "s/__PACKAGE__/$BINARY_FILE/g" -e "s/__VERSION__/$VERSION/g" -e "s/__ARCH__/$DEB_ARCH/g" -e "s/__APP_NAME__/$APP_NAME/g" "$control_template" > "$staging/DEBIAN/control"
  dpkg-deb --build "$staging" "$out" >/dev/null
  rm -rf "$staging"
  echo "built $out"
}

case "$MODE" in
  appimage) build_appimage ;;
  deb) build_deb ;;
  all) build_appimage; build_deb ;;
esac
