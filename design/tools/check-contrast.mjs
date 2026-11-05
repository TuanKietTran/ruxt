#!/usr/bin/env node
// WCAG AA contrast checker for design tokens.
// Checks every foreground/background pairing used for text in each theme:
//   text roles (fgText, fgSubtext1, fgSubtext0, accent, accentHover,
//   warning, danger, success, info) on bgBase, bgMantle and bgSurface0,
//   accent on accentMuted, and onAccent on accent -- all at >= 4.5:1.
// The focus ring (accent on bgBase) is checked at >= 3:1 (WCAG AA
// non-text contrast for UI indicators). Decorative borders are NOT
// checked: border/borderStrong equal the surface tokens by design in
// every theme and are separators, not indicators needed to identify a
// component or state (WCAG 1.4.11 does not cover decorative lines).
// Prints failures and exits non-zero.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tokensPath = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens.json');
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_FG = ['fgText', 'fgSubtext1', 'fgSubtext0', 'accent', 'accentHover', 'warning', 'danger', 'success', 'info'];
const TEXT_BG = ['bgBase', 'bgMantle', 'bgSurface0'];
const failures = [];
let checked = 0;
function check(themeName, fgRole, fg, bgRole, bg, min) {
  checked++;
  const r = ratio(fg, bg);
  if (r < min) failures.push(`${themeName}: ${fgRole} ${fg} on ${bgRole} ${bg} = ${r.toFixed(2)}:1 (needs ${min}:1)`);
}
for (const [name, theme] of Object.entries(tokens.themes)) {
  const c = theme.color;
  for (const fg of TEXT_FG) for (const bg of TEXT_BG) check(name, fg, c[fg], bg, c[bg], 4.5);
  check(name, 'accent', c.accent, 'accentMuted', c.accentMuted, 4.5);
  check(name, 'onAccent', c.onAccent, 'accent', c.accent, 4.5);
  check(name, 'accent (focus)', c.accent, 'bgBase', c.bgBase, 3);
}
if (failures.length) {
  console.error(`FAIL ${failures.length}/${checked} pairings below WCAG AA:`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`PASS ${checked} pairings meet WCAG AA across ${Object.keys(tokens.themes).length} themes`);
