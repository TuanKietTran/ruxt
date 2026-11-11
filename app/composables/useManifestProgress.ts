import { computed, ref } from "vue";
import {
    advanceManifestProgress,
    beginManifestProgress,
    completeManifestProgress,
    createManifestLoad,
    createManifestProgress,
    failManifestProgress,
    manifestProgressLabel,
    manifestProgressPercent,
    type ManifestChunkTask,
    type ManifestLoad,
    type ManifestLoadOptions,
    type ManifestProgressState,
} from "../utils/manifest-progress";

// Vue wrapper over the pure manifest-progress state machine and chunk runner.
// `load` runs chunk tasks sequentially with progress callbacks; `cancel`
// aborts the in-flight chunk through the runner's AbortController.
export function useManifestProgress() {
    const state = ref<ManifestProgressState>(createManifestProgress());
    const percent = computed(() => manifestProgressPercent(state.value));
    const label = computed(() => manifestProgressLabel(state.value));
    const isLoading = computed(() => state.value.status === "loading");
    let current: ManifestLoad<unknown> | null = null;

    const start = (totalChunks: number, totalBytes = 0) => {
        state.value = beginManifestProgress(createManifestProgress(totalChunks, totalBytes));
    };
    const advance = (chunkBytes = 0) => { state.value = advanceManifestProgress(state.value, chunkBytes); };
    const complete = () => { state.value = completeManifestProgress(state.value); };
    const fail = (error: unknown) => { state.value = failManifestProgress(state.value, error); };
    const reset = () => { current = null; state.value = createManifestProgress(); };

    const load = <T>(tasks: readonly ManifestChunkTask<T>[], options: ManifestLoadOptions = {}): Promise<T[]> => {
        const runner = createManifestLoad(tasks, {
            ...options,
            onProgress: (next) => { state.value = next; options.onProgress?.(next); },
        });
        current = runner as ManifestLoad<unknown>;
        state.value = runner.state();
        return runner.promise;
    };

    const cancel = () => {
        if (current) current.cancel();
        else if (state.value.status === "loading") state.value = { ...state.value, status: "cancelled" };
    };

    return { state, percent, label, isLoading, start, advance, complete, fail, reset, load, cancel };
}
