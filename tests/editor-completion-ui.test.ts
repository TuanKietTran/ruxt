import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const componentPath = "../packages/editor/app/components/CompletionPopup.vue";
const component = () => source(componentPath);

describe("editor completion popup contract (static source checks)", () => {
    it("exists as a standalone component", () => {
        expect(existsSync(new URL(componentPath, import.meta.url))).toBe(true);
    });

    it("declares items/open/activeIndex props and select/cancel emits", () => {
        const src = component();
        expect(src).toContain("defineProps");
        expect(src).toMatch(/items:\s*readonly CompletionItem\[\]/);
        expect(src).toMatch(/open:\s*boolean/);
        expect(src).toMatch(/activeIndex:\s*number/);
        expect(src).toContain("defineEmits");
        expect(src).toMatch(/select:\s*\[item: CompletionItem, index: number\]/);
        expect(src).toMatch(/cancel:\s*\[\]/);
        expect(src).toMatch(/"update:activeIndex":\s*\[index: number\]/);
        expect(src).toMatch(/export interface CompletionItem/);
        expect(src).toMatch(/label:\s*string/);
    });

    it("renders a listbox with aria-activedescendant tracking the active option", () => {
        const src = component();
        expect(src).toContain('v-if="open"');
        expect(src).toContain('role="listbox"');
        expect(src).toContain(":aria-activedescendant");
        expect(src).toContain('role="option"');
        expect(src).toContain(":aria-selected");
        expect(src).toContain(":id=\"optionId(index)\"");
        expect(src).toContain("useId");
    });

    it("handles full keyboard: up/down wrap, enter selects, escape cancels", () => {
        const src = component();
        expect(src).toContain('@keydown="onKeydown"');
        expect(src).toContain('"ArrowDown"');
        expect(src).toContain('"ArrowUp"');
        expect(src).toContain('"Enter"');
        expect(src).toContain('"Escape"');
        expect(src).toContain('"Home"');
        expect(src).toContain('"End"');
        expect(src).toContain("event.preventDefault()");
        expect(src).toMatch(/% props\.items\.length/);
        expect(src).toContain('emit("select"');
        expect(src).toContain('emit("cancel")');
        expect(src).toContain('emit("update:activeIndex"');
    });

    it("selects on click and tracks the pointer for the active option", () => {
        const src = component();
        expect(src).toContain('@click="selectAt(index)"');
        expect(src).toContain('@pointerenter="setActive(index)"');
    });

    it("renders label, kind and detail, with an empty state", () => {
        const src = component();
        expect(src).toContain("{{ item.label }}");
        expect(src).toContain("item.detail");
        expect(src).toContain("item.kind");
        expect(src).toContain('role="status"');
        expect(src).toContain("No completions");
    });

    it("uses only theme CSS vars that exist in themes.css, no hard-coded palette", () => {
        const src = component();
        const themes = source("../app/assets/theme/themes.css");
        const defined = new Set([...themes.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
        const used = [...src.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]);
        expect(used.length).toBeGreaterThan(0);
        for (const name of used) expect(defined, `--${name}`).toContain(name);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(src).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
    });

    it("stays sane at 390px: fluid width, wrapping text, scrollable list", () => {
        const src = component();
        expect(src).toMatch(/max-width:\s*min\(320px, calc\(100vw - 16px\)\)/);
        expect(src).toContain("overflow-y: auto");
        expect(src).toContain("overflow-wrap: anywhere");
        expect(src).toMatch(/max-height:/);
    });

    it("does not wire itself into CodeMirror (manager integrates later)", () => {
        const src = component();
        expect(src).not.toContain("useCodeMirror");
        expect(src).not.toContain("@codemirror");
    });
});
