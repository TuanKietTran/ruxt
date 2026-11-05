import { appendFile, readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { auditDir } from './registry.ts';
import type { AuditEntry, Plan } from './types.ts';

export async function readAudit(): Promise<AuditEntry[]> {
  try {
    const text = await readFile(join(auditDir, 'audit.jsonl'), 'utf8');
    return text.split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) as AuditEntry[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function nextId(existing: AuditEntry[]): string {
  const stamp = new Date().toISOString().slice(0, 13).replace(/[-:]/g, '');
  let seq = 1;
  for (const entry of existing) {
    if (entry.id.startsWith(stamp)) {
      const previous = Number(entry.id.slice(stamp.length)) || 0;
      seq = Math.max(seq, previous + 1);
    }
  }
  return `${stamp}${String(seq).padStart(3, '0')}`;
}

export async function appendAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'> & { timestamp?: string }): Promise<AuditEntry> {
  const existing = await readAudit();
  const full: AuditEntry = { ...entry, id: nextId(existing), timestamp: entry.timestamp || new Date().toISOString() };
  mkdirSync(auditDir, { recursive: true });
  await appendFile(join(auditDir, 'audit.jsonl'), JSON.stringify(full) + '\n', 'utf8');
  return full;
}

export async function recordApply(plan: Plan, result: AuditEntry['result'], detail: string): Promise<AuditEntry> {
  return appendAudit({ action: plan.action, target: plan.target, planHash: plan.hash, mode: 'applied', result, actor: plan.actor, detail });
}
