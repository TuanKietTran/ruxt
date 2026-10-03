import type { CvDocument, CvDocumentSummary } from "@core/domain/cv";

/**
 * Browser-side safety net for CV sessions. Every session this browser opens or edits keeps its latest
 * source here, so a deployment whose storage misses a session (a new or different KV database, a lost
 * filesystem, a failed write during a rollout) cannot make it disappear: the sidebar still lists it and
 * the layout re-creates it on the server from this copy.
 */
export interface CvSessionBackup {
    markdown: string;
    css: string;
    /** Server revision the source is based on. */
    revision: number;
    /** The source has edits the server has not acknowledged. */
    pending: boolean;
    /** Session title when last seen, for listing a session the server no longer returns. */
    title?: string;
    /** Last local change (ms since epoch). */
    savedAt?: number;
}

export interface CvSessionBackupEntry extends CvSessionBackup {
    id: string;
}

export const CV_SESSION_BACKUP_PREFIX = "cv-sv:session-backup:";
/** The unregistered `/` draft, kept until the server confirms its new session. */
export const CV_NEW_SESSION_DRAFT_KEY = "cv-sv:new-session-draft";

const parseBackup = (raw: string | null): CvSessionBackup | null => {
    try {
        const value = JSON.parse(raw || "null");
        if (!value || typeof value.markdown !== "string" || typeof value.css !== "string" || !Number.isInteger(value.revision)) return null;
        return {
            markdown: value.markdown,
            css: value.css,
            revision: value.revision,
            pending: Boolean(value.pending),
            title: typeof value.title === "string" ? value.title : undefined,
            savedAt: Number.isFinite(value.savedAt) ? value.savedAt : undefined,
        };
    } catch {
        return null;
    }
};

export function readCvSessionBackup(id: string): CvSessionBackup | null {
    try {
        return parseBackup(localStorage.getItem(CV_SESSION_BACKUP_PREFIX + id));
    } catch {
        return null;
    }
}

export function writeCvSessionBackup(id: string, backup: CvSessionBackup): void {
    const title = backup.title ?? cvTitleFromMarkdown(backup.markdown) ?? readCvSessionBackup(id)?.title;
    try {
        localStorage.setItem(CV_SESSION_BACKUP_PREFIX + id, JSON.stringify({ ...backup, title, savedAt: backup.savedAt ?? Date.now() }));
    } catch { /* storage full or blocked */ }
}

/** Forget a session's local backup (after the session is deleted). */
export function clearCvSessionBackup(id: string): void {
    try { localStorage.removeItem(CV_SESSION_BACKUP_PREFIX + id); } catch { /* storage blocked */ }
}

/** Every session backed up in this browser. */
export function listCvSessionBackups(): CvSessionBackupEntry[] {
    const entries: CvSessionBackupEntry[] = [];
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(CV_SESSION_BACKUP_PREFIX)) continue;
            const backup = parseBackup(localStorage.getItem(key));
            if (backup) entries.push({ ...backup, id: key.slice(CV_SESSION_BACKUP_PREFIX.length) });
        }
    } catch { /* storage blocked */ }
    return entries;
}

export const cvTitleFromMarkdown = (markdown: string) =>
    markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*\{[^{}]+\}\s*$/, "").trim() || undefined;

/**
 * Whether the local backup should replace what the server returned: the server
 * lost the session, is behind this browser, or never received its last edit.
 */
export function shouldRestoreCvBackup(
    backup: CvSessionBackup | null,
    server: Pick<CvDocument, "markdown" | "css" | "revision"> | null | undefined,
): backup is CvSessionBackup {
    if (!backup) return false;
    if (!server) return true;
    if (backup.revision > server.revision) return true;
    return backup.pending && backup.revision === server.revision
        && (backup.markdown !== server.markdown || backup.css !== server.css);
}

/** A session listed from this browser's backup because the server did not return it. */
export interface LocalOnlyCvSession extends CvDocumentSummary {
    localOnly: true;
}

/**
 * Server sessions plus backed-up sessions the server is missing, newest first. Only route ids
 * (what the editor creates) are considered, so stray keys never surface as sessions.
 */
export function mergeCvSessions(
    server: CvDocumentSummary[],
    backups: CvSessionBackupEntry[],
): Array<CvDocumentSummary | LocalOnlyCvSession> {
    const known = new Set(server.map(document => document.id));
    const localOnly: LocalOnlyCvSession[] = backups
        .filter(backup => !known.has(backup.id) && isCvRouteId(backup.id) && backup.markdown.trim())
        .map(backup => ({
            id: backup.id,
            title: backup.title ?? cvTitleFromMarkdown(backup.markdown),
            revision: backup.revision,
            updatedAt: new Date(backup.savedAt ?? 0).toISOString(),
            localOnly: true,
        }));
    return [...server, ...localOnly].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Backed-up sessions the server does not have and that should be re-created there. */
export function cvSessionsToRecover(server: CvDocumentSummary[], backups: CvSessionBackupEntry[]): CvSessionBackupEntry[] {
    const known = new Set(server.map(document => document.id));
    return backups.filter(backup => !known.has(backup.id) && isCvRouteId(backup.id) && backup.markdown.trim());
}

const routeIdPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
export const isCvRouteId = (id: string) => routeIdPattern.test(id);

export interface CvNewSessionDraft {
    markdown: string;
    css: string;
    savedAt: number;
}

export function readCvNewSessionDraft(): CvNewSessionDraft | null {
    try {
        const value = JSON.parse(localStorage.getItem(CV_NEW_SESSION_DRAFT_KEY) || "null");
        return value && typeof value.markdown === "string" && typeof value.css === "string"
            ? { markdown: value.markdown, css: value.css, savedAt: Number(value.savedAt) || 0 }
            : null;
    } catch {
        return null;
    }
}

export function writeCvNewSessionDraft(draft: Pick<CvNewSessionDraft, "markdown" | "css">): void {
    try { localStorage.setItem(CV_NEW_SESSION_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* storage full or blocked */ }
}

export function clearCvNewSessionDraft(): void {
    try { localStorage.removeItem(CV_NEW_SESSION_DRAFT_KEY); } catch { /* storage blocked */ }
}
