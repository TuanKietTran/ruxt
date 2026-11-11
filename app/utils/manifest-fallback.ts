/**
 * Manifest load fallbacks.
 *
 * Pure helpers for loading a chunked-storage manifest with clear
 * outcomes instead of a thrown error or a silent blank screen:
 *
 * - `network` failures (fetch failed, storage backend unavailable,
 *   timeouts, and anything unrecognised) are transient: the primary
 *   load is retried, then the caller-supplied fallback loader runs.
 *   The fallback is typically a main-thread / local load used when
 *   the worker or remote path cannot be reached.
 * - `corrupt` failures (a missing chunk, a chunk size mismatch, a
 *   corrupt chunk set, or bytes that do not decode) are never
 *   retried on the same path — retrying cannot repair the stored
 *   bytes — but a clean fallback load still succeeds.
 * - `empty` manifests (no value, an empty string, or a chunk header
 *   declaring zero chunks or zero bytes) are a first-class empty
 *   state, not an error, and never trigger the fallback.
 *
 * No I/O lives here: both loaders are injected by the caller, so
 * this module stays unit-testable without storage or network.
 */

export type ManifestFailureKind = "network" | "corrupt" | "empty";

export interface ManifestFailure {
    kind: ManifestFailureKind;
    retryable: boolean;
    message: string;
}

export type ManifestLoadResult<T> =
    | { status: "ready"; value: T; source: "primary" | "fallback"; attempts: number }
    | { status: "empty"; attempts: number }
    | { status: "error"; failure: ManifestFailure; attempts: number };

export interface LoadManifestOptions<T> {
    load: () => Promise<T | null | undefined>;
    fallbackLoad?: () => Promise<T | null | undefined>;
    retries?: number;
}

const EMPTY_PATTERNS: readonly RegExp[] = [
    /empty manifest/i,
    /manifest is empty/i,
    /no manifest/i,
];

const CORRUPT_PATTERNS: readonly RegExp[] = [
    /missing chunk/i,
    /size mismatch/i,
    /corrupt/i,
    /unexpected token/i,
    /unexpected end of json/i,
    /invalid json/i,
    /failed to decode/i,
    /undecodable/i,
];

function messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (
        error !== null
        && typeof error === "object"
        && "message" in error
        && typeof (error as { message: unknown }).message === "string"
    ) {
        return (error as { message: string }).message;
    }
    return String(error);
}

export function classifyManifestError(error: unknown): ManifestFailure {
    const message = messageOf(error);
    if (EMPTY_PATTERNS.some((pattern) => pattern.test(message))) {
        return { kind: "empty", retryable: false, message };
    }
    if (
        error instanceof SyntaxError
        || CORRUPT_PATTERNS.some((pattern) => pattern.test(message))
    ) {
        return { kind: "corrupt", retryable: false, message };
    }
    return { kind: "network", retryable: true, message };
}

export function isEmptyManifestValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (record.$ruxtStorage === "ruxt-chunked-json-v1") {
            const chunks = record.chunks;
            const bytes = record.bytes;
            return !(
                typeof chunks === "number" && chunks > 0
                && typeof bytes === "number" && bytes > 0
            );
        }
    }
    return false;
}

export async function loadManifestWithFallback<T>(
    options: LoadManifestOptions<T>,
): Promise<ManifestLoadResult<T>> {
    const retries = Math.max(0, Math.floor(options.retries ?? 1));
    let attempts = 0;
    let lastFailure: ManifestFailure = {
        kind: "network",
        retryable: true,
        message: "Manifest load failed before any attempt ran",
    };

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        attempts += 1;
        try {
            const value = await options.load();
            if (isEmptyManifestValue(value)) return { status: "empty", attempts };
            return { status: "ready", value: value as T, source: "primary", attempts };
        } catch (error) {
            const failure = classifyManifestError(error);
            if (failure.kind === "empty") return { status: "empty", attempts };
            lastFailure = failure;
            if (!failure.retryable) break;
        }
    }

    if (options.fallbackLoad) {
        attempts += 1;
        try {
            const value = await options.fallbackLoad();
            if (isEmptyManifestValue(value)) return { status: "empty", attempts };
            return { status: "ready", value: value as T, source: "fallback", attempts };
        } catch (error) {
            const failure = classifyManifestError(error);
            if (failure.kind === "empty") return { status: "empty", attempts };
            return { status: "error", failure, attempts };
        }
    }

    return { status: "error", failure: lastFailure, attempts };
}

export function manifestLoadMessage(result: ManifestLoadResult<unknown>): string {
    if (result.status === "ready") return "Manifest loaded.";
    if (result.status === "empty") {
        return "Nothing here yet \u2014 the manifest is empty and no data has been saved.";
    }
    if (result.failure.kind === "corrupt") {
        return "The saved data is damaged \u2014 a manifest chunk is missing or corrupt, so it could not be read.";
    }
    if (result.failure.kind === "empty") {
        return "Nothing here yet \u2014 the manifest is empty and no data has been saved.";
    }
    return "The manifest could not be reached \u2014 check your connection and try again.";
}
