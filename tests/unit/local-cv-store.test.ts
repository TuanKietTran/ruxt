import { describe, expect, it } from "vitest";
import { createLocalCvStore } from "../../app/utils/localCvStore";

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
        expect(store.fork("a", "b")?.title).toBe("Role Copy");
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
