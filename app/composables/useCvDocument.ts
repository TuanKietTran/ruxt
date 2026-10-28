import type { CvDocumentProps as CvDocument, CvUpdateEvent } from "@ruxt/shared/cv";
import { shouldRestoreCvBackup } from "@ruxt/shared/cv";
import { CV_SESSION_BACKUP_PREFIX, readCvSessionBackup, writeCvSessionBackup } from "~/utils/cvSessionBackup";

export type CvSaveState = "saved" | "saving" | "conflict" | "offline";

// Autosave waits for a pause in typing, but never holds an edit back longer than the max wait.
const SAVE_DEBOUNCE_MS = 2_000;
const SAVE_MAX_WAIT_MS = 10_000;
// Coming back to a tab re-checks the server only after a real absence, so tab flicking costs nothing.
const REFRESH_AFTER_AWAY_MS = 30_000;
const POLL_BACKOFF_STEPS = 4;
type ServerVersion = Pick<CvDocument, "revision" | "updatedAt" | "title">;

export async function useCvDocument(
    id: string,
    fallback: Pick<CvDocument, "markdown" | "css">,
) {
    // Lifecycle hooks must be registered before the first await, or Vue drops them.
    const nuxtApp = useNuxtApp();
    const { cvLiveEvents, cvPollSeconds } = useRuntimeConfig().public;
    let mounted: (() => void) | undefined;
    let unmounting: (() => void) | undefined;
    let activated: (() => void) | undefined;
    let deactivated: (() => void) | undefined;
    onMounted(() => mounted?.());
    onBeforeUnmount(() => unmounting?.());
    // Sessions stay alive in the page's <KeepAlive> after switching away; a hidden one must not poll.
    onActivated(() => activated?.());
    onDeactivated(() => deactivated?.());

    const { data } = await useFetch<CvDocument>(`/api/cvs/${encodeURIComponent(id)}`, {
        key: `cv-document:${id}`,
        // Reuse a document the sidebar already warmed so opening a session does not wait on the network;
        // the revision probe and local backup reconcile anything newer.
        getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
    });

    const resolvedId = ref(data.value?.id ?? id);
    const markdown = ref(data.value?.markdown ?? fallback.markdown);
    const css = ref(data.value?.css ?? fallback.css);
    const revision = ref(data.value?.revision ?? 0);
    const saveState = ref<CvSaveState>(data.value ? "saved" : "offline");
    const sourceId = ref("");
    let applyingRemote = false;
    let dirty = false;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstEditAt = 0;
    let saveQueue = Promise.resolve();
    let savesInFlight = 0;
    let events: EventSource | undefined;
    // What the server holds, as far as this tab knows: the source (to skip no-op saves) and the
    // validator fields (to ask for the document only if it changed).
    let serverSource = data.value ? { markdown: data.value.markdown, css: data.value.css } : undefined;
    let serverVersion: ServerVersion | undefined = data.value ?? undefined;

    const documentUrl = () => `/api/cvs/${encodeURIComponent(resolvedId.value)}`;
    const backup = (pending: boolean) => {
        if (import.meta.client) writeCvSessionBackup(resolvedId.value, { markdown: markdown.value, css: css.value, revision: revision.value, pending });
    };
    const liveEventsOpen = () => Boolean(events && events.readyState !== EventSource.CLOSED);

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

    const applyRemote = (document: CvDocument) => {
        if (dirty || document.revision <= revision.value) return false;
        applyingRemote = true;
        markdown.value = document.markdown;
        css.value = document.css;
        revision.value = document.revision;
        serverSource = { markdown: document.markdown, css: document.css };
        serverVersion = document;
        saveState.value = "saved";
        backup(false);
        nextTick(() => { applyingRemote = false; });
        return true;
    };

    // Revision probe: a conditional GET that the server answers with 304 (one storage read, no body)
    // while the document is unchanged. Without live events this replaces the old 3 s poll.
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let pollFailures = 0;
    let pollStopped = false;
    let refreshing = false;
    const clearPoll = () => { if (pollTimer) clearTimeout(pollTimer); pollTimer = undefined; };
    const schedulePoll = () => {
        clearPoll();
        if (!import.meta.client || !active || !cvPollSeconds || pollStopped || liveEventsOpen() || document.visibilityState !== "visible") return;
        const delay = cvPollSeconds * 1000 * 2 ** Math.min(pollFailures, POLL_BACKOFF_STEPS);
        pollTimer = setTimeout(() => { pollTimer = undefined; void refresh(); }, delay);
    };
    const refresh = async () => {
        // Pending local edits win; their save answers with the server's revision (or a 409) anyway.
        if (refreshing || dirty || timer) return schedulePoll();
        refreshing = true;
        try {
            const response = await $fetch.raw<CvDocument>(documentUrl(), {
                headers: serverVersion ? { "if-none-match": cvDocumentEtag(serverVersion) } : undefined,
                ignoreResponseError: true,
                retry: 0,
            });
            if (response.status === 304 || response.ok) {
                pollFailures = 0;
                if (response.ok && response._data) applyRemote(response._data);
                if (!dirty && saveState.value === "offline") saveState.value = "saved";
            } else if ([401, 403, 404].includes(response.status)) {
                // Signed out, forbidden or deleted: polling cannot fix that; saves still recreate a lost session.
                pollStopped = true;
            } else {
                pollFailures += 1;
            }
        } catch {
            pollFailures += 1;
            if (saveState.value === "saved") saveState.value = "offline";
        } finally {
            refreshing = false;
            schedulePoll();
        }
    };

    let awaySince = 0;
    const leave = () => { awaySince ||= Date.now(); };
    const comeBack = () => {
        const away = awaySince ? Date.now() - awaySince : 0;
        awaySince = 0;
        if (away > REFRESH_AFTER_AWAY_MS && !liveEventsOpen()) void refresh();
        else schedulePoll();
    };

    // Same-origin SSE fan-out for self-hosted deployments. Workers answer 501, so it is never opened there.
    const connect = () => {
        if (!cvLiveEvents) return schedulePoll();
        events?.close();
        events = new EventSource(`${documentUrl()}/events`);
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
            // The stream is retried after the next successful save; meanwhile probe slowly.
            events?.close();
            schedulePoll();
        };
        events.onopen = () => {
            clearPoll();
            if (!dirty) saveState.value = "saved";
        };
    };

    const writeSnapshot = async (snapshot: { markdown: string; css: string; sourceId: string }, keepalive: boolean) => {
        const url = documentUrl();
        try {
            return await $fetch<CvDocument>(url, {
                method: "PUT",
                body: { ...snapshot, expectedRevision: revision.value || undefined },
                // A save started while the page is hidden or unloading must outlive it.
                keepalive,
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

    const flush = (keepalive = false) => {
        timer = undefined;
        firstEditAt = 0;
        const snapshot = {
            markdown: markdown.value,
            css: css.value,
            sourceId: sourceId.value,
        };
        // Edits that end where they started (undo, retyping) send nothing.
        if (!savesInFlight && serverSource && serverSource.markdown === snapshot.markdown && serverSource.css === snapshot.css) {
            dirty = false;
            saveState.value = "saved";
            cancelRetry();
            backup(false);
            return;
        }
        savesInFlight += 1;
        saveQueue = saveQueue.then(async () => {
            try {
                const updated = await writeSnapshot(snapshot, keepalive);
                revision.value = updated.revision;
                serverSource = { markdown: snapshot.markdown, css: snapshot.css };
                serverVersion = updated;
                dirty = markdown.value !== snapshot.markdown || css.value !== snapshot.css;
                saveState.value = dirty ? "saving" : "saved";
                retryAttempt = 0;
                cancelRetry();
                backup(dirty);
                // The PUT response is the post-save refresh: it carries the stored revision, so no GET follows.
                pollStopped = false;
                schedulePoll();
                // A stream refused while the session was missing does not retry on its own.
                if (cvLiveEvents && events?.readyState === EventSource.CLOSED) connect();
            } catch (error: any) {
                saveState.value = error?.statusCode === 409 ? "conflict" : "offline";
                if (saveState.value === "offline") scheduleRetry();
            } finally {
                savesInFlight -= 1;
            }
        });
    };
    /** Save a waiting edit now instead of at the end of its debounce. */
    const flushPending = (keepalive = false) => {
        if (!timer) return;
        clearTimeout(timer);
        flush(keepalive);
    };

    const save = () => {
        if (!import.meta.client || applyingRemote) return;
        dirty = true;
        saveState.value = "saving";
        backup(true);
        const now = Date.now();
        firstEditAt ||= now;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstEditAt + SAVE_MAX_WAIT_MS - now)));
    };

    watch([markdown, css], save);

    const onVisibilityChange = () => {
        if (!active) return;
        if (document.visibilityState === "hidden") {
            flushPending(true);
            clearPoll();
            leave();
        } else {
            retryNow();
            comeBack();
        }
    };
    const onBlur = () => { if (active) { flushPending(); leave(); } };
    const onFocus = () => { if (active) comeBack(); };
    const onPageHide = () => flushPending(true);
    const onOnline = () => { if (active) retryNow(); };
    // Another tab of this browser saved the session: adopt its saved copy without a request.
    const onStorage = (event: StorageEvent) => {
        if (event.key !== CV_SESSION_BACKUP_PREFIX + resolvedId.value) return;
        const saved = readCvSessionBackup(resolvedId.value);
        if (!saved || saved.pending || saved.revision <= revision.value) return;
        // Its validator fields are unknown here, so the next probe asks for the full document once.
        if (applyRemote({ id: resolvedId.value, markdown: saved.markdown, css: saved.css, revision: saved.revision, updatedAt: "" })) serverVersion = undefined;
    };

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
        window.addEventListener("online", onOnline);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("storage", onStorage);
        document.addEventListener("visibilitychange", onVisibilityChange);
    };

    deactivated = () => {
        flushPending();
        clearPoll();
        leave();
        active = false;
    };
    activated = () => {
        if (active) return;
        active = true;
        comeBack();
    };

    unmounting = () => {
        // Leaving the session (for example, to view a template) must not drop the last edit.
        flushPending();
        cancelRetry();
        clearPoll();
        window.removeEventListener("online", onOnline);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("storage", onStorage);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        events?.close();
        // Drop the cached copy so the next visit does not open a stale revision.
        if (import.meta.client) delete nuxtApp.payload.data[`cv-document:${id}`];
    };

    /** Adopt a server-written document (for example, a profile switch) without re-saving it. */
    const applyDocument = (document: CvDocument) => { applyRemote(document); };
    const isDirty = () => dirty;

    return { resolvedId, markdown, css, revision, saveState, sourceId, applyDocument, isDirty };
}
