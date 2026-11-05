#!/usr/bin/env node
// Generator: emits platform token files from design/tokens.json only.
// Usage: node design/tools/generate-tokens.mjs <outdir>
// Outputs: tokens.css, tokens.rs, Tokens.kt, Theme.swift, theme.dart
// Generated outputs are regenerated, never hand-edited (see design/README.md).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outdir = process.argv[2];
if (!outdir) { console.error('usage: generate-tokens.mjs <outdir>'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, '..', 'tokens.json'), 'utf8'));

const HEADER = 'Generated from design/tokens.json by design/tools/generate-tokens.mjs. Do not edit by hand.';
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toUpperCase();
const pascal = (s) => s.replace(/(^|[^a-zA-Z0-9])(.)/g, (_, __, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
const camel = (s) => { const p = pascal(s); return p.charAt(0).toLowerCase() + p.slice(1); };
const dec = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));
const themes = Object.entries(t.themes);

// Flatten the non-color tokens into [name, value, kind] triples, kind: num|str.
function commonTokens() {
  const out = [];
  const num = (name, v) => out.push([name, v, 'num']);
  const str = (name, v) => out.push([name, v, 'str']);
  str('fontSans', t.typography.fontFamily.sans);
  str('fontMono', t.typography.fontFamily.mono);
  num('fontBaseSize', t.typography.baseSizePx);
  for (const [k, v] of Object.entries(t.typography.weights)) num(`fontWeight${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.typography.scale)) {
    num(`text${pascal(k)}Size`, v.sizePx);
    num(`text${pascal(k)}LineHeight`, v.lineHeight);
    num(`text${pascal(k)}Weight`, v.weight);
  }
  for (const [k, v] of Object.entries(t.spacing)) num(`spacing-${k}`, v);
  for (const [k, v] of Object.entries(t.radius)) num(`radius${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.elevation)) str(`elevation${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.motion.durationMs)) num(`duration${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.motion.easing)) str(`easing${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.breakpoints.valuesPx)) num(`breakpoint${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.density)) {
    num(`density${pascal(k)}Scale`, v.scale);
    num(`density${pascal(k)}ControlHeight`, v.controlHeightPx);
    num(`density${pascal(k)}RowHeight`, v.rowHeightPx);
  }
  num('focusRingWidth', t.focusRing.widthPx);
  num('focusRingOffset', t.focusRing.offsetPx);
  str('focusRingStyle', t.focusRing.style);
  str('iconSet', t.icons.set);
  return out;
}
const common = commonTokens();

function css() {
  const lines = [`/* ${HEADER} */`, ':root {'];
  const cssVal = (name, v, kind) => {
    if (kind !== 'num') return v;
    if (name.startsWith('duration')) return `${v}ms`;
    if (name.includes('Weight') || name.includes('LineHeight') || name.includes('Scale')) return v;
    return `${v}px`;
  };
  for (const [name, v, kind] of common) lines.push(`  --${kebab(name)}: ${cssVal(name, v, kind)};`);
  lines.push('}');
  for (const [name, theme] of themes) {
    lines.push(`[data-theme="${name}"] {`, `  color-scheme: ${theme.colorScheme};`);
    for (const [role, v] of Object.entries(theme.color)) lines.push(`  --${kebab(role)}: ${v};`);
    lines.push(`  --focus-ring-color: ${theme.color[t.focusRing.colorRole]};`, '}');
  }
  return lines.join('\n') + '\n';
}
function rust() {
  const lines = [`// ${HEADER}`];
  for (const [name, theme] of themes) {
    lines.push(`pub mod ${name.replace(/[^a-zA-Z0-9]/g, '_')} {`);
    for (const [role, v] of Object.entries(theme.color)) lines.push(`    pub const ${snake(role)}: &str = "${v}";`);
    lines.push('}');
  }
  lines.push('pub mod tokens {');
  for (const [name, v, kind] of common) lines.push(kind === 'num' ? `    pub const ${snake(name)}: f32 = ${dec(v)};` : `    pub const ${snake(name)}: &str = "${v}";`);
  lines.push('}');
  return lines.join('\n') + '\n';
}
function kotlin() {
  const lines = [`// ${HEADER}`, 'package designtokens', ''];
  for (const [name, theme] of themes) {
    lines.push(`object ${pascal(name)}Tokens {`);
    for (const [role, v] of Object.entries(theme.color)) lines.push(`    const val ${camel(role)}: String = "${v}"`);
    lines.push('}', '');
  }
  lines.push('object Tokens {');
  for (const [name, v, kind] of common) lines.push(kind === 'num' ? `    const val ${camel(name)}: Double = ${dec(v)}` : `    const val ${camel(name)}: String = "${v}"`);
  lines.push('}');
  return lines.join('\n') + '\n';
}
function swift() {
  const lines = [`// ${HEADER}`, 'import Foundation', ''];
  for (const [name, theme] of themes) {
    lines.push(`public enum ${pascal(name)}Theme {`);
    for (const [role, v] of Object.entries(theme.color)) lines.push(`    public static let ${camel(role)} = "${v}"`);
    lines.push('}', '');
  }
  lines.push('public enum Tokens {');
  for (const [name, v, kind] of common) lines.push(kind === 'num' ? `    public static let ${camel(name)}: Double = ${dec(v)}` : `    public static let ${camel(name)} = "${v}"`);
  lines.push('}');
  return lines.join('\n') + '\n';
}
function dart() {
  const lines = [`// ${HEADER}`];
  for (const [name, theme] of themes) {
    lines.push(`class ${pascal(name)}Tokens {`);
    for (const [role, v] of Object.entries(theme.color)) lines.push(`  static const String ${camel(role)} = '${v}';`);
    lines.push('}', '');
  }
  lines.push('class Tokens {');
  for (const [name, v, kind] of common) lines.push(kind === 'num' ? `  static const double ${camel(name)} = ${dec(v)};` : `  static const String ${camel(name)} = '${v}';`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

mkdirSync(outdir, { recursive: true });
const files = { 'tokens.css': css(), 'tokens.rs': rust(), 'Tokens.kt': kotlin(), 'Theme.swift': swift(), 'theme.dart': dart() };
for (const [name, content] of Object.entries(files)) writeFileSync(join(outdir, name), content);
console.log(`generated ${Object.keys(files).join(', ')} in ${outdir}`);
