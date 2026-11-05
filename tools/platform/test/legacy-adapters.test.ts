import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clerkAdapter, createClerkAdapter } from '../src/adapters/clerk.ts';
import { cloudflareAdapter, createCloudflareAdapter } from '../src/adapters/cloudflare.ts';
import { createDenoAdapter, denoAdapter } from '../src/adapters/deno.ts';

interface ChecklistItem {
  id: string;
  label: string;
  state: string;
}

interface LegacyProviderRecord {
  provider: string;
  sunsetDate: string;
  dependents: string[];
  checklist: ChecklistItem[];
  replacement: string;
}

const registry = JSON.parse(
  readFileSync(new URL('../data/registries/legacy.json', import.meta.url), 'utf8'),
) as { providers: LegacyProviderRecord[] };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

const cases = [
  { provider: 'clerk', kind: 'identity', factory: createClerkAdapter, instance: clerkAdapter },
  { provider: 'cloudflare', kind: 'hosting', factory: createCloudflareAdapter, instance: cloudflareAdapter },
  { provider: 'deno', kind: 'data', factory: createDenoAdapter, instance: denoAdapter },
] as const;

function recordFor(provider: string): LegacyProviderRecord {
  const record = registry.providers.find((entry) => entry.provider === provider);
  if (!record) throw new Error(`missing registry record for ${provider}`);
  return record;
}

describe('legacy registry', () => {
  it('has exactly the three legacy providers in order', () => {
    expect(registry.providers.map((entry) => entry.provider)).toEqual(['clerk', 'cloudflare', 'deno']);
  });

  it('gives every provider a 2027-01 sunset, dependents, a checklist and a replacement', () => {
    for (const record of registry.providers) {
      expect(record.sunsetDate).toBe('2027-01');
      expect(record.dependents.length).toBeGreaterThan(0);
      expect(record.checklist.length).toBeGreaterThan(0);
      expect(record.replacement.length).toBeGreaterThan(0);
      for (const item of record.checklist) {
        expect(['pending', 'in-progress', 'done']).toContain(item.state);
      }
    }
  });
});

for (const { provider, kind, factory, instance } of cases) {
  describe(`${provider} adapter`, () => {
    const adapter = factory();
    const record = recordFor(provider);

    it('exposes the specced id, kind and sunset matching legacy.json', () => {
      expect(adapter.id).toBe(provider);
      expect(adapter.kind).toBe(kind);
      expect(instance.id).toBe(provider);
      expect(adapter.sunset?.date).toBe('2027-01');
      expect(adapter.sunset?.date).toBe(record.sunsetDate);
      expect(adapter.sunset?.dependents).toEqual(record.dependents);
      expect(adapter.sunset?.checklist).toEqual(record.checklist);
    });

    it('declares plan and health capabilities only, never apply', () => {
      expect(adapter.capabilities).toEqual(['plan', 'health']);
      expect(adapter.capabilities).not.toContain('apply');
      expect(adapter.capabilities).not.toContain('verify');
    });

    it('plans deterministically with checksummed items and a checksummed plan', async () => {
      const ctx = { target: 'retirement', actor: 'admin-session-1' };
      const first = await adapter.plan(ctx);
      const second = await adapter.plan(ctx);
      expect(second).toEqual(first);
      expect(second.hash).toBe(first.hash);
      expect(first.adapterId).toBe(provider);
      expect(first.action).toBe('legacy.retirement');
      expect(first.target).toBe('retirement');
      expect(first.actor).toBe('admin-session-1');
      expect(first.id).toMatch(new RegExp(`^plan-\\d{8}-${provider}-retirement-[0-9a-f]{8}$`));
      expect(first.counts.items).toBe(record.dependents.length + record.checklist.length);
      expect(first.counts.byKind).toEqual({
        dependent: record.dependents.length,
        checklist: record.checklist.length,
      });
      for (const item of first.items) {
        const { checksum, ...rest } = item as unknown as Record<string, unknown> & { checksum: string };
        expect(sha256(rest)).toBe(checksum);
      }
      const { hash, ...planWithoutHash } = first as unknown as Record<string, unknown> & { hash: string };
      expect(sha256(planWithoutHash)).toBe(hash);
    });

    it('names every dependent and checklist item from legacy.json in the plan', async () => {
      const plan = await adapter.plan({ target: 'retirement', actor: 'admin-session-1' });
      const summaries = plan.items.map((item) => item.summary).join('\n');
      for (const dependent of record.dependents) expect(summaries).toContain(dependent);
      for (const item of record.checklist) {
        expect(summaries).toContain(item.label);
        expect(plan.items.some((entry) => entry.id === `${provider}-checklist-${item.id}`)).toBe(true);
      }
    });

    it('keeps the plan actor from the session context, ignoring option data', async () => {
      const plan = await adapter.plan({
        target: 'retirement',
        actor: 'admin-session-1',
        options: { actor: 'caller-chosen-id' },
      });
      expect(plan.actor).toBe('admin-session-1');
    });

    it('reports health as unknown offline and verify as not ok offline', async () => {
      const health = await adapter.health();
      expect(health.status).toBe('unknown');
      expect(health.detail).toMatch(/offline|dry-run/);
      const verification = await adapter.verify('plan-anything');
      expect(verification.ok).toBe(false);
      expect(verification.detail).toMatch(/offline|dry-run/);
    });

    it('refuses apply in this phase', async () => {
      await expect(adapter.apply('plan-anything', 'deadbeef')).rejects.toThrow(/apply refused/);
      await expect(adapter.apply('plan-anything', 'deadbeef')).rejects.toThrow(/Planned/);
    });

    it('uses no network APIs and only the allowed imports', () => {
      const source = readFileSync(new URL(`../src/adapters/${provider}.ts`, import.meta.url), 'utf8');
      const banned = [
        ['node:', 'http'].join(''),
        ['node:', 'https'].join(''),
        ['fet', 'ch('].join(''),
        ['XML', 'HttpRequest'].join(''),
      ];
      for (const token of banned) expect(source).not.toContain(token);
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
      expect(new Set(imports)).toEqual(new Set(['node:crypto', 'node:fs', '../types.ts']));
    });
  });
}
