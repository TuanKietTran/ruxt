// Progress state and cancellation for chunked-manifest loads.
// A chunked document load is 1 manifest read + N chunk reads (see
// server/storage/chunked-*), so progress is tracked per chunk and per byte.
// Pure and framework-free: the composable and component are thin wrappers.

export type ManifestProgressStatus = "idle" | "loading" | "done" | "cancelled" | "error";

export interface ManifestProgressState {
    status: ManifestProgressStatus;
    totalChunks: number;
    loadedChunks: number;
    totalBytes: number;
    loadedBytes: number;
    error?: string;
}

const cleanCount = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export function createManifestProgress(totalChunks = 0, totalBytes = 0): ManifestProgressState {
    return { status: "idle", totalChunks: cleanCount(totalChunks), loadedChunks: 0, totalBytes: cleanCount(totalBytes), loadedBytes: 0 };
}

export function beginManifestProgress(state: ManifestProgressState): ManifestProgressState {
    return { status: "loading", totalChunks: state.totalChunks, loadedChunks: 0, totalBytes: state.totalBytes, loadedBytes: 0 };
}

export function advanceManifestProgress(state: ManifestProgressState, chunkBytes = 0): ManifestProgressState {
    if (state.status !== "loading") return state;
    const loadedChunks = state.totalChunks > 0 ? Math.min(state.totalChunks, state.loadedChunks + 1) : state.loadedChunks + 1;
    const loadedBytes = state.totalBytes > 0 ? Math.min(state.totalBytes, state.loadedBytes + cleanCount(chunkBytes)) : state.loadedBytes + cleanCount(chunkBytes);
    const done = state.totalChunks > 0 && loadedChunks >= state.totalChunks;
    return { ...state, status: done ? "done" : "loading", loadedChunks, loadedBytes };
}

export function completeManifestProgress(state: ManifestProgressState): ManifestProgressState {
    if (state.status === "cancelled" || state.status === "error") return state;
    return {
        ...state,
        status: "done",
        loadedChunks: state.totalChunks > 0 ? state.totalChunks : state.loadedChunks,
        loadedBytes: state.totalBytes > 0 ? state.totalBytes : state.loadedBytes,
    };
}

export function cancelManifestProgress(state: ManifestProgressState): ManifestProgressState {
    return state.status === "loading" ? { ...state, status: "cancelled" } : state;
}

export function failManifestProgress(state: ManifestProgressState, error: unknown): ManifestProgressState {
    if (state.status === "cancelled") return state;
    return { ...state, status: "error", error: error instanceof Error ? error.message : String(error) };
}

export function manifestProgressPercent(state: ManifestProgressState): number {
    if (state.status === "done") return 100;
    if (state.totalBytes > 0) return Math.min(100, Math.floor((state.loadedBytes / state.totalBytes) * 100));
    if (state.totalChunks > 0) return Math.min(100, Math.floor((state.loadedChunks / state.totalChunks) * 100));
    return 0;
}

export function manifestProgressLabel(state: ManifestProgressState): string {
    switch (state.status) {
        case "done": return "Loading complete";
        case "cancelled": return "Loading cancelled";
        case "error": return state.error ? `Loading failed: ${state.error}` : "Loading failed";
        case "loading": return state.totalChunks > 0 ? `Loading chunk ${Math.min(state.loadedChunks + 1, state.totalChunks)} of ${state.totalChunks}` : "Loading";
        default: return "Ready to load";
    }
}

export function isManifestAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export interface ManifestChunkTask<T> {
    (signal: AbortSignal): Promise<T>;
    bytes?: number;
}

export interface ManifestLoadOptions {
    totalBytes?: number;
    signal?: AbortSignal;
    onProgress?: (state: ManifestProgressState) => void;
}

export interface ManifestLoad<T> {
    promise: Promise<T[]>;
    cancel: () => void;
    state: () => ManifestProgressState;
}

export function createManifestLoad<T>(tasks: readonly ManifestChunkTask<T>[], options: ManifestLoadOptions = {}): ManifestLoad<T> {
    const totalBytes = options.totalBytes ?? tasks.reduce((sum, task) => sum + cleanCount(task.bytes ?? 0), 0);
    let state = beginManifestProgress(createManifestProgress(tasks.length, totalBytes));
    const controller = new AbortController();
    const notify = () => options.onProgress?.(state);
    const cancel = () => {
        if (state.status !== "loading") return;
        state = cancelManifestProgress(state);
        notify();
        controller.abort();
    };
    if (options.signal) {
        if (options.signal.aborted) cancel();
        else options.signal.addEventListener("abort", cancel, { once: true });
    }
    notify();
    const promise = (async (): Promise<T[]> => {
        const results: T[] = [];
        try {
            for (const task of tasks) {
                if (controller.signal.aborted) throw controller.signal.reason;
                const result = await task(controller.signal);
                if (controller.signal.aborted) throw controller.signal.reason;
                state = advanceManifestProgress(state, task.bytes ?? 0);
                notify();
                results.push(result);
            }
            if (state.status === "loading") { state = completeManifestProgress(state); notify(); }
            return results;
        } catch (error) {
            if (controller.signal.aborted || isManifestAbortError(error)) {
                if (state.status === "loading") { state = cancelManifestProgress(state); notify(); }
                throw controller.signal.aborted ? controller.signal.reason : error;
            }
            state = failManifestProgress(state, error);
            notify();
            throw error;
        }
    })();
    return { promise, cancel, state: () => state };
}
