import type { CvDocument, CvUpdateEvent } from "@core/domain/cv";
import { shouldRestoreCvBackup } from "@core/domain/cv";
import { readCvSessionBackup, writeCvSessionBackup } from "~/utils/cvSessionBackup";

export type CvSaveState = "saved" | "saving" | "conflict" | "offline";

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
        if (import.meta.client) writeCvSessionBackup(resolvedId.value, { markdown: markdown.value, css: css.value, revision: revision.value, pending });
    };

    // A failed save (offline, or a deployment rolling over) is retried with backoff, and again when the
    // browser comes back online or the tab becomes visible, until the server has the edit.
    const RETRY_DELAYS = [2_000, 5_000, 10_000, 30_000];
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    const cancelRetry = () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = undefined; };
    const scheduleRetry = () => {
        cancelRetry();
        const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
        retryAttempt += 1;
        retryTimer = setTimeout(() => { retryTimer = undefined; if (dirty) flush(); }, delay);
    };
    const retryNow = () => {
        if (!dirty || timer || saveState.value === "conflict") return;
        cancelRetry();
        flush();
    };
    const retryWhenVisible = () => { if (document.visibilityState === "visible") retryNow(); };

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
            try {
                return await $fetch<CvDocument>("/api/cvs", {
                    method: "POST",
                    body: { id: resolvedId.value, ...snapshot },
                });
            } catch (createError: any) {
                // Another tab (or the sidebar's recovery) re-created it first: save over that copy.
                if (createError?.statusCode !== 409) throw createError;
                return await $fetch<CvDocument>(url, { method: "PUT", body: snapshot });
            }
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
                retryAttempt = 0;
                cancelRetry();
                backup(dirty);
                // A stream refused while the session was missing does not retry on its own.
                if (events?.readyState === EventSource.CLOSED) connect();
            } catch (error: any) {
                saveState.value = error?.statusCode === 409 ? "conflict" : "offline";
                if (saveState.value === "offline") scheduleRetry();
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
        const local = readCvSessionBackup(resolvedId.value);
        if (shouldRestoreCvBackup(local, data.value)) {
            // Never show a lost or stale server copy over this browser's newer source, and save the
            // restored source back explicitly: it may equal the fallback, which the watcher ignores.
            revision.value = data.value?.revision ?? 0;
            markdown.value = local.markdown;
            css.value = local.css;
            nextTick(save);
        } else {
            backup(false);
        }
        connect();
        window.addEventListener("online", retryNow);
        document.addEventListener("visibilitychange", retryWhenVisible);
    };

    unmounting = () => {
        // Leaving the session (for example, to view a template) must not drop the last edit.
        if (timer) {
            clearTimeout(timer);
            flush();
        }
        cancelRetry();
        window.removeEventListener("online", retryNow);
        document.removeEventListener("visibilitychange", retryWhenVisible);
        events?.close();
    };

    /** Adopt a server-written document (for example, a profile switch) without re-saving it. */
    const applyDocument = (document: CvDocument) => applyRemote(document);
    const isDirty = () => dirty;

    return { resolvedId, markdown, css, revision, saveState, sourceId, applyDocument, isDirty };
}
