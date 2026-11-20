import type { FetchOptions } from "ofetch";

/**
 * Client for the job automation proxy (`/api/jobs/v1/...`). Every call goes to Ruxt's own server,
 * which authenticates the owner and forwards to the Job CV Finder core.
 */
export function useJobAutomation() {
    const fetch = useRequestFetch() as typeof import("ofetch").$fetch;
    const call = <T>(path: string, options?: FetchOptions<"json">) => fetch<T>(`/api/jobs/v1/${path}`, { retry: 0, ...options });

    /** Subscribe to durable workflow events (SSE, resumable). Returns an unsubscribe function. */
    const subscribe = (onEvent: (event: JobEvent) => void, applicationId?: string): (() => void) => {
        if (!import.meta.client || typeof EventSource === "undefined") return () => {};
        const url = `/api/jobs/v1/events/stream${applicationId ? `?application_id=${encodeURIComponent(applicationId)}` : ""}`;
        const source = new EventSource(url);
        const handler = (message: MessageEvent) => {
            try { onEvent(JSON.parse(message.data) as JobEvent); } catch { /* ignore malformed frames */ }
        };
        for (const kind of EVENT_KINDS) source.addEventListener(kind, handler);
        return () => source.close();
    };

    return { call, subscribe };
}

export const EVENT_KINDS = [
    "state.changed", "application.created", "job.ingested", "job.enriched", "task.enqueued", "task.leased", "task.completed",
    "task.failed", "task.lease_expired", "task.result_ignored", "discovery.started", "discovery.finished", "candidate.snapshot_received",
    "answer.provided", "outcome.recorded", "outcome.application_viewed", "account.credential_set", "document.registration",
] as const;

export interface JobEvent {
    seq: number;
    application_id: string | null;
    kind: string;
    from_state: string | null;
    to_state: string | null;
    detail: Record<string, unknown>;
    created_at: string;
}

export interface CapabilityGrant { capability: string; method: string; permitted: boolean; basis: string }
export interface JobSource {
    id: string; kind: string; name: string; enabled: boolean; health: string;
    last_success_at: string | null; last_error: string | null;
    policy: { terms_url: string; terms_verified: boolean; automated_submit: boolean; rate_limit_per_minute: number; daily_submit_limit: number; capabilities: CapabilityGrant[]; notes?: string };
}
export interface PlatformAccount {
    id: string; source_id: string; label: string; has_secret: boolean; status: string; last_auth_at: string | null;
    session?: { status: string; expires_at: string | null; last_checked_at: string | null; invalid_reason: string | null };
}
export interface Job {
    job_id: string; source_id: string; external_job_id: string; company: string; title: string; description: string; location: string;
    work_mode: string; salary_min: number | null; salary_max: number | null; salary_currency: string; required_skills: string[];
    preferred_skills: string[]; application_url: string; completeness: string; status: string; duplicate_of?: string; last_seen_at: string;
}
export interface Requirement { requirement: string; kind: string; evidence_refs: string[]; note?: string }
export interface MatchSummary {
    match_score: number; eligibility: string; confidence: number; recommendation: string;
    dimensions: Record<string, { status: string; score: number | null; note?: string }>;
    matched_requirements: Requirement[]; missing_requirements: Requirement[]; uncertain_requirements: Requirement[];
    facts?: { fact_id: string; category: string; value: string; source_document_id: string; source_version_id: string; evidence_location: string }[];
}
export interface Application {
    id: string; job_id: string; state: string; selected_cv_id: string | null; selected_cv_revision: number | null; executor: string | null;
    attempts: number; last_error: string | null; exception_reason: string | null; outcome: string | null; created_at: string;
    updated_at: string; submitted_at: string | null; job: Job; match?: MatchSummary;
}

export const STATE_LABELS: Record<string, string> = {
    MATCHING: "Matching", MATCHED: "Matched", NOT_SELECTED: "Not selected", SELECTED: "Selected", PREPARING: "Preparing",
    PREPARED: "Prepared", POLICY_CHECK: "Policy check", EXECUTING: "Submitting", VERIFYING: "Verifying", SUBMITTED: "Submitted",
    HANDOFF_PENDING: "Ready for you to apply", FAILED_RETRYABLE: "Retrying", SUBMISSION_UNKNOWN: "Outcome unknown",
    FAILED_FINAL: "Failed", BLOCKED_EXCEPTION: "Needs you",
};
