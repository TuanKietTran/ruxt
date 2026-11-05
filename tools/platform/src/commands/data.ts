import { loadRegistry } from '../registry.ts';

export async function dataHandler({ flags, positionals }: { flags: Record<string, string>; positionals: string[] }): Promise<number> {
  const [sub] = positionals;
  if (sub === 'list') {
    const registry = await loadRegistry('databases');
    console.log(JSON.stringify(registry.databases, null, 2));
    return 0;
  }
  console.error(`data ${sub ?? ''} is not implemented in this phase; use \`platform plan native <action> --target <name>\``);
  return 1;
}
