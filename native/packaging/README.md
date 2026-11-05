# Native packaging

Scripts and config stubs for packaging the native apps
(`ruxt-desktop`, `ruxt-admin-desktop`) after a release build.
All scripts are idempotent (their staging dirs and outputs are rebuilt
from scratch), resolve binaries from `native/target/release/` (or a path
given as the first argument), and fail with a clear error when a required
tool or the binary is missing. Outputs land in `native/packaging/dist/`,
which is git-ignored (`/packaging/dist/` in `native/.gitignore`).

Build first, from `native/`:

```sh
cargo build --release
# -> target/release/ruxt-desktop, target/release/ruxt-admin-desktop
```

## macOS — .app + .dmg

Prerequisites: macOS with Xcode (for `hdiutil` and `plutil`).

```sh
native/packaging/macos/package-app.sh ruxt-desktop "Ruxt"
native/packaging/macos/package-app.sh ruxt-admin-desktop "Ruxt Admin"
# -> native/packaging/dist/macos/Ruxt.app, Ruxt.dmg, ...
```

The bundle's `Info.plist` is generated from
`macos/Info.plist.template` (bundle id `cloud.mashallow.ruxt.<binary>`).
Bundles are unsigned; code signing and notarization are release steps
and are not performed by this script.

## Windows — .zip (+ .msi with WiX)

Prerequisites: Windows PowerShell 5+ (`Compress-Archive`). For the .msi:
the WiX v4 toolset (`dotnet tool install --global wix`).

```powershell
native\packaging\windows\package.ps1 -BinaryName ruxt-desktop -AppName "Ruxt"
native\packaging\windows\package.ps1 -BinaryName ruxt-admin-desktop -AppName "Ruxt Admin"
# -> native\packaging\dist\windows\Ruxt.zip (+ Ruxt.msi when WiX is present)
```

Without WiX the script still builds the .zip and prints a warning that
the .msi was skipped. The .msi is built from `windows/Product.wxs`;
before shipping one, replace its `__UPGRADE_CODE__` placeholder with a
stable per-app GUID and commit it.

## Linux — AppImage + .deb

Prerequisites: for the AppImage, `linuxdeploy`
(https://github.com/linuxdeploy/linuxdeploy — put it on `PATH` or set
`LINUXDEPLOY=/path/to/linuxdeploy-x86_64.AppImage`); for the .deb,
`dpkg-deb` (package `dpkg-dev`). Runtime/build system packages are the
same list the CI workflow installs (see `.github/workflows/native.yml`:
fontconfig/freetype, wayland, xkbcommon, X11/XCB, ssl, zstd, vulkan,
alsa, udev development packages).

```sh
native/packaging/linux/package.sh ruxt-desktop Ruxt
native/packaging/linux/package.sh ruxt-admin-desktop "Ruxt Admin"
# modes: all (default) | appimage | deb, e.g.
# native/packaging/linux/package.sh ruxt-desktop Ruxt 0.1.0 deb
# -> native/packaging/dist/linux/*.AppImage, *.deb
```

Desktop entries are `linux/<binary>.desktop`. The .deb control file is
generated from `deb/control.template`. As an alternative to the script's
direct .deb build, `deb/<binary>.cargo-deb.toml` holds a commented
`[package.metadata.deb]` block to copy into the app crate's `Cargo.toml`
for use with `cargo deb`.

## CI

`.github/workflows/native.yml` builds and tests the workspace on
macOS, Windows and Ubuntu; it does not run these packaging scripts.
Packaging is a manual release step run on a machine of the target OS.
