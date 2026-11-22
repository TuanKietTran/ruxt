/**
 * Pure view helpers for the Job automation screens. They hold the decisions that were previously
 * inlined in templates (and got them wrong), so they can be unit-tested without mounting a page.
 */

export interface CapabilityGrantLike { capability: string; method: string; permitted: boolean }
export interface SourceLike { policy?: { capabilities?: CapabilityGrantLike[] } | null }

export type SubmitMode = "automated" | "handoff";

/**
 * How an application on this source gets submitted. Only a permitted authorized-API grant is
 * automatic; everything else (including an unknown source) is a handoff the candidate performs.
 */
export function submitMode(source: SourceLike | null | undefined): SubmitMode {
    const grants = source?.policy?.capabilities ?? [];
    return grants.some(g => g.capability === "submitApplication" && g.permitted && g.method === "authorized_api") ? "automated" : "handoff";
}

/** A CV as the candidate knows it: its title and revision, never a bare UUID. */
export function cvLabel(id: string | null | undefined, revision: number | null | undefined, titles: Record<string, string | undefined>): string {
    if (!id) return "—";
    const title = titles[id]?.trim();
    const rev = revision ? ` · rev ${revision}` : "";
    return `${title || `CV ${id.slice(0, 8)}`}${rev}`;
}

export interface SendResult { created?: boolean; new_applications?: number; rematched?: number }

/** The toast after "Send selected": what changed, including applications that were re-evaluated. */
export function sendResultMessage(result: SendResult, cvCount: number): string {
    if (!result.created) return "Nothing changed since the last send.";
    const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const parts = [`Sent ${noun(cvCount, "CV", "CVs")}`];
    if (result.new_applications) parts.push(`${noun(result.new_applications, "new job", "new jobs")} queued for matching`);
    if (result.rematched) parts.push(`${noun(result.rematched, "existing application", "existing applications")} re-evaluated with your updated data`);
    return `${parts.join(". ")}.`;
}

const MISSING_PREFIX = "missing information the candidate must provide: ";

/** Splits the core's "missing information…: A; B; C" reason into a lead-in and one entry per question. */
export function splitReason(reason: string | null | undefined): { lead: string; items: string[] } {
    const text = (reason ?? "").trim();
    if (!text.startsWith(MISSING_PREFIX)) return { lead: text, items: [] };
    const items = text.slice(MISSING_PREFIX.length).split(/;\s+/).map(s => s.trim()).filter(Boolean);
    return { lead: "Needs your answer to:", items };
}
