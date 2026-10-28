import type { CvDocumentProps as CvDocument } from "@ruxt/shared/cv";
import { CV_SESSION_BACKUP_PREFIX } from "~/utils/cvSessionBackup";
import { localCvStore } from "~/utils/localCvStore";

export type CvSaveState = "saved" | "saving" | "conflict" | "offline";

// Autosave waits for a pause in typing, but never holds an edit back longer than the max wait.
const SAVE_DEBOUNCE_MS = 500;
const SAVE_MAX_WAIT_MS = 3_000;
// A refused browser write (quota, blocked storage) is retried; the edit stays in memory meanwhile.
const RETRY_MS = 5_000;

/**
 * A CV session lives in this browser (`LocalCvStore`). Nothing here talks to the server, so an anonymous
 * visitor makes no CV requests at all. A failed write leaves the stored copy untouched and the editor
 * content in memory, and is retried.
 */
export async function useCvDocument(
    id: string,
    fallback: Pick<CvDocument, "markdown" | "css">,
) {
    // Lifecycle hooks must be registered before the first await, or Vue drops them.
    let mounted: (() => void) | undefined;
    let unmounting: (() => void) | undefined;
    let activated: (() => void) | undefined;
    let deactivated: (() => void) | undefined;
    onMounted(() => mounted?.());
    onBeforeUnmount(() => unmounting?.());
    onActivated(() => activated?.());
    onDeactivated(() => deactivated?.());

    const sessionActions = useCvSessionActions();
    const stored = import.meta.client ? localCvStore.get(id) : null;
    const buffered = import.meta.client ? sessionActions.buffers.value[id] : undefined;
    const resolvedId = ref(id);
    const markdown = ref(buffered?.markdown ?? stored?.markdown ?? fallback.markdown);
    const css = ref(buffered?.css ?? stored?.css ?? fallback.css);
    const revision = ref(stored?.revision ?? 0);
    const saveState = ref<CvSaveState>("saved");
    const sourceId = ref("");
    let applyingRemote = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let firstEditAt = 0;

    const cancelRetry = () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = undefined; };

    const flush = () => {
        timer = undefined;
        firstEditAt = 0;
        if (sessionActions.deleted.value[id]) { dirty = false; cancelRetry(); return; }
        const snapshot = { markdown: markdown.value, css: css.value };
        const saved = localCvStore.save(resolvedId.value, snapshot);
        if (!saved) {
            saveState.value = "offline";
            cancelRetry();
            retryTimer = setTimeout(() => { retryTimer = undefined; if (dirty) flush(); }, RETRY_MS);
            return;
        }
        sessionActions.upsertDocument(saved);
        revision.value = saved.revision;
        dirty = markdown.value !== snapshot.markdown || css.value !== snapshot.css;
        saveState.value = dirty ? "saving" : "saved";
        cancelRetry();
    };
    const flushPending = () => {
        if (!dirty) return;
        if (timer) clearTimeout(timer);
        flush();
    };

    const save = () => {
        if (!import.meta.client || applyingRemote || sessionActions.deleted.value[id]) return;
        dirty = true;
        sessionActions.buffers.value[id] = { markdown: markdown.value, css: css.value };
        saveState.value = "saving";
        const now = Date.now();
        firstEditAt ||= now;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstEditAt + SAVE_MAX_WAIT_MS - now)));
    };
    watch([markdown, css], save, { flush: "sync" });

    const apply = (document: CvDocument) => {
        if (dirty || document.revision <= revision.value) return false;
        applyingRemote = true;
        sessionActions.buffers.value[id] = { markdown: document.markdown, css: document.css };
        markdown.value = document.markdown;
        css.value = document.css;
        revision.value = document.revision;
        saveState.value = "saved";
        nextTick(() => { applyingRemote = false; });
        return true;
    };

    // Another tab of this browser saved the session: adopt its copy.
    const onStorage = (event: StorageEvent) => {
        if (event.key !== CV_SESSION_BACKUP_PREFIX + resolvedId.value) return;
        const next = localCvStore.get(resolvedId.value);
        if (next) apply(next);
    };
    const onPageHide = () => flushPending();
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flushPending(); };

    mounted = () => {
        sourceId.value = crypto.randomUUID();
        // Re-read on mount as well: the server render cannot read browser-local sessions.
        const local = localCvStore.get(id);
        if (buffered && (!local || buffered.markdown !== local.markdown || buffered.css !== local.css)) save();
        else if (local) apply(local);
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("storage", onStorage);
        document.addEventListener("visibilitychange", onVisibilityChange);
    };
    deactivated = () => flushPending();
    activated = () => {};
    unmounting = () => {
        // Leaving the session must not drop the last edit.
        flushPending();
        cancelRetry();
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("storage", onStorage);
        document.removeEventListener("visibilitychange", onVisibilityChange);
    };

    /** Adopt a document written elsewhere (for example, a profile switch) without re-saving it. */
    const applyDocument = (document: CvDocument) => { apply(document); };
    const isDirty = () => dirty;

    return { resolvedId, markdown, css, revision, saveState, sourceId, applyDocument, isDirty };
}
