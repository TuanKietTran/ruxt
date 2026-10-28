import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCvDocument, getCvDocument, listCvDocuments, peekCvDocument, renameCvDocument, updateCvDocument } from "../../server/adapters/cv/document-store";

const id = "abc123abc123abc123abc123abc123ab";
let items: Map<string, unknown>;
let writes: number;
let lists: number;
let meta: Record<string, unknown>;
beforeEach(() => {
    items = new Map();
    writes = 0;
    lists = 0;
    meta = {};
    vi.stubGlobal("useStorage", () => ({
        getItem: async (key: string) => structuredClone(items.get(key)),
        setItem: async (key: string, value: unknown) => { writes++; items.set(key, structuredClone(value)); },
        hasItem: async (key: string) => items.has(key),
        getKeys: async (prefix: string) => { lists++; return [...items.keys()].filter(key => key.startsWith(prefix)); },
        getMeta: async () => meta,
    }));
    vi.stubGlobal("createError", (input: object) => Object.assign(new Error(), input));
});
afterEach(() => vi.unstubAllGlobals());

// Current sources use explicit resume/name indicators; they need no legacy migration.
const source = { markdown: ":::resume\n\n# Ada {.cv-name}\n\nEngineer\n\n:::", css: ".resume { color: black; }" };
describe("CV content activity", () => {
    it("repeated opens and listings do not write, bump revision or change activity", async () => {
        const initial = await createCvDocument(id, source);
        const initialWrites = writes;
        for (let i = 0; i < 3; i++) {
            expect((await getCvDocument(id)).toJSON()).toEqual(initial.toJSON());
            expect(await listCvDocuments()).toEqual([{ id, title: "Ada", revision: 1, updatedAt: initial.updatedAt }]);
        }
        expect(writes).toBe(initialWrites);
    });

    it("rename changes only title and preserves source revision and activity", async () => {
        const initial = await createCvDocument(id, source);
        const renamed = await renameCvDocument(id, "Tailored role");
        expect(renamed.toJSON()).toEqual({ ...initial.toJSON(), title: "Tailored role" });
    });

    it("a concurrent rename never overwrites a queued source edit", async () => {
        await createCvDocument(id, source);
        const edited = updateCvDocument(id, { markdown: "# Changed {.cv-name}", expectedRevision: 1 });
        const renamed = renameCvDocument(id, "New name");
        await Promise.all([edited, renamed]);
        expect((await getCvDocument(id)).toJSON()).toMatchObject({ title: "New name", markdown: "# Changed {.cv-name}", revision: 2 });
    });

    it("legacy source migration is a one-time revision change, not repeated autosave", async () => {
        items.set(`documents:${id}`, { id, title: "Legacy", markdown: "# Ada\n\nEngineer", css: ".cv-sheet { color: black; }", revision: 4, updatedAt: "2026-01-01T00:00:00.000Z" });
        const migrated = await getCvDocument(id);
        expect(migrated.revision).toBe(5);
        const initialWrites = writes;
        expect((await getCvDocument(id)).toJSON()).toEqual(migrated.toJSON());
        await listCvDocuments();
        expect(writes).toBe(initialWrites);
    });

    it("lists storage keys once when no legacy session needs a new route", async () => {
        await createCvDocument(id, source);
        lists = 0;
        await listCvDocuments();
        expect(lists).toBe(1);
    });

    it("peeks the validator fields from storage metadata and reports when the driver has none", async () => {
        expect(await peekCvDocument(id)).toBeUndefined();
        meta = { revision: 7, updatedAt: "2026-10-28T00:00:00.000Z", title: "Ada" };
        expect(await peekCvDocument(id)).toEqual({ revision: 7, updatedAt: "2026-10-28T00:00:00.000Z", title: "Ada" });
    });
});
