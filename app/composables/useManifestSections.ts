import { createLazyManifestSections, planManifestSections } from "~/utils/manifest-sections";
import type { ChunkManifestLike, ManifestChunkLoader, ManifestSectionSnapshot, PlanManifestSectionsOptions } from "~/utils/manifest-sections";

/**
 * Vue wrapper for the lazy manifest-section loader (`app/utils/manifest-sections.ts`).
 * Sections start idle and fetch nothing until `loadSection` / `loadMany` / `loadAll`
 * is called; the reactive snapshot list is refreshed after every load or reset.
 * This composable does not fetch from any store itself — the caller supplies the
 * per-chunk loader, so wiring it to a chunked-KV reader is a manager step.
 */
export function useManifestSections(manifest: ChunkManifestLike, loadChunk: ManifestChunkLoader, options: PlanManifestSectionsOptions = {}) {
    const loader = createLazyManifestSections(planManifestSections(manifest, options), loadChunk);
    const sections = ref<ManifestSectionSnapshot[]>(loader.list());
    const loadedCount = computed(() => loader.loadedCount());
    const totalCount = computed(() => loader.list().length);
    const loadedBytes = computed(() => loader.loadedBytes());
    const allLoaded = computed(() => totalCount.value > 0 && loadedCount.value === totalCount.value);

    const sync = () => { sections.value = loader.list(); };
    const loadSection = async (id: string) => {
        try { return await loader.load(id); } finally { sync(); }
    };
    const loadMany = async (ids: string[]) => {
        try { return await loader.loadMany(ids); } finally { sync(); }
    };
    const loadAll = async () => {
        try { return await loader.loadAll(); } finally { sync(); }
    };
    const reset = (id?: string) => { loader.reset(id); sync(); };

    return { sections, loadedCount, totalCount, loadedBytes, allLoaded, getSection: loader.get, data: loader.data, isLoaded: loader.isLoaded, loadSection, loadMany, loadAll, reset };
}
