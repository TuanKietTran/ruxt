import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitLocalChange, isEditorDirty, isEditorOpen, onLocalChange, registerOpenEditor } from '../../app/utils/cloudSync/localChanges';
import type { LocalChange } from '../../app/utils/cloudSync/localChanges';

describe('cloud sync local change bus', () => {
    beforeEach(() => { vi.stubGlobal('window', new EventTarget()); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('delivers the exact change to every listener', () => {
        const seenA: LocalChange[] = [];
        const seenB: LocalChange[] = [];
        const offA = onLocalChange(change => { seenA.push(change); });
        const offB = onLocalChange(change => { seenB.push(change); });
        emitLocalChange({ kind: 'template', id: 't1', origin: 'cloud' });
        expect(seenA).toEqual([{ kind: 'template', id: 't1', origin: 'cloud' }]);
        expect(seenB).toEqual(seenA);
        offA();
        offB();
    });

    it('stops delivering after unsubscribe', () => {
        const seen: LocalChange[] = [];
        const off = onLocalChange(change => { seen.push(change); });
        off();
        emitLocalChange({ kind: 'session', id: 's1', origin: 'local' });
        expect(seen).toEqual([]);
    });

    it('is a no-op without a window and its unsubscribe is safe to call', () => {
        vi.unstubAllGlobals();
        expect(() => emitLocalChange({ kind: 'profile', id: '*', origin: 'local' })).not.toThrow();
        const off = onLocalChange(() => { throw new Error('must not be called'); });
        expect(() => off()).not.toThrow();
    });

    it('tracks open editors and reports dirtiness per record', () => {
        expect(isEditorOpen('session', 'ed1')).toBe(false);
        expect(isEditorDirty('session', 'ed1')).toBe(false);
        let dirty = false;
        const unregister = registerOpenEditor('session', 'ed1', () => dirty);
        expect(isEditorOpen('session', 'ed1')).toBe(true);
        expect(isEditorDirty('session', 'ed1')).toBe(false);
        expect(isEditorDirty('session', 'other')).toBe(false);
        expect(isEditorDirty('template', 'ed1')).toBe(false);
        dirty = true;
        expect(isEditorDirty('session', 'ed1')).toBe(true);
        unregister();
        expect(isEditorOpen('session', 'ed1')).toBe(false);
        expect(isEditorDirty('session', 'ed1')).toBe(false);
    });

    it('is dirty when any probe for the record is dirty, and clean when all are clean', () => {
        let first = false;
        let second = true;
        const offFirst = registerOpenEditor('session', 'ed2', () => first);
        const offSecond = registerOpenEditor('session', 'ed2', () => second);
        expect(isEditorDirty('session', 'ed2')).toBe(true);
        second = false;
        expect(isEditorDirty('session', 'ed2')).toBe(false);
        first = true;
        expect(isEditorDirty('session', 'ed2')).toBe(true);
        offFirst();
        expect(isEditorDirty('session', 'ed2')).toBe(false);
        expect(isEditorOpen('session', 'ed2')).toBe(true);
        offSecond();
        expect(isEditorOpen('session', 'ed2')).toBe(false);
    });

    it('treats a throwing probe as dirty rather than crashing', () => {
        const unregister = registerOpenEditor('session', 'ed3', () => { throw new Error('probe failed'); });
        expect(isEditorDirty('session', 'ed3')).toBe(true);
        unregister();
        expect(isEditorDirty('session', 'ed3')).toBe(false);
    });
});
