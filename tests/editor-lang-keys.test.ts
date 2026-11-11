import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ATTRIBUTE_CLASSES,
    CONTACT_KINDS,
    CV_DIRECTIVES,
    CV_SECTIONS,
    KNOWN_ATTRIBUTE_IDS,
    PROFILE_FIELD_KEYS,
    PROFILE_KEYS,
    isKnownAttributeClass,
    isKnownDirective,
    isKnownSection,
    parseAttributeTokens,
    sectionForProfileKey,
} from "../packages/editor/app/utils/lang/schema";
import { getKeyCompletions } from "../packages/editor/app/utils/lang/completionKeys";

const labels = (doc: string, offset = doc.length) => getKeyCompletions(doc, offset).map((c) => c.label);

describe("editor lang schema", () => {
    it("knows only the resume container directive found in the repo", () => {
        expect(CV_DIRECTIVES.map((d) => d.name)).toEqual(["resume"]);
        expect(CV_DIRECTIVES[0]).toMatchObject({ kind: "container" });
        expect(isKnownDirective("resume")).toBe(true);
        expect(isKnownDirective("note")).toBe(false);
    });

    it("knows cv-name as the only markdown attribute class", () => {
        expect(ATTRIBUTE_CLASSES.map((c) => c.name)).toEqual(["cv-name"]);
        expect(isKnownAttributeClass("cv-name")).toBe(true);
        expect(isKnownAttributeClass("cv-sheet")).toBe(false);
        expect(KNOWN_ATTRIBUTE_IDS).toEqual([]);
    });

    it("lists the reference-cv sections first, in document order", () => {
        expect(CV_SECTIONS.slice(0, 5).map((s) => s.name)).toEqual([
            "Education",
            "Experience",
            "Leadership & Activities",
            "Projects",
            "Skills & Interests",
        ]);
        expect(isKnownSection("experience")).toBe(true);
        expect(isKnownSection("Hobbies")).toBe(false);
    });

    it("maps sections to the CvProfile keys they fill", () => {
        expect(sectionForProfileKey("education")?.name).toBe("Education");
        expect(sectionForProfileKey("experiences")?.name).toBe("Experience");
        expect(sectionForProfileKey("projects")?.name).toBe("Projects");
        expect(sectionForProfileKey("skills")?.name).toBe("Skills & Interests");
        expect(sectionForProfileKey("certifications")?.name).toBe("Certifications");
        expect(sectionForProfileKey("languages")?.name).toBe("Languages");
    });

    it("records the CvProfileProps keys found in the repo", () => {
        expect(PROFILE_KEYS).toEqual([
            "version", "identity", "contacts", "experiences", "skills",
            "certifications", "education", "projects", "languages",
        ]);
        expect(PROFILE_FIELD_KEYS.identity).toEqual(["fullName", "headline", "summary", "location"]);
        expect(PROFILE_FIELD_KEYS.contacts).toEqual(["kind", "label", "value"]);
        expect(PROFILE_FIELD_KEYS.experiences).toEqual(["title", "company", "location", "start", "end", "highlights"]);
        expect(PROFILE_FIELD_KEYS.skills).toEqual(["name", "skills"]);
        expect(PROFILE_FIELD_KEYS.certifications).toEqual(["name", "issuer", "start", "end"]);
        expect(PROFILE_FIELD_KEYS.education).toEqual(["degree", "school", "location", "start", "end", "details"]);
        expect(PROFILE_FIELD_KEYS.projects).toEqual(["name", "url", "description", "technologies"]);
        expect(CONTACT_KINDS).toEqual(["email", "phone", "linkedin", "github", "website", "other"]);
    });

    it("parses trailing attribute tokens like cvMarkdown does", () => {
        expect(parseAttributeTokens(".cv-name #main .wide")).toEqual({ classes: ["cv-name", "wide"], id: "main" });
        expect(parseAttributeTokens("plain")).toEqual({ classes: [] });
        expect(parseAttributeTokens("")).toEqual({ classes: [] });
    });

    it("stays pure: no CodeMirror or DOM imports in the lang modules", () => {
        for (const rel of ["schema.ts", "completionKeys.ts"]) {
            const src = readFileSync(fileURLToPath(new URL(`../packages/editor/app/utils/lang/${rel}`, import.meta.url)), "utf8");
            expect(src).not.toMatch(/@codemirror|from \"vue\"|\bdocument\.|\bwindow\./);
        }
    });
});

describe("key completions", () => {
    it("completes the directive name after :::", () => {
        expect(labels(":::re")).toEqual(["resume"]);
        expect(labels(":::")).toEqual(["resume"]);
        expect(labels(":::xy")).toEqual([]);
        const [c] = getKeyCompletions(":::re", 5);
        expect(c).toMatchObject({ kind: "directive", insertText: "resume", from: 3, to: 5 });
    });

    it("completes classes inside a trailing attribute block", () => {
        expect(getKeyCompletions("# Ada {.cv-", 11)).toEqual([
            expect.objectContaining({ kind: "class", label: "cv-name", insertText: ".cv-name", from: 7, to: 11 }),
        ]);
        expect(labels("# Ada {.}".slice(0, 8))).toEqual(["cv-name"]);
        expect(labels("para {.unknown-")).toEqual([]);
    });

    it("offers no id completions, because the repo names no known ids", () => {
        expect(labels("# Ada {#")).toEqual([]);
    });

    it("completes classes inside directive attributes", () => {
        expect(labels(":::resume{.cv-")).toEqual(["cv-name"]);
    });

    it("completes section names on a level-2 heading line", () => {
        expect(labels("## Ex")).toEqual(["Experience"]);
        expect(labels("## ")).toEqual(CV_SECTIONS.map((s) => s.name));
        expect(labels("## Sk")).toContain("Skills & Interests");
        const [c] = getKeyCompletions("## Ex", 5);
        expect(c).toMatchObject({ kind: "section", insertText: "Experience", from: 3, to: 5 });
    });

    it("uses only the cursor line in a multi-line document", () => {
        const doc = ":::resume\n\n## Ed\n\nBody";
        expect(labels(doc, 16)).toEqual(["Education"]);
        expect(getKeyCompletions(doc, doc.length)).toEqual([]);
    });

    it("returns nothing for ordinary prose or code", () => {
        expect(getKeyCompletions("Hello res", 9)).toEqual([]);
        expect(getKeyCompletions("##Experience", 12)).toEqual([]);
        expect(getKeyCompletions("", 0)).toEqual([]);
        expect(getKeyCompletions(":::re", 99)).toEqual(getKeyCompletions(":::re", 5));
    });
});
