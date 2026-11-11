import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
   applyManifestDelta,
   diffManifests,
   isEmptyManifestDelta,
   type ManifestEntry,
   type ManifestSnapshot,
} from "../../shared/utils/manifestDelta";

const entry = (generation: string, bytes: number, meta?: Record<string, unknown>): ManifestEntry => ({
   generation,
   chunks: Math.max(1, Math.ceil(bytes / 1024)),
   bytes,
   ...(meta ? { meta } : {}),
});

const before: ManifestSnapshot = {
   "documents:one": entry("g1", 100, { title: "One" }),
   "documents:two": entry("g1", 2000),
   "documents:gone": entry("g1", 50),
   "documents:also-gone": entry("g2", 60),
};

const after: ManifestSnapshot = {
   "documents:one": entry("g1", 100, { title: "One" }),
   "documents:two": entry("g2", 2500),
   "documents:three": entry("g1", 300, { title: "Three" }),
};

describe("manifest delta diff", () => {
   it("is empty for identical snapshots, including deep-equal meta", () => {
      const delta = diffManifests(before, structuredClone(before));
      expect(delta).toEqual({ upsert: {}, remove: [] });
      expect(isEmptyManifestDelta(delta)).toBe(true);
   });

   it("upserts only added and changed entries, with meta changes counted", () => {
      const delta = diffManifests(before, after);
      expect(Object.keys(delta.upsert).sort()).toEqual(["documents:three", "documents:two"]);
      expect(delta.upsert["documents:two"]).toEqual(after["documents:two"]);
      const metaOnly: ManifestSnapshot = {
         ...before,
         "documents:one": entry("g1", 100, { title: "Renamed" }),
      };
      expect(Object.keys(diffManifests(before, metaOnly).upsert)).toEqual(["documents:one"]);
      expect(isEmptyManifestDelta(delta)).toBe(false);
   });

   it("lists removed keys sorted and never upserts them", () => {
      const delta = diffManifests(before, after);
      expect(delta.remove).toEqual(["documents:also-gone", "documents:gone"]);
      expect(delta.upsert["documents:gone"]).toBeUndefined();
   });

   it("does not alias the source snapshots in the delta", () => {
      const delta = diffManifests(before, after);
      delta.upsert["documents:two"]!.bytes = -1;
      expect(after["documents:two"]!.bytes).toBe(2500);
   });
});

describe("manifest delta apply", () => {
   it("round-trips: apply(before, diff(before, after)) equals after", () => {
      expect(applyManifestDelta(before, diffManifests(before, after))).toEqual(after);
      expect(applyManifestDelta(after, diffManifests(after, before))).toEqual(before);
      expect(applyManifestDelta({}, diffManifests({}, after))).toEqual(after);
      expect(applyManifestDelta(before, diffManifests(before, {}))).toEqual({});
   });

   it("does not mutate its inputs and returns copied entries", () => {
      const delta = diffManifests(before, after);
      const snapshot = structuredClone(before);
      const result = applyManifestDelta(before, delta);
      expect(before).toEqual(snapshot);
      result["documents:two"]!.bytes = -1;
      expect(delta.upsert["documents:two"]!.bytes).toBe(2500);
   });

   it("treats removing a missing key as a no-op and upsert as overwrite", () => {
      const result = applyManifestDelta(before, {
         upsert: { "documents:one": entry("g9", 1) },
         remove: ["documents:missing"],
      });
      expect(result["documents:one"]).toEqual(entry("g9", 1));
      expect(Object.keys(result).sort()).toEqual(Object.keys(before).sort());
   });
});

describe("chunked storage size budgets", () => {
   const constBytes = (path: string, name: string) => {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      const match = source.match(new RegExp(`const ${name} = ([0-9][0-9 *]*);`));
      expect(match, `${name} in ${path}`).not.toBeNull();
      return match![1]!.split("*").reduce((total, part) => total * Number(part.trim()), 1);
   };

   it("pins both drivers to an 8 MiB max item and 24-48 KiB chunks", () => {
      const cfChunk = constBytes("../../server/storage/chunked-cloudflare-kv.ts", "CHUNK_BYTES");
      const cfMax = constBytes("../../server/storage/chunked-cloudflare-kv.ts", "MAX_ITEM_BYTES");
      const denoChunk = constBytes("../../server/storage/chunked-deno-kv.ts", "DEFAULT_CHUNK_BYTES");
      const denoMax = constBytes("../../server/storage/chunked-deno-kv.ts", "DEFAULT_MAX_ITEM_BYTES");
      expect(cfChunk).toBe(24 * 1024);
      expect(denoChunk).toBe(48 * 1024);
      expect(cfMax).toBe(8 * 1024 * 1024);
      expect(denoMax).toBe(8 * 1024 * 1024);
      for (const chunk of [cfChunk, denoChunk]) {
         expect(chunk).toBeGreaterThanOrEqual(24 * 1024);
         expect(chunk).toBeLessThanOrEqual(48 * 1024);
         expect(cfMax % chunk).not.toBe(0);
      }
   });

   it("bounds the chunk count of a max-size item on both drivers", () => {
      const max = 8 * 1024 * 1024;
      expect(Math.ceil(max / (24 * 1024))).toBe(342);
      expect(Math.ceil(max / (48 * 1024))).toBe(171);
   });
});
