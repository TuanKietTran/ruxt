import { describe, expect, it } from "vitest";
import { packedPackagePolicyFailures, PACKED_PACKAGE_DEPENDENCIES } from "../../scripts/lint-packed-package-policy.js";

describe("packed package install policy", () => {
    it("accepts only the exact local package artifacts without workspace overrides", () => {
        expect(packedPackagePolicyFailures({ dependencies: PACKED_PACKAGE_DEPENDENCIES }, "packages:\n  - infra\n")).toEqual([]);
    });

    it("rejects registry pins, sibling paths, and package overrides", () => {
        const failures = packedPackagePolicyFailures({
            dependencies: { "@ruxt/core": "0.2.0", "@ruxt/editor": "link:../ruxt-core/packages/editor" },
        }, "overrides:\n  '@ruxt/core': link:../ruxt-core\n");
        expect(failures).toEqual([
            "package.json: @ruxt/core must use the exact local packed artifact file:../package-artifacts/phase3/ruxt-core-0.2.0.tgz",
            "pnpm-workspace.yaml: remove the local/workspace override for @ruxt/core",
            "package.json: @ruxt/editor must use the exact local packed artifact file:../package-artifacts/phase3/ruxt-editor-0.1.1.tgz",
        ]);
    });
});
