import { describe, expect, it } from "vitest";
import chunkedDenoKv from "../../server/storage/chunked-deno-kv";

class MemoryKv {
   readonly values = new Map<string, { key: unknown[]; value: unknown }>();
   writes = 0;
   private id(key: unknown[]) { return JSON.stringify(key); }
   async get(key: unknown[]) { return { value: this.values.get(this.id(key))?.value ?? null }; }
   async set(key: unknown[], value: unknown) {
      this.writes += 1;
      this.values.set(this.id(key), { key, value });
   }
   async delete(key: unknown[]) { this.values.delete(this.id(key)); }
   async *list({ prefix }: { prefix: unknown[] }) {
      for (const entry of this.values.values()) {
         if (prefix.every((part, index) => entry.key[index] === part)) yield entry;
      }
   }
}

const driver = (kv: MemoryKv, options: { chunkBytes?: number; maxItemBytes?: number } = {}) =>
   chunkedDenoKv({ base: "cv", openKv: async () => kv, chunkBytes: 1024, ...options });

describe("chunked Deno KV storage", () => {
   it("keeps small values directly readable and lists logical keys", async () => {
      const kv = new MemoryKv();
      const storage = driver(kv);
      const value = { id: "one", markdown: "hello" };
      await storage.setItem("documents:one", value);
      expect(await storage.getItem("documents:one")).toEqual(value);
      expect(await storage.getKeys("documents")).toEqual(["documents:one"]);
      expect(kv.values.size).toBe(1);
   });

   it("round-trips UTF-8 values across chunks without exposing internal keys", async () => {
      const kv = new MemoryKv();
      const storage = driver(kv);
      const value = { id: "large", markdown: "🦊".repeat(900) };
      await storage.setItem("documents:large", value);
      expect(kv.values.size).toBeGreaterThan(2);
      expect(await storage.getItem("documents:large")).toEqual(value);
      expect(await storage.getKeys()).toEqual(["documents:large"]);
   });

   it("removes old chunks when replacing a large value", async () => {
      const kv = new MemoryKv();
      const storage = driver(kv);
      await storage.setItem("documents:one", { markdown: "x".repeat(3000) });
      await storage.setItem("documents:one", { markdown: "small" });
      expect(kv.values.size).toBe(1);
      expect(await storage.getItem("documents:one")).toEqual({ markdown: "small" });
   });

   it("rejects oversized values before opening or writing KV", async () => {
      const kv = new MemoryKv();
      const storage = driver(kv, { maxItemBytes: 2048 });
      await expect(storage.setItem("documents:huge", { markdown: "x".repeat(3000) }))
         .rejects.toThrow("limit is 2048");
      expect(kv.writes).toBe(0);
   });
});
