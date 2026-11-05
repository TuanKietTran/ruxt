import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { plansDir } from './registry.ts';
import type { Plan, PlanItem } from './types.ts';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = canonicalValue((value as Record<string, unknown>)[key]);
  return result;
}

export function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function hashOf(value: unknown): string {
  return sha256(canonical(value));
}

export function itemChecksum(item: Omit<PlanItem, 'checksum'>): string {
  return hashOf(item);
}

export function planHashOf(plan: Omit<Plan, 'hash'>): string {
  return hashOf(plan);
}

export function withoutHash(plan: Plan): Omit<Plan, 'hash'> {
  const { hash, ...rest } = plan;
  return rest;
}

export function planCounts(items: PlanItem[]): Plan['counts'] {
  const byKind: Record<string, number> = {};
  for (const item of items) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  return { items: items.length, byKind };
}

export function makePlanId(action: string, target: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const slug = `${action}.${target}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = hashOf(`${action}:${target}:${Date.now()}`).slice(0, 8);
  return `plan-${stamp}-${slug}-${suffix}`;
}

export interface PlanInput {
  adapterId: Plan['adapterId'];
  action: string;
  target: string;
  actor: string;
  items: Array<Omit<PlanItem, 'checksum'>>;
  snapshot?: Record<string, string>;
}

export function buildPlan(input: PlanInput): Plan {
  const items = input.items.map(item => ({ ...item, checksum: itemChecksum(item) }));
  const plan: Omit<Plan, 'hash'> = {
    id: makePlanId(input.action, input.target),
    adapterId: input.adapterId,
    action: input.action,
    target: input.target,
    createdAt: new Date().toISOString(),
    actor: input.actor,
    items,
    counts: planCounts(items),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
  };
  return { ...plan, hash: planHashOf(plan) };
}

export async function writePlan(plan: Plan): Promise<void> {
  mkdirSync(plansDir, { recursive: true });
  await writeFile(join(plansDir, `${plan.id}.json`), JSON.stringify(plan, null, 2) + '\n', 'utf8');
}

export async function readPlan(planId: string): Promise<Plan> {
  const text = await readFile(join(plansDir, `${planId}.json`), 'utf8');
  return JSON.parse(text) as Plan;
}
