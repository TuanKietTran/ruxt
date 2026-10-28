import { describe, expect, it } from "vitest";
import { cvDocumentEtag } from "../../shared/utils/cvDocumentEtag";

const document = { revision: 4, updatedAt: "2026-10-28T10:00:00.000Z", title: "Ada" };

describe("CV document ETag", () => {
    it("is a quoted strong validator that is stable for one representation", () => {
        expect(cvDocumentEtag(document)).toMatch(/^"4-[0-9a-z]+"$/);
        expect(cvDocumentEtag({ ...document })).toBe(cvDocumentEtag(document));
    });

    it("changes with a save, a rename or a recreation", () => {
        const etag = cvDocumentEtag(document);
        expect(cvDocumentEtag({ ...document, revision: 5 })).not.toBe(etag);
        expect(cvDocumentEtag({ ...document, title: "Ada Lovelace" })).not.toBe(etag);
        expect(cvDocumentEtag({ ...document, updatedAt: "2026-10-28T10:00:01.000Z" })).not.toBe(etag);
    });
});
