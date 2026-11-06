#!/usr/bin/env python3
"""Generate lib/theme/generated_theme.dart from the design token JSON.

Input: ONE token JSON. Default path is the in-tree design/tokens.json
(repo root, merged from the design/tokens branch as provisional-real).
When the real tokens land on the integration branch the input path is
the only thing that changes: pass --input <path> or edit DEFAULT_INPUT.

Output is generated, never hand-edited. Run tool/check_theme_drift.sh
to verify the committed file matches the JSON.
"""
import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP_DIR = HERE.parent
DEFAULT_INPUT = APP_DIR / '..' / '..' / 'design' / 'tokens.json'
DEFAULT_OUTPUT = APP_DIR / 'lib' / 'theme' / 'generated_theme.dart'


def pascal(s):
    p = re.sub(r'(^|[^a-zA-Z0-9])(.)', lambda m: m.group(2).upper(), s)
    return re.sub(r'[^a-zA-Z0-9]', '', p)


def camel(s):
    p = pascal(s)
    return p[0].lower() + p[1:]


def dec(n):
    return f'{n}.0' if float(n) == int(n) else str(n)


def color_literal(hex_value):
    h = hex_value.lstrip('#').upper()
    return f'Color(0xFF{h})'


def common_tokens(t):
    """Flatten non-color tokens to [name, value, kind] like the design node tool."""
    out = []
    num = lambda name, v: out.append((name, v, 'num'))
    string = lambda name, v: out.append((name, v, 'str'))
    string('fontSans', t['typography']['fontFamily']['sans'])
    string('fontMono', t['typography']['fontFamily']['mono'])
    num('fontBaseSize', t['typography']['baseSizePx'])
    for k, v in t['typography']['weights'].items():
        num(f'fontWeight{pascal(k)}', v)
    for k, v in t['typography']['scale'].items():
        num(f'text{pascal(k)}Size', v['sizePx'])
        num(f'text{pascal(k)}LineHeight', v['lineHeight'])
        num(f'text{pascal(k)}Weight', v['weight'])
    for k, v in t['spacing'].items():
        num(f'spacing-{k}', v)
    for k, v in t['radius'].items():
        num(f'radius{pascal(k)}', v)
    for k, v in t['elevation'].items():
        string(f'elevation{pascal(k)}', v)
    for k, v in t['motion']['durationMs'].items():
        num(f'duration{pascal(k)}', v)
    for k, v in t['motion']['easing'].items():
        string(f'easing{pascal(k)}', v)
    for k, v in t['breakpoints']['valuesPx'].items():
        num(f'breakpoint{pascal(k)}', v)
    for k, v in t['density'].items():
        num(f'density{pascal(k)}Scale', v['scale'])
        num(f'density{pascal(k)}ControlHeight', v['controlHeightPx'])
        num(f'density{pascal(k)}RowHeight', v['rowHeightPx'])
    num('focusRingWidth', t['focusRing']['widthPx'])
    num('focusRingOffset', t['focusRing']['offsetPx'])
    string('focusRingStyle', t['focusRing']['style'])
    string('iconSet', t['icons']['set'])
    return [(camel(n), v, kind) for n, v, kind in out]


def generate(t):
    lines = []
    lines.append('// Generated from design/tokens.json by tool/generate_theme.py. Do not edit by hand.')
    lines.append("import 'dart:ui';")
    lines.append('')
    lines.append('/// One theme palette: every color role from design/tokens.json for one theme.')
    lines.append('class RuxtPalette {')
    color_keys = list(next(iter(t['themes'].values()))['color'].keys())
    for key in color_keys:
        lines.append(f'  final Color {key};')
    lines.append('  final Brightness brightness;')
    lines.append('  const RuxtPalette({')
    for key in color_keys:
        lines.append(f'    required this.{key},')
    lines.append('    required this.brightness,')
    lines.append('  });')
    lines.append('}')
    lines.append('')
    for theme_id, theme in t['themes'].items():
        brightness = 'Brightness.light' if theme['colorScheme'] == 'light' else 'Brightness.dark'
        lines.append(f'const RuxtPalette {theme_id}Palette = RuxtPalette(')
        for key, value in theme['color'].items():
            lines.append(f'  {key}: {color_literal(value)},')
        lines.append(f'  brightness: {brightness},')
        lines.append(');')
        lines.append('')
    lines.append('/// Non-color tokens (typography, spacing, radius, elevation, motion,')
    lines.append('/// breakpoints, density, focus ring, icons), mirroring the golden file names.')
    lines.append('class RuxtTokens {')
    for name, value, kind in common_tokens(t):
        if kind == 'num':
            lines.append(f'  static const double {name} = {dec(value)};')
        else:
            escaped = value.replace("'", "\\'")
            lines.append(f"  static const String {name} = '{escaped}';")
    lines.append('}')
    lines.append('')
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', default=str(DEFAULT_INPUT))
    ap.add_argument('--output', default=str(DEFAULT_OUTPUT))
    args = ap.parse_args()
    tokens = json.loads(Path(args.input).read_text())
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(generate(tokens))
    print(f'wrote {out}')


if __name__ == '__main__':
    main()
