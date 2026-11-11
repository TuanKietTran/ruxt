import { describe, expect, it } from "vitest";
import { createManifestCache, manifestToken } from "../../server/storage/manifest-cache";

const value = (id: string) => ({ id, markdown: `body-${id}` });

describe("manifest cache", () => {
   it("returns a stored value when the validation token still matches", () => {
      const cache = createManifestCache();
      cache.set("doc:a", "gen-1", value("a"));
      expect(cache.get("doc:a", "gen-1")).toEqual(value("a"));
      expect(cache.size).toBe(1);
   });

   it("never serves stale data after a generation change", () => {
      const cache = createManifestCache();
      cache.set("doc:a", "gen-1", value("a"));
      expect(cache.get("doc:a", "gen-2")).toBeUndefined();
      // The mismatched entry is evicted, not kept for the old token either.
      expect(cache.get("doc:a", "gen-1")).toBeUndefined();
      expect(cache.size).toBe(0);
   });

   it("keys entries on etag and version tokens as well as generation", () => {
      const cache = createManifestCache();
      cache.set("doc:a", { etag: '"v1"' }, value("a"));
      expect(cache.get("doc:a", { etag: '"v1"' })).toEqual(value("a"));
      expect(cache.get("doc:a", { etag: '"v2"' })).toBeUndefined();
      cache.set("doc:b", { version: 3 }, value("b"));
      expect(cache.get("doc:b", { version: 3 })).toEqual(value("b"));
      expect(cache.get("doc:b", { version: 4 })).toBeUndefined();
      cache.set("doc:c", { generation: "g1", etag: '"e1"' }, value("c"));
      expect(cache.get("doc:c", { generation: "g1", etag: '"e2"' })).toBeUndefined();
   });

   it("refuses to store or serve without a non-empty validation token", () => {
      const cache = createManifestCache();
      expect(cache.set("doc:a", "", value("a"))).toBe(false);
      expect(cache.set("doc:a", {}, value("a"))).toBe(false);
      expect(cache.set("doc:a", { generation: "" }, value("a"))).toBe(false);
      cache.set("doc:a", "gen-1", value("a"));
      expect(cache.get("doc:a", "")).toBeUndefined();
      expect(cache.get("doc:a", {})).toBeUndefined();
   });

   it("expires entries after the TTL, measured from when they were stored", () => {
      let now = 1_000;
      const cache = createManifestCache({ ttlMs: 5_000, now: () => now });
      cache.set("doc:a", "gen-1", value("a"));
      now = 5_999;
      expect(cache.get("doc:a", "gen-1")).toEqual(value("a"));
      // A hit does not extend the TTL.
      now = 6_000;
      expect(cache.get("doc:a", "gen-1")).toBeUndefined();
      expect(cache.size).toBe(0);
   });

   it("evicts least-recently-used entries beyond the item bound", () => {
      const cache = createManifestCache({ maxItems: 2 });
      cache.set("doc:a", "gen-1", value("a"));
      cache.set("doc:b", "gen-1", value("b"));
      expect(cache.get("doc:a", "gen-1")).toEqual(value("a"));
      cache.set("doc:c", "gen-1", value("c"));
      expect(cache.size).toBe(2);
      expect(cache.get("doc:b", "gen-1")).toBeUndefined();
      expect(cache.get("doc:a", "gen-1")).toEqual(value("a"));
      expect(cache.get("doc:c", "gen-1")).toEqual(value("c"));
   });

   it("evicts entries beyond the byte bound and rejects a single oversize value", () => {
      const cache = createManifestCache({ maxBytes: 100 });
      expect(cache.set("doc:big", "gen-1", value("big"), 101)).toBe(false);
      expect(cache.size).toBe(0);
      cache.set("doc:a", "gen-1", value("a"), 60);
      cache.set("doc:b", "gen-1", value("b"), 60);
      expect(cache.size).toBe(1);
      expect(cache.get("doc:a", "gen-1")).toBeUndefined();
      expect(cache.get("doc:b", "gen-1")).toEqual(value("b"));
   });

   it("replacing a key with a new token supersedes the old value", () => {
      const cache = createManifestCache();
      cache.set("doc:a", "gen-1", value("a"));
      cache.set("doc:a", "gen-2", { id: "a", markdown: "new" });
      expect(cache.size).toBe(1);
      expect(cache.get("doc:a", "gen-2")).toEqual({ id: "a", markdown: "new" });
      // Checked last: a probe with a mismatched token evicts the entry by design.
      expect(cache.get("doc:a", "gen-1")).toBeUndefined();
   });

   it("supports invalidate and clear", () => {
      const cache = createManifestCache();
      cache.set("doc:a", "gen-1", value("a"));
      cache.set("doc:b", "gen-1", value("b"));
      cache.invalidate("doc:a");
      expect(cache.get("doc:a", "gen-1")).toBeUndefined();
      expect(cache.get("doc:b", "gen-1")).toEqual(value("b"));
      cache.clear();
      expect(cache.size).toBe(0);
   });
});

describe("manifestToken", () => {
   it("extracts the generation from a chunked-storage manifest", () => {
      const manifest = { $ruxtStorage: "ruxt-chunked-json-v1", generation: "g-42", chunks: 3, bytes: 1234 };
      expect(manifestToken(manifest)).toBe("g-42");
   });

   it("returns undefined for values that are not valid manifests", () => {
      expect(manifestToken(null)).toBeUndefined();
      expect(manifestToken("gen-1")).toBeUndefined();
      expect(manifestToken({ generation: 7 })).toBeUndefined();
      expect(manifestToken({ $ruxtStorage: "other", generation: "g" })).toBeUndefined();
      expect(manifestToken({ $ruxtStorage: "ruxt-chunked-json-v1", generation: "" })).toBeUndefined();
   });
});
