import { describe, expect, it } from "vitest";
import { parseCvPdfPageSelection, toJsonResume } from "../../app/utils/exportCvDocument";
import type { CvProfileProps } from "@ruxt/shared/cv";

const profile: CvProfileProps = {
    version: 1,
    identity: {
        fullName: "Ada Lovelace",
        headline: "Engineer",
        summary: "Builder",
        location: "London",
    },
    contacts: [
        { kind: "email", label: "Email", value: "ada@example.test" },
        { kind: "github", label: "GitHub", value: "https://github.com/ada" },
    ],
    experiences: [{
        title: "Engineer", company: "Analytical Engines", location: "London",
        start: "1842", end: "1843", highlights: ["Published notes"],
    }],
    skills: [{ name: "Languages", skills: ["Ada"] }],
    certifications: [{ name: "Certificate" }],
    education: [{ degree: "Mathematics", school: "University", location: "London", start: "1835", end: "1839", details: "Honors" }],
    projects: [{ name: "Engine", url: "https://example.test", description: "A project", technologies: ["Ada"] }],
    languages: ["English"],
};

describe("CV PDF page selection", () => {
    it("defaults to every rendered page and sorts/deduplicates requested ranges", () => {
        expect(parseCvPdfPageSelection("", 4)).toEqual([1, 2, 3, 4]);
        expect(parseCvPdfPageSelection("3,1-2,2", 4)).toEqual([1, 2, 3]);
    });

    it("rejects invalid, descending, and out-of-range selections", () => {
        for (const value of ["0", "4-2", "1,", "1-5", "x"]) {
            expect(() => parseCvPdfPageSelection(value, 4)).toThrow();
        }
        expect(() => parseCvPdfPageSelection("", 0)).toThrow();
    });
});

describe("CV project export mapping", () => {
    it("maps the canonical profile to JSON Resume", () => {
        const resume = toJsonResume(profile);
        expect(resume.basics).toMatchObject({
            name: "Ada Lovelace",
            email: "ada@example.test",
            summary: "Builder",
        });
        expect(resume.basics.profiles).toEqual([{ network: "github", url: "https://github.com/ada" }]);
        expect(resume.work[0]).toMatchObject({ name: "Analytical Engines", position: "Engineer" });
        expect(resume.skills).toEqual([{ name: "Languages", keywords: ["Ada"] }]);
        expect(resume.projects[0]).toMatchObject({ name: "Engine", url: "https://example.test" });
    });
});
