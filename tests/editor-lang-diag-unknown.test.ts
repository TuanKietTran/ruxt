import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    KNOWN_ATTRIBUTE_CLASSES,
    KNOWN_DIRECTIVES,
    KNOWN_PROFILE_KEYS,
    KNOWN_SECTION_NAMES,
    diagnoseUnknownKeys,
} from "../packages/editor/app/utils/lang/diagnosticsUnknown";

const pairs = (text: string): [string, string][] =>
    diagnoseUnknownKeys(text).map((d) => [d.code, text.slice(d.from, d.to)]);

describe("known sets", () => {
    it("exposes the grammar's directive, class, section and profile-key names", () => {
        expect(KNOWN_DIRECTIVES).toEqual(["resume"]);
        expect(KNOWN_ATTRIBUTE_CLASSES).toEqual(["cv-name"]);
        expect(KNOWN_SECTION_NAMES).toEqual([
            "Education", "Experience", "Leadership & Activities", "Projects",
            "Skills & Interests", "Objective", "Skills", "Certifications", "Languages",
        ]);
        // Profile keys in section order, de-duplicated (Skills & Interests
        // and Skills both map to "skills"; Objective maps to "identity").
        expect(KNOWN_PROFILE_KEYS).toEqual([
            "education", "experiences", "projects", "skills", "identity",
            "certifications", "languages",
        ]);
    });
});

describe("unknown directives", () => {
    it("flags an unknown :::name with the name's exact range", () => {
        const text = ":::coverletter\n\n# Ada\n";
        const [d] = diagnoseUnknownKeys(text);
        expect(d).toMatchObject({ code: "unknown-directive", severity: "warning", from: 3, to: 14 });
        expect(d?.message).toContain("resume");
        expect(pairs(text)).toEqual([["unknown-directive", "coverletter"]]);
    });
    it("accepts :::resume and the bare ::: close", () => {
        expect(diagnoseUnknownKeys(":::resume\n\n# Ada {.cv-name}\n\n:::\n")).toEqual([]);
    });
    it("does not flag ::: in mid-line prose", () => {
        expect(diagnoseUnknownKeys("He typed :::coverletter inline by mistake.\n")).toEqual([]);
    });
});

describe("unknown attribute classes", () => {
    it("flags an unknown {.class} token on a heading, dot included", () => {
        const text = "# Ada {.cv-nam}\n";
        expect(pairs(text)).toEqual([["unknown-attribute-class", ".cv-nam"]]);
    });
    it("accepts .cv-name and any #id", () => {
        expect(diagnoseUnknownKeys("# Ada {.cv-name #main}\n")).toEqual([]);
    });
    it("flags unknown classes in directive attributes without flagging the directive", () => {
        expect(pairs(":::resume{.wide}\n")).toEqual([["unknown-attribute-class", ".wide"]]);
    });
    it("flags every unknown class in one block, in order", () => {
        expect(pairs("# Ada {.wide .cv-name .tall}\n")).toEqual([
            ["unknown-attribute-class", ".wide"],
            ["unknown-attribute-class", ".tall"],
        ]);
    });
    it("still checks tokens in an unclosed trailing block", () => {
        expect(pairs("# Ada {.wide\n")).toEqual([["unknown-attribute-class", ".wide"]]);
    });
    it("ignores braces that are not a trailing attribute block", () => {
        expect(diagnoseUnknownKeys("Use {curly} braces, or a set like {1, 2} here.\n")).toEqual([]);
        expect(diagnoseUnknownKeys("Not trailing: {.wide} is mid-sentence.\n")).toEqual([]);
    });
});

describe("unknown sections", () => {
    it("flags an unknown ## heading with the title's range", () => {
        const text = "## Hobbies\n\nStuff.\n";
        const [d] = diagnoseUnknownKeys(text);
        expect(d).toMatchObject({ code: "unknown-section", severity: "warning", from: 3, to: 10 });
        expect(d?.message).toContain("Education");
    });
    it("accepts every known section, case-insensitively", () => {
        const doc = KNOWN_SECTION_NAMES.map((name) => `## ${name.toLowerCase()}`).join("\n\n");
        expect(diagnoseUnknownKeys(doc)).toEqual([]);
    });
    it("strips a trailing attribute block before checking the title", () => {
        expect(diagnoseUnknownKeys("## Experience {.cv-name}\n")).toEqual([]);
        expect(pairs("## Hobbies {.cv-name}\n")).toEqual([["unknown-section", "Hobbies"]]);
    });
    it("does not treat # or ### headings as sections", () => {
        expect(diagnoseUnknownKeys("# Hobbies\n\n### Hobbies\n")).toEqual([]);
    });
});

describe("prose and code safety", () => {
    it("flags nothing in plain Markdown prose", () => {
        const prose = "Ada is a Cover Letter enthusiast.\n\nShe loves Hobbies and .wide margins in text.\n";
        expect(diagnoseUnknownKeys(prose)).toEqual([]);
    });
    it("ignores directive, section and class lookalikes inside fenced code", () => {
        const fenced = "```md\n:::bogus\n\n## Bogus\n\n# Ada {.bogus}\n```\n";
        expect(diagnoseUnknownKeys(fenced)).toEqual([]);
    });
    it("returns diagnostics sorted by position across kinds", () => {
        const text = "## Hobbies\n\n:::bogus\n\n# Ada {.wide}\n";
        const found = diagnoseUnknownKeys(text);
        expect(found.map((d) => d.code)).toEqual(["unknown-section", "unknown-directive", "unknown-attribute-class"]);
        expect(found.map((d) => d.from)).toEqual([...found.map((d) => d.from)].sort((a, b) => a - b));
    });
    it("returns [] for empty input", () => {
        expect(diagnoseUnknownKeys("")).toEqual([]);
    });
    it("diagnoses the real reference CV as clean", () => {
        const ref = readFileSync(fileURLToPath(new URL("../app/data/reference-cv.md", import.meta.url)), "utf8");
        expect(diagnoseUnknownKeys(ref)).toEqual([]);
    });
    it("stays pure: no CodeMirror or DOM imports in the module", () => {
        const src = readFileSync(fileURLToPath(new URL("../packages/editor/app/utils/lang/diagnosticsUnknown.ts", import.meta.url)), "utf8");
        expect(src).not.toMatch(/@codemirror|from "vue"|\bdocument\.|\bwindow\./);
    });
});
