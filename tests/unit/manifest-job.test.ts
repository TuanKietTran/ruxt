import { describe, expect, it } from "vitest";
import { MANIFEST_FORMAT, MANIFEST_MAX_ITEM_BYTES, isChunkManifest, migrateManifest, parseManifest, runManifestJob, validateManifest } from "../../server/services/manifest-job";

const valid = { $ruxtStorage: MANIFEST_FORMAT, generation: "gen-1", chunks: 5, bytes: 100_000 };

describe("parseManifest", () => {
   it("parses an object manifest and a JSON-string manifest", () => {
      expect(parseManifest(valid)).toEqual(valid);
      expect(parseManifest(JSON.stringify(valid))).toEqual(valid);
   });
   it("returns null for inline values, invalid JSON, and non-manifests", () => {
      expect(parseManifest({ id: "doc" })).toBeNull();
      expect(parseManifest("{not json")).toBeNull();
      expect(parseManifest(null)).toBeNull();
      expect(isChunkManifest(valid)).toBe(true);
      expect(isChunkManifest({ ...valid, generation: 3 })).toBe(false);
   });
});

describe("validateManifest", () => {
   it("accepts a valid manifest, with or without meta", () => {
      expect(validateManifest(valid)).toEqual([]);
      expect(validateManifest({ ...valid, meta: { id: "doc" } })).toEqual([]);
   });
   it("flags wrong format, empty generation, and non-integer counts", () => {
      const codes = validateManifest({ $ruxtStorage: "other", generation: "  ", chunks: 1.5, bytes: 0 }).map((i) => i.code);
      expect(codes).toEqual(expect.arrayContaining(["wrong-format", "invalid-generation", "invalid-chunks", "invalid-bytes"]));
   });
   it("flags bytes over the 8 MiB driver ceiling and chunk-count mismatch", () => {
      expect(validateManifest({ ...valid, bytes: MANIFEST_MAX_ITEM_BYTES + 1 }).map((i) => i.code)).toContain("bytes-exceeds-max");
      expect(validateManifest({ ...valid, chunks: 4 }, { chunkBytes: 24 * 1024 }).map((i) => i.code)).toContain("chunks-mismatch");
      expect(validateManifest(valid, { chunkBytes: 20_000 })).toEqual([]);
   });
   it("flags a non-object meta and non-object input", () => {
      expect(validateManifest({ ...valid, meta: [] }).map((i) => i.code)).toContain("invalid-meta");
      expect(validateManifest("nope").map((i) => i.code)).toContain("not-an-object");
   });
});

describe("migrateManifest", () => {
   it("repairs a legacy manifest: adds format, coerces numeric strings, trims generation", () => {
      const legacy = { generation: " gen-2 ", chunks: "3", bytes: "70000", meta: { id: "x" } };
      expect(migrateManifest(legacy)).toEqual({ $ruxtStorage: MANIFEST_FORMAT, generation: "gen-2", chunks: 3, bytes: 70_000, meta: { id: "x" } });
      expect(legacy).toEqual({ generation: " gen-2 ", chunks: "3", bytes: "70000", meta: { id: "x" } });
   });
   it("drops a non-object meta and returns an equal copy for a valid manifest", () => {
      expect(migrateManifest({ ...valid, meta: "x" })).toEqual(valid);
      const copy = migrateManifest(valid);
      expect(copy).toEqual(valid);
      expect(copy).not.toBe(valid);
   });
   it("returns null when unrepairable", () => {
      expect(migrateManifest({ generation: "", chunks: 2, bytes: 10 })).toBeNull();
      expect(migrateManifest({ id: "doc" })).toBeNull();
      expect(migrateManifest(42)).toBeNull();
   });
});

describe("runManifestJob", () => {
   const entries = [
      { key: "a", value: valid },
      { key: "b", value: JSON.stringify({ generation: "g", chunks: "2", bytes: "30000" }) },
      { key: "c", value: { ...valid, generation: "" } },
      { key: "d", value: { id: "inline-doc" } },
   ];
   it("classifies valid, migrated, invalid, and inline entries", () => {
      const summary = runManifestJob(entries);
      expect(summary.processed).toBe(4);
      expect(summary.valid).toBe(1);
      expect(summary.migrated).toBe(1);
      expect(summary.invalid).toBe(1);
      expect(summary.inline).toBe(1);
      expect(summary.results.map((r) => [r.key, r.status])).toEqual([["a", "valid"], ["b", "migrated"], ["c", "invalid"], ["d", "inline"]]);
      expect(summary.results[1]?.manifest?.generation).toBe("g");
      expect(summary.results[2]?.issues.map((i) => i.code)).toContain("invalid-generation");
   });
   it("respects the batch limit and does not migrate when disabled", () => {
      expect(runManifestJob(entries, { limit: 2 }).processed).toBe(2);
      const noMigrate = runManifestJob(entries, { migrate: false });
      expect(noMigrate.migrated).toBe(0);
      expect(noMigrate.invalid).toBe(2);
   });
});
