import { expect, test } from 'vitest';
import { makePlatformRoot } from '../helpers/platform';

makePlatformRoot('plt-audit-');

const { appendAudit, readAudit } = await import('../../tools/platform/src/audit.ts');

test('audit appends entries with stable, unique ids', async () => {
  const now = '2026-11-05T00:00:00.000Z';
  const first = await appendAudit({ action: 'plan.create', target: 't', planHash: 'h1', mode: 'dry-run', result: 'ok', actor: 'u', detail: 'd' });
  const second = await appendAudit({ action: 'plan.create', target: 't', planHash: 'h2', mode: 'applied', result: 'ok', actor: 'u', detail: 'd2', timestamp: now });
  const entries = await readAudit();
  expect(entries).toHaveLength(2);
  expect(entries[0].id).toMatch(/^\d{8}T\d{5}$/);
  expect(entries[1].id).not.toBe(entries[0].id);
  expect(entries[1].timestamp).toBe(now);
});

test('audit is append-only: entries accumulate across appends', async () => {
  await appendAudit({ action: 'x', target: 't', planHash: 'h', mode: 'dry-run', result: 'ok', actor: 'u' });
  const entries = await readAudit();
  expect(entries.length).toBeGreaterThanOrEqual(3);
  for (const entry of entries) {
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
  }
});
