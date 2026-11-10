import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("useEditorChrome SSR safety", () => {
    it("publish() is a no-op on the server so callbacks never reach the SSR payload", () => {
        const source = readFileSync("app/composables/useEditorChrome.ts", "utf8");
        const publish = source.slice(source.indexOf("const publish"), source.indexOf("const clear"));
        expect(publish).toContain("if (import.meta.server) return;");
        expect(publish.indexOf("import.meta.server")).toBeLessThan(publish.indexOf("chrome.value = state"));
    });
});
