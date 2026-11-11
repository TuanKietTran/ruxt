import { describe, expect, it } from "vitest";
import {
    CV_SNIPPETS,
    expandSnippet,
    getSnippet,
} from "../packages/editor/app/utils/lang/snippets";

describe("snippet catalogue", () => {
    it("defines the required resume snippets with unique ids and prefixes", () => {
        const ids = CV_SNIPPETS.map((s) => s.id);
        expect(ids).toContain("resume-skeleton");
        expect(ids).toContain("section");
        expect(ids).toContain("section-education");
        expect(ids).toContain("section-experience");
        expect(ids).toContain("section-projects");
        expect(ids).toContain("experience-entry");
        expect(ids).toContain("skills-block");
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(CV_SNIPPETS.map((s) => s.prefix)).size).toBe(CV_SNIPPETS.length);
        for (const s of CV_SNIPPETS) {
            expect(s.label.length).toBeGreaterThan(0);
            expect(s.body.length).toBeGreaterThan(0);
        }
    });

    it("getSnippet returns undefined for unknown ids", () => {
        expect(getSnippet("nope")).toBeUndefined();
        expect(getSnippet("skills-block")?.id).toBe("skills-block");
    });
});

describe("expandSnippet tab-stop format", () => {
    it("substitutes ${n:placeholder} defaults and records ranges", () => {
        const out = expandSnippet("# ${1:YOUR NAME} {.cv-name}");
        expect(out.text).toBe("# YOUR NAME {.cv-name}");
        expect(out.tabStops).toEqual([
            { index: 1, placeholder: "YOUR NAME", from: 2, to: 11 },
        ]);
    });

    it("handles bare $n stops with empty placeholders", () => {
        const out = expandSnippet("a $1 b");
        expect(out.text).toBe("a  b");
        expect(out.tabStops).toEqual([
            { index: 1, placeholder: "", from: 2, to: 2 },
        ]);
    });

    it("sorts stops by index with $0 (final) last", () => {
        const out = expandSnippet("${2:second} ${1:first} $0");
        expect(out.text).toBe("second first ");
        expect(out.tabStops.map((t) => t.index)).toEqual([1, 2, 0]);
    });

    it("mirrors repeated indices as separate ranges", () => {
        const out = expandSnippet("${1:City}, ${1:City}");
        expect(out.text).toBe("City, City");
        expect(out.tabStops).toHaveLength(2);
        expect(out.tabStops.every((t) => t.index === 1)).toBe(true);
    });

    it("treats an escaped dollar / backslash as literal, creating no tab stop", () => {
        const body = "cost " + "\\" + "$5 and " + "\\" + "\\" + " path";
        expect(expandSnippet(body).text).toBe("cost $5 and \\ path");
        expect(expandSnippet(body).tabStops).toEqual([]);
    });

    it("leaves plain text untouched with no stops", () => {
        expect(expandSnippet("## Education")).toEqual({ text: "## Education", tabStops: [] });
    });
});

describe("resume snippet shapes match reference-cv.md", () => {
    const expanded = (id: string) => expandSnippet(getSnippet(id)!.body).text;

    it("resume skeleton wraps everything in :::resume with the cv-name heading", () => {
        const text = expanded("resume-skeleton");
        expect(text.startsWith(":::resume\n\n# YOUR NAME {.cv-name}")).toBe(true);
        expect(text.trimEnd().endsWith(":::" )).toBe(true);
        expect(text).toContain("## Education");
        expect(text).toContain("## Experience");
        expect(text).toContain("## Leadership & Activities");
        expect(text).toContain("## Projects");
        expect(text).toContain("## Skills & Interests");
        expect(text).toContain("[email@example.com](mailto:email@example.com)");
    });

    it("generic section is a level-2 heading with a tab stop", () => {
        const body = getSnippet("section")!.body;
        expect(body.startsWith("## ${1:")).toBe(true);
        expect(expanded("section")).toContain("## ");
    });

    it("named sections expand to the exact reference headings", () => {
        expect(expanded("section-education")).toContain("## Education");
        expect(expanded("section-experience")).toContain("## Experience");
        expect(expanded("section-projects")).toContain("## Projects");
    });

    it("experience entry is the reference two-row table plus bullets", () => {
        const text = expanded("experience-entry");
        expect(text).toContain("| **ORGANIZATION NAME** |");
        expect(text).toContain("| :-- | --: |");
        expect(text).toContain("| Job Title | Month Year – Present |");
        expect(text).toContain("- Start each bullet with a strong action verb");
        expect(text).toContain("- Quantify the scope, impact, or outcome wherever possible");
    });

    it("skills block is the three bold-labelled reference lines", () => {
        const text = expanded("skills-block");
        expect(text).toContain("**Technical:** Language or tool, Language or tool, Platform or framework");
        expect(text).toContain("**Languages:** Language (proficiency), Language (proficiency)");
        expect(text).toContain("**Interests:** Interest, Interest, Interest");
    });

    it("every snippet body parses with sequential tab stops starting at 1", () => {
        for (const s of CV_SNIPPETS) {
            const { tabStops } = expandSnippet(s.body);
            const indices = [...new Set(tabStops.filter((t) => t.index > 0).map((t) => t.index))].sort((a, b) => a - b);
            expect(indices, s.id).toEqual(indices.map((_, i) => i + 1));
        }
    });
});
