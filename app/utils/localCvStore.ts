import { cvTitleFromMarkdown, parseCvSessionBackup } from "@ruxt/shared/cv";
import type { CvDocumentProps, CvDocumentSummary } from "@ruxt/shared/cv";
import { CV_SESSION_BACKUP_PREFIX } from "./cvSessionBackup";

/**
 * Browser-local CV documents. Anonymous visitors never reach the server for CVs: every session lives in
 * `localStorage` under the same keys the session backups always used, so sessions saved before the
 * server routes were removed open unchanged. A failed write (quota, blocked storage) reports `false`
 * and leaves the previously stored copy intact; callers keep the in-memory content.
 */
const PLACEHOLDER_TITLE = "Untitled CV";

export interface LocalCvStore {
    list(): CvDocumentSummary[];
    get(id: string): CvDocumentProps | null;
    /** Write a whole document. Returns false when the browser refused the write. */
    put(document: CvDocumentProps): boolean;
    create(input: { id: string; title?: string; markdown: string; css: string }): CvDocumentProps | null;
    /** Save new source, bumping the revision only when it changed. */
    save(id: string, source: { markdown: string; css: string }): CvDocumentProps | null;
    rename(id: string, title: string): CvDocumentProps | null;
    fork(sourceId: string, newId: string, title?: string): CvDocumentProps | null;
    remove(id: string): void;
}

const titleOf = (document: Pick<CvDocumentProps, "id" | "title" | "markdown">) => {
    const explicit = document.title?.trim();
    return explicit && explicit !== PLACEHOLDER_TITLE ? explicit : cvTitleFromMarkdown(document.markdown) ?? explicit ?? PLACEHOLDER_TITLE;
};

export function createLocalCvStore(storage: () => Storage | undefined = () => {
    try { return globalThis.localStorage; } catch { return undefined; }
}): LocalCvStore {
    const read = (id: string): CvDocumentProps | null => {
        try {
            const raw = storage()?.getItem(CV_SESSION_BACKUP_PREFIX + id);
            const backup = parseCvSessionBackup(JSON.parse(raw || "null"));
            if (!backup) return null;
            const savedAt = backup.savedAt ?? 0;
            return {
                id,
                title: backup.title ?? cvTitleFromMarkdown(backup.markdown) ?? PLACEHOLDER_TITLE,
                markdown: backup.markdown,
                css: backup.css,
                revision: Math.max(1, backup.revision || 1),
                updatedAt: new Date(savedAt).toISOString(),
            };
        } catch {
            return null;
        }
    };

    const put = (document: CvDocumentProps) => {
        try {
            const target = storage();
            if (!target) return false;
            target.setItem(CV_SESSION_BACKUP_PREFIX + document.id, JSON.stringify({
                markdown: document.markdown,
                css: document.css,
                title: document.title,
                revision: document.revision,
                pending: false,
                savedAt: Date.parse(document.updatedAt) || Date.now(),
            }));
            return true;
        } catch {
            return false;
        }
    };

    const store: LocalCvStore = {
        list() {
            const target = storage();
            const summaries: CvDocumentSummary[] = [];
            try {
                for (let index = 0; target && index < target.length; index += 1) {
                    const key = target.key(index);
                    if (!key?.startsWith(CV_SESSION_BACKUP_PREFIX)) continue;
                    const document = read(key.slice(CV_SESSION_BACKUP_PREFIX.length));
                    if (document) summaries.push({ id: document.id, title: titleOf(document), revision: document.revision, updatedAt: document.updatedAt });
                }
            } catch { /* storage blocked */ }
            return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
        },
        get: read,
        put,
        create(input) {
            try {
                // Preserve even an unreadable legacy value rather than silently replacing it.
                if (storage()?.getItem(CV_SESSION_BACKUP_PREFIX + input.id) != null) return null;
            } catch { return null; }
            const document: CvDocumentProps = {
                id: input.id,
                title: input.title?.trim() || PLACEHOLDER_TITLE,
                markdown: input.markdown,
                css: input.css,
                revision: 1,
                updatedAt: new Date().toISOString(),
            };
            return put(document) ? document : null;
        },
        save(id, source) {
            const current = read(id);
            let raw: string | null;
            try { raw = storage()?.getItem(CV_SESSION_BACKUP_PREFIX + id) ?? null; } catch { return null; }
            // A corrupt existing backup is still user data: never treat a failed parse as a missing session.
            if (raw !== null && !current) return null;
            if (current && current.markdown === source.markdown && current.css === source.css) return current;
            const next: CvDocumentProps = {
                id,
                title: current?.title ?? PLACEHOLDER_TITLE,
                markdown: source.markdown,
                css: source.css,
                revision: (current?.revision ?? 0) + 1,
                updatedAt: new Date().toISOString(),
            };
            return put(next) ? next : null;
        },
        rename(id, title) {
            const current = read(id);
            if (!current) return null;
            const next = { ...current, title: title.trim() || PLACEHOLDER_TITLE };
            return put(next) ? next : null;
        },
        fork(sourceId, newId, title) {
            const source = read(sourceId);
            if (!source || read(newId)) return null;
            return store.create({ id: newId, title: title ?? `${titleOf(source)} Copy`, markdown: source.markdown, css: source.css });
        },
        remove(id) {
            const target = storage();
            if (!target) throw new Error("Browser storage is unavailable.");
            target.removeItem(CV_SESSION_BACKUP_PREFIX + id);
        },
    };
    return store;
}

export const localCvStore = createLocalCvStore();
