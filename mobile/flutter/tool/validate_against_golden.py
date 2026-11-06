#!/usr/bin/env python3
"""Cross-check lib/theme/generated_theme.dart against design/golden/theme.dart.

Every per-theme color hex in the golden file must appear in the generated
file as a Color(0xFF...) literal, and every common double/String constant
in the golden Tokens class must exist in RuxtTokens with the same value.
Exits non-zero and prints each mismatch.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP_DIR = HERE.parent
GOLDEN = APP_DIR / '..' / '..' / 'design' / 'golden' / 'theme.dart'
GENERATED = APP_DIR / 'lib' / 'theme' / 'generated_theme.dart'


def main():
    golden = GOLDEN.read_text()
    generated = GENERATED.read_text()
    errors = []
    # Per-theme string colors in the golden file: '#rrggbb'.
    for hex_value in sorted(set(re.findall(r"'(#[0-9a-fA-F]{6})'", golden))):
        literal = f'Color(0xFF{hex_value[1:].upper()})'
        if literal not in generated:
            errors.append(f'color {hex_value} ({literal}) missing from generated file')
    # Common constants from the golden Tokens class.
    tokens_section = golden.split('class Tokens', 1)[1]
    doubles = re.findall(r'static const double (\w+) = ([0-9.]+);', tokens_section)
    for name, value in doubles:
        if f'static const double {name} = {value};' not in generated:
            errors.append(f'double {name} = {value} missing or different in generated file')
    strings = re.findall(r"static const String (\w+) = '([^']*)';", tokens_section)
    for name, value in strings:
        if f"static const String {name} = '{value}';" not in generated:
            errors.append(f'String {name} missing or different in generated file')
    if errors:
        print('GOLDEN MISMATCH:')
        for e in errors:
            print(f'  {e}')
        return 1
    print(f'golden cross-check OK ({len(doubles)} doubles, {len(strings)} strings, colors verified)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
