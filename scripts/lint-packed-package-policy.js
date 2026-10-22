export const PACKED_PACKAGE_DEPENDENCIES = Object.freeze({
    "@ruxt/core": "file:../package-artifacts/phase3/ruxt-core-0.2.0.tgz",
    "@ruxt/editor": "file:../package-artifacts/phase3/ruxt-editor-0.1.1.tgz",
});

export function packedPackagePolicyFailures(packageManifest, workspaceConfig) {
    const failures = [];
    for (const [name, artifact] of Object.entries(PACKED_PACKAGE_DEPENDENCIES)) {
        if (packageManifest.dependencies?.[name] !== artifact) {
            failures.push(`package.json: ${name} must use the exact local packed artifact ${artifact}`);
        }
        if (new RegExp(`^\\s*['"]?${name}['"]?:`, "m").test(workspaceConfig)) {
            failures.push(`pnpm-workspace.yaml: remove the local/workspace override for ${name}`);
        }
    }
    return failures;
}
