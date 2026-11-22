import { describe, expect, it } from "vitest";
import { cvLabel, sendResultMessage, splitReason, submitMode } from "../../app/utils/jobsView";

const grant = (capability: string, method: string, permitted = true) => ({ capability, method, permitted });

describe("submitMode", () => {
    it("is automated only for a permitted authorized-API submit grant", () => {
        expect(submitMode({ policy: { capabilities: [grant("discoverJobs", "public_api"), grant("submitApplication", "authorized_api")] } })).toBe("automated");
    });

    it("is a handoff for every other source, including unknown ones", () => {
        // Regression (2026-11-22): the Mock ATS, whose submit grant is an authorized API, was shown
        // "does not permit automated submission" with a manual "I submitted this application" form.
        expect(submitMode({ policy: { capabilities: [grant("submitApplication", "handoff")] } })).toBe("handoff");
        expect(submitMode({ policy: { capabilities: [grant("submitApplication", "authorized_api", false)] } })).toBe("handoff");
        expect(submitMode({ policy: { capabilities: [grant("discoverJobs", "authorized_api")] } })).toBe("handoff");
        expect(submitMode({ policy: { capabilities: [] } })).toBe("handoff");
        expect(submitMode(null)).toBe("handoff");
        expect(submitMode(undefined)).toBe("handoff");
    });
});

describe("cvLabel", () => {
    it("shows the title and revision, not the UUID", () => {
        expect(cvLabel("344a2c6e-d813-4b61-9918-0e25dadb681b", 2, { "344a2c6e-d813-4b61-9918-0e25dadb681b": " Backend CV " })).toBe("Backend CV · rev 2");
    });

    it("falls back to a short id for a CV that is not in this browser", () => {
        expect(cvLabel("344a2c6e-d813-4b61-9918-0e25dadb681b", 2, {})).toBe("CV 344a2c6e · rev 2");
        expect(cvLabel("344a2c6e-d813-4b61-9918-0e25dadb681b", null, { "344a2c6e-d813-4b61-9918-0e25dadb681b": "" })).toBe("CV 344a2c6e");
    });

    it("shows a dash when no CV was selected", () => {
        expect(cvLabel(null, null, {})).toBe("—");
        expect(cvLabel(undefined, 3, {})).toBe("—");
    });
});

describe("sendResultMessage", () => {
    it("reports what the send changed, including re-evaluated applications", () => {
        expect(sendResultMessage({ created: true, new_applications: 3, rematched: 11 }, 1))
            .toBe("Sent 1 CV. 3 new jobs queued for matching. 11 existing applications re-evaluated with your updated data.");
        expect(sendResultMessage({ created: true, new_applications: 1, rematched: 1 }, 2))
            .toBe("Sent 2 CVs. 1 new job queued for matching. 1 existing application re-evaluated with your updated data.");
    });

    it("never prints code or placeholders", () => {
        // Regression: the toast options were inside the template string, so the toast read
        // `Sent 1 CV(s, { tone: "success" }); 3 job(s) queued for matching.`
        const text = sendResultMessage({ created: true, new_applications: 3 }, 1);
        expect(text).toBe("Sent 1 CV. 3 new jobs queued for matching.");
        expect(text).not.toMatch(/[{}]|tone/);
    });

    it("says so when nothing changed", () => {
        expect(sendResultMessage({ created: false }, 1)).toBe("Nothing changed since the last send.");
        expect(sendResultMessage({}, 1)).toBe("Nothing changed since the last send.");
    });
});

describe("splitReason", () => {
    it("turns the core's wall of text into one entry per question", () => {
        const { lead, items } = splitReason("missing information the candidate must provide: First Name; Last Name; Phone; Will you now or in the future require sponsorship for a visa?");
        expect(lead).toBe("Needs your answer to:");
        expect(items).toEqual(["First Name", "Last Name", "Phone", "Will you now or in the future require sponsorship for a visa?"]);
    });

    it("leaves any other reason untouched", () => {
        expect(splitReason("platform account needs re-authentication: authentication required: HTTP 401")).toEqual({ lead: "platform account needs re-authentication: authentication required: HTTP 401", items: [] });
        expect(splitReason(null)).toEqual({ lead: "", items: [] });
    });
});
