import { describe, expect, it } from "vitest";
import { packedPackagePolicyFailures, PACKED_PACKAGE_DEPENDENCIES } from "../../scripts/lint-packed-package-policy.js";

describe("packed package install policy", () => {
    it("accepts exact published public versions and the active private core fallback artifact", () => {
        expect(packedPackagePolicyFailures({ dependencies: PACKED_PACKAGE_DEPENDENCIES }, "packages:\n  - infra\n")).toEqual([]);
    });

    it("allows only the exact published shared version override needed by core", () => {
        const shared = PACKED_PACKAGE_DEPENDENCIES["@ruxt/shared"];
        expect(packedPackagePolicyFailures(
            { dependencies: PACKED_PACKAGE_DEPENDENCIES },
            `packages:\n  - infra\noverrides:\n  '@ruxt/shared': ${shared}\n`,
        )).toEqual([]);
    });

    it("rejects stale pins, sibling paths, private package overrides, and a wrong shared override", () => {
        const failures = packedPackagePolicyFailures({
            dependencies: { "@ruxt/shared": "file:../package-artifacts/phase4/ruxt-shared-0.0.0.tgz", "@ruxt/core": "0.2.0", "@ruxt/editor": "link:../ruxt-core/packages/editor" },
        }, "overrides:\n  '@ruxt/core': link:../ruxt-core\n  '@ruxt/shared': @ruxt/shared@0.0.0\n");
        expect(failures).toEqual([
            "package.json: @ruxt/shared must use the exact published version 0.1.0",
            "package.json: @ruxt/editor must use the exact published version 0.1.2",
            "package.json: @ruxt/core must use the exact local packed artifact file:../package-artifacts/phase4/tuankiettran-ruxt-core-0.3.0.tgz",
            "pnpm-workspace.yaml: remove the local/workspace override for @ruxt/core",
            "pnpm-workspace.yaml: @ruxt/shared override must use the exact published version 0.1.0",
        ]);
    });
});
