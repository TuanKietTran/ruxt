import { expect, test, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makePlatformRoot, seedStagingRegistries } from '../helpers/platform';

// No-network / no-credential proof: the platform src contains no network
// APIs at all (static scan), a trapped global fetch is never called while
// every adapter plans / verifies / reports health (dynamic proof), and a
// sentinel env value never appears in any returned object, console output,
// stored plan, audit entry, or registry file — secrets surface as names
// plus presence only.
const root = makePlatformRoot('plt-network-proof-', 'network-proof-actor');
const SENTINEL_NAME = 'PLT_SENTINEL_SECRET';
const SENTINEL = ['plt-sentinel', '9f3e', 'do-not-leak'].join('-');
process.env[SENTINEL_NAME] = SENTINEL;
process.env.PLT_EMPTY_SECRET = '';
delete process.env.PLT_DEFINITELY_MISSING_X;

seedStagingRegistries(root, [SENTINEL_NAME]);

const { adapters } = await import('../../tools/platform/src/adapters/index.ts');
const { checkEnv } = await import('../../tools/platform/src/secrets.ts');
const { configHandler } = await import('../../tools/platform/src/commands/config.ts');
const { writePlan } = await import('../../tools/platform/src/plan.ts');
const { readAudit } = await import('../../tools/platform/src/audit.ts');
const { aggregateHealth } = await import('../../tools/platform/src/health.ts');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function registrySnapshot(): Record<string, string> {
  const dir = join(root, 'data', 'registries');
  const snapshot: Record<string, string> = {};
  for (const file of readdirSync(dir).sort()) snapshot[file] = readFileSync(join(dir, file), 'utf8');
  return snapshot;
}

test('platform src uses no network APIs and imports no network or third-party modules', () => {
  const banned = [
    ['fet', 'ch('].join(''),
    ['XML', 'HttpRequest'].join(''),
    ['Web', 'Socket'].join(''),
    ['node:', 'http'].join(''),
    ['node:', 'https'].join(''),
    ['node:', 'net'].join(''),
    ['node:', 'dns'].join(''),
    ['node:', 'tls'].join(''),
    ['ax', 'ios'].join(''),
    ['und', 'ici'].join(''),
  ];
  const files = listFiles(join(process.cwd(), 'tools/platform/src')).filter((f) => f.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(10);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const token of banned) expect(source, file).not.toContain(token);
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const spec of imports) expect(spec.startsWith('.') || spec.startsWith('node:'), file).toBe(true);
  }
});

test('checkEnv reports names and presence only: set, empty, and missing are exact, values never surface', () => {
  const rows = checkEnv([SENTINEL_NAME, 'PLT_EMPTY_SECRET', 'PLT_DEFINITELY_MISSING_X'], 'staging');
  expect(rows).toEqual([
    { environment: 'staging', name: SENTINEL_NAME, present: true },
    { environment: 'staging', name: 'PLT_EMPTY_SECRET', present: false },
    { environment: 'staging', name: 'PLT_DEFINITELY_MISSING_X', present: false },
  ]);
  for (const row of rows) expect(Object.keys(row).sort()).toEqual(['environment', 'name', 'present']);
  expect(JSON.stringify(rows)).not.toContain(SENTINEL);
});

test('all adapters plan, verify, and report health with fetch trapped: zero calls, zero sentinel leaks, registries untouched', async () => {
  const before = registrySnapshot();
  const fetchSpy = vi.fn(async () => { throw new Error('network is disabled in this test'); });
  const g = globalThis as unknown as { fetch: unknown };
  const originalFetch = g.fetch;
  g.fetch = fetchSpy;
  const outputs: string[] = [];
  let configCode = -1;
  try {
    const nativePlan = await adapters.native.plan({ target: 'staging', actor: 'network-proof-actor' });
    await writePlan(nativePlan);
    outputs.push(JSON.stringify(nativePlan));
    const nativeVerify = await adapters.native.verify(nativePlan.id);
    expect(nativeVerify.ok).toBe(true);
    outputs.push(JSON.stringify(nativeVerify));
    outputs.push(JSON.stringify(await adapters.native.health()));
    for (const id of ['clerk', 'cloudflare', 'deno']) {
      const adapter = adapters[id];
      const plan = await adapter.plan({ target: id, actor: 'network-proof-actor' });
      outputs.push(JSON.stringify(plan));
      const verification = await adapter.verify(plan.id);
      expect(verification.ok).toBe(false);
      outputs.push(JSON.stringify(verification));
      const health = await adapter.health();
      expect(health.status).toBe('unknown');
      outputs.push(JSON.stringify(health));
    }
    outputs.push(JSON.stringify(await aggregateHealth(Object.values(adapters))));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      configCode = await configHandler({ flags: { environment: 'staging' }, positionals: ['check'] });
      outputs.push(logSpy.mock.calls.map((call) => String(call[0])).join('\n'));
    } finally {
      logSpy.mockRestore();
    }
    outputs.push(JSON.stringify(checkEnv([SENTINEL_NAME], 'staging')));
    outputs.push(JSON.stringify(await readAudit()));
  } finally {
    g.fetch = originalFetch;
  }
  expect(configCode).toBe(0);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(outputs.join('\n')).not.toContain(SENTINEL);
  for (const file of listFiles(join(root, 'data'))) expect(readFileSync(file, 'utf8'), file).not.toContain(SENTINEL);
  expect(registrySnapshot()).toEqual(before);
});
