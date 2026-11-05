import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AuditEntry, Plan, PlanContext, ProviderAdapter, SunsetInfo } from '../types.ts';

// Legacy adapter for Clerk (identity), sunset 2027-01. Dry-run only in this
// phase: capabilities are plan and health, no live provider calls are made,
// and apply is refused. The actor on a plan is the session-derived principal
// supplied in PlanContext (see specs/auth-iam-security.md); it is never read
// from plan item or option data.

type ChecklistItem = SunsetInfo['checklist'][number];

interface LegacyProviderRecord {
  provider: string;
  sunsetDate: string;
  dependents: string[];
  checklist: ChecklistItem[];
  replacement: string;
}

interface LegacyPlanItem {
  id: string;
  kind: string;
  summary: string;
  before: unknown;
  after: unknown;
  checksum: string;
}

const PROVIDER = 'clerk';
// Reproducible dry-run plans carry this fixed as-of timestamp unless the
// caller supplies options.createdAt, so identical inputs hash identically.
const PLAN_AS_OF = '2026-11-05T00:00:00.000Z';

function loadRecord(): LegacyProviderRecord {
  const url = new URL('../../data/registries/legacy.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(url, 'utf8')) as { providers: LegacyProviderRecord[] };
  const record = parsed.providers.find((entry) => entry.provider === PROVIDER);
  if (!record) throw new Error(`legacy registry has no record for ${PROVIDER}`);
  return record;
}

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

function buildPlan(record: LegacyProviderRecord, ctx: PlanContext): Plan {
  if (!ctx.target) throw new Error('plan requires a target');
  if (!ctx.actor) throw new Error('plan requires a session-derived actor');
  const dependentItems: LegacyPlanItem[] = record.dependents.map((dependent, index) => {
    const base = {
      id: `${PROVIDER}-dependent-${String(index + 1).padStart(2, '0')}`,
      kind: 'dependent',
      summary: `${dependent} depends on ${PROVIDER} today`,
      before: { dependent, provider: PROVIDER },
      after: { migration: 'Planned', replacement: record.replacement },
    };
    return { ...base, checksum: sha256(base) };
  });
  const checklistItems: LegacyPlanItem[] = record.checklist.map((item) => {
    const base = {
      id: `${PROVIDER}-checklist-${item.id}`,
      kind: 'checklist',
      summary: item.label,
      before: { state: item.state },
      after: { plannedStep: item.label, state: item.state },
    };
    return { ...base, checksum: sha256(base) };
  });
  const items = [...dependentItems, ...checklistItems];
  const byKind: Record<string, number> = {};
  for (const item of items) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  const createdAt = ctx.options?.createdAt ?? PLAN_AS_OF;
  const yyyymmdd = createdAt.slice(0, 10).replace(/-/g, '');
  const shortHash = sha256(items).slice(0, 8);
  const planWithoutHash = {
    id: `plan-${yyyymmdd}-${PROVIDER}-retirement-${shortHash}`,
    adapterId: PROVIDER,
    action: 'legacy.retirement',
    target: ctx.target,
    createdAt,
    actor: ctx.actor,
    items,
    counts: { items: items.length, byKind },
  };
  return { ...planWithoutHash, hash: sha256(planWithoutHash) } as Plan;
}

export function createClerkAdapter(): ProviderAdapter {
  const record = loadRecord();
  const sunset: SunsetInfo = {
    date: record.sunsetDate,
    dependents: [...record.dependents],
    checklist: record.checklist.map((item) => ({ ...item })),
  };
  return {
    id: PROVIDER,
    kind: 'identity',
    capabilities: ['plan', 'health'],
    sunset,
    async plan(ctx: PlanContext): Promise<Plan> {
      return buildPlan(record, ctx);
    },
    async apply(_planId: string, _confirmHash: string): Promise<AuditEntry> {
      throw new Error(
        `apply refused for ${PROVIDER}: apply is Planned and owner-run only after merge with the core engine`,
      );
    },
    async verify(planId: string): Promise<{ ok: boolean; detail: string }> {
      return {
        ok: false,
        detail: `verify unavailable offline for ${PROVIDER}: dry-run only, no provider state was read for plan ${planId}`,
      };
    },
    async health(): Promise<{ status: 'ok' | 'degraded' | 'down' | 'unknown'; detail: string }> {
      return {
        status: 'unknown',
        detail: `${PROVIDER} health is unknown offline: dry-run only, no live provider check was performed`,
      };
    },
  };
}

export const clerkAdapter: ProviderAdapter = createClerkAdapter();

export default clerkAdapter;
