export const REGISTRY_PACKAGE_DEPENDENCIES = Object.freeze({
    "@ruxt/shared": "0.1.0",
    "@ruxt/editor": "0.1.2",
});

export const PRIVATE_PACKAGE_DEPENDENCIES = Object.freeze({
    "@ruxt/core": "file:../package-artifacts/phase4/ruxt-core-0.2.0.tgz",
});

export const PACKED_PACKAGE_DEPENDENCIES = Object.freeze({
    ...REGISTRY_PACKAGE_DEPENDENCIES,
    ...PRIVATE_PACKAGE_DEPENDENCIES,
});

const FORBIDDEN_OVERRIDES = Object.freeze(["@ruxt/core", "@ruxt/editor"]);

export function packedPackagePolicyFailures(packageManifest, workspaceConfig) {
    const failures = [];
    for (const [name, version] of Object.entries(REGISTRY_PACKAGE_DEPENDENCIES)) {
        if (packageManifest.dependencies?.[name] !== version) {
            failures.push(`package.json: ${name} must use the exact published version ${version}`);
        }
    }
    for (const [name, artifact] of Object.entries(PRIVATE_PACKAGE_DEPENDENCIES)) {
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
    const sharedVersion = REGISTRY_PACKAGE_DEPENDENCIES["@ruxt/shared"];
    if (sharedOverride && sharedOverride[1] !== sharedVersion) {
        failures.push(`pnpm-workspace.yaml: @ruxt/shared override must use the exact published version ${sharedVersion}`);
    }
    return failures;
}
