import { describe, expect, it } from "vitest";
import {
    cloneLocalCvTemplate, exportLocalCvTemplate, importLocalCvTemplate, LOCAL_CV_TEMPLATES_KEY, LOCAL_TEMPLATE_MAX_BYTES,
    readLocalCvTemplates, removeLocalCvTemplate, renameLocalCvTemplate, saveLocalCvTemplate, TEMPLATE_EXPORT_SCHEMA,
} from "../../app/utils/localCvTemplates";
import { toCvTemplateSkeleton } from "@ruxt/shared/cv";
import { isImportCvTemplate, isPublicCvTemplate } from "../../server/utils/cv-template-visibility";
import { makeTemplate } from "../helpers/fakes";

describe("local private templates", () => {
    it("clones and reloads a private copy without changing the source", () => {
        const items = new Map<string, string>();
        const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
        const source = makeTemplate({ tags: ["public"] });
        const clone = cloneLocalCvTemplate(source, "local-copy", storage);
        expect(clone.tags).toEqual(["local"]);
        expect(clone.builtIn).toBe(false);
        expect(source.tags).toEqual(["public"]);
        expect(readLocalCvTemplates(storage).map(template => template.id)).toEqual(["local-copy"]);
        expect(() => cloneLocalCvTemplate(source, "local-copy", storage)).toThrow();
        const previous = storage.getItem(LOCAL_CV_TEMPLATES_KEY);
        storage.setItem = () => { throw new Error("QuotaExceededError"); };
        expect(() => cloneLocalCvTemplate(source, "another-copy", storage)).toThrow();
        expect(storage.getItem(LOCAL_CV_TEMPLATES_KEY)).toBe(previous);
    });

    it("allows public templates and only the exact internal import seed", () => {
        expect(isPublicCvTemplate(makeTemplate({ tags: ["public"] }))).toBe(true);
        expect(isPublicCvTemplate(makeTemplate({ tags: ["public", "internal"] }))).toBe(false);
        expect(isImportCvTemplate(makeTemplate({ tags: ["local"] }))).toBe(false);
        expect(isImportCvTemplate(makeTemplate({ id: "pipeline-default", version: 1, tags: ["internal"] }))).toBe(true);
        expect(isImportCvTemplate(makeTemplate({ id: "pipeline-default", version: 2, tags: ["internal"] }))).toBe(false);
        expect(isImportCvTemplate(makeTemplate({ id: "other-internal", tags: ["internal"] }))).toBe(false);
    });
});

describe("managing private templates", () => {
    const memory = () => {
        const items = new Map<string, string>();
        return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, items };
    };

    it("saves a CV's structure as a private template without its personal text", () => {
        const storage = memory();
        const skeleton = toCvTemplateSkeleton(":::resume\n\n# Ada Lovelace {.cv-name}\n\n## Experience\n\n- Built the Analytical Engine\n\n:::\n");
        const template = saveLocalCvTemplate({ name: "  My   layout ", markdownSkeleton: skeleton, css: ".resume {}" }, storage);
        expect(template).toMatchObject({ name: "My layout", version: 1, builtIn: false, tags: ["local"] });
        expect(skeleton).not.toContain("Ada Lovelace");
        expect(skeleton).toContain("## Experience");
        expect(readLocalCvTemplates(storage).map(item => item.id)).toEqual([template.id]);
    });

    it("refuses an empty name, a duplicate id and oversized content, leaving the list unchanged", () => {
        const storage = memory();
        const first = saveLocalCvTemplate({ name: "One", markdownSkeleton: "# A", css: "" }, storage);
        const before = storage.getItem(LOCAL_CV_TEMPLATES_KEY);
        expect(() => saveLocalCvTemplate({ name: "   ", markdownSkeleton: "# A", css: "" }, storage)).toThrow(/needs a name/);
        expect(() => saveLocalCvTemplate({ name: "x".repeat(121), markdownSkeleton: "# A", css: "" }, storage)).toThrow(/120/);
        expect(() => saveLocalCvTemplate({ id: first.id, name: "Dup", markdownSkeleton: "# A", css: "" }, storage)).toThrow(/already exists/);
        expect(() => saveLocalCvTemplate({ name: "Big", markdownSkeleton: "x".repeat(LOCAL_TEMPLATE_MAX_BYTES + 1), css: "" }, storage)).toThrow(/512 KiB/);
        expect(storage.getItem(LOCAL_CV_TEMPLATES_KEY)).toBe(before);
    });

    it("renames and removes only private templates, never built-in ones", () => {
        const storage = memory();
        const mine = saveLocalCvTemplate({ name: "Mine", markdownSkeleton: "# A", css: "a{}" }, storage);
        const other = saveLocalCvTemplate({ name: "Other", markdownSkeleton: "# B", css: "b{}" }, storage);
        const builtIn = makeTemplate({ id: "built-in-1", builtIn: true, tags: ["public"] }).toJSON();
        storage.setItem(LOCAL_CV_TEMPLATES_KEY, JSON.stringify([...JSON.parse(storage.getItem(LOCAL_CV_TEMPLATES_KEY)!), builtIn]));

        expect(renameLocalCvTemplate(mine.id, " Renamed ", storage)).toMatchObject({ id: mine.id, name: "Renamed", version: 1, markdownSkeleton: "# A" });
        expect(() => renameLocalCvTemplate("built-in-1", "Nope", storage)).toThrow(/not a private template/);
        expect(() => renameLocalCvTemplate("missing", "Nope", storage)).toThrow(/not a private template/);

        removeLocalCvTemplate(mine.id, storage);
        expect(readLocalCvTemplates(storage).map(item => item.id)).toEqual([other.id, "built-in-1"]);
        expect(() => removeLocalCvTemplate("built-in-1", storage)).toThrow(/not a private template/);
        expect(() => removeLocalCvTemplate(mine.id, storage)).toThrow(/not a private template/);
    });

    it("keeps the previous list when the browser refuses a write", () => {
        const storage = memory();
        const mine = saveLocalCvTemplate({ name: "Mine", markdownSkeleton: "# A", css: "" }, storage);
        const before = storage.getItem(LOCAL_CV_TEMPLATES_KEY);
        storage.setItem = () => { throw new Error("QuotaExceededError"); };
        expect(() => renameLocalCvTemplate(mine.id, "New", storage)).toThrow();
        expect(() => removeLocalCvTemplate(mine.id, storage)).toThrow();
        expect(storage.getItem(LOCAL_CV_TEMPLATES_KEY)).toBe(before);
    });

    it("round-trips through an export file as a new template and rejects anything else", () => {
        const source = memory();
        const original = saveLocalCvTemplate({ name: "Portable", markdownSkeleton: "# Name\n\n## Skills\n", css: ".resume { color: red; }" }, source);
        const file = exportLocalCvTemplate(original);
        expect(JSON.parse(file)).toMatchObject({ schema: TEMPLATE_EXPORT_SCHEMA, name: "Portable" });
        expect(JSON.parse(file).id).toBeUndefined();

        const target = memory();
        const imported = importLocalCvTemplate(file, target);
        expect(imported).toMatchObject({ name: "Portable", markdownSkeleton: original.markdownSkeleton, css: original.css, version: 1, tags: ["local"] });
        expect(imported.id).not.toBe(original.id);
        // Importing twice adds a second template; nothing is overwritten.
        importLocalCvTemplate(file, target);
        expect(readLocalCvTemplates(target)).toHaveLength(2);

        for (const bad of ["not json", "{}", JSON.stringify({ schema: "other/1", name: "x", markdownSkeleton: "", css: "" }), JSON.stringify({ schema: TEMPLATE_EXPORT_SCHEMA, name: 5, markdownSkeleton: "", css: "" })]) {
            expect(() => importLocalCvTemplate(bad, memory())).toThrow(/Ruxt template export|missing/);
        }
        expect(() => importLocalCvTemplate("x".repeat(LOCAL_TEMPLATE_MAX_BYTES * 2 + 1), memory())).toThrow(/too large/);
    });
});

