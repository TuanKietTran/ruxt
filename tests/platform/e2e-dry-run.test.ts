import { expect, test, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePlatformRoot } from '../helpers/platform';

// Dry-run e2e: drive the CLI/library plan flow for every adapter and every
// command family against a temp data dir. No network, no live providers,
// no credential values: secrets appear as names + presence only.
const root = makePlatformRoot('plt-e2e-', 'e2e-actor');
process.env.PLT_E2E_PRESENT = 'present';
delete process.env.PLT_E2E_DEFINITELY_MISSING;

mkdirSync(join(root, 'data', 'registries'), { recursive: true });
cpSync(join(process.cwd(), 'tools/platform/data/registries'), join(root, 'data', 'registries'), { recursive: true });
writeFileSync(
  join(root, 'data', 'registries', 'environments.json'),
  JSON.stringify({
    environments: [
      { name: 'staging', deploymentEnv: 'staging', databaseId: 'db-sqlite', adapterId: 'native', requiredEnv: ['PLT_E2E_PRESENT'] },
      { name: 'staging-missing', deploymentEnv: 'staging-missing', databaseId: 'db-sqlite', adapterId: 'native', requiredEnv: ['PLT_E2E_DEFINITELY_MISSING'] },
    ],
  }),
);
writeFileSync(
  join(root, 'data', 'registries', 'databases.json'),
  JSON.stringify({ databases: [{ id: 'db-sqlite', environment: 'staging', adapter: 'sqlite', reference: join(root, 'store.db'), migrationState: { applied: [] }, health: 'unknown' }] }),
);
writeFileSync(join(root, 'store.db'), '');

const { writePlan, readPlan, planHashOf, withoutHash, itemChecksum } = await import('../../tools/platform/src/plan.ts');
const { appendAudit, readAudit } = await import('../../tools/platform/src/audit.ts');
const { loadRegistry } = await import('../../tools/platform/src/registry.ts');
const { adapters } = await import('../../tools/platform/src/adapters/index.ts');
const { cliActor } = await import('../../tools/platform/src/auth.ts');
const { releasesHandler } = await import('../../tools/platform/src/commands/releases.ts');
const { domainsHandler } = await import('../../tools/platform/src/commands/domains.ts');
const { dataHandler } = await import('../../tools/platform/src/commands/data.ts');
const { configHandler } = await import('../../tools/platform/src/commands/config.ts');
const { legacyHandler } = await import('../../tools/platform/src/commands/legacy.ts');
const { auditHandler } = await import('../../tools/platform/src/commands/audit.ts');

function registrySnapshot(): Record<string, string> {
  const dir = join(root, 'data', 'registries');
  const snapshot: Record<string, string> = {};
  for (const file of readdirSync(dir).sort()) snapshot[file] = readFileSync(join(dir, file), 'utf8');
  return snapshot;
}

async function captureLog(fn: () => Promise<number>): Promise<{ code: number; logged: string }> {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const code = await fn();
    return { code, logged: spy.mock.calls.map((call) => String(call[0])).join('\n') };
  } finally {
    spy.mockRestore();
  }
}

const PLAN_CASES: Array<{ adapterId: string; target: string }> = [
  { adapterId: 'native', target: 'staging' },
  { adapterId: 'clerk', target: 'clerk' },
  { adapterId: 'cloudflare', target: 'cloudflare' },
  { adapterId: 'deno', target: 'deno' },
];

test('all four adapters are registered', () => {
  expect(Object.keys(adapters).sort()).toEqual(['clerk', 'cloudflare', 'deno', 'native']);
});

for (const { adapterId, target } of PLAN_CASES) {
  test(`dry-run plan flow for ${adapterId}: stored plan, checksums, confirm hash, dry-run audit, no registry mutation`, async () => {
    const before = registrySnapshot();
    const actor = await cliActor();
    expect(actor).toBe('e2e-actor');
    const adapter = adapters[adapterId];
    const plan = await adapter.plan({ target, actor, options: { action: 'native.verify' } });
    expect(plan.adapterId).toBe(adapterId);
    expect(plan.actor).toBe('e2e-actor');
    expect(plan.id).toMatch(/^plan-\d{8}-[a-z0-9-]+-[0-9a-f]{8}$/);
    expect(plan.counts.items).toBe(plan.items.length);
    expect(Object.values(plan.counts.byKind).reduce((a, b) => a + b, 0)).toBe(plan.items.length);
    for (const item of plan.items) {
      const { checksum, ...rest } = item;
      expect(itemChecksum(rest)).toBe(checksum);
    }
    expect(planHashOf(withoutHash(plan))).toBe(plan.hash);
    await writePlan(plan);
    expect(existsSync(join(root, 'data', 'plans', `${plan.id}.json`))).toBe(true);
    expect(await readPlan(plan.id)).toEqual(plan);
    await appendAudit({ action: `plan.${plan.action}`, target, planHash: plan.hash, mode: 'dry-run', result: 'ok', actor, detail: `Planned ${plan.action} on ${target} (${plan.items.length} items)` });
    const entries = await readAudit();
    const entry = entries.find((e) => e.planHash === plan.hash && e.mode === 'dry-run');
    expect(entry).toBeDefined();
    expect(entry!.result).toBe('ok');
    expect(entry!.actor).toBe('e2e-actor');
    expect(registrySnapshot()).toEqual(before);
  });
}

test('releases list returns the seeded releases as JSON', async () => {
  const registry = await loadRegistry('releases');
  const { code, logged } = await captureLog(() => releasesHandler({ flags: {}, positionals: ['list'] }));
  expect(code).toBe(0);
  expect(JSON.parse(logged)).toEqual(registry.releases);
  // The committed releases registry on this branch is currently empty;
  // the handler must return exactly what the registry holds.
  expect(JSON.parse(logged)).toHaveLength(registry.releases.length);
});

test('domains list returns the seeded domain', async () => {
  const { code, logged } = await captureLog(() => domainsHandler({ flags: {}, positionals: ['list'] }));
  expect(code).toBe(0);
  expect(JSON.parse(logged).map((d: { domain: string }) => d.domain)).toContain('ruxt.mashallow.cloud');
});

test('data list returns databases from the temp registry only', async () => {
  const { code, logged } = await captureLog(() => dataHandler({ flags: {}, positionals: ['list'] }));
  expect(code).toBe(0);
  const parsed = JSON.parse(logged);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].id).toBe('db-sqlite');
});

test('legacy list returns the three sunset providers (regression: checklist is an array)', async () => {
  // Regression for the validateLegacyRegistry bug (mgr fix 2026-11-05):
  // checklist is a ChecklistItem[] in types.ts and legacy.json, so
  // loadRegistry('legacy') must resolve, not throw RegistryError.
  const registry = await loadRegistry('legacy');
  expect(registry.providers.map((p) => p.provider).sort()).toEqual(['clerk', 'cloudflare', 'deno']);
  for (const provider of registry.providers) {
    expect(Array.isArray(provider.checklist)).toBe(true);
    expect(provider.checklist.length).toBeGreaterThan(0);
    expect(provider.checklist.every((item) => typeof item.id === 'string' && typeof item.label === 'string')).toBe(true);
  }
  const { code, logged } = await captureLog(() => legacyHandler({ flags: {}, positionals: ['list'] }));
  expect(code).toBe(0);
  const parsed = JSON.parse(logged);
  expect(parsed.map((p: { provider: string }) => p.provider).sort()).toEqual(['clerk', 'cloudflare', 'deno']);
  expect(parsed.every((p: { checklist: unknown }) => Array.isArray(p.checklist))).toBe(true);
  expect(parsed).toEqual(registry.providers);
});

test('config check reports env presence by name only and passes when present', async () => {
  const { code, logged } = await captureLog(() => configHandler({ flags: { environment: 'staging' }, positionals: ['check'] }));
  expect(code).toBe(0);
  const parsed = JSON.parse(logged);
  expect(parsed.envPresence).toEqual([{ environment: 'staging', name: 'PLT_E2E_PRESENT', present: true }]);
  expect(logged).not.toContain('present",');
});

test('config check fails closed when a required env name is missing', async () => {
  const { code, logged } = await captureLog(() => configHandler({ flags: { environment: 'staging-missing' }, positionals: ['check'] }));
  expect(code).toBe(1);
  expect(JSON.parse(logged).envPresence).toEqual([{ environment: 'staging-missing', name: 'PLT_E2E_DEFINITELY_MISSING', present: false }]);
});

test('audit list returns the dry-run entries written by the plan flow', async () => {
  const { code, logged } = await captureLog(() => auditHandler({ flags: {}, positionals: ['list'] }));
  expect(code).toBe(0);
  const parsed = JSON.parse(logged);
  expect(parsed.length).toBeGreaterThanOrEqual(PLAN_CASES.length);
  expect(parsed.every((e: { mode: string }) => e.mode === 'dry-run' || e.mode === 'applied')).toBe(true);
});

test('unimplemented command-family subcommands refuse with exit 1 and mutate nothing', async () => {
  const before = registrySnapshot();
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await releasesHandler({ flags: {}, positionals: ['publish'] })).toBe(1);
    expect(await domainsHandler({ flags: {}, positionals: ['update'] })).toBe(1);
    expect(await dataHandler({ flags: {}, positionals: ['migrate'] })).toBe(1);
    expect(await legacyHandler({ flags: {}, positionals: ['retire'] })).toBe(1);
    expect(await auditHandler({ flags: {}, positionals: ['clear'] })).toBe(1);
  } finally {
    errSpy.mockRestore();
  }
  expect(registrySnapshot()).toEqual(before);
});
