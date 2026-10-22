export const PACKED_PACKAGE_DEPENDENCIES = Object.freeze({
    "@ruxt/shared": "file:../package-artifacts/phase4/ruxt-shared-0.0.0.tgz",
    "@ruxt/core": "file:../package-artifacts/phase4/ruxt-core-0.2.0.tgz",
    "@ruxt/editor": "file:../package-artifacts/phase4/ruxt-editor-0.1.1.tgz",
});

const FORBIDDEN_OVERRIDES = Object.freeze(["@ruxt/core", "@ruxt/editor"]);

export function packedPackagePolicyFailures(packageManifest, workspaceConfig) {
    const failures = [];
    for (const [name, artifact] of Object.entries(PACKED_PACKAGE_DEPENDENCIES)) {
        if (packageManifest.dependencies?.[name] !== artifact) {
            failures.push(`package.json: ${name} must use the exact local packed artifact ${artifact}`);
        }
    }
    for (const name of FORBIDDEN_OVERRIDES) {
        if (new RegExp(`^\\s*['"]?${name.replace("/", "\\/")}['"]?:`, "m").test(workspaceConfig)) {
            failures.push(`pnpm-workspace.yaml: remove the local/workspace override for ${name}`);
        }
    }
    const sharedOverride = workspaceConfig.match(/^\s*['"]?@ruxt\/shared['"]?:\s*(\S.*?)\s*$/m);
    const sharedArtifact = PACKED_PACKAGE_DEPENDENCIES["@ruxt/shared"];
    if (sharedOverride && sharedOverride[1] !== sharedArtifact) {
        failures.push(`pnpm-workspace.yaml: @ruxt/shared override must use the exact local artifact ${sharedArtifact}`);
    }
    return failures;
}
