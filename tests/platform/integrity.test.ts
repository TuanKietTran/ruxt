import { expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePlatformRoot, seedStagingRegistries } from '../helpers/platform';

// Integrity: plan hashes are key-order stable and tamper-evident, the audit
// log grows by raw append only, a registry that fails schema validation is
// rejected before anything is written, and caller-supplied actor / id /
// role values never override the session- or environment-derived identity.
const root = makePlatformRoot('plt-integrity-', 'integrity-actor');
seedStagingRegistries(root);
writeFileSync(join(root, 'data', 'registries', 'legacy.json'), JSON.stringify({ providers: [{ provider: 'clerk', sunsetDate: '2027-01', dependents: ['auth'], checklist: [{ id: 'c1', label: 'step', state: 'pending' }], replacement: 'native' }] }));

const { adapters } = await import('../../tools/platform/src/adapters/index.ts');
const { canonical, itemChecksum, planHashOf, withoutHash, writePlan, readPlan } = await import('../../tools/platform/src/plan.ts');
const { appendAudit, readAudit } = await import('../../tools/platform/src/audit.ts');
const { loadRegistry, RegistryError } = await import('../../tools/platform/src/registry.ts');
const { adminActor, cliActor, AuthError } = await import('../../tools/platform/src/auth.ts');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

test('hash stability: canonical, itemChecksum, and planHashOf are key-order stable and tamper-evident', () => {
  expect(canonical({ b: 2, a: { d: 4, c: 3 } })).toBe(canonical({ a: { c: 3, d: 4 }, b: 2 }));
  const item = { id: 'i1', kind: 'k', summary: 's', before: { a: 1 }, after: { a: 2 } };
  const shuffled = { after: { a: 2 }, summary: 's', before: { a: 1 }, kind: 'k', id: 'i1' };
  expect(itemChecksum(shuffled)).toBe(itemChecksum(item));
  expect(itemChecksum({ ...item, after: { a: 3 } })).not.toBe(itemChecksum(item));
  const base = { id: 'plan-x', adapterId: 'native', action: 'a', target: 't', createdAt: '2026-01-01T00:00:00.000Z', actor: 'u1', items: [{ ...item, checksum: itemChecksum(item) }], counts: { items: 1, byKind: { k: 1 } } };
  const hash = planHashOf(base);
  expect(planHashOf(withoutHash({ ...base, hash: 'anything' } as never))).toBe(planHashOf(base));
  expect(planHashOf(withoutHash({ ...base, hash: 'zzz' } as never))).toBe(hash);
  expect(planHashOf({ ...base, actor: 'u2' })).not.toBe(hash);
  expect(planHashOf({ ...base, target: 'other' })).not.toBe(hash);
  expect(planHashOf({ ...base, counts: { items: 2, byKind: { k: 2 } } })).not.toBe(hash);
});

test('stored plan round-trips byte-faithfully and its hash and item checksums verify; legacy plans are deterministic and verify under the core hash', async () => {
  const plan = await adapters.native.plan({ target: 'staging', actor: 'integrity-actor' });
  await writePlan(plan);
  const read = await readPlan(plan.id);
  expect(read).toEqual(plan);
  expect(planHashOf(withoutHash(read))).toBe(read.hash);
  for (const item of read.items) {
    const { checksum, ...rest } = item;
    expect(itemChecksum(rest)).toBe(checksum);
  }
  const first = await adapters.clerk.plan({ target: 'clerk', actor: 'integrity-actor' });
  const second = await adapters.clerk.plan({ target: 'clerk', actor: 'integrity-actor' });
  expect(second).toEqual(first);
  expect(planHashOf(withoutHash(first))).toBe(first.hash);
});

test('audit is append-only at the byte level: earlier lines never change, ids stay unique, order is preserved', async () => {
  const file = join(root, 'data', 'audit', 'audit.jsonl');
  const first = await appendAudit({ action: 'a1', target: 't', planHash: 'h1', mode: 'dry-run', result: 'ok', actor: 'integrity-actor' });
  const second = await appendAudit({ action: 'a2', target: 't', planHash: 'h2', mode: 'applied', result: 'refused', actor: 'integrity-actor' });
  const rawBefore = readFileSync(file, 'utf8');
  const third = await appendAudit({ action: 'a3', target: 't', planHash: 'h3', mode: 'dry-run', result: 'ok', actor: 'integrity-actor' });
  const rawAfter = readFileSync(file, 'utf8');
  expect(rawAfter.startsWith(rawBefore)).toBe(true);
  expect(rawAfter.split('\n').filter((l) => l.length > 0)).toHaveLength(3);
  const entries = await readAudit();
  expect(entries.map((e) => e.id)).toEqual([first.id, second.id, third.id]);
  expect(new Set(entries.map((e) => e.id)).size).toBe(3);
});

test('schema failure writes nothing: invalid legacy checklist shape, invalid databases shape, and invalid JSON all reject with the target file untouched and no new files anywhere', async () => {
  const cases: Array<{ name: 'legacy' | 'databases'; bad: string; pattern: RegExp }> = [
    { name: 'legacy', bad: JSON.stringify({ providers: [{ provider: 'clerk', sunsetDate: '2027-01', dependents: [], checklist: { id: 'c1' }, replacement: 'native' }] }), pattern: /checklist/ },
    { name: 'databases', bad: JSON.stringify({ databases: {} }), pattern: /databases/ },
    { name: 'databases', bad: '{not json', pattern: /invalid JSON/ },
  ];
  for (const { name, bad, pattern } of cases) {
    const file = join(root, 'data', 'registries', name + '.json');
    const good = readFileSync(file, 'utf8');
    writeFileSync(file, bad);
    const filesBefore = listFiles(join(root, 'data'));
    try {
      await expect(loadRegistry(name)).rejects.toBeInstanceOf(RegistryError);
      await expect(loadRegistry(name)).rejects.toThrow(pattern);
      expect(readFileSync(file, 'utf8')).toBe(bad);
      expect(listFiles(join(root, 'data'))).toEqual(filesBefore);
    } finally {
      writeFileSync(file, good);
    }
    await expect(loadRegistry(name)).resolves.toBeDefined();
  }
});

test('spoofed actor, id, and role are ignored: identity comes from the session resolver or PLATFORM_ACTOR only', async () => {
  const spoofEvent = { userId: 'caller-chosen', role: 'admin', actor: 'caller-chosen', id: 'caller-chosen' };
  await expect(adminActor(spoofEvent, async () => null)).rejects.toMatchObject({ status: 401 });
  await expect(adminActor(spoofEvent, async () => ({ userId: 'real-user', role: 'user' }))).rejects.toMatchObject({ status: 403 });
  await expect(adminActor(spoofEvent, async () => ({ userId: 'session-admin', role: 'admin' }))).resolves.toBe('session-admin');
  await expect(adminActor({}, async () => ({ role: 'admin' } as never))).rejects.toBeInstanceOf(AuthError);
  const cli = cliActor as unknown as (...args: unknown[]) => Promise<string>;
  await expect(cli('caller-chosen')).resolves.toBe('integrity-actor');
  const saved = process.env.PLATFORM_ACTOR;
  delete process.env.PLATFORM_ACTOR;
  try {
    await expect(cliActor()).rejects.toThrow(/PLATFORM_ACTOR is required/);
  } finally {
    process.env.PLATFORM_ACTOR = saved;
  }
  for (const id of ['clerk', 'cloudflare', 'deno']) {
    const plan = await adapters[id].plan({ target: id, actor: 'integrity-actor', options: { actor: 'caller-chosen', id: 'plan-fake', hash: 'deadbeef' } });
    expect(plan.actor).toBe('integrity-actor');
    expect(plan.id).not.toBe('plan-fake');
    expect(plan.id).toMatch(/^plan-\d{8}-[a-z0-9-]+-[0-9a-f]{8}$/);
    expect(plan.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.hash).not.toBe('deadbeef');
  }
  const nativePlan = await adapters.native.plan({ target: 'staging', actor: 'integrity-actor', options: { actor: 'caller-chosen', id: 'plan-fake' } });
  expect(nativePlan.actor).toBe('integrity-actor');
  expect(nativePlan.id).not.toBe('plan-fake');
  expect(existsSync(join(root, 'data', 'plans', 'plan-fake.json'))).toBe(false);
});
