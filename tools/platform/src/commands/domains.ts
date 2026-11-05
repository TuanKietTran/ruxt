import { loadRegistry } from '../registry.ts';

export async function domainsHandler({ flags, positionals }: { flags: Record<string, string>; positionals: string[] }): Promise<number> {
  const [sub] = positionals;
  if (sub === 'list') {
    const registry = await loadRegistry('domains');
    console.log(JSON.stringify(registry.domains, null, 2));
    return 0;
  }
  console.error(`domains ${sub ?? ''} is not implemented in this phase; use \`platform plan cloudflare domains.dns-plan --target <domain>\``);
  return 1;
}
