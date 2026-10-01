import { MetricsRecorder, mergeBuckets } from "@ruxt/core/domain/analytics";
import type { MetricBucket, MetricKind, MetricSample } from "@ruxt/core/domain/analytics";
import { metricStorageKey } from "@ruxt/core/repos/metric.repo";

const recorder = new MetricsRecorder();
let flushing: Promise<void> = Promise.resolve();

export function recordMetric(kind: MetricKind, key: string, sample: MetricSample): void {
   recorder.record(kind, key, sample);
}

/** Merge pending samples into the shared `analytics` storage read by the admin app. */
export function flushMetrics(): Promise<void> {
   flushing = flushing.then(async () => {
      const storage = useStorage("analytics");
      for (const { kind, hour, bucket } of recorder.drain()) {
         const key = metricStorageKey(kind, hour);
         const current = await storage.getItem<MetricBucket>(key) ?? {};
         await storage.setItem(key, mergeBuckets(current, bucket));
      }
   }).catch((error) => {
      console.warn("[analytics] flush failed; samples dropped", error);
   });
   return flushing;
}
