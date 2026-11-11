import { runManifestJob } from "../services/manifest-job";
import type { ManifestJobEntry } from "../services/manifest-job";

/**
 * Nitro task wrapper for the manifest job. Raw manifests are internal to
 * the chunked storage drivers (useStorage decodes chunked values before
 * returning them), so entries arrive via the task payload — e.g.
 * runTask("manifest-job", { payload: { entries, limit, chunkBytes } }) —
 * and a scheduled run with no payload is a no-op batch, not a storage scan.
 */
export default defineTask({
   meta: {
      name: "manifest-job",
      description: "Parse, validate, and migrate chunked storage manifests",
   },
   async run(event: { payload?: Record<string, unknown> } = {}) {
      const startedAt = performance.now();
      let ok = false;
      try {
         const payload = event.payload ?? {};
         const summary = runManifestJob((payload.entries ?? []) as ManifestJobEntry[], {
            limit: payload.limit as number | undefined,
            chunkBytes: payload.chunkBytes as number | undefined,
         });
         ok = true;
         return { result: summary };
      } finally {
         recordMetric("tasks", "manifest-job", { durationMs: performance.now() - startedAt, ok });
      }
   },
});
