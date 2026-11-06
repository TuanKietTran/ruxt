#!/usr/bin/env python3
"""Regenerate every Ruxt Android prototype capture in this directory.

No Android SDK platforms/build-tools are installed locally and there is
no gradlew wrapper, so the app cannot be built or run here. These are
prototype HTML renders (prototype/*.html, shared style.css + app.js)
that mirror the Kotlin/Compose screens, screenshot headless. Requires:
a Chromium-family browser (Playwright cache or Brave/Chrome) and
ffmpeg. All paths are relative to this script; no network is used.

Outputs: NN-<screen>.png next to this script (412x915 phone, wide-rail
captures 800x1280) and flow-*.gif / flow-*.mp4 (GIF <= 3 MB each).
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROTO = HERE / 'prototype'
WIDE_PREFIXES = ('17-', '18-', '25-', '26-')
PHONE = (412, 915)
WIDE = (800, 1280)

FLOWS = {
    'flow-login-list-edit-export': [
        ('01-login.png', 1.3), ('02-sessions.png', 1.3),
        ('04-editor.png', 1.3), ('27-editor-edited.png', 1.3),
        ('04-editor.png', 1.6)],
    'flow-offline': [
        ('24-offline.png', 1.9), ('15-loading.png', 1.5),
        ('02-sessions.png', 1.9), ('04-editor.png', 1.9)],
    'flow-wide-rail': [
        ('17-wide-rail-sessions.png', 1.9), ('18-wide-rail-editor.png', 1.9),
        ('25-wide-rail-settings.png', 1.9), ('26-wide-rail-dashboard.png', 1.9)],
}


def find_browser():
    env = os.environ.get('BROWSER_BIN')
    if env and Path(env).exists():
        return env
    for name in ('chromium', 'chromium-browser', 'google-chrome', 'brave'):
        found = shutil.which(name)
        if found:
            return found
    cache = Path.home() / 'Library' / 'Caches' / 'ms-playwright'
    patterns = [
        'chromium_headless_shell-*/chrome-headless-shell-mac*/chrome-headless-shell',
        'chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium',
        'chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ]
    for pat in patterns:
        hits = sorted(glob.glob(str(cache / pat)))
        if hits:
            return hits[0]
    for app in ('Brave Browser', 'Google Chrome'):
        candidate = Path('/Applications') / (app + '.app') / 'Contents' / 'MacOS' / app
        if candidate.exists():
            return str(candidate)
    sys.exit('No Chromium-family browser found (set BROWSER_BIN).')


def shoot(browser, html, png, size):
    cmd = [browser, '--headless', '--disable-gpu', '--no-sandbox',
           '--hide-scrollbars', '--force-device-scale-factor=1',
           '--virtual-time-budget=3000',
           '--window-size=%d,%d' % size,
           '--screenshot=' + str(png), html.as_uri()]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    if not png.exists() or png.stat().st_size == 0:
        sys.exit('Screenshot failed: ' + str(png))


def make_flow(name, frames, tmp):
    for png, _ in frames:
        if not (HERE / png).exists():
            sys.exit('Flow frame missing: ' + png)
    lst = tmp / (name + '.txt')
    lines = []
    for png, dur in frames:
        lines.append("file '%s'" % (HERE / png))
        lines.append('duration %.2f' % dur)
    lines.append("file '%s'" % (HERE / frames[-1][0]))
    lst.write_text('\n'.join(lines) + '\n')
    mp4 = HERE / (name + '.mp4')
    subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst),
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28',
                    '-r', '30', '-movflags', '+faststart', str(mp4)],
                   check=True, capture_output=True, text=True)
    width = 800 if frames[0][0].startswith(WIDE_PREFIXES) else 412
    gif_w = 400 if width == 800 else 412
    palette = tmp / (name + '.png')
    vf = 'fps=4,scale=%d:-1:flags=lanczos' % gif_w
    subprocess.run(['ffmpeg', '-y', '-i', str(mp4), '-vf', vf + ',palettegen=stats_mode=diff',
                    str(palette)], check=True, capture_output=True, text=True)
    gif = HERE / (name + '.gif')
    subprocess.run(['ffmpeg', '-y', '-i', str(mp4), '-i', str(palette),
                    '-lavfi', vf + ' [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4',
                    str(gif)], check=True, capture_output=True, text=True)
    print(name, 'mp4', mp4.stat().st_size, 'gif', gif.stat().st_size)


def main():
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg not found on PATH.')
    browser = find_browser()
    print('browser:', browser)
    htmls = sorted(PROTO.glob('*.html'))
    if len(htmls) < 20:
        sys.exit('Expected >=20 prototype pages, found %d' % len(htmls))
    for html in htmls:
        size = WIDE if html.name.startswith(WIDE_PREFIXES) else PHONE
        png = HERE / (html.stem + '.png')
        shoot(browser, html, png, size)
        print(png.name, size, png.stat().st_size)
    with tempfile.TemporaryDirectory() as td:
        for name, frames in FLOWS.items():
            make_flow(name, frames, Path(td))
    print('DONE', len(htmls), 'pngs +', len(FLOWS), 'flows')


if __name__ == '__main__':
    main()
