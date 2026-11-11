import { describe, expect, it } from "vitest";
import { getSignatureHelp } from "../packages/editor/app/utils/lang/signature";

// Cursor marker: `|` is removed and its index used as the cursor.
const at = (marked: string) => {
    const cursor = marked.indexOf("|");
    if (cursor < 0) throw new Error("missing cursor marker");
    return { text: marked.replace("|", ""), cursor };
};
const help = (marked: string) => {
    const { text, cursor } = at(marked);
    return getSignatureHelp(text, cursor);
};

describe("directive signature help", () => {
    it("reports the #id parameter inside :::name{...}", () => {
        const result = help(":::resume{#ma|in}");
        expect(result?.context).toBe("directive");
        expect(result?.name).toBe("resume");
        expect(result?.activeSignature).toBe(0);
        expect(result?.activeParameter).toBe(1);
        expect(result?.signatures[0]?.label).toContain("resume");
        expect(result?.signatures[0]?.parameters).toHaveLength(3);
        expect(result?.signatures[0]?.parameters[1]?.label).toContain("#id");
        expect(result?.parameterText).toBe("#main");
        const range = result?.parameterRange;
        expect(range && result?.parameterText).toBeTruthy();
        expect(":::resume{#main}".slice(range!.from, range!.to)).toBe("#main");
    });

    it("reports the .class parameter", () => {
        const result = help(":::resume{.wi|de #main}");
        expect(result?.activeParameter).toBe(0);
        expect(result?.parameterText).toBe(".wide");
        expect(result?.signatures[0]?.parameters[0]?.documentation).toMatch(/repeatable/i);
    });

    it("reports a key=value attribute, keeping quoted spaces in one token", () => {
        const result = help(':::resume{label="a |b" .x}');
        expect(result?.activeParameter).toBe(2);
        expect(result?.parameterText).toBe('label="a b"');
        expect(result?.signatures[0]?.parameters[2]?.label).toContain("key=value");
    });

    it("reports a bare key attribute as key=value parameter", () => {
        expect(help(":::resume{dra|ft}")?.activeParameter).toBe(2);
    });

    it("works with an unclosed brace", () => {
        const result = help(":::resume{#ma|in");
        expect(result?.context).toBe("directive");
        expect(result?.activeParameter).toBe(1);
    });

    it("shows help on the directive name, before any brace", () => {
        const result = help(":::res|ume");
        expect(result?.context).toBe("directive");
        expect(result?.name).toBe("resume");
        expect(result?.activeParameter).toBe(-1);
        expect(result?.parameterRange).toBeNull();
        expect(result?.signatures[0]?.documentation).toMatch(/div/i);
    });

    it("uses the actual name for an unknown directive", () => {
        const result = help(":::note{.x|}");
        expect(result?.name).toBe("note");
        expect(result?.signatures[0]?.label).toContain("note");
    });

    it("defaults to the first parameter in empty braces", () => {
        const result = help(":::resume{||}".replace("||", "|"));
        expect(result?.activeParameter).toBe(0);
        expect(result?.parameterText).toBe("");
    });

    it("returns null after the closing brace and for a bare closing fence", () => {
        expect(help(":::resume{#main}| x")).toBeNull();
        expect(help(":::|\n\nBody")).toBeNull();
    });
});

describe("attribute-block signature help", () => {
    it("reports .class in a trailing heading attribute", () => {
        const result = help("# YOUR NAME {.cv-na|me}");
        expect(result?.context).toBe("attributes");
        expect(result?.activeSignature).toBe(0);
        expect(result?.activeParameter).toBe(0);
        expect(result?.signatures[0]?.parameters).toHaveLength(2);
        expect(result?.parameterText).toBe(".cv-name");
    });

    it("reports #id", () => {
        const result = help("Some text {.wide #to|p}");
        expect(result?.activeParameter).toBe(1);
        expect(result?.parameterText).toBe("#top");
        expect(result?.signatures[0]?.parameters[1]?.documentation).toMatch(/at most one/i);
    });

    it("works unclosed and resolves absolute ranges in a multi-line document", () => {
        const text = "# Title\n\nBody {.wi|de";
        const { cursor } = at(text);
        const result = getSignatureHelp(text.replace("|", ""), cursor);
        expect(result?.context).toBe("attributes");
        const range = result!.parameterRange!;
        expect(text.replace("|", "").slice(range.from, range.to)).toBe(".wide");
        expect(range.from).toBeGreaterThan(8);
    });

    it("suggests #id for the empty slot after a class", () => {
        const result = help("{.wide |}");
        expect(result?.activeParameter).toBe(1);
        expect(result?.parameterText).toBe("");
        expect(result?.parameterRange).toBeNull();
    });

    it("returns null after the closing brace", () => {
        expect(help("# T {.cv-name}| x")).toBeNull();
    });
});

describe("no signature help", () => {
    it("returns null for plain text", () => {
        expect(help("Just some |prose.")).toBeNull();
        expect(help("## Edu|cation")).toBeNull();
    });

    it("returns null for braces that are not attribute blocks", () => {
        expect(help("Use {hel|lo} here")).toBeNull();
        expect(help("a {key=va|lue} b")).toBeNull();
    });

    it("clamps an out-of-range cursor instead of throwing", () => {
        expect(getSignatureHelp(":::resume{#main}", 999)).toBeNull();
        expect(getSignatureHelp("", 0)).toBeNull();
        expect(getSignatureHelp("text", -1)).toBeNull();
    });
});
