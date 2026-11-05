import { readAudit } from '../audit.ts';

export async function auditHandler({ flags, positionals }: { flags: Record<string, string>; positionals: string[] }): Promise<number> {
  const [sub] = positionals;
  if (sub === 'list') {
    const entries = await readAudit();
    const limit = flags.limit ? Number(flags.limit) : entries.length;
    console.log(JSON.stringify(entries.slice(Math.max(0, entries.length - limit)), null, 2));
    return 0;
  }
  console.error('audit is read-only; `platform audit list [--limit n]` is supported');
  return 1;
}
