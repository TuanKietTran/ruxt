import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { useManifestProgress } from "../../app/composables/useManifestProgress";
import {
    advanceManifestProgress,
    beginManifestProgress,
    cancelManifestProgress,
    completeManifestProgress,
    createManifestLoad,
    createManifestProgress,
    failManifestProgress,
    isManifestAbortError,
    manifestProgressLabel,
    manifestProgressPercent,
} from "../../app/utils/manifest-progress";

describe("manifest progress state", () => {
    it("starts idle with sanitized totals", () => {
        expect(createManifestProgress(12, 4096)).toEqual({ status: "idle", totalChunks: 12, loadedChunks: 0, totalBytes: 4096, loadedBytes: 0 });
        expect(createManifestProgress(-3, Number.NaN).totalChunks).toBe(0);
        expect(createManifestProgress(2.9, 10.5).totalBytes).toBe(10);
    });

    it("advances per chunk, clamps to totals, and completes on the last chunk", () => {
        let state = beginManifestProgress(createManifestProgress(2, 300));
        state = advanceManifestProgress(state, 100);
        expect(state).toMatchObject({ status: "loading", loadedChunks: 1, loadedBytes: 100 });
        state = advanceManifestProgress(state, 500);
        expect(state).toMatchObject({ status: "done", loadedChunks: 2, loadedBytes: 300 });
        expect(advanceManifestProgress(state, 10)).toBe(state);
    });

    it("does not advance after cancel or error", () => {
        const loading = beginManifestProgress(createManifestProgress(3));
        const cancelled = cancelManifestProgress(loading);
        expect(cancelled.status).toBe("cancelled");
        expect(advanceManifestProgress(cancelled)).toBe(cancelled);
        const failed = failManifestProgress(loading, new Error("boom"));
        expect(failed).toMatchObject({ status: "error", error: "boom" });
        expect(advanceManifestProgress(failed)).toBe(failed);
    });

    it("cancel is a no-op unless loading, complete forces done", () => {
        const idle = createManifestProgress(4);
        expect(cancelManifestProgress(idle)).toBe(idle);
        expect(completeManifestProgress(beginManifestProgress(idle))).toMatchObject({ status: "done", loadedChunks: 4 });
    });

    it("percent prefers bytes, falls back to chunks, done is 100", () => {
        expect(manifestProgressPercent(createManifestProgress(4, 200))).toBe(0);
        let state = beginManifestProgress(createManifestProgress(4, 200));
        state = advanceManifestProgress(state, 50);
        expect(manifestProgressPercent(state)).toBe(25);
        let byChunks = beginManifestProgress(createManifestProgress(4));
        byChunks = advanceManifestProgress(byChunks);
        byChunks = advanceManifestProgress(byChunks);
        byChunks = advanceManifestProgress(byChunks);
        expect(manifestProgressPercent(byChunks)).toBe(75);
        expect(manifestProgressPercent(completeManifestProgress(byChunks))).toBe(100);
        expect(manifestProgressPercent(beginManifestProgress(createManifestProgress(0)))).toBe(0);
    });

    it("labels are plain status text for aria-live", () => {
        expect(manifestProgressLabel(createManifestProgress(2))).toBe("Ready to load");
        let state = beginManifestProgress(createManifestProgress(12));
        expect(manifestProgressLabel(state)).toBe("Loading chunk 1 of 12");
        state = advanceManifestProgress(advanceManifestProgress(state));
        expect(manifestProgressLabel(state)).toBe("Loading chunk 3 of 12");
        expect(manifestProgressLabel(completeManifestProgress(state))).toBe("Loading complete");
        expect(manifestProgressLabel(cancelManifestProgress(beginManifestProgress(createManifestProgress(1))))).toBe("Loading cancelled");
        expect(manifestProgressLabel(failManifestProgress(beginManifestProgress(createManifestProgress(1)), new Error("nope")))).toBe("Loading failed: nope");
    });
});

describe("manifest chunk load runner", () => {
    it("loads sequentially, reports progress, resolves in order", async () => {
        const seen: number[] = [];
        const onProgress = vi.fn();
        const tasks = [0, 1, 2].map(i => Object.assign(async () => { seen.push(i); return `chunk-${i}`; }, { bytes: 10 }));
        const load = createManifestLoad(tasks, { totalBytes: 30, onProgress });
        await expect(load.promise).resolves.toEqual(["chunk-0", "chunk-1", "chunk-2"]);
        expect(seen).toEqual([0, 1, 2]);
        expect(load.state()).toMatchObject({ status: "done", loadedChunks: 3, loadedBytes: 30 });
        expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "done" }));
    });

    it("cancel aborts the in-flight chunk and rejects with an abort error", async () => {
        let observedSignal: AbortSignal | undefined;
        const tasks = [
            async () => "first",
            (signal: AbortSignal) => new Promise<string>((_resolve, reject) => { observedSignal = signal; signal.addEventListener("abort", () => reject(signal.reason)); }),
            async () => "never",
        ];
        const load = createManifestLoad(tasks, {});
        const rejection = expect(load.promise).rejects.toSatisfy(isManifestAbortError);
        await vi.waitFor(() => expect(observedSignal).toBeDefined());
        load.cancel();
        await rejection;
        expect(load.state().status).toBe("cancelled");
        load.cancel();
        expect(load.state().status).toBe("cancelled");
    });

    it("treats a chunk that resolves after cancel as cancelled, not done", async () => {
        let release: (value: string) => void = () => {};
        const gate = new Promise<string>((resolve) => { release = resolve; });
        const load = createManifestLoad([() => gate], {});
        const rejection = expect(load.promise).rejects.toSatisfy(isManifestAbortError);
        load.cancel();
        release("late");
        await rejection;
        expect(load.state().status).toBe("cancelled");
    });

    it("an external abort signal cancels the load", async () => {
        const external = new AbortController();
        const tasks = [(signal: AbortSignal) => new Promise<string>((_resolve, reject) => { signal.addEventListener("abort", () => reject(signal.reason)); })];
        const load = createManifestLoad(tasks, { signal: external.signal });
        const rejection = expect(load.promise).rejects.toSatisfy(isManifestAbortError);
        external.abort();
        await rejection;
        expect(load.state().status).toBe("cancelled");
    });

    it("a failing chunk sets error state, rejects with the original error, stops the rest", async () => {
        const boom = new Error("chunk 2 broke");
        const third = vi.fn(async () => "third");
        const load = createManifestLoad([async () => "first", async () => { throw boom; }, third], {});
        await expect(load.promise).rejects.toBe(boom);
        expect(load.state()).toMatchObject({ status: "error", error: "chunk 2 broke", loadedChunks: 1 });
        expect(third).not.toHaveBeenCalled();
    });

    it("an empty load completes immediately", async () => {
        const load = createManifestLoad([], {});
        await expect(load.promise).resolves.toEqual([]);
        expect(load.state().status).toBe("done");
    });
});

describe("useManifestProgress composable", () => {
    it("tracks a run and cancels it", async () => {
        const progress = useManifestProgress();
        expect(progress.percent.value).toBe(0);
        let observedSignal: AbortSignal | undefined;
        const promise = progress.load([
            async () => "a",
            (signal: AbortSignal) => new Promise<string>((_resolve, reject) => { observedSignal = signal; signal.addEventListener("abort", () => reject(signal.reason)); }),
        ]);
        const rejection = expect(promise).rejects.toSatisfy(isManifestAbortError);
        await vi.waitFor(() => expect(observedSignal).toBeDefined());
        expect(progress.isLoading.value).toBe(true);
        expect(progress.label.value).toBe("Loading chunk 2 of 2");
        progress.cancel();
        await rejection;
        expect(progress.state.value.status).toBe("cancelled");
        expect(progress.label.value).toBe("Loading cancelled");
    });

    it("reset returns to idle", async () => {
        const progress = useManifestProgress();
        await progress.load([async () => "a"]);
        expect(progress.state.value.status).toBe("done");
        progress.reset();
        expect(progress.state.value).toEqual(createManifestProgress(0, 0));
    });
});

describe("ManifestProgress component contract", () => {
    const source = readFileSync(new URL("../../app/components/ManifestProgress.vue", import.meta.url), "utf8");

    it("announces via role=status + aria-live and exposes a progressbar", () => {
        expect(source).toContain('role="status"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain('role="progressbar"');
        expect(source).toContain(':aria-valuenow="percent"');
    });

    it("cancel is a native keyboard-operable button wired to an emit", () => {
        expect(source).toMatch(/<button[^>]*type="button"/);
        expect(source).toContain('@click="emit(\'cancel\')"');
        expect(source).toContain(":focus-visible");
    });

    it("uses theme tokens with no slop and a small-screen rule", () => {
        expect(source).toContain("var(--accent)");
        expect(source).not.toMatch(/gradient|uppercase|box-shadow:\s*0 0/);
        expect(source).toMatch(/@media \(max-width: 480px\)/);
    });
});
