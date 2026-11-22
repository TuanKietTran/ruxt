import { describe, expect, it } from "vitest";
import { buildCandidateSnapshot, emptyJobPreferences, normalizeJobPreferences } from "../../app/utils/jobSnapshot";

const profile = {
    version: 1,
    identity: { fullName: "Test Candidate", headline: "Backend Engineer", summary: "", location: "Ho Chi Minh City" },
    contacts: [{ kind: "email", label: "Email", value: "candidate@example.test" }],
    experiences: [], skills: [], certifications: [], education: [], projects: [], languages: [],
} as any;

describe("buildCandidateSnapshot", () => {
    it("keeps each CV's id and exact revision and stamps the source", () => {
        const snap = buildCandidateSnapshot({
            profileId: "profile-1", profileUpdatedAt: Date.UTC(2026, 10, 19), profile, preferences: emptyJobPreferences(),
            cvs: [{ id: "cv-a", title: "Backend", markdown: "# A", css: "", revision: 7, updatedAt: "2026-11-18T00:00:00.000Z" }],
            appVersion: "1.2.3", now: new Date("2026-11-20T00:00:00Z"),
        });
        expect(snap.schema_version).toBe(1);
        expect(snap.source).toEqual({ system: "ruxt", app_version: "1.2.3", exported_at: "2026-11-20T00:00:00.000Z" });
        expect(snap.profile.updated_at).toBe("2026-11-19T00:00:00.000Z");
        expect(snap.cvs).toEqual([{ cv_id: "cv-a", revision: 7, title: "Backend", markdown: "# A", css: "", updated_at: "2026-11-18T00:00:00.000Z" }]);
        expect(snap.profile.data).toBe(profile);
    });

    it("sends the CV's real title, not the placeholder a never-renamed CV stores", () => {
        // Regression: a CV that was never renamed stores the placeholder, so every CV reached the core as "Untitled CV".
        const send = (title: string | undefined, markdown: string) => buildCandidateSnapshot({
            profileId: "p", profileUpdatedAt: 0, profile, preferences: emptyJobPreferences(),
            cvs: [{ id: "cv-a", title, markdown, css: "", revision: 1, updatedAt: "2026-11-18T00:00:00.000Z" } as any],
        }).cvs[0]!.title;
        const body = "# Backend Engineer CV\n\nBody";
        expect(send("Untitled CV", body)).toBe("Backend Engineer CV");
        expect(send(undefined, body)).toBe("Backend Engineer CV");
        expect(send("My renamed CV", "# Something else")).toBe("My renamed CV");
        expect(send("Untitled CV", "no heading here")).toBe("Untitled CV");
    });

    it("requires an explicit CV selection", () => {
        expect(() => buildCandidateSnapshot({ profileId: "p", profileUpdatedAt: 0, profile, preferences: emptyJobPreferences(), cvs: [] })).toThrow(/at least one CV/);
    });
});

describe("normalizeJobPreferences", () => {
    it("drops malformed values instead of guessing", () => {
        const prefs = normalizeJobPreferences({
            locations: ["  Ho Chi Minh City ", 3, ""], work_modes: ["remote", "spaceship", "remote"], salary_min: -5,
            salary_currency: "usd", answers: { notice_period: " One month ", empty: "  ", bad: 4 },
        });
        expect(prefs).toEqual({
            locations: ["Ho Chi Minh City"], work_modes: ["remote"], target_roles: [], excluded_keywords: [],
            salary_min: null, salary_currency: "USD", answers: { notice_period: "One month" },
        });
        expect(normalizeJobPreferences("nonsense")).toEqual(emptyJobPreferences());
    });
});
