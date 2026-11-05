import { loadRegistry } from '../registry.ts';
import { checkEnv } from '../secrets.ts';

export async function configHandler({ flags, positionals }: { flags: Record<string, string>; positionals: string[] }): Promise<number> {
  const [sub] = positionals;
  if (sub === 'check') {
    const name = flags.environment;
    if (!name) throw new Error('--environment is required');
    const registry = await loadRegistry('environments');
    const environment = registry.environments.find((e) => e.name === name);
    if (!environment) throw new Error(`unknown environment: ${name}`);
    const presence = checkEnv(environment.requiredEnv, name);
    console.log(JSON.stringify({ environment, envPresence: presence }, null, 2));
    return presence.some((p) => !p.present) ? 1 : 0;
  }
  console.error('config plan-flag is not implemented in this phase; `platform config check --environment <name>` is supported');
  return 1;
}
