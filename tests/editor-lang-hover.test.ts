import { describe, expect, it } from "vitest";
import { hoverAt } from "../packages/editor/app/utils/lang/hover";

const doc = [
    ":::resume",
    "",
    "# YOUR NAME {.cv-name}",
    "",
    "## Education",
    "",
    "| **UNIVERSITY NAME** | City, Country |",
    "",
    "## Experience",
    "",
    "- Start each bullet with a strong action verb",
    "",
    ":::",
].join("\n");

const at = (needle: string, base = doc) => {
    const i = base.indexOf(needle);
    if (i < 0) throw new Error(`needle not found: ${needle}`);
    return i;
};

describe("hoverAt: directives", () => {
    it("documents the resume directive name, ranged on the name", () => {
        const from = at("resume");
        const hover = hoverAt(doc, from + 2);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(from);
        expect(hover!.to).toBe(from + "resume".length);
        expect(doc.slice(hover!.from, hover!.to)).toBe("resume");
        expect(hover!.markdown).toContain(":::resume");
        expect(hover!.markdown).toContain('<div class="resume">');
    });

    it("documents the closing fence", () => {
        const closing = doc.lastIndexOf(":::");
        const hover = hoverAt(doc, closing + 1);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(closing);
        expect(hover!.to).toBe(closing + 3);
        expect(hover!.markdown.toLowerCase()).toContain("clos");
    });

    it("gives a generic doc for an unknown directive name", () => {
        const text = ":::sidebar\n\nBody\n\n:::";
        const hover = hoverAt(text, text.indexOf("sidebar") + 1);
        expect(hover).not.toBeNull();
        expect(hover!.markdown).toContain("sidebar");
        expect(hover!.markdown).toContain("container directive");
    });

    it("documents a directive on its colons too", () => {
        const hover = hoverAt(doc, 1);
        expect(hover).not.toBeNull();
        expect(hover!.markdown).toContain(":::resume");
    });
});

describe("hoverAt: {.class / #id} tokens", () => {
    it("documents .cv-name, ranged on the token including the dot", () => {
        const from = at(".cv-name");
        const hover = hoverAt(doc, from + 3);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(from);
        expect(hover!.to).toBe(from + ".cv-name".length);
        expect(hover!.markdown).toContain(".cv-name");
        expect(hover!.markdown).toContain("16pt");
        expect(hover!.markdown.toLowerCase()).toContain("center");
    });

    it("prefers the attribute token over the heading on the same line", () => {
        const hover = hoverAt(doc, at(".cv-name") + 2);
        expect(hover!.markdown).toContain(".cv-name");
        expect(hover!.markdown).not.toContain("## ");
    });

    it("documents a generic class token in a spaced block", () => {
        const text = "## Experience { .compact #main }";
        const from = text.indexOf(".compact");
        const hover = hoverAt(text, from + 2);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(from);
        expect(hover!.to).toBe(from + ".compact".length);
        expect(hover!.markdown).toContain(".compact");
        expect(hover!.markdown.toLowerCase()).toContain("class");
    });

    it("documents an id token", () => {
        const text = "## Experience { .compact #main }";
        const from = text.indexOf("#main");
        const hover = hoverAt(text, from + 2);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(from);
        expect(hover!.to).toBe(from + "#main".length);
        expect(hover!.markdown).toContain("#main");
        expect(hover!.markdown.toLowerCase()).toContain("id");
    });

    it("returns null on the braces and spaces of an attribute block", () => {
        const text = "# Name {.cv-name}";
        expect(hoverAt(text, text.indexOf("{"))).toBeNull();
        expect(hoverAt(text, text.indexOf("}"))).toBeNull();
    });
});

describe("hoverAt: section headings", () => {
    it("documents Education, ranged on the heading text", () => {
        const from = at("Education");
        const hover = hoverAt(doc, from + 2);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(from);
        expect(hover!.to).toBe(from + "Education".length);
        expect(hover!.markdown).toContain("Education");
        expect(hover!.markdown.toLowerCase()).toContain("degree");
    });

    it("documents Experience with bullet guidance", () => {
        const hover = hoverAt(doc, at("Experience") + 2);
        expect(hover).not.toBeNull();
        expect(hover!.markdown).toContain("Experience");
        expect(hover!.markdown.toLowerCase()).toContain("action verb");
    });

    it.each([
        ["Leadership & Activities", "contribution"],
        ["Projects", "problem"],
        ["Skills & Interests", "Technical"],
    ])("documents the %s section", (title, keyword) => {
        const text = `## ${title}`;
        const hover = hoverAt(text, 4);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(3);
        expect(hover!.to).toBe(3 + title.length);
        expect(hover!.markdown).toContain(title);
        expect(hover!.markdown).toContain(keyword);
    });

    it("documents an unknown H2 as a generic resume section", () => {
        const text = "## Certifications";
        const hover = hoverAt(text, 5);
        expect(hover).not.toBeNull();
        expect(hover!.markdown).toContain("Certifications");
        expect(hover!.markdown).toContain("12pt");
    });

    it("documents the H1 as the name heading and points at .cv-name", () => {
        const hover = hoverAt(doc, at("YOUR NAME") + 2);
        expect(hover).not.toBeNull();
        expect(hover!.from).toBe(at("YOUR NAME"));
        expect(hover!.to).toBe(at("YOUR NAME") + "YOUR NAME".length);
        expect(hover!.markdown).toContain(".cv-name");
    });

    it("matches known sections case-insensitively", () => {
        const hover = hoverAt("## education", 4);
        expect(hover).not.toBeNull();
        expect(hover!.markdown.toLowerCase()).toContain("degree");
    });
});

describe("hoverAt: null cases", () => {
    it("returns null for body, table and bullet text", () => {
        expect(hoverAt(doc, at("UNIVERSITY"))).toBeNull();
        expect(hoverAt(doc, at("Start each bullet"))).toBeNull();
    });

    it("returns null for empty text and out-of-range offsets", () => {
        expect(hoverAt("", 0)).toBeNull();
        expect(hoverAt(doc, -1)).toBeNull();
        expect(hoverAt(doc, doc.length + 5)).toBeNull();
    });

    it("returns null on the ## marks' trailing space and plain paragraphs", () => {
        expect(hoverAt("Just a paragraph", 3)).toBeNull();
    });
});
