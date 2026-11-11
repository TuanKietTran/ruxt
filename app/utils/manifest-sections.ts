/**
 * Lazy, on-demand loading of chunk-manifest sections.
 *
 * A chunk manifest (`ruxt-chunked-json-v1`, see `server/storage/chunked-deno-kv.ts`)
 * describes a value split into `chunks` pieces, and the storage readers reassemble
 * every chunk up front. This module does the opposite: `planManifestSections` cuts
 * the manifest into contiguous chunk ranges, and `createLazyManifestSections` fetches
 * a section's chunks only when that section is explicitly requested, caching the
 * joined result. Nothing is fetched at creation time, sections stay independent,
 * and a failed section can be retried without touching the others.
 *
 * Pure (no DOM, no storage, no network): the caller supplies the per-chunk fetcher,
 * so the same loader works for a KV chunk reader, a local store, or a test fake.
 */

export interface ChunkManifestLike {
    generation: string;
    chunks: number;
    bytes: number;
}

export interface ManifestSection {
    id: string;
    index: number;
    /** First chunk index (inclusive). */
    start: number;
    /** Last chunk index (exclusive). */
    end: number;
    chunks: number;
    /** Estimated bytes, when `chunkBytes` was supplied; otherwise null. */
    bytes: number | null;
}

export type ManifestSectionState = "idle" | "loading" | "loaded" | "error";

export interface ManifestSectionSnapshot extends ManifestSection {
    state: ManifestSectionState;
    data: string | null;
    error: string | null;
    attempts: number;
}

export type ManifestChunkLoader = (chunkIndex: number) => Promise<string>;

export interface PlanManifestSectionsOptions {
    /** Chunks per section. Defaults to 4. */
    chunksPerSection?: number;
    /** Bytes per full chunk, for per-section byte estimates. */
    chunkBytes?: number;
    /** One id per planned section; defaults to `section-<index>`. */
    ids?: string[];
}

const isNonNegativeInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0;

export function planManifestSections(manifest: ChunkManifestLike, options: PlanManifestSectionsOptions = {}): ManifestSection[] {
    if (!manifest || typeof manifest.generation !== "string" || manifest.generation === "" || !isNonNegativeInteger(manifest.chunks) || !isNonNegativeInteger(manifest.bytes)) {
        throw new Error("invalid chunk manifest");
    }
    const chunksPerSection = options.chunksPerSection ?? 4;
    if (!Number.isInteger(chunksPerSection) || chunksPerSection <= 0) {
        throw new Error("chunksPerSection must be a positive integer");
    }
    if (options.chunkBytes !== undefined && (!Number.isInteger(options.chunkBytes) || options.chunkBytes <= 0)) {
        throw new Error("chunkBytes must be a positive integer");
    }
    const count = Math.ceil(manifest.chunks / chunksPerSection);
    const sections: ManifestSection[] = [];
    for (let index = 0; index < count; index += 1) {
        const start = index * chunksPerSection;
        const end = Math.min(manifest.chunks, start + chunksPerSection);
        const isLast = index === count - 1;
        sections.push({
            id: `section-${index}`,
            index,
            start,
            end,
            chunks: end - start,
            bytes: options.chunkBytes === undefined ? null : isLast ? Math.max(0, manifest.bytes - start * options.chunkBytes) : (end - start) * options.chunkBytes,
        });
    }
    if (options.ids !== undefined) {
        if (options.ids.length !== sections.length) {
            throw new Error("section ids must match the planned sections");
        }
        if (options.ids.some((id) => typeof id !== "string" || id === "")) {
            throw new Error("section ids must be non-empty strings");
        }
        if (new Set(options.ids).size !== options.ids.length) {
            throw new Error("section ids must be unique");
        }
        sections.forEach((section, index) => { section.id = options.ids![index]!; });
    }
    return sections;
}

export interface LazyManifestSections {
    list(): ManifestSectionSnapshot[];
    get(id: string): ManifestSectionSnapshot | null;
    data(id: string): string | null;
    isLoaded(id: string): boolean;
    loadedCount(): number;
    loadedBytes(): number;
    load(id: string): Promise<string>;
    loadMany(ids: string[]): Promise<string[]>;
    loadAll(): Promise<string[]>;
    reset(id?: string): void;
}

interface SectionEntry extends ManifestSection {
    state: ManifestSectionState;
    data: string | null;
    error: string | null;
    attempts: number;
    inflight: Promise<string> | null;
}

export function createLazyManifestSections(sections: ManifestSection[], loadChunk: ManifestChunkLoader): LazyManifestSections {
    const seen = new Set<string>();
    const entries: SectionEntry[] = sections.map((section) => {
        if (typeof section.id !== "string" || section.id === "" || seen.has(section.id)) {
            throw new Error(`duplicate manifest section id: ${section.id}`);
        }
        seen.add(section.id);
        if (!Number.isInteger(section.start) || !Number.isInteger(section.end) || section.start < 0 || section.end <= section.start) {
            throw new Error("invalid manifest section");
        }
        return { ...section, state: "idle" as const, data: null, error: null, attempts: 0, inflight: null };
    });
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    const snapshot = (entry: SectionEntry): ManifestSectionSnapshot => ({
        id: entry.id,
        index: entry.index,
        start: entry.start,
        end: entry.end,
        chunks: entry.chunks,
        bytes: entry.bytes,
        state: entry.state,
        data: entry.data,
        error: entry.error,
        attempts: entry.attempts,
    });

    const requireEntry = (id: string): SectionEntry => {
        const entry = byId.get(id);
        if (!entry) throw new Error(`unknown manifest section: ${id}`);
        return entry;
    };

    const load = (id: string): Promise<string> => {
        const entry = byId.get(id);
        if (!entry) return Promise.reject(new Error(`unknown manifest section: ${id}`));
        if (entry.state === "loaded" && entry.data !== null) return Promise.resolve(entry.data);
        if (entry.inflight) return entry.inflight;
        entry.state = "loading";
        entry.error = null;
        entry.attempts += 1;
        const run = (async () => {
            const parts: string[] = [];
            for (let index = entry.start; index < entry.end; index += 1) {
                const part = await loadChunk(index);
                if (typeof part !== "string") {
                    throw new Error(`missing chunk ${index} of manifest section ${entry.id}`);
                }
                parts.push(part);
            }
            const joined = parts.join("");
            entry.state = "loaded";
            entry.data = joined;
            entry.error = null;
            return joined;
        })();
        entry.inflight = run;
        run.catch((error: unknown) => {
            entry.state = "error";
            entry.data = null;
            entry.error = error instanceof Error ? error.message : String(error);
        });
        // `.then(onSettled, onSettled)` — not `.finally()`: finally returns a
        // rejected promise of its own, which vitest reports as unhandled.
        const clearInflight = () => { if (entry.inflight === run) entry.inflight = null; };
        run.then(clearInflight, clearInflight);
        return run;
    };

    return {
        list: () => entries.map(snapshot),
        get: (id) => { const entry = byId.get(id); return entry ? snapshot(entry) : null; },
        data: (id) => byId.get(id)?.data ?? null,
        isLoaded: (id) => byId.get(id)?.state === "loaded",
        loadedCount: () => entries.filter((entry) => entry.state === "loaded").length,
        loadedBytes: () => entries.reduce((sum, entry) => sum + (entry.state === "loaded" ? entry.bytes ?? 0 : 0), 0),
        load,
        loadMany: async (ids) => {
            const results: string[] = [];
            for (const id of ids) results.push(await load(id));
            return results;
        },
        loadAll: async () => {
            const results: string[] = [];
            for (const entry of entries) results.push(await load(entry.id));
            return results;
        },
        reset: (id) => {
            const targets = id === undefined ? entries : [requireEntry(id)];
            for (const entry of targets) {
                entry.state = "idle";
                entry.data = null;
                entry.error = null;
                entry.attempts = 0;
                entry.inflight = null;
            }
        },
    };
}
