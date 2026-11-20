import type { CvDocumentProps, CvProfileProps } from "@ruxt/shared/cv";

/**
 * Candidate snapshot for the Job CV Finder core (contract: candidate-snapshot.schema.json, v1).
 *
 * Ruxt stays the owner of profiles and CVs: they live in this browser, and only what the owner
 * explicitly selects is sent, as a read-only copy that keeps each CV's id and revision. Standalone
 * profiles are otherwise never uploaded (specs/authenticated-cloud-data.md); sending one here is a
 * deliberate, per-send action from the Job automation screen.
 */
export interface JobPreferences {
    locations: string[];
    work_modes: ("onsite" | "hybrid" | "remote")[];
    target_roles: string[];
    excluded_keywords: string[];
    salary_min: number | null;
    salary_currency: string | null;
    /** Standing answers written by the candidate (notice period, work authorization, …). */
    answers: Record<string, string>;
}

export const JOB_PREFERENCES_KEY = "ruxt:job-automation:preferences:v1";
export const JOB_SNAPSHOT_SELECTION_KEY = "ruxt:job-automation:selection:v1";

export const emptyJobPreferences = (): JobPreferences => ({
    locations: [], work_modes: [], target_roles: [], excluded_keywords: [], salary_min: null, salary_currency: null, answers: {},
});

/** Well-known standing answers the core maps application questions onto. */
export const STANDING_ANSWER_KEYS = [
    { key: "notice_period", label: "Notice period" },
    { key: "work_authorization", label: "Work authorization / visa sponsorship" },
    { key: "salary_expectation", label: "Salary expectation" },
    { key: "availability", label: "Availability / start date" },
    { key: "relocation", label: "Relocation" },
] as const;

const list = (values: unknown, max: number) => (Array.isArray(values) ? values : [])
    .filter((value): value is string => typeof value === "string")
    .map(value => value.trim()).filter(Boolean).slice(0, max);

/** Parse stored preferences defensively (local storage is user-editable). */
export function normalizeJobPreferences(raw: unknown): JobPreferences {
    const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const modes = list(value.work_modes, 3).filter((mode): mode is JobPreferences["work_modes"][number] => ["onsite", "hybrid", "remote"].includes(mode));
    const answers: Record<string, string> = {};
    if (value.answers && typeof value.answers === "object") {
        for (const [key, answer] of Object.entries(value.answers as Record<string, unknown>)) {
            if (typeof answer === "string" && answer.trim() && Object.keys(answers).length < 100) answers[key.slice(0, 100)] = answer.trim().slice(0, 2000);
        }
    }
    const salary = typeof value.salary_min === "number" && Number.isFinite(value.salary_min) && value.salary_min >= 0 ? value.salary_min : null;
    const currency = typeof value.salary_currency === "string" && value.salary_currency.trim() ? value.salary_currency.trim().toUpperCase().slice(0, 8) : null;
    return {
        locations: list(value.locations, 30), work_modes: [...new Set(modes)], target_roles: list(value.target_roles, 30),
        excluded_keywords: list(value.excluded_keywords, 50), salary_min: salary, salary_currency: currency, answers,
    };
}

export interface SnapshotInput {
    profileId: string;
    profileLabel?: string;
    profileUpdatedAt: number | string;
    profile: CvProfileProps;
    cvs: CvDocumentProps[];
    preferences: JobPreferences;
    appVersion?: string;
    now?: Date;
}

const iso = (value: number | string) => new Date(value).toISOString();

export function buildCandidateSnapshot(input: SnapshotInput) {
    if (!input.cvs.length) throw new Error("Select at least one CV to send.");
    if (input.cvs.length > 50) throw new Error("Select at most 50 CVs.");
    return {
        schema_version: 1 as const,
        source: { system: "ruxt" as const, ...(input.appVersion ? { app_version: input.appVersion.slice(0, 64) } : {}), exported_at: (input.now ?? new Date()).toISOString() },
        profile: {
            profile_id: input.profileId,
            ...(input.profileLabel ? { label: input.profileLabel.slice(0, 200) } : {}),
            updated_at: iso(input.profileUpdatedAt),
            data: input.profile,
        },
        cvs: input.cvs.map(cv => ({
            cv_id: cv.id,
            revision: Math.max(1, cv.revision || 1),
            title: (cv.title ?? "Untitled CV").slice(0, 300),
            markdown: cv.markdown,
            css: cv.css,
            updated_at: iso(cv.updatedAt),
        })),
        preferences: normalizeJobPreferences(input.preferences),
    };
}
