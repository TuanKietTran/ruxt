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
    it("rejects every private package path, including type-only imports and re-exports", () => {
        const root = appRoot();
        mkdirSync(join(root, "nested"));
        writeFileSync(join(root, "nested", "consumer.ts"), 'import type { Result } from "@core/domain/iam";\n');
        writeFileSync(join(root, "nested", "barrel.ts"), 'export type { Result } from "@ruxt/core/domain/cv";\n');
        writeFileSync(join(root, "nested", "root.ts"), 'import "@ruxt/core";\n');
        expect(findForbiddenAppImports(root)).toEqual([
            { file: "nested/barrel.ts", line: 1, specifier: "@ruxt/core/domain/cv" },
            { file: "nested/consumer.ts", line: 1, specifier: "@core/domain/iam" },
            { file: "nested/root.ts", line: 1, specifier: "@ruxt/core" },
        ]);
    });

    it("parses Vue scripts, import types, dynamic and require calls, and backtick module literals", () => {
        const root = appRoot();
        writeFileSync(join(root, "page.vue"), `<template><p>import type is visible text</p></template>\n<script setup lang="ts">\nconst example = "@core/handlers/not-an-import";\nimport type { Result } from "@core/domain/iam";\ntype Contract = import("@ruxt/core/domain/cv").CvProfileProps;\nconst load = () => import(\`@ruxt/core/domain/preferences\`);\nconst legacy = require("@core/shared");\n</script>\n`);
        expect(findForbiddenAppImports(root)).toEqual([
            { file: "page.vue", line: 4, specifier: "@core/domain/iam" },
            { file: "page.vue", line: 5, specifier: "@ruxt/core/domain/cv" },
            { file: "page.vue", line: 6, specifier: "@ruxt/core/domain/preferences" },
            { file: "page.vue", line: 7, specifier: "@core/shared" },
        ]);
    });

    it("allows public shared imports and non-package paths that merely share a prefix", () => {
        const root = appRoot();
        writeFileSync(join(root, "allowed.ts"), 'import type { CvProfileProps } from "@ruxt/shared/cv";\nimport { Email } from "@ruxt/shared/email";\nconst example = "@core/domain/iam";\n');
        writeFileSync(join(root, "also-allowed.js"), 'import { handler } from "@ruxt/coreish/domain";\n');
        expect(findForbiddenAppImports(root)).toEqual([]);
    });
});
