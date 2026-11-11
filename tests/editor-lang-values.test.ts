import { describe, expect, it } from "vitest";
import {
    DIRECTIVE_ATTRIBUTE_KEYS,
    DIRECTIVE_NAMES,
    KNOWN_CLASS_TOKENS,
    TABLE_ALIGNMENT_TOKENS,
    completeValues,
    type ValueCompletion,
} from "../packages/editor/app/utils/lang/completionValues";

/** Runs completeValues with `<cursor>` marking the cursor position. */
const complete = (marked: string): ValueCompletion[] => {
    const cursor = marked.indexOf("<cursor>");
    expect(cursor).toBeGreaterThanOrEqual(0);
    return completeValues(marked.replace("<cursor>", ""), cursor);
};
const values = (marked: string): string[] => complete(marked).map((item) => item.value);

describe("known value inventories (grep-verified, not invented)", () => {
    it("knows only the resume directive", () => {
        expect(DIRECTIVE_NAMES).toEqual(["resume"]);
    });

    it("knows only class/id directive attribute keys (sanitize drops the rest)", () => {
        expect(DIRECTIVE_ATTRIBUTE_KEYS).toEqual(["class", "id"]);
    });

    it("knows only document classes defined in reference-cv.css", () => {
        expect(KNOWN_CLASS_TOKENS).toEqual(["cv-name", "resume"]);
    });

    it("knows only table alignment tokens used in repo markdown", () => {
        expect(TABLE_ALIGNMENT_TOKENS).toEqual([":--", "--:", "---"]);
    });
});

describe("directive name completion", () => {
    it("completes resume after :::", () => {
        const items = complete(":::<cursor>");
        expect(items.map((i) => i.value)).toEqual(["resume"]);
        expect(items[0]).toMatchObject({ kind: "directive", from: 3, to: 3 });
    });

    it("filters by the typed prefix", () => {
        expect(values(":::re<cursor>")).toEqual(["resume"]);
        expect(values(":::x<cursor>")).toEqual([]);
    });

    it("does not complete a directive name mid-line", () => {
        expect(values("text :::re<cursor>")).toEqual([]);
    });
});

describe("directive attribute completion", () => {
    it("completes attribute keys inside :::resume{...}", () => {
        expect(values(":::resume{<cursor>")).toEqual(["class", "id"]);
        expect(values(":::resume{cl<cursor>")).toEqual(["class"]);
    });

    it("completes class values after class=", () => {
        expect(values(":::resume{class=\"<cursor>")).toEqual(["cv-name", "resume"]);
        expect(values(":::resume{class=\"cv-<cursor>")).toEqual(["cv-name"]);
        expect(values(":::resume{class='cv-<cursor>")).toEqual(["cv-name"]);
    });

    it("completes dot shorthand class tokens", () => {
        expect(values(":::resume{.<cursor>")).toEqual([".cv-name", ".resume"]);
        expect(values(":::resume{.cv-<cursor>")).toEqual([".cv-name"]);
    });

    it("offers nothing for id values or # shorthand: no known ids exist in the repo", () => {
        expect(values(":::resume{id=\"<cursor>")).toEqual([]);
        expect(values(":::resume{#<cursor>")).toEqual([]);
    });

    it("stops completing once the directive brace is closed", () => {
        expect(values(":::resume{class=\"cv-name\"} <cursor>")).toEqual([]);
    });
});

describe("trailing attribute brace completion on headings/paragraphs", () => {
    it("completes dot class tokens", () => {
        expect(values("# YOUR NAME {.<cursor>")).toEqual([".cv-name", ".resume"]);
        expect(values("# YOUR NAME {.cv-<cursor>")).toEqual([".cv-name"]);
    });

    it("suggests dot-prefixed tokens for a bare partial word", () => {
        expect(values("# YOUR NAME {cv-<cursor>")).toEqual([".cv-name"]);
    });

    it("tracks the replacement range of the current token", () => {
        const text = "# YOUR NAME {.cv-";
        const items = completeValues(text, text.length);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ value: ".cv-name", kind: "class", from: 13, to: text.length });
    });

    it("offers nothing for # ids", () => {
        expect(values("Some paragraph {#<cursor>")).toEqual([]);
    });

    it("does not complete in plain prose or heading text without a brace", () => {
        expect(values("Hello wor<cursor>")).toEqual([]);
        expect(values("# Experie<cursor>")).toEqual([]);
    });
});

describe("table alignment completion", () => {
    const header = "| Name | City |\n";

    it("completes all alignments in an empty delimiter cell", () => {
        expect(values(`${header}| <cursor>`)).toEqual([":--", "--:", "---"]);
    });

    it("filters by the cell prefix and replaces the whole cell token", () => {
        const items = complete(`${header}| :-- | -<cursor>`);
        expect(items.map((i) => i.value)).toEqual(["--:", "---"]);
        expect(items[0]).toMatchObject({ kind: "alignment" });
        expect(items[0]!.from).toBe(header.length + 8);
    });

    it("completes left alignment from a colon prefix", () => {
        expect(values(`${header}| :<cursor>`)).toEqual([":--"]);
    });

    it("does not complete dashes that are not a table delimiter row", () => {
        expect(values("Some text\n---<cursor>")).toEqual([]);
        expect(values("---<cursor>")).toEqual([]);
    });

    it("does not complete inside table body cells", () => {
        expect(values(`${header}| :-- | --: |\n| Ada | Lon<cursor>`)).toEqual([]);
    });
});

describe("robustness", () => {
    it("clamps out-of-range cursors instead of throwing", () => {
        expect(completeValues("", 0)).toEqual([]);
        expect(completeValues(":::re", 99)).toEqual([]);
        expect(completeValues(":::re", -1)).toEqual([]);
    });

    it("is pure: repeated calls return equal results", () => {
        const text = "# A {.cv-";
        expect(completeValues(text, text.length)).toEqual(completeValues(text, text.length));
    });
});
