import type { DiffLine, MergeHunk, TextMergeResult } from './contracts';
import type { SyncKind, SyncSnapshot } from './types';

const NL = String.fromCharCode(10);

export interface SnapshotMerge {
   title: { value: string; conflict: boolean; local: string; cloud: string };
   text: Array<{ field: string; result: TextMergeResult }>;
   json: Array<{ field: string; merged: unknown; conflicts: string[] }>;
   snapshot: SyncSnapshot | null;
   conflicts: number;
}

function splitLines(text: string): string[] {
   return text === '' ? [] : text.split(NL);
}

function joinLines(lines: string[]): string {
   return lines.join(NL);
}

function equalLines(a: string[], b: string[]): boolean {
   return a.length === b.length && a.every((line, index) => line === b[index]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
   if (Object.is(a, b)) return true;
   if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
   }
   if (isPlainObject(a) || isPlainObject(b)) {
      if (!isPlainObject(a) || !isPlainObject(b)) return false;
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((key) => {
         const hasKey = Object.prototype.hasOwnProperty.call(b, key);
         return hasKey && deepEqual(a[key], b[key]);
      });
   }
   return false;
}
// Minimal diff of the trimmed middle via LCS. Trimming keeps the common case
// (a few edits in a long file) tiny, so the 5,000-line case stays well under 200 ms.
function diffMiddle(a: string[], b: string[]): DiffLine[] {
   const n = a.length;
   const m = b.length;
   if (n === 0) return b.map((text): DiffLine => ({ op: 'insert', text }));
   if (m === 0) return a.map((text): DiffLine => ({ op: 'delete', text }));
   if (n * m > 2000000) {
      const deletes = a.map((text): DiffLine => ({ op: 'delete', text }));
      const inserts = b.map((text): DiffLine => ({ op: 'insert', text }));
      return [...deletes, ...inserts];
   }
   const width = m + 1;
   const dp = new Uint32Array((n + 1) * width);
   for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
         const up = dp[(i - 1) * width + j]!;
         const left = dp[i * width + j - 1]!;
         const diag = dp[(i - 1) * width + j - 1]!;
         if (a[i - 1] === b[j - 1]) {
            dp[i * width + j] = diag + 1;
         } else {
            dp[i * width + j] = Math.max(up, left);
         }
      }
   }
   const ops: DiffLine[] = [];
   let i = n;
   let j = m;
   while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
         ops.push({ op: 'equal', text: a[i - 1]! });
         i--;
         j--;
      } else if (j > 0 && (i === 0 || dp[i * width + j - 1]! >= dp[(i - 1) * width + j]!)) {
         ops.push({ op: 'insert', text: b[j - 1]! });
         j--;
      } else {
         ops.push({ op: 'delete', text: a[i - 1]! });
         i--;
      }
   }
   ops.reverse();
   return ops;
}

export function diffLines(before: string, after: string): DiffLine[] {
   const a = splitLines(before);
   const b = splitLines(after);
   let prefix = 0;
   while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
   let suffix = 0;
   while (suffix < a.length - prefix && suffix < b.length - prefix) {
      if (a[a.length - 1 - suffix] !== b[b.length - 1 - suffix]) break;
      suffix++;
   }
   const ops: DiffLine[] = [];
   for (let i = 0; i < prefix; i++) ops.push({ op: 'equal', text: a[i]! });
   ops.push(...diffMiddle(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix)));
   for (let i = a.length - suffix; i < a.length; i++) ops.push({ op: 'equal', text: a[i]! });
   return ops;
}
interface Change {
   start: number;
   end: number;
   lines: string[];
}

// Consecutive non-equal ops form one change: base lines [start, end) replaced by lines.
function changesFromDiff(ops: DiffLine[]): Change[] {
   const changes: Change[] = [];
   let baseIndex = 0;
   let current: Change | null = null;
   const flush = () => {
      if (current) {
         changes.push(current);
         current = null;
      }
   };
   for (const op of ops) {
      if (op.op === 'equal') {
         flush();
         baseIndex++;
      } else {
         if (!current) current = { start: baseIndex, end: baseIndex, lines: [] };
         if (op.op === 'delete') {
            current.end = baseIndex + 1;
            baseIndex++;
         } else {
            current.lines.push(op.text);
         }
      }
   }
   flush();
   return changes;
}

// Empty ranges (pure inserts) never overlap a real change: an insert at a boundary
// is independent of the change next to it. Two inserts at the same spot do overlap.
function rangesOverlap(x: Change, y: Change): boolean {
   if (x.start < y.end && y.start < x.end) return true;
   return x.start === x.end && y.start === y.end && x.start === y.start;
}

function pickNext(
   lc: Change | undefined,
   cc: Change | undefined
): { change: Change; isLocal: boolean } | undefined {
   if (lc && cc) {
      if (lc.start < cc.start || (lc.start === cc.start && lc.start === lc.end)) {
         return { change: lc, isLocal: true };
      }
      return { change: cc, isLocal: false };
   }
   if (lc) return { change: lc, isLocal: true };
   if (cc) return { change: cc, isLocal: false };
   return undefined;
}
export function mergeText(base: string, local: string, cloud: string): TextMergeResult {
   const baseLines = splitLines(base);
   const localChanges = changesFromDiff(diffLines(base, local));
   const cloudChanges = changesFromDiff(diffLines(base, cloud));
   const hunks: MergeHunk[] = [];
   let conflicts = 0;
   let clean: string[] = [];
   const flushClean = () => {
      if (clean.length > 0) {
         hunks.push({ kind: 'clean', lines: clean });
         clean = [];
      }
   };
   let i = 0;
   let li = 0;
   let ci = 0;
   const total = baseLines.length;
   while (true) {
      const lc = li < localChanges.length ? localChanges[li] : undefined;
      const cc = ci < cloudChanges.length ? cloudChanges[ci] : undefined;
      if (!lc && !cc) {
         if (i < total) clean.push(...baseLines.slice(i));
         break;
      }
      const nextStart = Math.min(lc ? lc.start : Infinity, cc ? cc.start : Infinity);
      if (i < nextStart) {
         const end = Math.min(nextStart, total);
         clean.push(...baseLines.slice(i, end));
         i = end;
         continue;
      }
      if (lc && cc && rangesOverlap(lc, cc)) {
         const end = Math.max(lc.end, cc.end);
         if (lc.start === cc.start && lc.end === cc.end && equalLines(lc.lines, cc.lines)) {
            clean.push(...lc.lines);
         } else {
            flushClean();
            hunks.push({
               kind: 'conflict',
               base: baseLines.slice(i, end),
               local: lc.lines,
               cloud: cc.lines,
            });
            conflicts++;
         }
         i = end;
         li++;
         ci++;
         continue;
      }
      const next = pickNext(lc, cc);
      if (!next) break;
      clean.push(...next.change.lines);
      i = Math.max(i, next.change.end);
      if (next.isLocal) li++;
      else ci++;
   }
   flushClean();
   let merged: string | null = null;
   if (conflicts === 0) {
      const lines: string[] = [];
      for (const hunk of hunks) {
         if (hunk.kind === 'clean') lines.push(...hunk.lines);
      }
      merged = lines.join(NL);
   }
   return { hunks, conflicts, merged };
}

export function renderMerge(
   hunks: MergeHunk[],
   choices: Array<'local' | 'cloud' | 'both'>
): string {
   const lines: string[] = [];
   let conflictIndex = 0;
   for (const hunk of hunks) {
      if (hunk.kind === 'clean') {
         lines.push(...hunk.lines);
      } else {
         const choice = choices[conflictIndex] ?? 'local';
         conflictIndex++;
         if (choice === 'local') lines.push(...hunk.local);
         else if (choice === 'cloud') lines.push(...hunk.cloud);
         else lines.push(...hunk.local, ...hunk.cloud);
      }
   }
   return lines.join(NL);
}
function mergeScalar(
   base: unknown,
   local: unknown,
   cloud: unknown,
   path: string
): { value: unknown; conflicts: string[] } {
   if (deepEqual(local, cloud)) return { value: local, conflicts: [] };
   if (deepEqual(local, base)) return { value: cloud, conflicts: [] };
   if (deepEqual(cloud, base)) return { value: local, conflicts: [] };
   return { value: local, conflicts: [path] };
}

function mergeObject(
   base: Record<string, unknown>,
   local: Record<string, unknown>,
   cloud: Record<string, unknown>,
   path: string
): { value: Record<string, unknown>; conflicts: string[] } {
   const value: Record<string, unknown> = {};
   const conflicts: string[] = [];
   const keys: string[] = [];
   for (const source of [base, local, cloud]) {
      for (const key of Object.keys(source)) {
         if (!keys.includes(key)) keys.push(key);
      }
   }
   for (const key of keys) {
      const childPath = path === '' ? key : path + '.' + key;
      const inBase = Object.prototype.hasOwnProperty.call(base, key);
      const inLocal = Object.prototype.hasOwnProperty.call(local, key);
      const inCloud = Object.prototype.hasOwnProperty.call(cloud, key);
      if (!inLocal && !inCloud) continue;
      if (!inLocal) {
         if (!inBase) {
            value[key] = cloud[key];
            continue;
         }
         if (deepEqual(cloud[key], base[key])) continue;
         conflicts.push(childPath);
         continue;
      }
      if (!inCloud) {
         if (!inBase) {
            value[key] = local[key];
            continue;
         }
         if (deepEqual(local[key], base[key])) continue;
         conflicts.push(childPath);
         continue;
      }
      if (!inBase) {
         value[key] = local[key];
         if (!deepEqual(local[key], cloud[key])) conflicts.push(childPath);
         continue;
      }
      const baseVal = base[key];
      const localVal = local[key];
      const cloudVal = cloud[key];
      if (isPlainObject(baseVal) && isPlainObject(localVal) && isPlainObject(cloudVal)) {
         const nested = mergeObject(baseVal, localVal, cloudVal, childPath);
         value[key] = nested.value;
         conflicts.push(...nested.conflicts);
         continue;
      }
      const merged = mergeScalar(baseVal, localVal, cloudVal, childPath);
      value[key] = merged.value;
      conflicts.push(...merged.conflicts);
   }
   return { value, conflicts };
}

export function mergeJson(
   base: unknown,
   local: unknown,
   cloud: unknown
): { merged: unknown; conflicts: string[] } {
   if (isPlainObject(base) && isPlainObject(local) && isPlainObject(cloud)) {
      const result = mergeObject(base, local, cloud, '');
      return { merged: result.value, conflicts: result.conflicts };
   }
   const result = mergeScalar(base, local, cloud, '');
   return { merged: result.value, conflicts: result.conflicts };
}
const SCHEMAS: Record<SyncKind, string> = {
   session: 'ruxt.session/1',
   template: 'ruxt.template/1',
   profile: 'ruxt.profile/1',
};

export function buildSnapshot(kind: SyncKind, title: string, fields: Record<string, unknown>): SyncSnapshot {
   let content: string;
   if (kind === 'session') {
      content = JSON.stringify({ schema: SCHEMAS.session, markdown: fields.markdown, css: fields.css });
   } else if (kind === 'template') {
      content = JSON.stringify({
         schema: SCHEMAS.template,
         markdownSkeleton: fields.markdownSkeleton,
         css: fields.css,
         capabilities: fields.capabilities,
         tags: fields.tags,
      });
   } else {
      content = JSON.stringify({ schema: SCHEMAS.profile, profile: fields.profile });
   }
   return { title, content };
}

export function parseSnapshotFields(kind: SyncKind, snapshot: SyncSnapshot): Record<string, unknown> | null {
   let parsed: unknown;
   try {
      parsed = JSON.parse(snapshot.content);
   } catch {
      return null;
   }
   if (!isPlainObject(parsed) || parsed.schema !== SCHEMAS[kind]) return null;
   if (kind === 'session') return { markdown: parsed.markdown, css: parsed.css };
   if (kind === 'template') {
      return {
         markdownSkeleton: parsed.markdownSkeleton,
         css: parsed.css,
         capabilities: parsed.capabilities,
         tags: parsed.tags,
      };
   }
   return { profile: parsed.profile };
}

const TEXT_FIELDS: Record<SyncKind, string[]> = {
   session: ['markdown', 'css'],
   template: ['markdownSkeleton', 'css'],
   profile: [],
};

const JSON_FIELDS: Record<SyncKind, string[]> = {
   session: [],
   template: ['capabilities', 'tags'],
   profile: ['profile'],
};

function textField(fields: Record<string, unknown> | null, field: string): string {
   if (!fields) return '';
   const value = fields[field];
   return typeof value === 'string' ? value : '';
}

// No common ancestor: every differing region is a conflict with an empty base.
function mergeTextNoBase(localText: string, cloudText: string): TextMergeResult {
   const ops = diffLines(localText, cloudText);
   const hunks: MergeHunk[] = [];
   let conflicts = 0;
   let clean: string[] = [];
   const flushClean = () => {
      if (clean.length > 0) {
         hunks.push({ kind: 'clean', lines: clean });
         clean = [];
      }
   };
   let localLines: string[] = [];
   let cloudLines: string[] = [];
   const flushConflict = () => {
      if (localLines.length === 0 && cloudLines.length === 0) return;
      flushClean();
      hunks.push({ kind: 'conflict', base: [], local: localLines, cloud: cloudLines });
      conflicts++;
      localLines = [];
      cloudLines = [];
   };
   for (const op of ops) {
      if (op.op === 'equal') {
         flushConflict();
         clean.push(op.text);
      } else if (op.op === 'delete') {
         localLines.push(op.text);
      } else {
         cloudLines.push(op.text);
      }
   }
   flushConflict();
   flushClean();
   let merged: string | null = null;
   if (conflicts === 0) {
      const lines: string[] = [];
      for (const hunk of hunks) {
         if (hunk.kind === 'clean') lines.push(...hunk.lines);
      }
      merged = lines.join(NL);
   }
   return { hunks, conflicts, merged };
}
export function mergeSnapshots(
   kind: SyncKind,
   base: SyncSnapshot | null,
   local: SyncSnapshot,
   cloud: SyncSnapshot
): SnapshotMerge {
   const baseFields = base ? parseSnapshotFields(kind, base) : null;
   const localFields = parseSnapshotFields(kind, local) ?? {};
   const cloudFields = parseSnapshotFields(kind, cloud) ?? {};
   let titleValue = local.title;
   let titleConflict = false;
   if (local.title === cloud.title) {
      titleValue = local.title;
   } else if (base !== null && local.title === base.title) {
      titleValue = cloud.title;
   } else if (base !== null && cloud.title === base.title) {
      titleValue = local.title;
   } else {
      titleConflict = true;
      titleValue = local.title;
   }
   let conflicts = titleConflict ? 1 : 0;
   const text: Array<{ field: string; result: TextMergeResult }> = [];
   for (const field of TEXT_FIELDS[kind]) {
      const baseText = base === null ? null : textField(baseFields, field);
      const localText = textField(localFields, field);
      const cloudText = textField(cloudFields, field);
      const result = baseText === null ? mergeTextNoBase(localText, cloudText) : mergeText(baseText, localText, cloudText);
      conflicts += result.conflicts;
      text.push({ field, result });
   }
   const json: Array<{ field: string; merged: unknown; conflicts: string[] }> = [];
   for (const field of JSON_FIELDS[kind]) {
      const hasBase = baseFields !== null && Object.prototype.hasOwnProperty.call(baseFields, field);
      const hasLocal = Object.prototype.hasOwnProperty.call(localFields, field);
      const hasCloud = Object.prototype.hasOwnProperty.call(cloudFields, field);
      const baseVal = baseFields && hasBase ? baseFields[field] : undefined;
      const localVal = hasLocal ? localFields[field] : undefined;
      const cloudVal = hasCloud ? cloudFields[field] : undefined;
      if (base === null) {
         if (deepEqual(localVal, cloudVal)) {
            json.push({ field, merged: localVal, conflicts: [] });
         } else {
            conflicts++;
            json.push({ field, merged: localVal, conflicts: [field] });
         }
         continue;
      }
      const merged = mergeJson(baseVal, localVal, cloudVal);
      conflicts += merged.conflicts.length;
      json.push({ field, merged: merged.merged, conflicts: merged.conflicts });
   }
   let snapshot: SyncSnapshot | null = null;
   if (conflicts === 0) {
      const fields: Record<string, unknown> = {};
      for (const entry of text) fields[entry.field] = entry.result.merged ?? '';
      for (const entry of json) fields[entry.field] = entry.merged;
      snapshot = buildSnapshot(kind, titleValue, fields);
   }
   return {
      title: { value: titleValue, conflict: titleConflict, local: local.title, cloud: cloud.title },
      text,
      json,
      snapshot,
      conflicts,
   };
}
