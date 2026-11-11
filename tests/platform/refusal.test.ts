import { expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePlatformRoot, seedStagingRegistries } from '../helpers/platform';

const root = makePlatformRoot('plt-refusal-');
seedStagingRegistries(root);

const { nativeAdapter } = await import('../../tools/platform/src/adapters/native.ts');
const { loadRegistry } = await import('../../tools/platform/src/registry.ts');
const { writePlan } = await import('../../tools/platform/src/plan.ts');
const { readAudit } = await import('../../tools/platform/src/audit.ts');

test('apply with mismatched confirmHash is refused and mutates nothing', async () => {
  const plan = await nativeAdapter.plan({ target: 'staging', actor: 'u1' });
  await writePlan(plan);
  const entry = await nativeAdapter.apply(plan.id, '0000000000000000000000000000000000000000000000000000000000000000');
  expect(entry.result).toBe('refused');
  expect((await loadRegistry('databases')).databases[0].health).toBe('unknown');
});

test('apply with matching confirmHash verifies the store', async () => {
  const plan = await nativeAdapter.plan({ target: 'staging', actor: 'u1' });
  await writePlan(plan);
  const entry = await nativeAdapter.apply(plan.id, plan.hash);
  expect(entry.result).toBe('ok');
  expect((await loadRegistry('databases')).databases.find((d) => d.id === 'db-sqlite')!.health).toBe('ok');
});

test('stale plan is refused when a snapshot registry changed after planning', async () => {
  const plan = await nativeAdapter.plan({ target: 'staging', actor: 'u1' });
  await writePlan(plan);
  writeFileSync(
    join(root, 'data', 'registries', 'environments.json'),
    JSON.stringify({ environments: [{ name: 'staging', deploymentEnv: 'staging', databaseId: 'db-sqlite', adapterId: 'native', requiredEnv: ['NUXT_SESSION_SECRET'] }] }),
  );
  const entry = await nativeAdapter.apply(plan.id, plan.hash);
  expect(entry.result).toBe('refused');
  expect(entry.detail).toContain('stale');
});

test('audit records refused applies', async () => {
  const plan = await nativeAdapter.plan({ target: 'staging', actor: 'u1' });
  await writePlan(plan);
  await nativeAdapter.apply(plan.id, 'bad-hash');
  const entries = await readAudit();
  expect(entries.some((e) => e.result === 'refused')).toBe(true);
});
