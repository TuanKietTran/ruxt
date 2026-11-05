#!/usr/bin/env node
// Generator: emits the Compose theme token source from design/tokens.json only.
// Usage: node mobile/android/tools/generate-tokens.mjs [outfile]
// Default outfile: app/src/main/java/cloud/mashallow/ruxt/theme/Tokens.kt
// Mirrors design/tools/generate-tokens.mjs kotlin() exactly, except the package
// is cloud.mashallow.ruxt.theme. Generated output is regenerated, never hand-edited.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, '..', '..', '..', 'design', 'tokens.json'), 'utf8'));
const outfile = process.argv[2] || join(here, '..', 'app', 'src', 'main', 'java', 'cloud', 'mashallow', 'ruxt', 'theme', 'Tokens.kt');

const HEADER = 'Generated from design/tokens.json by mobile/android/tools/generate-tokens.mjs. Do not edit by hand.';
const pascal = (s) => s.replace(/(^|[^a-zA-Z0-9])(.)/g, (_, __, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
const camel = (s) => { const p = pascal(s); return p.charAt(0).toLowerCase() + p.slice(1); };
const dec = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));
const themes = Object.entries(t.themes);

function commonTokens() {
  const out = [];
  const num = (name, v) => out.push([name, v, 'num']);
  const str = (name, v) => out.push([name, v, 'str']);
  str('fontSans', t.typography.fontFamily.sans);
  str('fontMono', t.typography.fontFamily.mono);
  num('fontBaseSize', t.typography.baseSizePx);
  for (const [k, v] of Object.entries(t.typography.weights)) num(`fontWeight${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.typography.scale)) { num(`text${pascal(k)}Size`, v.sizePx); num(`text${pascal(k)}LineHeight`, v.lineHeight); num(`text${pascal(k)}Weight`, v.weight); }
  for (const [k, v] of Object.entries(t.spacing)) num(`spacing${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.radius)) num(`radius${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.elevation)) str(`elevation${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.motion.durationMs)) num(`duration${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.motion.easing)) str(`easing${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.breakpoints.valuesPx)) num(`breakpoint${pascal(k)}`, v);
  for (const [k, v] of Object.entries(t.density)) { num(`density${pascal(k)}Scale`, v.scale); num(`density${pascal(k)}ControlHeight`, v.controlHeightPx); num(`density${pascal(k)}RowHeight`, v.rowHeightPx); }
  num('focusRingWidth', t.focusRing.widthPx);
  num('focusRingOffset', t.focusRing.offsetPx);
  str('focusRingStyle', t.focusRing.style);
  str('iconSet', t.icons.set);
  return out;
}

const lines = [`// ${HEADER}`, 'package cloud.mashallow.ruxt.theme', ''];
for (const [name, theme] of themes) {
  lines.push(`object ${pascal(name)}Tokens {`);
  for (const [role, v] of Object.entries(theme.color)) lines.push(`    const val ${camel(role)}: String = "${v}"`);
  lines.push('}', '');
}
lines.push('object Tokens {');
for (const [name, v, kind] of commonTokens()) lines.push(kind === 'num' ? `    const val ${camel(name)}: Double = ${dec(v)}` : `    const val ${camel(name)}: String = "${v}"`);
lines.push('}');
mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, lines.join('\n') + '\n');
console.log(`generated Tokens.kt in ${outfile}`);
