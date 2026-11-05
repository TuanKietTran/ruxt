import { expect, test } from 'vitest';
import { canonical, hashOf, itemChecksum, buildPlan, planHashOf, withoutHash } from '../../tools/platform/src/plan.ts';
import type { Plan } from '../../tools/platform/src/types.ts';

test('canonical serialization is key-order stable', () => {
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  expect(canonical([{ b: 2 }, { a: 1 }])).not.toBe(canonical([{ a: 1 }, { b: 2 }]));
});

test('itemChecksum is stable and content-dependent', () => {
  const item = { id: 'x', kind: 'k', summary: 's', before: { a: 1 }, after: { a: 2 } };
  expect(itemChecksum(item)).toBe(itemChecksum(item));
  expect(itemChecksum({ ...item, summary: 't' })).not.toBe(itemChecksum(item));
});

test('planHashOf excludes hash and is content-dependent', () => {
  const base = {
    id: 'plan-1',
    adapterId: 'native',
    action: 'a',
    target: 't',
    createdAt: '2026-01-01T00:00:00.000Z',
    actor: 'user-1',
    items: [],
    counts: { items: 0, byKind: {} },
  };
  expect(planHashOf(withoutHash({ ...base, hash: 'abc' }))).toBe(planHashOf(withoutHash({ ...base, hash: 'def' })));
  expect(
    planHashOf({ ...base, items: [{ id: 'i', kind: 'k', summary: 's', checksum: 'c' }], counts: { items: 1, byKind: { k: 1 } } }),
  ).not.toBe(planHashOf(base));
});

test('withoutHash drops the hash field', () => {
  const base = {
    id: 'plan-1',
    adapterId: 'native',
    action: 'a',
    target: 't',
    createdAt: '2026-01-01T00:00:00.000Z',
    actor: 'user-1',
    items: [],
    counts: { items: 0, byKind: {} },
    hash: 'abc',
  } as Plan;
  expect(withoutHash(base)).not.toHaveProperty('hash');
  expect((withoutHash(base) as Record<string, unknown>).hash).toBeUndefined();
});

test('buildPlan commits to the hash and the plan hash verifies', () => {
  const items = [
    { id: 'i1', kind: 'k', summary: 's', before: { a: 1 }, after: { a: 2 } },
    { id: 'i2', kind: 'k', summary: 's2', after: { b: 1 } },
  ];
  const plan = buildPlan({ adapterId: 'native', action: 'a', target: 't', actor: 'u', items });
  expect(plan.counts).toEqual({ items: 2, byKind: { k: 2 } });
  expect(plan.hash).toBe(hashOf(withoutHash(plan)));
  expect(plan.id).toMatch(/^plan-\d{8}-.+-.{8}$/);
});
