import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const root = mkdtempSync(join(tmpdir(), 'plt-native-'));
process.env.PLATFORM_DATA_DIR = join(root, 'data');

mkdirSync(join(root, 'data', 'registries'), { recursive: true });
writeFileSync(
  join(root, 'data', 'registries', 'environments.json'),
  JSON.stringify({ environments: [{ name: 'staging', deploymentEnv: 'staging', databaseId: 'db-sqlite', adapterId: 'native', requiredEnv: [] }] }),
);
writeFileSync(
  join(root, 'data', 'registries', 'databases.json'),
  JSON.stringify({ databases: [{ id: 'db-sqlite', environment: 'staging', adapter: 'sqlite', reference: join(root, 'store.db'), migrationState: { applied: [] }, health: 'unknown' }] }),
);
writeFileSync(join(root, 'store.db'), '');

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
