import { runQueuedCvImports } from "../services/cv-import-worker";

/** Recover durable queued imports after restarts or request-runtime termination. */
export default defineTask({
   meta: {
      name: "cv-pipeline-maintenance",
      description: "Run queued CV extraction jobs",
   },
   async run() {
      const startedAt = performance.now();
      let ok = false;
      try {
         const processed = await runQueuedCvImports(2);
         ok = true;
         return { result: { processed } };
      } finally {
         recordMetric("tasks", "cv-pipeline-maintenance", { durationMs: performance.now() - startedAt, ok });
      }
   },
});
