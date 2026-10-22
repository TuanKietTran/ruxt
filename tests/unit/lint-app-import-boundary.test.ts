import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findForbiddenAppImports } from "../../scripts/lint-app-import-boundary.js";

const temporaryRoots: string[] = [];
const appRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "ruxt-app-boundary-"));
    temporaryRoots.push(root);
    return root;
};
afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("frontend import boundary", () => {
    it("finds handler imports and re-exports including type-only imports", () => {
        const root = appRoot();
        mkdirSync(join(root, "nested"));
        writeFileSync(join(root, "nested", "consumer.ts"), 'import type { Result } from "@core/handlers/apply";\n');
        writeFileSync(join(root, "nested", "barrel.ts"), 'export type { Result } from "@ruxt/core/handlers/apply";\n');
        expect(findForbiddenAppImports(root)).toEqual([
            { file: "nested/barrel.ts", line: 1, specifier: "@ruxt/core/handlers/apply" },
            { file: "nested/consumer.ts", line: 1, specifier: "@core/handlers/apply" },
        ]);
    });

    it("parses Vue script blocks, dynamic imports and import types without matching plain strings", () => {
        const root = appRoot();
        writeFileSync(join(root, "page.vue"), `<template><p>import type is visible text</p></template>\n<script setup lang="ts">\nconst example = "@core/handlers/not-an-import";\nimport type { Result } from "@core/handlers/apply";\ntype Handler = typeof import("@core/handlers/apply");\nconst load = () => import("@ruxt/core/handlers/apply");\n</script>\n`);
        expect(findForbiddenAppImports(root)).toEqual([
            { file: "page.vue", line: 4, specifier: "@core/handlers/apply" },
            { file: "page.vue", line: 5, specifier: "@core/handlers/apply" },
            { file: "page.vue", line: 6, specifier: "@ruxt/core/handlers/apply" },
        ]);
    });

    it("accepts domain contracts and paths that merely share a prefix", () => {
        const root = appRoot();
        writeFileSync(join(root, "allowed.ts"), 'import type { CvDocumentProps } from "@core/domain/cv";\nconst example = "@core/handlers/foo";\n');
        writeFileSync(join(root, "also-allowed.js"), 'import { handler } from "@core/handlers-not-a-module";\n');
        expect(findForbiddenAppImports(root)).toEqual([]);
    });
});
