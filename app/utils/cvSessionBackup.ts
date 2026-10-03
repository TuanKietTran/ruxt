import {
    cvTitleFromMarkdown,
    parseCvSessionBackup,
    type CvSessionBackup,
    type CvSessionBackupEntry,
} from "@core/domain/cv";

/**
 * Browser storage for CV session backups. The rules (when a backup wins, which sessions to re-create,
 * the merged session list) live in `@ruxt/core` (`domain/cv/session-backup`); this module only reads
 * and writes `localStorage`, so a deployment whose storage misses a session cannot make it disappear.
 */
export const CV_SESSION_BACKUP_PREFIX = "cv-sv:session-backup:";
/** The unregistered `/` draft, kept until the server confirms its new session. */
export const CV_NEW_SESSION_DRAFT_KEY = "cv-sv:new-session-draft";

const parseStored = (raw: string | null): CvSessionBackup | null => {
    try {
        return parseCvSessionBackup(JSON.parse(raw || "null"));
    } catch {
        return null;
    }
};

export function readCvSessionBackup(id: string): CvSessionBackup | null {
    try {
        return parseStored(localStorage.getItem(CV_SESSION_BACKUP_PREFIX + id));
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
            const backup = parseStored(localStorage.getItem(key));
            if (backup) entries.push({ ...backup, id: key.slice(CV_SESSION_BACKUP_PREFIX.length) });
        }
    } catch { /* storage blocked */ }
    return entries;
}

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
