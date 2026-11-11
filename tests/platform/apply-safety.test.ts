import { expect, test } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePlatformRoot, seedStagingRegistries, stagingEnvironmentsJson } from '../helpers/platform';

// Apply-safety: every refused apply must leave registries and the stored
// plan byte-identical. The only permitted write on a native refusal is the
// append-only audit entry recording the refusal itself; legacy refusals
// throw before any write at all. No successful apply happens in this file,
// so the database health must stay 'unknown' throughout.
const root = makePlatformRoot('plt-apply-safety-');

const envFile = join(root, 'data', 'registries', 'environments.json');
const dbFile = join(root, 'data', 'registries', 'databases.json');

seedStagingRegistries(root);

const { adapters } = await import('../../tools/platform/src/adapters/index.ts');
const { writePlan } = await import('../../tools/platform/src/plan.ts');
const { readAudit } = await import('../../tools/platform/src/audit.ts');
const { loadRegistry } = await import('../../tools/platform/src/registry.ts');

const registriesSnapshot = () => `${readFileSync(envFile, 'utf8')}\n---\n${readFileSync(dbFile, 'utf8')}`;
const planFile = (planId: string) => join(root, 'data', 'plans', `${planId}.json`);
const LEGACY = ['clerk', 'cloudflare', 'deno'] as const;

test.each(LEGACY)('legacy adapter %s refuses apply as Planned and writes nothing', async (adapterId) => {
  const adapter = adapters[adapterId];
  expect(adapter.capabilities).not.toContain('apply');
  const plan = await adapter.plan({ target: 'retirement', actor: 'safety-actor' });
  const registriesBefore = registriesSnapshot();
  const auditBefore = (await readAudit()).length;
  await expect(adapter.apply(plan.id, plan.hash)).rejects.toThrow(/apply refused/);
  await expect(adapter.apply(plan.id, plan.hash)).rejects.toThrow(/Planned/);
  expect(registriesSnapshot()).toBe(registriesBefore);
  expect((await readAudit()).length).toBe(auditBefore);
});

test('native apply with a wrong confirmHash is refused, registries and plan file untouched', async () => {
  const plan = await adapters.native.plan({ target: 'staging', actor: 'safety-actor' });
  await writePlan(plan);
  const registriesBefore = registriesSnapshot();
  const planBefore = readFileSync(planFile(plan.id), 'utf8');
  const entry = await adapters.native.apply(plan.id, '0'.repeat(64));
  expect(entry.result).toBe('refused');
  expect(entry.mode).toBe('applied');
  expect(entry.detail).toContain('plan hash mismatch');
  expect(entry.actor).toBe('safety-actor');
  expect(registriesSnapshot()).toBe(registriesBefore);
  expect(readFileSync(planFile(plan.id), 'utf8')).toBe(planBefore);
  expect((await loadRegistry('databases')).databases[0].health).toBe('unknown');
});

test('native apply of a tampered stored plan is refused even with the original hash', async () => {
  const plan = await adapters.native.plan({ target: 'staging', actor: 'safety-actor' });
  await writePlan(plan);
  const stored = JSON.parse(readFileSync(planFile(plan.id), 'utf8'));
  stored.items[0].summary = 'tampered after planning';
  writeFileSync(planFile(plan.id), JSON.stringify(stored, null, 2) + '\n');
  const registriesBefore = registriesSnapshot();
  const entry = await adapters.native.apply(plan.id, plan.hash);
  expect(entry.result).toBe('refused');
  expect(entry.detail).toContain('plan hash mismatch');
  expect(registriesSnapshot()).toBe(registriesBefore);
  expect((await loadRegistry('databases')).databases[0].health).toBe('unknown');
});

test('native apply with an unknown plan id rejects and writes nothing', async () => {
  const registriesBefore = registriesSnapshot();
  const auditBefore = (await readAudit()).length;
  await expect(adapters.native.apply('plan-20990101-no-such-plan-00000000', 'whatever')).rejects.toThrow();
  expect(registriesSnapshot()).toBe(registriesBefore);
  expect((await readAudit()).length).toBe(auditBefore);
});

test('native stale plan is refused and the databases registry is untouched', async () => {
  const plan = await adapters.native.plan({ target: 'staging', actor: 'safety-actor' });
  await writePlan(plan);
  const dbBefore = readFileSync(dbFile, 'utf8');
  const planBefore = readFileSync(planFile(plan.id), 'utf8');
  writeFileSync(envFile, stagingEnvironmentsJson(['NUXT_SESSION_SECRET']));
  try {
    const entry = await adapters.native.apply(plan.id, plan.hash);
    expect(entry.result).toBe('refused');
    expect(entry.detail).toContain('stale plan');
    expect(readFileSync(dbFile, 'utf8')).toBe(dbBefore);
    expect(readFileSync(planFile(plan.id), 'utf8')).toBe(planBefore);
    expect((await loadRegistry('databases')).databases[0].health).toBe('unknown');
  } finally {
    writeFileSync(envFile, stagingEnvironmentsJson([]));
  }
});

test('every refusal above was audit-logged as refused and none as ok', async () => {
  const entries = await readAudit();
  const refused = entries.filter((e) => e.result === 'refused');
  expect(refused.length).toBeGreaterThanOrEqual(3);
  expect(refused.every((e) => e.mode === 'applied')).toBe(true);
  expect(entries.some((e) => e.result === 'ok')).toBe(false);
});
