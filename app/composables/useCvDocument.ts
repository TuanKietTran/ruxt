import type { CvDocument, CvUpdateEvent } from "@core/domain/cv";

export type CvSaveState = "saved" | "saving" | "conflict" | "offline";

/** Last source this browser saw or wrote for a session, used to survive storage misses. */
interface CvSessionBackup {
    markdown: string;
    css: string;
    /** Server revision the source is based on. */
    revision: number;
    /** The source has edits the server has not acknowledged. */
    pending: boolean;
}

const BACKUP_PREFIX = "cv-sv:session-backup:";

function readBackup(id: string): CvSessionBackup | null {
    try {
        const value = JSON.parse(localStorage.getItem(BACKUP_PREFIX + id) || "null");
        return value && typeof value.markdown === "string" && typeof value.css === "string" && Number.isInteger(value.revision)
            ? { markdown: value.markdown, css: value.css, revision: value.revision, pending: Boolean(value.pending) }
            : null;
    } catch {
        return null;
    }
}

function writeBackup(id: string, backup: CvSessionBackup) {
    try { localStorage.setItem(BACKUP_PREFIX + id, JSON.stringify(backup)); } catch { /* storage full or blocked */ }
}

/** Forget a session's local backup (after the session is deleted). */
export function clearCvSessionBackup(id: string) {
    try { localStorage.removeItem(BACKUP_PREFIX + id); } catch { /* storage blocked */ }
}

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

export async function useCvDocument(
    id: string,
    fallback: Pick<CvDocument, "markdown" | "css">,
) {
    // Lifecycle hooks must be registered before the first await, or Vue drops them.
    let mounted: (() => void) | undefined;
    let unmounting: (() => void) | undefined;
    onMounted(() => mounted?.());
    onBeforeUnmount(() => unmounting?.());

    const { data } = await useFetch<CvDocument>(`/api/cvs/${encodeURIComponent(id)}`, {
        key: `cv-document:${id}`,
    });

    const resolvedId = ref(data.value?.id ?? id);
    const markdown = ref(data.value?.markdown ?? fallback.markdown);
    const css = ref(data.value?.css ?? fallback.css);
    const revision = ref(data.value?.revision ?? 0);
    const saveState = ref<CvSaveState>(data.value ? "saved" : "offline");
    const sourceId = ref("");
    let applyingRemote = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let saveQueue = Promise.resolve();
    let events: EventSource | undefined;

    const backup = (pending: boolean) => {
        if (import.meta.client) writeBackup(resolvedId.value, { markdown: markdown.value, css: css.value, revision: revision.value, pending });
    };

    const applyRemote = (document: CvDocument) => {
        if (dirty || document.revision <= revision.value) return;
        applyingRemote = true;
        markdown.value = document.markdown;
        css.value = document.css;
        revision.value = document.revision;
        saveState.value = "saved";
        backup(false);
        nextTick(() => { applyingRemote = false; });
    };

    const connect = () => {
        events?.close();
        events = new EventSource(`/api/cvs/${encodeURIComponent(resolvedId.value)}/events`);
        events.addEventListener("ready", (event) => {
            const update = JSON.parse((event as MessageEvent).data) as { document: CvDocument };
            applyRemote(update.document);
        });
        events.addEventListener("cv:update", (event) => {
            const update = JSON.parse((event as MessageEvent).data) as CvUpdateEvent;
            if (update.sourceId !== sourceId.value) applyRemote(update.document);
        });
        events.onerror = () => {
            if (saveState.value === "saved") saveState.value = "offline";
        };
        events.onopen = () => {
            if (!dirty) saveState.value = "saved";
        };
    };

    const writeSnapshot = async (snapshot: { markdown: string; css: string; sourceId: string }) => {
        const url = `/api/cvs/${encodeURIComponent(resolvedId.value)}`;
        try {
            return await $fetch<CvDocument>(url, {
                method: "PUT",
                body: { ...snapshot, expectedRevision: revision.value || undefined },
            });
        } catch (error: any) {
            if (error?.statusCode !== 404) throw error;
            // The server no longer has this session: recreate it from the editor.
            return await $fetch<CvDocument>("/api/cvs", {
                method: "POST",
                body: { id: resolvedId.value, ...snapshot },
            });
        }
    };

    const flush = () => {
        timer = undefined;
        const snapshot = {
            markdown: markdown.value,
            css: css.value,
            sourceId: sourceId.value,
        };
        saveQueue = saveQueue.then(async () => {
            try {
                const updated = await writeSnapshot(snapshot);
                revision.value = updated.revision;
                dirty = markdown.value !== snapshot.markdown || css.value !== snapshot.css;
                saveState.value = dirty ? "saving" : "saved";
                backup(dirty);
                // A stream refused while the session was missing does not retry on its own.
                if (events?.readyState === EventSource.CLOSED) connect();
            } catch (error: any) {
                saveState.value = error?.statusCode === 409 ? "conflict" : "offline";
            }
        });
    };

    const save = () => {
        if (!import.meta.client || applyingRemote) return;
        dirty = true;
        saveState.value = "saving";
        backup(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 450);
    };

    watch([markdown, css], save);

    mounted = () => {
        sourceId.value = crypto.randomUUID();
        const local = readBackup(resolvedId.value);
        if (shouldRestoreCvBackup(local, data.value)) {
            // Never show a lost or stale server copy over this browser's newer source;
            // the watcher saves the restored source back to the server.
            revision.value = data.value?.revision ?? 0;
            markdown.value = local.markdown;
            css.value = local.css;
        } else {
            backup(false);
        }
        connect();
    };

    unmounting = () => {
        // Leaving the session (for example, to view a template) must not drop the last edit.
        if (timer) {
            clearTimeout(timer);
            flush();
        }
        events?.close();
    };

    /** Adopt a server-written document (for example, a profile switch) without re-saving it. */
    const applyDocument = (document: CvDocument) => applyRemote(document);
    const isDirty = () => dirty;

    return { resolvedId, markdown, css, revision, saveState, sourceId, applyDocument, isDirty };
}
