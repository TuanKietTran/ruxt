import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalCvStore } from "../../app/utils/localCvStore";
import { onLocalChange } from "../../app/utils/cloudSync/localChanges";
import type { LocalChange } from "../../app/utils/cloudSync/localChanges";

class MemoryStorage implements Storage {
    items = new Map<string, string>();
    blocked = false;
    get length() { return this.items.size; }
    key(index: number) { return [...this.items.keys()][index] ?? null; }
    getItem(key: string) { return this.items.get(key) ?? null; }
    setItem(key: string, value: string) { if (this.blocked) throw new Error("QuotaExceededError"); this.items.set(key, value); }
    removeItem(key: string) { if (this.blocked) throw new Error("Storage blocked"); this.items.delete(key); }
    clear() { this.items.clear(); }
}

describe("browser-local CV store", () => {
    it("loads existing pending backups without rewriting them or the unregistered draft", () => {
        const storage = new MemoryStorage();
        const raw = JSON.stringify({ markdown: "# Example", css: "", revision: 3, pending: true });
        storage.setItem("cv-sv:session-backup:old", raw);
        storage.setItem("cv-sv:new-session-draft", "draft untouched");
        storage.setItem("cv-sv:session-backup:broken", "{");
        const store = createLocalCvStore(() => storage);
        expect(store.list()).toEqual([expect.objectContaining({ id: "old", title: "Example", revision: 3 })]);
        expect(store.get("old")?.markdown).toBe("# Example");
        expect(storage.getItem("cv-sv:session-backup:old")).toBe(raw);
        expect(storage.getItem("cv-sv:new-session-draft")).toBe("draft untouched");
    });

    it("creates, edits, renames, forks and deletes locally", () => {
        const store = createLocalCvStore(() => newStorage);
        const newStorage = new MemoryStorage();
        expect(store.create({ id: "a", markdown: "# Example", css: "" })?.revision).toBe(1);
        expect(store.save("a", { markdown: "# Changed", css: "" })?.revision).toBe(2);
        expect(store.save("a", { markdown: "# Changed", css: "" })?.revision).toBe(2);
        const renamed = store.rename("a", "Role");
        expect(renamed?.revision).toBe(2);
        expect(store.fork("a", "b")?.title).toBe("Role (copy)");
        expect(store.get("b")?.markdown).toBe("# Changed");
        store.remove("a");
        expect(store.list().map(doc => doc.id)).toEqual(["b"]);
    });

    it("never overwrites an existing session during create", () => {
        const store = createLocalCvStore(() => storage);
        const storage = new MemoryStorage();
        store.create({ id: "a", markdown: "original", css: "" });
        expect(store.create({ id: "a", markdown: "replacement", css: "" })).toBeNull();
        expect(store.get("a")?.markdown).toBe("original");
        storage.setItem("cv-sv:session-backup:broken", "{");
        expect(store.create({ id: "broken", markdown: "replacement", css: "" })).toBeNull();
        expect(storage.getItem("cv-sv:session-backup:broken")).toBe("{");
    });

    it("refuses to replace an existing backup that cannot be parsed", () => {
        const storage = new MemoryStorage();
        const store = createLocalCvStore(() => storage);
        const original = "{not valid JSON";
        storage.setItem("cv-sv:session-backup:broken", original);
        expect(store.save("broken", { markdown: "replacement", css: "" })).toBeNull();
        expect(storage.getItem("cv-sv:session-backup:broken")).toBe(original);
    });

    it("reports quota/delete failures and keeps the previously stored copy", () => {
        const storage = new MemoryStorage();
        const store = createLocalCvStore(() => storage);
        store.create({ id: "a", markdown: "original", css: "" });
        storage.blocked = true;
        expect(store.save("a", { markdown: "still in editor", css: "" })).toBeNull();
        expect(store.get("a")?.markdown).toBe("original");
        expect(() => store.remove("a")).toThrow();
        expect(store.get("a")?.markdown).toBe("original");
    });
});

describe("local CV store cloud-sync behaviour", () => {
    const rawOf = (storage: MemoryStorage, id: string) => JSON.parse(storage.getItem("cv-sv:session-backup:" + id) ?? "null");
    const seed = (storage: MemoryStorage, id: string, extra: Record<string, unknown> = {}) => {
        storage.setItem("cv-sv:session-backup:" + id, JSON.stringify({ markdown: "# Old", css: "", title: "Old", revision: 3, pending: false, savedAt: 1700000000000, ...extra }));
    };

    it("preserves unknown fields and drops cloudApplied on a local save", () => {
        const storage = new MemoryStorage();
        seed(storage, "a", { cloudApplied: true, customField: "keep-me", customNumber: 42 });
        const store = createLocalCvStore(() => storage);
        const saved = store.save("a", { markdown: "# New", css: "" });
        expect(saved?.revision).toBe(4);
        expect(saved?.markdown).toBe("# New");
        const raw = rawOf(storage, "a");
        expect(raw.customField).toBe("keep-me");
        expect(raw.customNumber).toBe(42);
        expect("cloudApplied" in raw).toBe(false);
        expect(raw.syncConflict).toBeUndefined();
    });

    it("flags a stale cloud-applied save as conflicted without losing the edit", () => {
        const storage = new MemoryStorage();
        seed(storage, "a", { cloudApplied: true });
        seed(storage, "b", { cloudApplied: true });
        seed(storage, "c", {});
        const store = createLocalCvStore(() => storage);
        const stale = store.save("a", { markdown: "# Stale edit", css: "" }, { baseRevision: 2 });
        expect(stale?.markdown).toBe("# Stale edit");
        expect(stale?.revision).toBe(4);
        expect(rawOf(storage, "a").syncConflict).toBe(true);
        expect("cloudApplied" in rawOf(storage, "a")).toBe(false);
        store.save("b", { markdown: "# Fresh edit", css: "" }, { baseRevision: 3 });
        expect(rawOf(storage, "b").syncConflict).toBeUndefined();
        store.save("c", { markdown: "# Local edit", css: "" }, { baseRevision: 1 });
        expect(rawOf(storage, "c").syncConflict).toBeUndefined();
    });

    describe("local-change emissions", () => {
        beforeEach(() => { vi.stubGlobal("window", new EventTarget()); });
        afterEach(() => { vi.unstubAllGlobals(); });

        it("emits on create, changing save, rename, put, fork and remove, but not on a no-op save", () => {
            const seen: LocalChange[] = [];
            const off = onLocalChange(change => { seen.push(change); });
            const storage = new MemoryStorage();
            const store = createLocalCvStore(() => storage);
            store.create({ id: "a", markdown: "# One", css: "" });
            store.save("a", { markdown: "# Two", css: "" });
            store.save("a", { markdown: "# Two", css: "" });
            store.rename("a", "Renamed");
            store.put({ id: "a", title: "Renamed", markdown: "# Three", css: "", revision: 4, updatedAt: new Date().toISOString() });
            store.fork("a", "b");
            store.remove("a");
            off();
            expect(seen).toEqual([
                { kind: "session", id: "a", origin: "local" },
                { kind: "session", id: "a", origin: "local" },
                { kind: "session", id: "a", origin: "local" },
                { kind: "session", id: "a", origin: "local" },
                { kind: "session", id: "b", origin: "local" },
                { kind: "session", id: "a", origin: "local" },
            ]);
        });

        it("emits nothing when a write fails", () => {
            const seen: LocalChange[] = [];
            const off = onLocalChange(change => { seen.push(change); });
            const storage = new MemoryStorage();
            const store = createLocalCvStore(() => storage);
            store.create({ id: "a", markdown: "# One", css: "" });
            storage.blocked = true;
            expect(store.save("a", { markdown: "# Two", css: "" })).toBeNull();
            off();
            expect(seen).toEqual([{ kind: "session", id: "a", origin: "local" }]);
        });
    });
});
