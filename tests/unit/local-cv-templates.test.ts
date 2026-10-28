import { describe, expect, it } from "vitest";
import { cloneLocalCvTemplate, LOCAL_CV_TEMPLATES_KEY, readLocalCvTemplates } from "../../app/utils/localCvTemplates";
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
