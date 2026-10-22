import { describe, expect, it } from "vitest";
import { mapProfileApplyResults, profileApplyErrorMessage, type ProfileApplyResponse } from "../../app/utils/profileApplyResults";
import type { CvDocumentProps } from "@core/domain/cv";

const document: CvDocumentProps = {
    id: "session-1", title: "Example", markdown: "placeholder", css: "", revision: 2, updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("profile apply response mapping", () => {
    it("maps an empty successful response to no visible results", () => {
        const response: ProfileApplyResponse = { results: [], applied: 0, failed: 0 };
        expect(mapProfileApplyResults(response)).toEqual({});
    });

    it("preserves the successful label and document payload for all-success responses", () => {
        const response: ProfileApplyResponse = {
            results: [{ documentId: "session-1", ok: true, document }], applied: 1, failed: 0,
        };
        expect(mapProfileApplyResults(response)).toEqual({ "session-1": { ok: true, message: "Applied" } });
        expect(response.results[0]).toMatchObject({ ok: true, document: { revision: 2 } });
    });

    it("preserves per-session error messages in partial failures", () => {
        const response: ProfileApplyResponse = {
            results: [
                { documentId: "session-1", ok: true, document },
                { documentId: "session-2", ok: false, error: "Revision conflict" },
            ], applied: 1, failed: 1,
        };
        expect(mapProfileApplyResults(response)).toEqual({
            "session-1": { ok: true, message: "Applied" },
            "session-2": { ok: false, message: "Revision conflict" },
        });
    });

    it("preserves API error, Error.message, and fallback messages", () => {
        expect(profileApplyErrorMessage({ data: { statusMessage: "Rejected by server" }, message: "other" })).toBe("Rejected by server");
        expect(profileApplyErrorMessage(new Error("Network failed"))).toBe("Network failed");
        expect(profileApplyErrorMessage(null)).toBe("Apply failed.");
    });
});
