import { describe, expect, it } from "vitest";
import { findShortPolls, parseHeadersFile } from "../../scripts/check-request-budget.js";

describe("request budget guardrail", () => {
    it("flags the old three-second document poll, inline or through a named callback", () => {
        const inline = "e.onerror=()=>{t??=setInterval(async()=>{await $fetch(`/api/cvs/${encodeURIComponent(n.value)}`)},3e3)};";
        const named = "function p(){return $fetch(\"/api/cvs/\"+i)}const h=window.setInterval(p,5000);";
        expect(findShortPolls(inline)).toEqual([{ file: "bundle.js", line: 1, ms: 3000 }]);
        expect(findShortPolls(named)).toEqual([{ file: "bundle.js", line: 1, ms: 5000 }]);
    });

    it("follows a minifier's timer alias, within a chunk and across chunk imports", () => {
        // The shape of the deployed fallback poll: `Dt=globalThis.setInterval` and a 3e3 literal.
        const deployed = "const Dt=globalThis.setInterval;S.onerror=()=>{S?.close(),C??=Dt(async()=>{try{M(await N(`/api/cvs/${encodeURIComponent(s.value)}`))}catch{}},3e3)};";
        expect(findShortPolls(deployed)).toEqual([{ file: "bundle.js", line: 1, ms: 3000 }]);
        const shared = { file: "_nuxt/a1.js", source: "const t=globalThis.setInterval.bind(globalThis);export{t as i};" };
        const editor = { file: "_nuxt/b2.js", source: "import{i as q}from\"./a1.js\";q(()=>$fetch(`/api/cvs/${n}`),3e3);" };
        expect(findShortPolls([shared, editor])).toEqual([{ file: "_nuxt/b2.js", line: 1, ms: 3000 }]);
    });

    it("allows slow polls, computed delays and unrelated short intervals", () => {
        expect(findShortPolls("setInterval(()=>$fetch(`/api/cvs/${i}`),6e4);")).toEqual([]);
        expect(findShortPolls("setTimeout(()=>$fetch(`/api/cvs/${i}`),s*1e3*2**f);")).toEqual([]);
        expect(findShortPolls("setInterval(()=>tick(),1e3);fetch('/api/cvs')")).toEqual([]);
    });

    it("joins repeated header rules the way Workers Assets does", () => {
        const rules = parseHeadersFile([
            "# comment",
            "/favicon.ico",
            "  cache-control: public, max-age=86400",
            "/_nuxt/*",
            "  cache-control: public, max-age=31536000, immutable",
            "/_nuxt/*",
            "  x-extra: 1",
        ].join("\n"));
        expect(rules.get("/favicon.ico")?.get("cache-control")).toBe("public, max-age=86400");
        expect(Object.fromEntries(rules.get("/_nuxt/*") ?? [])).toEqual({ "cache-control": "public, max-age=31536000, immutable", "x-extra": "1" });
    });
});
