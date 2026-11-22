import { describe, expect, it } from 'vitest';
import {
   buildSnapshot,
   diffLines,
   mergeJson,
   mergeSnapshots,
   mergeText,
   parseSnapshotFields,
   renderMerge,
} from '../../app/utils/cloudSync/merge';

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const CRLF = CR + NL;

function session(title: string, markdown: string, css: string) {
   return buildSnapshot('session', title, { markdown, css });
}

describe('diffLines', () => {
   it('returns all equal ops for identical inputs', () => {
      expect(diffLines(['a', 'b', 'c'].join(NL), ['a', 'b', 'c'].join(NL))).toEqual([
         { op: 'equal', text: 'a' },
         { op: 'equal', text: 'b' },
         { op: 'equal', text: 'c' },
      ]);
   });

   it('marks inserts and deletes', () => {
      expect(diffLines(['a', 'c'].join(NL), ['a', 'b', 'c'].join(NL))).toEqual([
         { op: 'equal', text: 'a' },
         { op: 'insert', text: 'b' },
         { op: 'equal', text: 'c' },
      ]);
      expect(diffLines(['a', 'b', 'c'].join(NL), ['a', 'c'].join(NL))).toEqual([
         { op: 'equal', text: 'a' },
         { op: 'delete', text: 'b' },
         { op: 'equal', text: 'c' },
      ]);
   });

   it('replaces one line with a minimal delete plus insert', () => {
      expect(diffLines(['a', 'b', 'c'].join(NL), ['a', 'x', 'c'].join(NL))).toEqual([
         { op: 'equal', text: 'a' },
         { op: 'delete', text: 'b' },
         { op: 'insert', text: 'x' },
         { op: 'equal', text: 'c' },
      ]);
   });

   it('handles empty inputs', () => {
      expect(diffLines('', '')).toEqual([]);
      expect(diffLines('', 'a')).toEqual([{ op: 'insert', text: 'a' }]);
      expect(diffLines('a', '')).toEqual([{ op: 'delete', text: 'a' }]);
   });
});

describe('mergeText clean merges', () => {
   it('merges identical inputs unchanged', () => {
      const text = ['a', 'b', 'c'].join(NL);
      const result = mergeText(text, text, text);
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(text);
      expect(result.hunks).toEqual([{ kind: 'clean', lines: ['a', 'b', 'c'] }]);
   });

   it('takes a one-sided local edit', () => {
      const result = mergeText(['a', 'b', 'c'].join(NL), ['a', 'B', 'c'].join(NL), ['a', 'b', 'c'].join(NL));
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(['a', 'B', 'c'].join(NL));
   });

   it('takes a one-sided cloud edit', () => {
      const result = mergeText(['a', 'b', 'c'].join(NL), ['a', 'b', 'c'].join(NL), ['a', 'b', 'C'].join(NL));
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(['a', 'b', 'C'].join(NL));
   });

   it('merges edits on different lines', () => {
      const result = mergeText(['a', 'b', 'c', 'd'].join(NL), ['a', 'B', 'c', 'd'].join(NL), ['a', 'b', 'c', 'D'].join(NL));
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(['a', 'B', 'c', 'D'].join(NL));
      expect(result.hunks).toEqual([{ kind: 'clean', lines: ['a', 'B', 'c', 'D'] }]);
   });

   it('takes the same edit on both sides once', () => {
      const result = mergeText(['a', 'b', 'c'].join(NL), ['a', 'X', 'c'].join(NL), ['a', 'X', 'c'].join(NL));
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(['a', 'X', 'c'].join(NL));
      expect(result.hunks).toEqual([{ kind: 'clean', lines: ['a', 'X', 'c'] }]);
   });

   it('reports overlapping edits as one conflict with null merged text', () => {
      const result = mergeText(['a', 'b', 'c'].join(NL), ['a', 'B1', 'c'].join(NL), ['a', 'B2', 'c'].join(NL));
      expect(result.conflicts).toBe(1);
      expect(result.merged).toBeNull();
      expect(result.hunks).toEqual([
         { kind: 'clean', lines: ['a'] },
         { kind: 'conflict', base: ['b'], local: ['B1'], cloud: ['B2'] },
         { kind: 'clean', lines: ['c'] },
      ]);
   });
});
describe('mergeText boundary inserts', () => {
   it('merges inserts at different spots', () => {
      const result = mergeText(
         ['a', 'b', 'c', 'd'].join(NL),
         ['a', 'X', 'b', 'c', 'd'].join(NL),
         ['a', 'b', 'c', 'Y', 'd'].join(NL)
      );
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(['a', 'X', 'b', 'c', 'Y', 'd'].join(NL));
   });

   it('reports inserts at the same spot as one conflict', () => {
      const result = mergeText(['a', 'b'].join(NL), ['a', 'X', 'b'].join(NL), ['a', 'Y', 'b'].join(NL));
      expect(result.conflicts).toBe(1);
      expect(result.merged).toBeNull();
      expect(result.hunks[1]).toEqual({ kind: 'conflict', base: [], local: ['X'], cloud: ['Y'] });
   });

   it('keeps CRLF line endings on a one-sided edit', () => {
      const base = ['a', 'b', 'c'].join(CRLF);
      const local = ['a', 'B', 'c'].join(CRLF);
      const result = mergeText(base, local, base);
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(local);
   });

   it('merges identical CRLF inputs unchanged', () => {
      const text = ['a', 'b', 'c'].join(CRLF);
      const result = mergeText(text, text, text);
      expect(result.conflicts).toBe(0);
      expect(result.merged).toBe(text);
   });
});

describe('renderMerge', () => {
   const conflict = mergeText(['a', 'b', 'c'].join(NL), ['a', 'B1', 'c'].join(NL), ['a', 'B2', 'c'].join(NL));

   it('renders the local side', () => {
      expect(renderMerge(conflict.hunks, ['local'])).toBe(['a', 'B1', 'c'].join(NL));
   });

   it('renders the cloud side', () => {
      expect(renderMerge(conflict.hunks, ['cloud'])).toBe(['a', 'B2', 'c'].join(NL));
   });

   it('renders both sides in order', () => {
      expect(renderMerge(conflict.hunks, ['both'])).toBe(['a', 'B1', 'B2', 'c'].join(NL));
   });

   it('defaults to local when no choice is given', () => {
      expect(renderMerge(conflict.hunks, [])).toBe(['a', 'B1', 'c'].join(NL));
   });
});

describe('mergeJson', () => {
   it('merges edits to different keys', () => {
      const result = mergeJson({ a: 1, b: 2 }, { a: 1, b: 3 }, { a: 9, b: 2 });
      expect(result.conflicts).toEqual([]);
      expect(result.merged).toEqual({ a: 9, b: 3 });
   });

   it('reports the same key edited both ways as a conflict keeping local', () => {
      const result = mergeJson({ a: 1 }, { a: 2 }, { a: 3 });
      expect(result.conflicts).toEqual(['a']);
      expect(result.merged).toEqual({ a: 2 });
   });

   it('merges nested objects key by key', () => {
      const result = mergeJson({ o: { x: 1, y: 1 } }, { o: { x: 2, y: 1 } }, { o: { x: 1, y: 2 } });
      expect(result.conflicts).toEqual([]);
      expect(result.merged).toEqual({ o: { x: 2, y: 2 } });
   });

   it('keeps a delete when the other side did not touch the key', () => {
      const result = mergeJson({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 });
      expect(result.conflicts).toEqual([]);
      expect(result.merged).toEqual({ a: 1 });
   });

   it('reports delete versus edit as a conflict', () => {
      const result = mergeJson({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 3 });
      expect(result.conflicts).toEqual(['b']);
      expect(result.merged).toEqual({ a: 1 });
   });

   it('reports a key added on both sides with different values', () => {
      const result = mergeJson({}, { n: 1 }, { n: 2 });
      expect(result.conflicts).toEqual(['n']);
      expect(result.merged).toEqual({ n: 1 });
   });

   it('treats arrays as scalars', () => {
      const result = mergeJson({ list: [1] }, { list: [1, 2] }, { list: [1, 3] });
      expect(result.conflicts).toEqual(['list']);
      expect(result.merged).toEqual({ list: [1, 2] });
   });
});

describe('buildSnapshot and parseSnapshotFields', () => {
   it('round-trips a session snapshot', () => {
      const snap = buildSnapshot('session', 'T', { markdown: '# hi', css: 'a{}' });
      expect(JSON.parse(snap.content).schema).toBe('ruxt.session/1');
      expect(parseSnapshotFields('session', snap)).toEqual({ markdown: '# hi', css: 'a{}' });
   });

   it('round-trips a template snapshot', () => {
      const snap = buildSnapshot('template', 'Tpl', {
         markdownSkeleton: '# s',
         css: 'b{}',
         capabilities: { x: 1 },
         tags: ['a', 'b'],
      });
      expect(parseSnapshotFields('template', snap)).toEqual({
         markdownSkeleton: '# s',
         css: 'b{}',
         capabilities: { x: 1 },
         tags: ['a', 'b'],
      });
   });

   it('round-trips a profile snapshot', () => {
      const snap = buildSnapshot('profile', 'P', { profile: { name: 'Kyle', level: 3 } });
      expect(parseSnapshotFields('profile', snap)).toEqual({ profile: { name: 'Kyle', level: 3 } });
   });

   it('returns null for bad JSON and for a wrong schema', () => {
      expect(parseSnapshotFields('session', { title: 'x', content: 'not json' })).toBeNull();
      const snap = buildSnapshot('session', 'T', { markdown: 'm', css: '' });
      expect(parseSnapshotFields('template', snap)).toBeNull();
   });
});

describe('mergeSnapshots', () => {
   it('merges a clean session and builds the snapshot', () => {
      const base = session('T', ['a', 'b', 'c'].join(NL), '');
      const local = session('T', ['a', 'B', 'c'].join(NL), '');
      const cloud = session('T', ['a', 'b', 'C'].join(NL), '');
      const result = mergeSnapshots('session', base, local, cloud);
      expect(result.conflicts).toBe(0);
      expect(result.title.conflict).toBe(false);
      expect(result.snapshot).not.toBeNull();
      expect(parseSnapshotFields('session', result.snapshot as never)).toEqual({ markdown: ['a', 'B', 'C'].join(NL), css: '' });
   });

   it('reports a title conflict and builds no snapshot', () => {
      const base = session('T', 'm', '');
      const local = session('T-local', 'm', '');
      const cloud = session('T-cloud', 'm', '');
      const result = mergeSnapshots('session', base, local, cloud);
      expect(result.title.conflict).toBe(true);
      expect(result.title.value).toBe('T-local');
      expect(result.conflicts).toBe(1);
      expect(result.snapshot).toBeNull();
   });

   it('takes a one-sided title change', () => {
      const base = session('T', 'm', '');
      const local = session('T2', 'm', '');
      const cloud = session('T', 'm', '');
      const result = mergeSnapshots('session', base, local, cloud);
      expect(result.title.conflict).toBe(false);
      expect(result.title.value).toBe('T2');
      expect(result.conflicts).toBe(0);
      expect(result.snapshot).not.toBeNull();
   });

   it('merges identical snapshots with no base', () => {
      const local = session('T', ['a', 'b'].join(NL), '');
      const result = mergeSnapshots('session', null, local, local);
      expect(result.conflicts).toBe(0);
      expect(result.snapshot).not.toBeNull();
   });

   it('reports differing snapshots with no base as a conflict', () => {
      const local = session('T', ['a', 'b'].join(NL), '');
      const cloud = session('T', ['a', 'c'].join(NL), '');
      const result = mergeSnapshots('session', null, local, cloud);
      expect(result.conflicts).toBeGreaterThan(0);
      expect(result.snapshot).toBeNull();
   });

   it('merges template JSON fields cleanly', () => {
      const base = buildSnapshot('template', 'Tpl', { markdownSkeleton: 's', css: '', capabilities: { a: 1 }, tags: [] });
      const local = buildSnapshot('template', 'Tpl', { markdownSkeleton: 's', css: '', capabilities: { a: 2 }, tags: [] });
      const cloud = buildSnapshot('template', 'Tpl', { markdownSkeleton: 's', css: '', capabilities: { a: 1 }, tags: [] });
      const result = mergeSnapshots('template', base, local, cloud);
      expect(result.conflicts).toBe(0);
      expect(result.json).toEqual([
         { field: 'capabilities', merged: { a: 2 }, conflicts: [] },
         { field: 'tags', merged: [], conflicts: [] },
      ]);
   });
});

describe('mergeText performance', () => {
   it('merges 5000 lines with two distant edits in under 500 ms', () => {
      const lines = Array.from({ length: 5000 }, (_v, i) => 'line ' + i);
      const localLines = lines.slice();
      localLines[2500] = 'local edit';
      const cloudLines = lines.slice();
      cloudLines[4000] = 'cloud edit';
      const start = Date.now();
      const result = mergeText(lines.join(NL), localLines.join(NL), cloudLines.join(NL));
      const duration = Date.now() - start;
      expect(result.conflicts).toBe(0);
      expect(result.merged).toContain('local edit');
      expect(result.merged).toContain('cloud edit');
      expect(duration).toBeLessThan(500);
   });
});
