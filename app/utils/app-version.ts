export interface AppVersionInput {
    gitTag?: string | null;
    envRefName?: string | null;
    gitSha?: string | null;
    envSha?: string | null;
}

export interface AppVersion {
    version: string;
    commit: string;
}

const trimmed = (value: string | null | undefined): string => (value ?? "").trim();

export function resolveAppVersion(input: AppVersionInput): AppVersion {
    const gitTag = trimmed(input.gitTag);
    const envRefName = trimmed(input.envRefName);
    const gitSha = trimmed(input.gitSha);
    const envSha = trimmed(input.envSha);
    return {
        version: gitTag || envRefName || "dev",
        commit: (gitSha || envSha || "").slice(0, 7),
    };
}

export function formatAppVersion(version: string, commit: string): string {
    const trimmedVersion = trimmed(version) || "dev";
    const base = /^\d/.test(trimmedVersion) ? `v${trimmedVersion}` : trimmedVersion;
    const trimmedCommit = trimmed(commit);
    if (!/^[0-9a-f]{7}$/i.test(trimmedCommit)) return base;
    return `${base} (${trimmedCommit.toLowerCase()})`;
}
