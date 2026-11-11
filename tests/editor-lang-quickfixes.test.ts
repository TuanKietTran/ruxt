import { describe, expect, it } from "vitest";
import { applyTextEdits, getQuickFixes, KNOWN_CLASSES, KNOWN_DIRECTIVES } from "../packages/editor/app/utils/lang/quickFixes";
import type { LangDiagnostic } from "../packages/editor/app/utils/lang/quickFixes";

const diag = (code: string, text: string, needle: string): LangDiagnostic => {
    const from = text.indexOf(needle);
    if (from < 0) throw new Error(`needle not found: ${needle}`);
    return { code, range: { from, to: from + needle.length } };
};

describe("known sets", () => {
    it("exposes the grammar's directive and class names", () => {
        expect(KNOWN_DIRECTIVES).toContain("resume");
        expect(KNOWN_CLASSES).toContain("cv-name");
    });
});

describe("close unclosed :::", () => {
    it("appends the closing ::: at end of document", () => {
        const text = ":::resume\n\n# Ada {.cv-name}\n";
        const edits = getQuickFixes(text, diag("unclosed-directive", text, ":::resume"));
        expect(edits).toEqual([{ from: text.length, to: text.length, insert: "\n:::\n" }]);
        expect(applyTextEdits(text, edits)).toBe(":::resume\n\n# Ada {.cv-name}\n\n:::\n");
    });
    it("adds separating newlines when the document has no trailing newline", () => {
        const text = ":::resume\n\n# Ada";
        const edits = getQuickFixes(text, diag("unclosed-container-directive", text, ":::resume"));
        expect(applyTextEdits(text, edits)).toBe(":::resume\n\n# Ada\n\n:::\n");
    });
    it("offers nothing when a closing ::: already follows", () => {
        const text = ":::resume\n\n# Ada\n\n:::\n";
        expect(getQuickFixes(text, diag("unclosed-directive", text, ":::resume"))).toEqual([]);
    });
});

describe("close unclosed }", () => {
    it("closes a heading attribute block at the end of the range", () => {
        const text = "# Ada {.cv-name\n\nBody";
        const edits = getQuickFixes(text, diag("unclosed-attribute", text, "{.cv-name"));
        expect(edits).toEqual([{ from: text.indexOf("\n"), to: text.indexOf("\n"), insert: "}" }]);
        expect(applyTextEdits(text, edits)).toBe("# Ada {.cv-name}\n\nBody");
    });
    it("closes directive attributes :::resume{... at the end of the line", () => {
        const text = ":::resume{lang=en\n\n# Ada\n\n:::\n";
        const edits = getQuickFixes(text, diag("unclosed-brace", text, "{lang=en"));
        expect(applyTextEdits(text, edits)).toBe(":::resume{lang=en}\n\n# Ada\n\n:::\n");
    });
    it("offers nothing when the block is already closed", () => {
        const text = "# Ada {.cv-name}";
        expect(getQuickFixes(text, diag("unclosed-attribute", text, "{.cv-name}"))).toEqual([]);
    });
});

describe("near-miss names", () => {
    it("corrects a near-miss directive name", () => {
        const text = ":::resum\n\n# Ada\n\n:::\n";
        const edits = getQuickFixes(text, diag("unknown-directive", text, "resum"));
        expect(edits).toEqual([{ from: 3, to: 8, insert: "resume" }]);
        expect(applyTextEdits(text, edits)).toContain(":::resume");
    });
    it("corrects a transposed directive name (distance 2)", () => {
        const text = ":::resuem\n\n# Ada\n\n:::\n";
        expect(applyTextEdits(text, getQuickFixes(text, diag("unknown-directive", text, "resuem")))).toContain(":::resume");
    });
    it("corrects a near-miss class name inside { . }", () => {
        const text = "# Ada {.cv-nam}";
        const edits = getQuickFixes(text, diag("unknown-class", text, "cv-nam"));
        expect(edits).toEqual([{ from: text.indexOf("cv-nam"), to: text.indexOf("cv-nam") + 6, insert: "cv-name" }]);
        expect(applyTextEdits(text, edits)).toBe("# Ada {.cv-name}");
    });
    it("corrects a class name when the range includes the leading dot", () => {
        const text = "# Ada {.cv-nam}";
        expect(applyTextEdits(text, getQuickFixes(text, diag("unknown-class", text, ".cv-nam")))).toBe("# Ada {.cv-name}");
    });
    it("offers nothing for an exact known name", () => {
        const text = ":::resume\n\n:::\n";
        expect(getQuickFixes(text, diag("unknown-directive", text, "resume"))).toEqual([]);
    });
    it("offers nothing for a far miss", () => {
        const text = ":::banana\n\n:::\n";
        expect(getQuickFixes(text, diag("unknown-directive", text, "banana"))).toEqual([]);
        const cls = "# Ada {.banana}";
        expect(getQuickFixes(cls, diag("unknown-class", cls, "banana"))).toEqual([]);
    });
    it("infers directive vs class from context for a generic unknown-name code", () => {
        const text = ":::resum\n\n:::\n";
        expect(applyTextEdits(text, getQuickFixes(text, diag("unknown-name", text, "resum")))).toContain(":::resume");
        const cls = "# Ada {.cv-nam}";
        expect(applyTextEdits(cls, getQuickFixes(cls, diag("unknown-name", cls, "cv-nam")))).toBe("# Ada {.cv-name}");
    });
});

describe("non-fixable diagnostics", () => {
    it("returns no edits for unrelated codes", () => {
        const text = ":::resume\n\n:::\n";
        expect(getQuickFixes(text, diag("trailing-whitespace", text, "resume"))).toEqual([]);
    });
    it("clamps an out-of-bounds range instead of throwing", () => {
        expect(getQuickFixes("abc", { code: "unknown-directive", range: { from: 90, to: 120 } })).toEqual([]);
    });
});
