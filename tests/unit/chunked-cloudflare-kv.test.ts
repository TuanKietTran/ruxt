import { afterEach, describe, expect, it } from "vitest";
import chunkedCloudflareKv from "../../server/storage/chunked-cloudflare-kv";

const store = new Map<string, string | Uint8Array>();
(globalThis as any).__env__ = {
   RUXT_KV: {
      get: async (key: string, type?: string) => {
         const value = store.get(key);
         if (value === undefined) return null;
         if (type === "arrayBuffer") return (value as Uint8Array).buffer;
         return JSON.parse(value as string);
      },
      put: async (key: string, value: string | Uint8Array) => { store.set(key, value); },
      delete: async (key: string) => { store.delete(key); },
      list: async ({ prefix = "" }: { prefix?: string } = {}) => ({ keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
   },
};

describe("chunked Cloudflare KV driver", () => {
   afterEach(() => store.clear());

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
});
