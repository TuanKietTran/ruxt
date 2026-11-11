import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    CV_ATTRIBUTE_CLASSES,
    CV_DIRECTIVE_NAMES,
    diagnoseCvMarkdown,
    positionAt,
} from "../packages/editor/app/utils/lang/diagnosticsTypes";
import type { CvDiagnostic } from "../packages/editor/app/utils/lang/diagnosticsTypes";

const referenceCv = readFileSync(fileURLToPath(new URL("../app/data/reference-cv.md", import.meta.url)), "utf8");

const byCode = (source: string, code: CvDiagnostic["code"]) =>
    diagnoseCvMarkdown(source).filter((diagnostic) => diagnostic.code === code);

describe("known grammar sets", () => {
    it("exports the directive and attribute-class sets the repo defines", () => {
        expect(CV_DIRECTIVE_NAMES).toEqual(["resume"]);
        expect(CV_ATTRIBUTE_CLASSES).toEqual(["cv-name"]);
    });
});

describe("valid documents", () => {
    it("reports nothing for the reference CV", () => {
        expect(diagnoseCvMarkdown(referenceCv)).toEqual([]);
    });

    it("reports nothing for empty or blank sources", () => {
        expect(diagnoseCvMarkdown("")).toEqual([]);
        expect(diagnoseCvMarkdown("\n\n  \n")).toEqual([]);
    });

    it("accepts a known class and an id in one trailing block", () => {
        expect(diagnoseCvMarkdown("# Ada {.cv-name #top}\n")).toEqual([]);
    });

    it("accepts one sheet break between content inside a directive", () => {
        expect(diagnoseCvMarkdown(":::resume\n\nPage one\n\n---\n\nPage two\n\n:::\n")).toEqual([]);
    });

    it("does not treat a setext heading underline as a sheet break", () => {
        expect(diagnoseCvMarkdown("Title\n---\n\nBody\n")).toEqual([]);
    });
});

describe("directive diagnostics", () => {
    it("flags an unclosed ::: directive on its opening token", () => {
        const source = ":::resume\n\n# Ada\n";
        const found = byCode(source, "unclosed-directive");
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: "error", source: "cv-markdown" });
        expect(found[0]!.from).toBe(source.indexOf(":::resume"));
        expect(found[0]!.to).toBe(source.indexOf(":::resume") + ":::resume".length);
    });

    it("flags a closing ::: with no open directive", () => {
        const source = "# Ada\n\n:::\n";
        const found = byCode(source, "stray-directive-close");
        expect(found).toHaveLength(1);
        expect(found[0]!.from).toBe(source.indexOf(":::"));
        expect(found[0]!.to).toBe(source.indexOf(":::") + 3);
    });

    it("warns on a directive name outside the known set, ranged on the name", () => {
        const source = ":::sidebar\n\nBody\n\n:::\n";
        const found = byCode(source, "unknown-directive");
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: "warning" });
        expect(found[0]!.from).toBe(source.indexOf("sidebar"));
        expect(found[0]!.to).toBe(source.indexOf("sidebar") + "sidebar".length);
        expect(byCode(source, "unclosed-directive")).toEqual([]);
    });
});

describe("attribute block diagnostics", () => {
    it("flags an unclosed trailing block from the brace to the line end", () => {
        const source = "# Ada {.cv-name\n";
        const found = byCode(source, "unclosed-attribute-block");
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: "error" });
        expect(found[0]!.from).toBe(source.indexOf("{"));
        expect(found[0]!.to).toBe(source.indexOf("{") + "{.cv-name".length);
    });

    it("flags an unclosed attribute block on a directive line and still opens it", () => {
        const source = ":::resume{.cv-name\n\nBody\n\n:::\n";
        expect(byCode(source, "unclosed-attribute-block")).toHaveLength(1);
        expect(byCode(source, "unclosed-directive")).toEqual([]);
        expect(byCode(source, "stray-directive-close")).toEqual([]);
    });

    it("flags a token without a . or # prefix, ranged on the token", () => {
        const source = "# Ada {cv-name}\n";
        const found = byCode(source, "malformed-attribute-block");
        expect(found).toHaveLength(1);
        expect(found[0]!.from).toBe(source.indexOf("cv-name"));
        expect(found[0]!.to).toBe(source.indexOf("cv-name") + "cv-name".length);
    });

    it("flags an empty attribute block and an illegal token character", () => {
        expect(byCode("# Ada {}\n", "malformed-attribute-block")).toHaveLength(1);
        expect(byCode("# Ada {.cv-name!}\n", "malformed-attribute-block")).toHaveLength(1);
    });

    it("flags an attribute block that is not at the end of a heading line", () => {
        const source = "# Ada {.cv-name} extra\n";
        expect(byCode(source, "malformed-attribute-block")).toHaveLength(1);
    });

    it("warns on an attribute class outside the known set, ranged on the token", () => {
        const source = "# Ada {.fancy}\n";
        const found = byCode(source, "unknown-attribute-class");
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: "warning" });
        expect(found[0]!.from).toBe(source.indexOf(".fancy"));
        expect(found[0]!.to).toBe(source.indexOf(".fancy") + ".fancy".length);
    });
});

describe("id diagnostics", () => {
    it("flags a duplicate #id on the later occurrence only", () => {
        const source = "# A {#main}\n\n# B {#main}\n";
        const found = byCode(source, "duplicate-id");
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: "error" });
        const second = source.indexOf("#main", source.indexOf("#main") + 1);
        expect(found[0]!.from).toBe(second);
        expect(found[0]!.to).toBe(second + "#main".length);
        expect(diagnoseCvMarkdown(source)).toHaveLength(1);
    });

    it("flags duplicate ids across a directive attribute and a heading block", () => {
        const source = ":::resume{#top}\n\n# B {#top}\n\n:::\n";
        expect(byCode(source, "duplicate-id")).toHaveLength(1);
    });

    it("flags two ids in one block, ranged on the second id", () => {
        const source = "# A {#a #b}\n";
        const found = byCode(source, "multiple-ids");
        expect(found).toHaveLength(1);
        expect(found[0]!.from).toBe(source.indexOf("#b"));
    });
});

describe("sheet break diagnostics", () => {
    it("warns on a leading sheet break", () => {
        const source = "---\n\n# Ada\n";
        const found = byCode(source, "leading-sheet-break");
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: "warning", from: 0, to: 3 });
    });

    it("warns on a trailing sheet break", () => {
        const source = "# Ada\n\n---\n";
        const found = byCode(source, "trailing-sheet-break");
        expect(found).toHaveLength(1);
        expect(found[0]!.from).toBe(source.indexOf("---"));
    });

    it("warns once on consecutive sheet breaks, ranged on the second break", () => {
        const source = "# A\n\n---\n\n---\n\nB\n";
        const found = byCode(source, "consecutive-sheet-breaks");
        expect(found).toHaveLength(1);
        const second = source.indexOf("---", source.indexOf("---") + 3);
        expect(found[0]!.from).toBe(second);
        expect(byCode(source, "leading-sheet-break")).toEqual([]);
        expect(byCode(source, "trailing-sheet-break")).toEqual([]);
    });
});

describe("ranges and ordering", () => {
    it("returns diagnostics sorted by range start", () => {
        const source = ":::resume\n\n# Ada {.fancy}\n";
        expect(diagnoseCvMarkdown(source).map((diagnostic) => diagnostic.code)).toEqual([
            "unclosed-directive",
            "unknown-attribute-class",
        ]);
    });

    it("keeps every range inside the source and non-empty", () => {
        const source = ":::nope {.bad! #x #x}\n\n---\n\n---\n";
        const diagnostics = diagnoseCvMarkdown(source);
        expect(diagnostics.length).toBeGreaterThan(0);
        for (const diagnostic of diagnostics) {
            expect(diagnostic.from).toBeGreaterThanOrEqual(0);
            expect(diagnostic.to).toBeGreaterThan(diagnostic.from);
            expect(diagnostic.to).toBeLessThanOrEqual(source.length);
            expect(diagnostic.message.length).toBeGreaterThan(0);
        }
    });

    it("is pure: repeated calls return equal results", () => {
        const source = "# A {#x}\n\n# B {#x}\n";
        expect(diagnoseCvMarkdown(source)).toEqual(diagnoseCvMarkdown(source));
    });

    it("converts offsets to 1-based line and column", () => {
        expect(positionAt("ab\ncd", 0)).toEqual({ offset: 0, line: 1, column: 1 });
        expect(positionAt("ab\ncd", 3)).toEqual({ offset: 3, line: 2, column: 1 });
        expect(positionAt("ab\ncd", 4)).toEqual({ offset: 4, line: 2, column: 2 });
        expect(positionAt("ab\ncd", 99)).toEqual({ offset: 5, line: 2, column: 3 });
    });
});
