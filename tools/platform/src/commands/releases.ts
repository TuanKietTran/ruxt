import { loadRegistry } from '../registry.ts';

export async function releasesHandler({ flags, positionals }: { flags: Record<string, string>; positionals: string[] }): Promise<number> {
  const [sub] = positionals;
  if (sub === 'list') {
    const registry = await loadRegistry('releases');
    console.log(JSON.stringify(registry.releases, null, 2));
    return 0;
  }
  console.error(`releases ${sub ?? ''} is not implemented in this phase; use \`platform plan native <action> --target <name>\``);
  return 1;
}
