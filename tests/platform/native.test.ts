import { expect, test } from 'vitest';
import { makePlatformRoot, seedStagingRegistries } from '../helpers/platform';

const root = makePlatformRoot('plt-native-');
seedStagingRegistries(root);

const { hashOf, withoutHash, writePlan } = await import('../../tools/platform/src/plan.ts');
const { nativeAdapter } = await import('../../tools/platform/src/adapters/native.ts');
const { loadRegistry } = await import('../../tools/platform/src/registry.ts');
const { readAudit } = await import('../../tools/platform/src/audit.ts');

test('native plan targets the sqlite store of the environment and hashes stably', async () => {
  const plan = await nativeAdapter.plan({ target: 'staging', actor: 'u1' });
  expect(plan.adapterId).toBe('native');
  expect(plan.items.some((i) => i.kind === 'sqlite.verify')).toBe(true);
  expect(plan.counts.items).toBe(2);
  expect(hashOf(withoutHash(plan))).toBe(plan.hash);
  const snapshot = JSON.parse(JSON.stringify(plan));
  delete snapshot.hash;
  expect(hashOf(snapshot)).toBe(plan.hash);
});

test('apply writes an ok audit entry and verify confirms the store', async () => {
  const plan = await nativeAdapter.plan({ target: 'staging', actor: 'u1' });
  await writePlan(plan);
  const entry = await nativeAdapter.apply(plan.id, plan.hash);
  expect(entry.result).toBe('ok');
  const result = await nativeAdapter.verify(plan.id);
  expect(result.ok).toBe(true);
  expect((await loadRegistry('databases')).databases.find((d) => d.id === 'db-sqlite')!.health).toBe('ok');
  const entries = await readAudit();
  expect(entries.some((e) => e.mode === 'applied' && e.result === 'ok')).toBe(true);
});

test('health reports the sqlite store as ok', async () => {
  const health = await nativeAdapter.health();
  expect(health.adapterId).toBe('native');
  expect(health.status).toBe('ok');
});
