import { afterEach, describe, expect, it, vi } from "vitest";
import { createCvDocument, deleteCvDocument, forkCvDocument, getCvDocument, listCvDocuments, peekCvDocument, renameCvDocument, updateCvDocument } from "../../server/adapters/cv/document-store";

// PR1 retires the shared server store rather than assigning ownerless data to any account.
afterEach(() => vi.unstubAllGlobals());
describe("retired server CV store", () => {
    it("omits all legacy data and never reads or modifies storage", async () => {
        const storage = vi.fn(() => { throw new Error("Legacy storage must not be opened"); });
        vi.stubGlobal("useStorage", storage);
        vi.stubGlobal("createError", (input: object) => Object.assign(new Error(), input));
        expect(await listCvDocuments()).toEqual([]);
        expect(await peekCvDocument("master")).toBeUndefined();
        for (const id of ["master", "legacy", "other-owner", "missing"]) {
            await expect(getCvDocument(id)).rejects.toMatchObject({ statusCode: 404 });
            await expect(updateCvDocument(id, { markdown: "synthetic" })).rejects.toMatchObject({ statusCode: 404 });
            await expect(renameCvDocument(id, "Synthetic")).rejects.toMatchObject({ statusCode: 404 });
            await expect(deleteCvDocument(id)).rejects.toMatchObject({ statusCode: 404 });
            await expect(forkCvDocument(id, "copy")).rejects.toMatchObject({ statusCode: 404 });
            await expect(createCvDocument(id, { markdown: "synthetic", css: "" })).rejects.toMatchObject({ statusCode: 404 });
        }
        expect(storage).not.toHaveBeenCalled();
    });
});
