import { describe, expect, it } from "vitest";
import {
   MetricsRecorder,
   hourlyTotals,
   mergeBuckets,
   normalizeRoutePath,
   recordSample,
   recentHourKeys,
   summarizeBuckets,
} from "@core/analytics/metrics";

describe("analytics metrics", () => {
   it("normalizes dynamic path segments without changing stable slugs", () => {
      expect(normalizeRoutePath("/api/cvs/8d9dc8eb-3021-4e33-8d75-87f8dadbd999?x=1")).toBe("/api/cvs/:id");
      expect(normalizeRoutePath("/api/jobs/123")).toBe("/api/jobs/:id");
      expect(normalizeRoutePath("/api/public/templates")).toBe("/api/public/templates");
   });

   it("merges and summarizes counters", () => {
      const first = {};
      recordSample(first, "GET /api/cvs", { durationMs: 10, ok: true, status: 200 });
      recordSample(first, "GET /api/cvs", { durationMs: 30, ok: false, status: 500 });
      const second = {};
      recordSample(second, "GET /api/cvs", { durationMs: 20, ok: true, status: 200 });

      expect(mergeBuckets(first, second)["GET /api/cvs"]).toMatchObject({
         count: 3, errors: 1, totalMs: 60, maxMs: 30, statuses: { "200": 2, "500": 1 },
      });
      expect(summarizeBuckets([first])[0]).toMatchObject({ avgMs: 20, errorRate: 1 / 3 });
   });

   it("drains process-local buckets and creates an oldest-first chart", () => {
      const recorder = new MetricsRecorder();
      recorder.record("routes", "GET /", { durationMs: 8, ok: true, status: 200 }, Date.UTC(2026, 0, 2, 3));
      recorder.record("routes", "GET /", { durationMs: 12, ok: false, status: 503 }, Date.UTC(2026, 0, 2, 3));
      const drained = recorder.drain();

      expect(drained).toHaveLength(1);
      expect(recorder.drain()).toEqual([]);
      expect(hourlyTotals(drained.map(({ hour, bucket }) => ({ hour, bucket })))).toEqual([
         { hour: "2026-01-02T03", count: 2, errors: 1, avgMs: 10 },
      ]);
      expect(recentHourKeys(2, Date.UTC(2026, 0, 2, 3))).toEqual(["2026-01-02T03", "2026-01-02T02"]);
   });
});
