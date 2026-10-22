import type { CvDocumentProps } from "@ruxt/core/domain/cv";

export type ProfileApplyResult =
    | { documentId: string; ok: true; document: CvDocumentProps }
    | { documentId: string; ok: false; error: string };

/** HTTP response shape used by the profile page; this stays independent of core handler modules. */
export interface ProfileApplyResponse {
    results: ProfileApplyResult[];
    applied: number;
    failed: number;
}

export interface ProfileApplyStatus {
    ok: boolean;
    message: string;
}

export function mapProfileApplyResults(response: ProfileApplyResponse): Record<string, ProfileApplyStatus> {
    return Object.fromEntries(response.results.map(result => [result.documentId, result.ok
        ? { ok: true, message: "Applied" }
        : { ok: false, message: result.error }]));
}

export function profileApplyErrorMessage(error: unknown): string {
    if (!error || typeof error !== "object") return "Apply failed.";
    const cause = error as { data?: { statusMessage?: string }; message?: string };
    return cause.data?.statusMessage ?? cause.message ?? "Apply failed.";
}
