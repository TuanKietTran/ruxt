import { afterEach, describe, expect, it, vi } from "vitest";
import chunkedCloudflareKv from "../../server/storage/chunked-cloudflare-kv";

const store = new Map<string, string | Uint8Array>();
const reads: { key: string; cacheTtl?: number }[] = [];
(globalThis as any).__env__ = {
   RUXT_KV: {
      get: async (key: string, options?: string | { type?: string; cacheTtl?: number }) => {
         const type = typeof options === "string" ? options : options?.type;
         reads.push({ key, cacheTtl: typeof options === "object" ? options.cacheTtl : undefined });
         const value = store.get(key);
         if (value === undefined) return null;
         if (type === "arrayBuffer") return (value as Uint8Array).buffer;
         return type === "json" ? JSON.parse(value as string) : value;
      },
      put: async (key: string, value: string | Uint8Array) => { store.set(key, value); },
      delete: async (key: string) => { store.delete(key); },
      list: async ({ prefix = "" }: { prefix?: string } = {}) => ({ keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
   },
};
const chunks = (value: unknown) => Math.ceil(new TextEncoder().encode(JSON.stringify(value)).byteLength / (24 * 1024));
const documentOf = (size: number) => ({ id: "doc", title: "Ada", revision: 3, updatedAt: "2026-10-28T00:00:00.000Z", markdown: "x".repeat(size), css: "" });

describe("chunked Cloudflare KV driver", () => {
   afterEach(() => { store.clear(); reads.length = 0; vi.useRealTimers(); });

   it("does not list keys of a sibling mount whose name starts with the same text", async () => {
      await chunkedCloudflareKv({ base: "cv" }).setItem("doc:a", { id: "a" });
      await chunkedCloudflareKv({ base: "cv-pipeline" }).setItem("imports:j1", { id: "j1" });
      expect(await chunkedCloudflareKv({ base: "cv" }).getKeys()).toEqual(["doc:a"]);
      expect(await chunkedCloudflareKv({ base: "cv-pipeline" }).getKeys()).toEqual(["imports:j1"]);
   });

   it("round-trips values larger than one chunk and hides chunk keys", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      const big = { markdown: "x".repeat(100_000) };
      await driver.setItem("doc:big", big);
      expect(await driver.getItem("doc:big")).toEqual(big);
      expect(await driver.getKeys()).toEqual(["doc:big"]);
   });

   it("reads a small document with one KV read and a chunked one with one read per chunk plus the manifest", async () => {
      const small = documentOf(3_000);
      const big = documentOf(100_000);
      await chunkedCloudflareKv({ base: "cv" }).setItem("documents:small", small);
      await chunkedCloudflareKv({ base: "cv" }).setItem("documents:big", big);
      // A fresh driver instance stands in for a new Worker isolate with nothing remembered.
      const driver = chunkedCloudflareKv({ base: "cv" });
      reads.length = 0;
      expect(await driver.getItem("documents:small")).toEqual(small);
      expect(reads).toHaveLength(1);
      reads.length = 0;
      expect(await driver.getItem("documents:big")).toEqual(big);
      expect(reads).toHaveLength(1 + chunks(big));
   });

   it("re-reads an unchanged chunked document from the isolate copy with one manifest read", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const driver = chunkedCloudflareKv({ base: "cv" });
      const big = documentOf(100_000);
      await driver.setItem("documents:big", big);
      reads.length = 0;
      expect(await driver.getItem("documents:big")).toEqual(big);
      expect(reads).toHaveLength(1);
      // Another isolate's write swaps the generation, so the copy is never served stale.
      const changed = { ...big, revision: 4, markdown: "y".repeat(100_000) };
      await chunkedCloudflareKv({ base: "cv" }).setItem("documents:big", changed);
      reads.length = 0;
      expect(await driver.getItem("documents:big")).toEqual(changed);
      expect(reads).toHaveLength(1 + chunks(changed));
      // The copy expires after ten seconds.
      vi.advanceTimersByTime(10_001);
      reads.length = 0;
      await driver.getItem("documents:big");
      expect(reads).toHaveLength(1 + chunks(changed));
   });

   it("answers metadata from the chunk manifest without reading chunks", async () => {
      const driver = chunkedCloudflareKv({ base: "cv", metaFields: ["revision", "updatedAt", "title"] });
      await driver.setItem("documents:big", documentOf(100_000));
      await driver.setItem("documents:small", documentOf(10));
      reads.length = 0;
      expect(await driver.getMeta("documents:big")).toEqual({ revision: 3, updatedAt: "2026-10-28T00:00:00.000Z", title: "Ada" });
      expect(await driver.getMeta("documents:small")).toEqual({ revision: 3, updatedAt: "2026-10-28T00:00:00.000Z", title: "Ada" });
      expect(await driver.getMeta("documents:none")).toEqual({});
      expect(reads).toHaveLength(3);
   });

   it("uses the KV edge cache only for configured read-mostly prefixes and never on writes", async () => {
      const driver = chunkedCloudflareKv({ base: "cv", cachedPrefixes: ["templates:"], cacheTtl: 300 });
      await driver.setItem("templates:harvard:v1", { id: "harvard" });
      await driver.setItem("documents:a", { id: "a" });
      reads.length = 0;
      await driver.getItem("templates:harvard:v1");
      await driver.getItem("documents:a");
      await driver.setItem("templates:harvard:v1", { id: "harvard", v: 2 });
      expect(reads.map(read => read.cacheTtl)).toEqual([300, undefined, undefined]);
   });
});
