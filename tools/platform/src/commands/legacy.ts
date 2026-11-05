import { loadRegistry } from '../registry.ts';

export async function legacyHandler({ flags, positionals }: { flags: Record<string, string>; positionals: string[] }): Promise<number> {
  const [sub] = positionals;
  if (sub === 'list') {
    const registry = await loadRegistry('legacy');
    console.log(JSON.stringify(registry.providers, null, 2));
    return 0;
  }
  console.error(`legacy ${sub ?? ''} is not implemented in this phase; use \`platform plan clerk legacy.checklist --target clerk\``);
  return 1;
}
