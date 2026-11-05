// Golden + validation tests for the design token pipeline.
// Run: node --test design/tools/generate-tokens.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const designDir = join(here, '..');
const tokens = JSON.parse(readFileSync(join(designDir, 'tokens.json'), 'utf8'));
const schema = JSON.parse(readFileSync(join(designDir, 'tokens.schema.json'), 'utf8'));

// Minimal JSON Schema validator covering the keywords tokens.schema.json
// uses: $ref (#/$defs/...), type (incl. arrays and integer), enum, pattern,
// minLength, minimum, exclusiveMinimum, maximum, minProperties, minItems,
// required, properties, additionalProperties (boolean or schema), items.
function resolveRef(root, ref) {
  return ref.slice(2).split('/').reduce((o, k) => o[k], root);
}
function validate(value, sch, root, path, errors) {
  if (sch.$ref) return validate(value, resolveRef(root, sch.$ref), root, path, errors);
  if (sch.enum && !sch.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (sch.type) {
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    const ok = types.some((ty) =>
      ty === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : ty === 'array' ? Array.isArray(value)
      : ty === 'null' ? value === null
      : ty === 'integer' ? Number.isInteger(value)
      : ty === 'number' ? typeof value === 'number'
      : typeof value === ty);
    if (!ok) { errors.push(`${path}: expected ${types.join('|')}, got ${JSON.stringify(value)}`); return; }
  }
  if (typeof value === 'string') {
    if (sch.pattern && !new RegExp(sch.pattern).test(value)) errors.push(`${path}: ${value} fails pattern ${sch.pattern}`);
    if (sch.minLength !== undefined && value.length < sch.minLength) errors.push(`${path}: shorter than minLength ${sch.minLength}`);
  }
  if (typeof value === 'number') {
    if (sch.minimum !== undefined && value < sch.minimum) errors.push(`${path}: ${value} < minimum ${sch.minimum}`);
    if (sch.exclusiveMinimum !== undefined && value <= sch.exclusiveMinimum) errors.push(`${path}: ${value} <= exclusiveMinimum ${sch.exclusiveMinimum}`);
    if (sch.maximum !== undefined && value > sch.maximum) errors.push(`${path}: ${value} > maximum ${sch.maximum}`);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (sch.minProperties !== undefined && keys.length < sch.minProperties) errors.push(`${path}: fewer than ${sch.minProperties} properties`);
    for (const req of sch.required || []) if (!(req in value)) errors.push(`${path}: missing required ${req}`);
    const props = sch.properties || {};
    for (const k of keys) {
      if (props[k]) validate(value[k], props[k], root, `${path}.${k}`, errors);
      else if (sch.additionalProperties === false) errors.push(`${path}: additional property ${k} not allowed`);
      else if (sch.additionalProperties && typeof sch.additionalProperties === 'object') validate(value[k], sch.additionalProperties, root, `${path}.${k}`, errors);
    }
  }
  if (Array.isArray(value)) {
    if (sch.minItems !== undefined && value.length < sch.minItems) errors.push(`${path}: fewer than ${sch.minItems} items`);
    if (sch.items) value.forEach((v, i) => validate(v, sch.items, root, `${path}[${i}]`, errors));
  }
}

test('tokens.json validates against tokens.schema.json', () => {
  const errors = [];
  validate(tokens, schema, schema, '$', errors);
  assert.deepEqual(errors, []);
});

test('contrast checker passes on committed tokens', () => {
  const out = execFileSync('node', [join(here, 'check-contrast.mjs')], { encoding: 'utf8' });
  assert.match(out, /PASS/);
});

test('regeneration is byte-identical to design/golden', () => {
  const out = mkdtempSync(join(tmpdir(), 'tokens-gen-'));
  execFileSync('node', [join(here, 'generate-tokens.mjs'), out], { encoding: 'utf8' });
  const goldenDir = join(designDir, 'golden');
  const goldenFiles = readdirSync(goldenDir).sort();
  assert.deepEqual(readdirSync(out).sort(), goldenFiles);
  for (const f of goldenFiles) {
    assert.equal(readFileSync(join(out, f), 'utf8'), readFileSync(join(goldenDir, f), 'utf8'), `${f} differs from golden`);
  }
});
