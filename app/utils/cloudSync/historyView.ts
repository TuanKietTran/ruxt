/**
 * Pure view helpers for the cloud history and recovery panels.
 *
 * Built against contracts.ts and types.ts only: no store, engine or
 * network access here, so the panels can be tested without a browser.
 */
import type { CloudHistoryDto, SyncKind, SyncSnapshot } from './types';
import type { RecoveryEntry } from './contracts';
import { snapshotBytes } from './hash';

export interface HistoryItem {
   id: string;
   label: string;
   revision: number;
   changedAt: string;
   isHead: boolean;
   snapshot: SyncSnapshot;
   preview: string;
   bytes: number;
}

const PREVIEW_MAX_CHARS = 160;
const PREVIEW_LINES = 2;

function nonEmptyLines(text: string): string[] {
   const lines: string[] = [];
   for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
         lines.push(trimmed);
      }
   }
   return lines;
}

function firstLines(text: string, count: number): string {
   return nonEmptyLines(text).slice(0, count).join(' ');
}

function truncate(text: string, maxChars: number): string {
   if (text.length <= maxChars) {
      return text;
   }
   if (maxChars < 2) {
      return text.slice(0, maxChars);
   }
   return text.slice(0, maxChars - 1).trimEnd() + '…';
}

function parseContent(content: string): Record<string, unknown> | null {
   try {
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) {
         return null;
      }
      return parsed as Record<string, unknown>;
   } catch {
      return null;
   }
}

function stringField(value: unknown): string | null {
   if (typeof value !== 'string') {
      return null;
   }
   const trimmed = value.trim();
   return trimmed.length > 0 ? trimmed : null;
}

function profilePreview(parsed: Record<string, unknown>): string {
   const profile = parsed.profile;
   if (typeof profile !== 'object' || profile === null) {
      return '';
   }
   const identity = (profile as Record<string, unknown>).identity;
   if (typeof identity !== 'object' || identity === null) {
      return '';
   }
   const fields = identity as Record<string, unknown>;
   const parts: string[] = [];
   const fullName = stringField(fields.fullName);
   if (fullName !== null) {
      parts.push(fullName);
   }
   const headline = stringField(fields.headline);
   if (headline !== null) {
      parts.push(headline);
   }
   return parts.join(' — ');
}

export function snapshotPreview(kind: SyncKind, snapshot: SyncSnapshot, maxChars: number = PREVIEW_MAX_CHARS): string {
   const parsed = parseContent(snapshot.content);
   let preview = '';
   if (parsed !== null) {
      if (kind === 'session') {
         preview = firstLines(stringField(parsed.markdown) ?? '', PREVIEW_LINES);
      } else if (kind === 'template') {
         preview = firstLines(stringField(parsed.markdownSkeleton) ?? '', PREVIEW_LINES);
      } else {
         preview = profilePreview(parsed);
      }
   }
   if (preview.length === 0) {
      preview = firstLines(snapshot.content, PREVIEW_LINES);
   }
   return truncate(preview, maxChars);
}

export function historyItems(history: CloudHistoryDto): HistoryItem[] {
   const head: HistoryItem = {
      id: `${history.clientItemId}@${history.revision}`,
      label: 'Current cloud version',
      revision: history.revision,
      changedAt: history.updatedAt,
      isHead: true,
      snapshot: history.snapshot,
      preview: snapshotPreview(history.kind, history.snapshot),
      bytes: snapshotBytes(history.snapshot),
   };
   const checkpoints = [...history.checkpoints];
   checkpoints.sort((a, b) => {
      if (a.changedAt !== b.changedAt) {
         return b.changedAt.localeCompare(a.changedAt);
      }
      return b.revision - a.revision;
   });
   const items: HistoryItem[] = [head];
   for (const checkpoint of checkpoints) {
      items.push({
         id: `${history.clientItemId}@${checkpoint.revision}`,
         label: `Saved ${checkpoint.day}`,
         revision: checkpoint.revision,
         changedAt: checkpoint.changedAt,
         isHead: false,
         snapshot: checkpoint.snapshot,
         preview: snapshotPreview(history.kind, checkpoint.snapshot),
         bytes: snapshotBytes(checkpoint.snapshot),
      });
   }
   return items;
}

export function recoveryGroups(entries: RecoveryEntry[]): Array<{ day: string; entries: RecoveryEntry[] }> {
   const sorted = [...entries];
   sorted.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
   const byDay = new Map<string, RecoveryEntry[]>();
   for (const entry of sorted) {
      const day = entry.savedAt.slice(0, 10);
      const group = byDay.get(day) ?? [];
      group.push(entry);
      byDay.set(day, group);
   }
   const groups: Array<{ day: string; entries: RecoveryEntry[] }> = [];
   for (const [day, dayEntries] of byDay) {
      groups.push({ day, entries: dayEntries });
   }
   return groups;
}

const REASON_TEXT: Record<RecoveryEntry['reason'], string> = {
   'fast-forward': 'Saved before the cloud version moved ahead',
   'keep-cloud': 'Saved before keeping the cloud version',
   'merge': 'Saved before merging with the cloud version',
   'download': 'Saved before downloading the cloud version',
   'restore': 'Saved before restoring a cloud version',
};

export function reasonText(reason: RecoveryEntry['reason']): string {
   return REASON_TEXT[reason];
}

