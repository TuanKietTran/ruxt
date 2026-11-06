#!/usr/bin/env python3
"""Generate all PoC assets (PNGs + flow GIF/MP4) from prototype/*.html.

Prototype renders only: no iOS simulator runtimes exist on the build
machine, so screens are HTML mirrors of the SwiftUI code, shot headless.
Paths are relative to this file; browser = Brave headless if present,
else the Playwright-cache Chromium; ffmpeg builds the flow clips.
"""
import glob, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROTO = HERE / "prototype"

WIDE = {"14-ipad-split-sessions", "15-ipad-split-editor", "23-ipad-split-about"}
FLOWS = {
    "flow-login-list-edit-save": ["11-settings-account-login", "01-sessions", "03-editor", "04-editor-manual-save", "20-editor-preview"],
    "flow-offline": ["13-offline-or-error-state", "01-sessions", "03-editor"],
    "flow-ipad-split": ["14-ipad-split-sessions", "15-ipad-split-editor", "23-ipad-split-about"],
}
FRAME_SECONDS = 2

def browser() -> str:
    for p in ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]:
        if os.path.exists(p):
            return p
    cache = sorted(glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium")))
    if cache:
        return cache[-1]
    sys.exit("no headless browser found (Brave/Chromium/Playwright cache)")

def shot(browser_path: str, html: Path, png: Path, w: int, h: int) -> None:
    subprocess.run([browser_path, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size={w},{h}", f"--screenshot={png}", html.as_uri()],
                   check=True, capture_output=True)

def clip(name: str, frames: list[Path], w: int, h: int) -> None:
    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "frames.txt"
        lines = []
        for f in frames:
            lines += [f"file '{f}'", f"duration {FRAME_SECONDS}"]
        lines.append(f"file '{frames[-1]}'")
        lst.write_text("\n".join(lines) + "\n")
        even = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-vf", f"{even},format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart",
                        str(HERE / f"{name}.mp4")], check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=bayer",
                        str(HERE / f"{name}.gif")], check=True, capture_output=True)

def main() -> None:
    b = browser()
    pngs = {}
    for html in sorted(PROTO.glob("[0-9]*.html")):
        stem = html.stem
        w, h = (820, 1180) if stem in WIDE else (393, 852)
        png = HERE / f"{stem}.png"
        shot(b, html, png, w, h)
        pngs[stem] = png
        print(f"png {png.name} {w}x{h}")
    for name, stems in FLOWS.items():
        frames = [pngs[s] for s in stems]
        w, h = (820, 1180) if name == "flow-ipad-split" else (393, 852)
        clip(name, frames, w, h)
        print(f"flow {name} ({len(frames)} frames)")

if __name__ == "__main__":
    main()
