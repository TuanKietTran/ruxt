import { expect, test, vi } from 'vitest';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePlatformRoot } from '../helpers/platform';

// Sunset data: legacy.json is the single source for the Jan 2027 retirements.
// The committed registry, the registry loader (post checklist-array fix),
// the `legacy list` handler, and every legacy adapter's sunset + retirement
// plan must all agree on provider order, sunset date, dependents, checklist
// ids/states, and replacement. Native is not a legacy provider.
const root = makePlatformRoot('plt-sunset-', 'sunset-actor');

mkdirSync(join(root, 'data', 'registries'), { recursive: true });
cpSync(join(process.cwd(), 'tools/platform/data/registries/legacy.json'), join(root, 'data', 'registries', 'legacy.json'));

const committed = JSON.parse(readFileSync(join(process.cwd(), 'tools/platform/data/registries/legacy.json'), 'utf8')) as {
  providers: Array<{ provider: string; sunsetDate: string; dependents: string[]; checklist: Array<{ id: string; label: string; state: string }>; replacement: string }>;
};

const { loadRegistry } = await import('../../tools/platform/src/registry.ts');
const { adapters } = await import('../../tools/platform/src/adapters/index.ts');
const { legacyHandler } = await import('../../tools/platform/src/commands/legacy.ts');

const EXPECTED = [
  { provider: 'clerk', kind: 'identity', dependents: 9, checklist: ['promote-local-session-auth', 'migrate-clerk-owner-ids', 'replace-clerk-lookups', 'remove-clerk-nuxt', 'retire-clerk-env-names'], replacementPart: 'Local session authentication as primary' },
  { provider: 'cloudflare', kind: 'hosting', dependents: 7, checklist: ['stand-up-native-hosting', 'migrate-d1-and-kv-data', 'move-domain-binding', 'retire-wrangler-bindings', 'retire-cf-scripts'], replacementPart: 'SQLite as the data path' },
  { provider: 'deno', kind: 'data', dependents: 6, checklist: ['flip-strategy-weights', 'port-kv-repositories', 'replace-deno-openkv', 'change-build-presets', 'resolve-celld-stack'], replacementPart: 'SQLite via infra/db/sqlite.ts' },
] as const;

test('committed legacy.json pins the three Jan 2027 sunsets in order', () => {
  expect(committed.providers.map((p) => p.provider)).toEqual(['clerk', 'cloudflare', 'deno']);
  let totalDependents = 0;
  let totalChecklist = 0;
  const allChecklistIds: string[] = [];
  for (const want of EXPECTED) {
    const record = committed.providers.find((p) => p.provider === want.provider)!;
    expect(record.sunsetDate).toBe('2027-01');
    expect(record.dependents).toHaveLength(want.dependents);
    expect(record.dependents.every((d) => d.trim().length > 0)).toBe(true);
    expect(new Set(record.dependents).size).toBe(record.dependents.length);
    expect(record.checklist.map((c) => c.id)).toEqual([...want.checklist]);
    expect(record.checklist.every((c) => c.state === 'pending' && c.label.trim().length > 0)).toBe(true);
    expect(record.replacement).toContain(want.replacementPart);
    totalDependents += record.dependents.length;
    totalChecklist += record.checklist.length;
    allChecklistIds.push(...record.checklist.map((c) => c.id));
  }
  expect(totalDependents).toBe(22);
  expect(totalChecklist).toBe(15);
  expect(new Set(allChecklistIds).size).toBe(15);
});

test('loadRegistry(legacy) and legacy list return the committed providers intact', async () => {
  const loaded = await loadRegistry('legacy') as typeof committed;
  expect(loaded.providers).toEqual(committed.providers);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await expect(legacyHandler({ flags: {}, positionals: ['list'] })).resolves.toBe(0);
  } finally {
    // capture before restore
  }
  const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
  logSpy.mockRestore();
  expect(JSON.parse(printed)).toEqual(committed.providers);
});

test('every legacy adapter sunset, kind and plan mirrors legacy.json; native has no sunset', async () => {
  expect(adapters.native.sunset).toBeUndefined();
  for (const want of EXPECTED) {
    const record = committed.providers.find((p) => p.provider === want.provider)!;
    const adapter = adapters[want.provider];
    expect(adapter.kind).toBe(want.kind);
    expect(adapter.capabilities).toEqual(['plan', 'health']);
    expect(adapter.sunset).toEqual({ date: '2027-01', dependents: record.dependents, checklist: record.checklist });
    expect(adapter.sunset?.date).toBe(record.sunsetDate);
    const health = await adapter.health();
    expect(health.adapterId).toBe(want.provider);
    expect(health.status).toBe('unknown');
    const plan = await adapter.plan({ target: want.provider, actor: 'sunset-actor' });
    expect(plan.action).toBe('legacy.retirement');
    expect(plan.counts).toEqual({ items: record.dependents.length + record.checklist.length, byKind: { dependent: record.dependents.length, checklist: record.checklist.length } });
    const summaries = plan.items.map((item) => item.summary).join('\n');
    for (const dependent of record.dependents) expect(summaries).toContain(dependent);
    for (const item of record.checklist) expect(summaries).toContain(item.label);
  }
});
