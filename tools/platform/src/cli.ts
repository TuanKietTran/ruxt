import { cliActor } from './auth.ts';
import { aggregateHealth } from './health.ts';
import { readPlan, writePlan } from './plan.ts';
import { appendAudit } from './audit.ts';
import { loadRegistry } from './registry.ts';
import { adapters } from './adapters/index.ts';
import { releasesHandler } from './commands/releases.ts';
import { domainsHandler } from './commands/domains.ts';
import { dataHandler } from './commands/data.ts';
import { configHandler } from './commands/config.ts';
import { legacyHandler } from './commands/legacy.ts';
import { auditHandler } from './commands/audit.ts';

const ADAPTERS = adapters;

function parseArgs(argv: string[]): { path: string[]; flags: Record<string, string> } {
  const path: string[] = [];
  const flags: Record<string, string> = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq > -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        flags[token.slice(2)] = argv[i + 1] ?? '';
        i++;
      }
    } else if (token.startsWith('-') && token.length > 1) {
      flags[token.slice(1)] = argv[i + 1] ?? '';
      i++;
    } else {
      path.push(token);
    }
    i++;
  }
  return { path, flags };
}

function help(): void {
  console.log('Usage: platform <command> [options]');
  console.log('Commands:');
  console.log('  plan <adapter> <action> --target <name>');
  console.log('  apply --plan <planId> --confirm <hash>');
  console.log('  verify --plan <planId>');
  console.log('  health [--adapter <id>]');
  console.log('  releases | domains | data | config | legacy | audit');
}

async function main(argv: string[]): Promise<number> {
  const { path, flags } = parseArgs(argv);
  if (path.length === 0) {
    help();
    return 0;
  }
  const [top] = path;
  const rest = path.slice(1);
  try {
    if (top === 'plan') {
      const actor = await cliActor();
      const [adapterId, action] = rest;
      const adapter = ADAPTERS[adapterId ?? ''];
      if (!adapter) throw new Error(`unknown adapter: ${adapterId}`);
      const target = flags.target;
      if (!target) throw new Error('--target is required');
      const plan = await adapter.plan({ target, actor, options: { ...flags, action } } as any);
      await writePlan(plan);
      await appendAudit({ action: `plan.${action}`, target, planHash: plan.hash, mode: 'dry-run', result: 'ok', actor, detail: `Planned ${action} on ${target} (${plan.items.length} items)` });
      console.log(JSON.stringify({ planId: plan.id, hash: plan.hash, items: plan.items.length }, null, 2));
      return 0;
    }
    if (top === 'apply') {
      await cliActor();
      const planId = flags.plan;
      const confirm = flags.confirm;
      if (!planId || !confirm) throw new Error('--plan and --confirm are required');
      const plan = await readPlan(planId);
      const adapter = ADAPTERS[plan.adapterId];
      if (!adapter) throw new Error(`unknown adapter: ${plan.adapterId}`);
      const entry = await adapter.apply(planId, confirm);
      console.log(JSON.stringify(entry, null, 2));
      return entry.result === 'ok' ? 0 : 1;
    }
    if (top === 'verify') {
      const planId = flags.plan;
      if (!planId) throw new Error('--plan is required');
      const plan = await readPlan(planId);
      const adapter = ADAPTERS[plan.adapterId];
      if (!adapter) throw new Error(`unknown adapter: ${plan.adapterId}`);
      const result = await adapter.verify(planId);
      console.log(JSON.stringify({ planId, ok: result.ok, detail: result.detail }, null, 2));
      return result.ok ? 0 : 1;
    }
    if (top === 'health') {
      const list = flags.adapter ? [ADAPTERS[flags.adapter]] : Object.values(ADAPTERS);
      const results = await aggregateHealth(list as unknown as typeof list[0][]);
      console.log(JSON.stringify(results, null, 2));
      return 0;
    }
    const handlers: Record<string, (args: { flags: Record<string, string>; positionals: string[] }) => Promise<number>> = {
      releases: releasesHandler,
      domains: domainsHandler,
      data: dataHandler,
      config: configHandler,
      legacy: legacyHandler,
      audit: auditHandler,
    };
    const handler = handlers[top];
    if (!handler) throw new Error(`unknown command: ${top}`);
    return handler({ flags, positionals: rest });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

main(process.argv.slice(2)).then((code: number) => {
  process.exitCode = code;
});
