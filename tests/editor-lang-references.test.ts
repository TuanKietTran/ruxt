import { describe, expect, it } from "vitest";
import {
    findDefinition,
    findReferences,
    findSymbolOccurrences,
    symbolAtOffset,
} from "../packages/editor/app/utils/lang/references";

const at = (text: string, needle: string, occurrence = 0): number => {
    let index = -1;
    for (let i = 0; i <= occurrence; i++) {
        index = text.indexOf(needle, index + 1);
        if (index === -1) throw new Error(`needle not found: ${needle} #${occurrence}`);
    }
    return index;
};

const rangeOf = (text: string, needle: string, occurrence = 0) => {
    const from = at(text, needle, occurrence);
    return { from, to: from + needle.length };
};

const doc = [
    ":::resume",
    "",
    "# YOUR NAME {.cv-name}",
    "",
    "## Experience {#exp .cv-section}",
    "",
    "Led things {.cv-section}",
    "",
    "[Jump to experience](#exp)",
    "",
    "Prose mentions C# and .hidden and #exp should not count.",
    "",
    "```",
    "{.cv-name}",
    "```",
    "",
    ":::",
].join("\n");

const css = [
    ".resume { color: #171717; }",
    ".cv-name { margin: 0; }",
    "#exp .cv-section { padding: .5mm; }",
    "/* .cv-name in a comment */",
    ".cv-name + p { margin: 0; }",
].join("\n");

describe("findSymbolOccurrences", () => {
    it("collects directive, attribute, and link occurrences in document order", () => {
        const occurrences = findSymbolOccurrences(doc);
        expect(occurrences.map((o) => `${o.kind}:${o.name}`)).toEqual([
            "class:resume",
            "class:cv-name",
            "id:exp",
            "class:cv-section",
            "class:cv-section",
            "id:exp",
        ]);
    });

    it("marks only the first assignment site per symbol as the definition", () => {
        const occurrences = findSymbolOccurrences(doc);
        expect(occurrences.filter((o) => o.definition).map((o) => o.name)).toEqual([
            "resume",
            "cv-name",
            "exp",
            "cv-section",
        ]);
        const secondSection = occurrences.filter((o) => o.name === "cv-section")[1];
        expect(secondSection?.definition).toBe(false);
        const link = occurrences[occurrences.length - 1];
        expect(link?.definition).toBe(false);
    });

    it("returns exact ranges including the . / # prefix", () => {
        const occurrences = findSymbolOccurrences(doc);
        const name = occurrences.find((o) => o.name === "cv-name");
        expect({ from: name?.from, to: name?.to }).toEqual(rangeOf(doc, ".cv-name"));
        const id = occurrences.find((o) => o.name === "exp");
        expect({ from: id?.from, to: id?.to }).toEqual(rangeOf(doc, "#exp"));
        const directive = occurrences.find((o) => o.name === "resume");
        expect({ from: directive?.from, to: directive?.to }).toEqual({
            from: at(doc, "resume"),
            to: at(doc, "resume") + "resume".length,
        });
    });

    it("ignores prose tokens, headings markers, and fenced code", () => {
        const names = findSymbolOccurrences(doc).map((o) => o.name);
        expect(names).not.toContain("hidden");
        expect(findSymbolOccurrences(doc).filter((o) => o.name === "cv-name")).toHaveLength(1);
        expect(findSymbolOccurrences(doc).filter((o) => o.name === "exp")).toHaveLength(2);
    });

    it("collects CSS selector tokens as references, not definitions", () => {
        const occurrences = findSymbolOccurrences(css);
        expect(occurrences.map((o) => `${o.kind}:${o.name}`)).toEqual([
            "class:resume",
            "class:cv-name",
            "id:exp",
            "class:cv-section",
            "class:cv-name",
        ]);
        expect(occurrences.every((o) => !o.definition)).toBe(true);
    });

    it("is case-sensitive and handles an empty document", () => {
        const mixed = "# A {.Foo}\n\n# B {.foo}";
        expect(findSymbolOccurrences(mixed).map((o) => o.name)).toEqual(["Foo", "foo"]);
        expect(findSymbolOccurrences("")).toEqual([]);
    });
});

describe("symbolAtOffset", () => {
    it("resolves the prefix, the name, and the last name character", () => {
        const { from, to } = rangeOf(doc, ".cv-name");
        expect(symbolAtOffset(doc, from)?.name).toBe("cv-name");
        expect(symbolAtOffset(doc, from + 3)?.name).toBe("cv-name");
        expect(symbolAtOffset(doc, to - 1)?.name).toBe("cv-name");
    });

    it("returns null outside any symbol", () => {
        expect(symbolAtOffset(doc, at(doc, "YOUR"))).toBeNull();
        expect(symbolAtOffset(doc, at(doc, "{.cv-name}"))).toBeNull();
        expect(symbolAtOffset(doc, -1)).toBeNull();
        expect(symbolAtOffset(doc, doc.length + 10)).toBeNull();
    });
});

describe("findDefinition", () => {
    it("jumps from a fragment link back to the {#id} definition", () => {
        const linkOffset = at(doc, "#exp", 1) + 2;
        expect(findDefinition(doc, linkOffset)).toMatchObject({
            ...rangeOf(doc, "#exp"),
            kind: "id",
            name: "exp",
            definition: true,
        });
    });

    it("jumps from a later class assignment back to the first assignment", () => {
        const reuseOffset = at(doc, ".cv-section", 1) + 2;
        expect(findDefinition(doc, reuseOffset)).toMatchObject({
            ...rangeOf(doc, ".cv-section"),
            kind: "class",
            name: "cv-section",
            definition: true,
        });
    });

    it("returns the definition itself when the cursor is on it", () => {
        const defOffset = at(doc, ".cv-name") + 2;
        expect(findDefinition(doc, defOffset)).toMatchObject(rangeOf(doc, ".cv-name"));
    });

    it("returns null when no assignment site exists in the document", () => {
        expect(findDefinition(css, at(css, ".cv-name") + 2)).toBeNull();
        expect(findDefinition(doc, at(doc, "YOUR"))).toBeNull();
    });

    it("resolves a duplicate #id to its first definition", () => {
        const dup = "# A {#dup}\n\n# B {#dup}";
        expect(findDefinition(dup, at(dup, "#dup", 1) + 1)).toMatchObject(rangeOf(dup, "#dup"));
    });
});

describe("findReferences", () => {
    it("returns every occurrence of the symbol in document order", () => {
        const refs = findReferences(doc, at(doc, ".cv-section") + 2);
        expect(refs.map((r) => ({ from: r.from, to: r.to }))).toEqual([
            rangeOf(doc, ".cv-section"),
            rangeOf(doc, ".cv-section", 1),
        ]);
        const idRefs = findReferences(doc, at(doc, "#exp") + 1);
        expect(idRefs).toHaveLength(2);
        expect(idRefs[1]).toMatchObject(rangeOf(doc, "#exp", 1));
    });

    it("finds references from any occurrence, including a link", () => {
        const refs = findReferences(doc, at(doc, "#exp", 1) + 2);
        expect(refs.map((r) => r.from)).toEqual([at(doc, "#exp"), at(doc, "#exp", 1)]);
    });

    it("can exclude the definition site", () => {
        const refs = findReferences(doc, at(doc, "#exp") + 1, { includeDefinition: false });
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject(rangeOf(doc, "#exp", 1));
        const classRefs = findReferences(doc, at(doc, ".cv-section") + 2, {
            includeDefinition: false,
        });
        expect(classRefs).toHaveLength(1);
        expect(classRefs[0]).toMatchObject(rangeOf(doc, ".cv-section", 1));
    });

    it("collects CSS selector references across rules", () => {
        const refs = findReferences(css, at(css, ".cv-name") + 2);
        expect(refs.map((r) => ({ from: r.from, to: r.to }))).toEqual([
            rangeOf(css, ".cv-name"),
            // Raw occurrence 2: occurrence 1 sits in the /* */ comment and is ignored.
            rangeOf(css, ".cv-name", 2),
        ]);
    });

    it("returns [] when the cursor is not on a symbol", () => {
        expect(findReferences(doc, at(doc, "YOUR"))).toEqual([]);
        expect(findReferences("", 0)).toEqual([]);
    });

    it("keeps same-name id and class symbols separate", () => {
        const both = "# A {#panel .panel}\n\n# B {.panel}";
        expect(findReferences(both, at(both, "#panel") + 1)).toHaveLength(1);
        expect(findReferences(both, at(both, ".panel") + 1)).toHaveLength(2);
    });
});
