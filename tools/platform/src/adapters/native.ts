import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendAudit } from '../audit.ts';
import { buildPlan, itemChecksum, planHashOf, readPlan, withoutHash } from '../plan.ts';
import { loadRegistry, registryChecksum, repoRoot, saveRegistry } from '../registry.ts';
import type { AuditEntry, HealthResult, Plan, PlanContext, ProviderAdapter } from '../types.ts';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function dbPath(reference: string): string {
  return resolve(repoRoot, reference);
}

function auditEntry(plan: Plan, result: AuditEntry['result'], detail: string): Promise<AuditEntry> {
  return appendAudit({
    action: plan.action,
    target: plan.target,
    planHash: plan.hash,
    mode: 'applied',
    result,
    actor: plan.actor,
    detail,
  });
}

export const nativeAdapter: ProviderAdapter = {
  id: 'native',
  kind: 'hosting',
  capabilities: ['plan', 'apply', 'verify', 'health'],
  plan: async (ctx: PlanContext): Promise<Plan> => {
    const environments = await loadRegistry('environments');
    const environment = environments.environments.find((e) => e.name === ctx.target || e.deploymentEnv === ctx.target);
    if (!environment) throw new Error(`native: unknown environment ${ctx.target}`);
    const databases = await loadRegistry('databases');
    const database = databases.databases.find((d) => d.id === environment.databaseId);
    if (!database) throw new Error(`native: database ${environment.databaseId} not found`);
    if (database.adapter !== 'sqlite') {
      throw new Error(`native: environment ${ctx.target} is backed by ${database.adapter}, not sqlite`);
    }
    const items = [
      {
        id: `native.sqlite.${database.id}`,
        kind: 'sqlite.verify',
        summary: `Verify SQLite store at ${database.reference} for environment ${ctx.target}`,
        before: { exists: existsSync(dbPath(database.reference)) },
        after: { exists: true },
      },
      {
        id: `native.migration.${database.id}`,
        kind: 'migration.verify',
        summary: `Confirm migration state for database ${database.id}`,
        before: database.migrationState,
        after: database.migrationState,
      },
    ];
    return buildPlan({
      adapterId: 'native',
      action: 'native.verify',
      target: ctx.target,
      actor: ctx.actor,
      items,
      snapshot: {
        environments: await registryChecksum('environments'),
        databases: await registryChecksum('databases'),
      },
    });
  },
  apply: async (planId: string, confirmHash: string): Promise<AuditEntry> => {
    const plan = await readPlan(planId);
    if (confirmHash !== planHashOf(withoutHash(plan))) return auditEntry(plan, 'refused', 'plan hash mismatch');
    if (plan.snapshot) {
      const current: Record<string, string> = {
        environments: await registryChecksum('environments'),
        databases: await registryChecksum('databases'),
      };
      for (const [name, expected] of Object.entries(plan.snapshot)) {
        if (current[name] !== expected) return auditEntry(plan, 'refused', `stale plan: ${name} registry changed after planning`);
      }
    }
    const environments = await loadRegistry('environments');
    const environment = environments.environments.find((e) => e.name === plan.target || e.deploymentEnv === plan.target);
    const databases = await loadRegistry('databases');
    const database = environment ? databases.databases.find((d) => d.id === environment.databaseId) : undefined;
    if (!database || database.adapter !== 'sqlite' || !existsSync(dbPath(database.reference))) {
      return auditEntry(plan, 'failed', `sqlite store not found for environment ${plan.target}`);
    }
    database.health = 'ok';
    await saveRegistry('databases', databases);
    return auditEntry(plan, 'ok', `native SQLite store verified for environment ${plan.target}`);
  },
  verify: async (planId: string): Promise<{ ok: boolean; detail: string }> => {
    const plan = await readPlan(planId);
    const environments = await loadRegistry('environments');
    const environment = environments.environments.find((e) => e.name === plan.target || e.deploymentEnv === plan.target);
    const databases = await loadRegistry('databases');
    const database = environment ? databases.databases.find((d) => d.id === environment.databaseId) : undefined;
    const ok = Boolean(database && database.adapter === 'sqlite' && existsSync(dbPath(database.reference)));
    return { ok, detail: ok && database ? `SQLite store present at ${database.reference}` : `SQLite store missing for ${plan.target}` };
  },
  health: async (): Promise<HealthResult> => {
    const databases = await loadRegistry('databases');
    const sqliteDatabases = databases.databases.filter((d) => d.adapter === 'sqlite');
    const missing: string[] = [];
    for (const database of sqliteDatabases) {
      if (!existsSync(dbPath(database.reference))) missing.push(database.id);
    }
    const status: HealthResult['status'] = sqliteDatabases.length === 0 ? 'unknown' : missing.length === 0 ? 'ok' : 'degraded';
    return {
      adapterId: 'native',
      status,
      detail: missing.length > 0 ? `missing stores: ${missing.join(', ')}` : 'sqlite stores present',
    };
  },
};
