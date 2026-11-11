import { describe, expect, it } from "vitest";
import { createLazyManifestSections, planManifestSections } from "../../app/utils/manifest-sections";

const manifest = { generation: "g1", chunks: 9, bytes: 85 };
const plan = () => planManifestSections(manifest, { chunksPerSection: 4, chunkBytes: 10 });

const recorder = () => {
    const calls: number[] = [];
    const fetchChunk = async (index: number) => { calls.push(index); return `<${index}>`; };
    return { calls, fetchChunk };
};

describe("planManifestSections", () => {
    it("splits a chunk manifest into contiguous sections with per-section bytes", () => {
        expect(plan()).toEqual([
            { id: "section-0", index: 0, start: 0, end: 4, chunks: 4, bytes: 40 },
            { id: "section-1", index: 1, start: 4, end: 8, chunks: 4, bytes: 40 },
            { id: "section-2", index: 2, start: 8, end: 9, chunks: 1, bytes: 5 },
        ]);
    });

    it("uses custom ids, plans no sections for an empty manifest, and leaves bytes null without chunkBytes", () => {
        expect(planManifestSections({ generation: "g", chunks: 2, bytes: 3 }, { chunksPerSection: 1, ids: ["head", "tail"] }).map((s) => s.id)).toEqual(["head", "tail"]);
        expect(planManifestSections({ generation: "g", chunks: 0, bytes: 0 })).toEqual([]);
        expect(planManifestSections(manifest)[0]?.bytes).toBeNull();
    });

    it("rejects invalid manifests, section sizes and id lists", () => {
        expect(() => planManifestSections({ generation: "g", chunks: -1, bytes: 0 })).toThrow(/invalid chunk manifest/);
        expect(() => planManifestSections({ generation: "g", chunks: 1.5, bytes: 0 })).toThrow(/invalid chunk manifest/);
        expect(() => planManifestSections({ generation: "g", chunks: 1, bytes: -1 })).toThrow(/invalid chunk manifest/);
        expect(() => planManifestSections(manifest, { chunksPerSection: 0 })).toThrow(/chunksPerSection must be a positive integer/);
        expect(() => planManifestSections(manifest, { chunksPerSection: 4, ids: ["only"] })).toThrow(/section ids must match the planned sections/);
        expect(() => planManifestSections(manifest, { chunksPerSection: 4, ids: ["a", "a", "b"] })).toThrow(/section ids must be unique/);
    });
});

describe("createLazyManifestSections", () => {
    it("fetches nothing at creation: every section starts idle with no data", () => {
        const { calls, fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        expect(calls).toEqual([]);
        expect(loader.list().map((s) => s.state)).toEqual(["idle", "idle", "idle"]);
        expect(loader.loadedCount()).toBe(0);
        expect(loader.loadedBytes()).toBe(0);
        expect(loader.data("section-0")).toBeNull();
        expect(loader.isLoaded("section-0")).toBe(false);
    });

    it("loads only the requested section's chunks, in order, joins them and caches the result", async () => {
        const { calls, fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        await expect(loader.load("section-1")).resolves.toBe("<4><5><6><7>");
        expect(calls).toEqual([4, 5, 6, 7]);
        expect(loader.get("section-1")).toMatchObject({ state: "loaded", data: "<4><5><6><7>", error: null, attempts: 1 });
        expect(loader.loadedCount()).toBe(1);
        expect(loader.loadedBytes()).toBe(40);
        await expect(loader.load("section-1")).resolves.toBe("<4><5><6><7>");
        expect(calls).toEqual([4, 5, 6, 7]);
        expect(loader.get("section-0")?.state).toBe("idle");
    });

    it("dedupes concurrent loads of the same section", async () => {
        const { calls, fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        const [a, b] = await Promise.all([loader.load("section-2"), loader.load("section-2")]);
        expect(a).toBe("<8>");
        expect(b).toBe("<8>");
        expect(calls).toEqual([8]);
    });

    it("records a fetch failure as a per-section error and retries on the next load", async () => {
        let fail = true;
        const loader = createLazyManifestSections(plan(), async (index: number) => { if (fail) throw new Error("kv unavailable"); return `<${index}>`; });
        await expect(loader.load("section-2")).rejects.toThrow("kv unavailable");
        expect(loader.get("section-2")).toMatchObject({ state: "error", data: null, error: "kv unavailable", attempts: 1 });
        expect(loader.get("section-0")?.state).toBe("idle");
        fail = false;
        await expect(loader.load("section-2")).resolves.toBe("<8>");
        expect(loader.get("section-2")).toMatchObject({ state: "loaded", error: null, attempts: 2 });
    });

    it("fails a section whose chunk comes back missing instead of joining a hole", async () => {
        const loader = createLazyManifestSections(plan(), (async (index: number) => (index === 5 ? undefined : `<${index}>`)) as never);
        await expect(loader.load("section-1")).rejects.toThrow(/missing chunk 5/);
        expect(loader.get("section-1")?.state).toBe("error");
    });

    it("rejects an unknown section id without fetching anything", async () => {
        const { calls, fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        await expect(loader.load("nope")).rejects.toThrow(/unknown manifest section: nope/);
        expect(loader.get("nope")).toBeNull();
        expect(calls).toEqual([]);
    });

    it("loadMany loads only the listed sections and loadAll loads the rest", async () => {
        const { calls, fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        await expect(loader.loadMany(["section-2", "section-0"])).resolves.toEqual(["<8>", "<0><1><2><3>"]);
        expect(calls).toEqual([8, 0, 1, 2, 3]);
        await expect(loader.loadAll()).resolves.toEqual(["<0><1><2><3>", "<4><5><6><7>", "<8>"]);
        expect(loader.loadedCount()).toBe(3);
        expect(loader.loadedBytes()).toBe(85);
    });

    it("reset clears one section or all sections back to idle so they refetch", async () => {
        const { calls, fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        await loader.loadAll();
        loader.reset("section-1");
        expect(loader.get("section-1")).toMatchObject({ state: "idle", data: null, attempts: 0 });
        expect(loader.loadedCount()).toBe(2);
        await loader.load("section-1");
        expect(calls.filter((c) => c === 4)).toHaveLength(2);
        loader.reset();
        expect(loader.loadedCount()).toBe(0);
        expect(loader.list().every((s) => s.state === "idle")).toBe(true);
    });

    it("list returns snapshot copies that cannot mutate loader state", async () => {
        const { fetchChunk } = recorder();
        const loader = createLazyManifestSections(plan(), fetchChunk);
        await loader.load("section-2");
        const snapshot = loader.list();
        snapshot[2]!.state = "idle";
        snapshot[2]!.data = "tampered";
        expect(loader.get("section-2")).toMatchObject({ state: "loaded", data: "<8>" });
    });
});
