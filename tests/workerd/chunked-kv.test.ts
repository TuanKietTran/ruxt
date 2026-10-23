import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import chunkedCloudflareKv from "../../server/storage/chunked-cloudflare-kv";
import { createBindings, globalEnv } from "./miniflare";

let mf: ReturnType<typeof createBindings>;
let kv: Awaited<ReturnType<ReturnType<typeof createBindings>["getKVNamespace"]>>;

const rawKeys = async (prefix?: string) => {
   const names: string[] = [];
   let cursor: string | undefined;
   do {
      const page = await kv.list({ prefix, cursor });
      names.push(...page.keys.map(k => k.name));
      cursor = page.list_complete ? undefined : (page as any).cursor;
   } while (cursor);
   return names.sort();
};
const chunkKeys = async () => (await rawKeys()).filter(k => k.includes("__ruxt_chunks__"));
const big = (char: string, size = 100_000) => ({ markdown: char.repeat(size) });

beforeAll(async () => {
   mf = createBindings();
   kv = await mf.getKVNamespace("RUXT_KV");
   globalEnv.__env__ = { RUXT_KV: kv };
});
afterAll(async () => {
   delete globalEnv.__env__;
   await mf.dispose();
});
beforeEach(async () => {
   for (const name of await rawKeys()) await kv.delete(name);
});

describe("chunked Cloudflare KV driver on a real KV namespace", () => {
   it("stores a small value as one plain key", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      await driver.setItem("doc:a", { id: "a", n: 1 });
      expect(await driver.getItem("doc:a")).toEqual({ id: "a", n: 1 });
      expect(await driver.hasItem("doc:a")).toBe(true);
      expect(await rawKeys()).toEqual(["cv:doc:a"]);
      expect(await driver.getItem("doc:none")).toBeNull();
      expect(await driver.hasItem("doc:none")).toBe(false);
   });

   it("splits a multi-chunk value into 24 KiB chunks and reads it back", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      const value = big("é");
      await driver.setItem("doc:big", value);
      expect(await driver.getItem("doc:big")).toEqual(value);
      const expectedChunks = Math.ceil(new TextEncoder().encode(JSON.stringify(value)).byteLength / (24 * 1024));
      expect(expectedChunks).toBeGreaterThan(1);
      expect(await chunkKeys()).toHaveLength(expectedChunks);
   });

   it("overwrite swaps generations and removes the old chunks", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      await driver.setItem("doc:big", big("a"));
      const before = await chunkKeys();
      await driver.setItem("doc:big", big("b"));
      const after = await chunkKeys();
      expect(await driver.getItem("doc:big")).toEqual(big("b"));
      expect(before.length).toBeGreaterThan(1);
      expect(after).toHaveLength(before.length);
      expect(after.filter(k => before.includes(k))).toEqual([]);
   });

   it("overwriting a chunked value with a small one removes all chunks", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      await driver.setItem("doc:big", big("a"));
      await driver.setItem("doc:big", { small: true });
      expect(await driver.getItem("doc:big")).toEqual({ small: true });
      expect(await chunkKeys()).toEqual([]);
   });

   it("removeItem deletes the manifest and its chunks", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      await driver.setItem("doc:big", big("a"));
      await driver.setItem("doc:keep", { keep: true });
      await driver.removeItem("doc:big");
      expect(await driver.getItem("doc:big")).toBeNull();
      expect(await rawKeys()).toEqual(["cv:doc:keep"]);
   });

   it("getKeys hides chunk keys and does not leak sibling mounts", async () => {
      const cv = chunkedCloudflareKv({ base: "cv" });
      const pipeline = chunkedCloudflareKv({ base: "cv-pipeline" });
      await cv.setItem("doc:a", { id: "a" });
      await cv.setItem("doc:big", big("x"));
      await pipeline.setItem("imports:j1", { id: "j1" });
      await pipeline.setItem("imports:big", big("y"));
      expect((await cv.getKeys()).sort()).toEqual(["doc:a", "doc:big"]);
      expect((await pipeline.getKeys()).sort()).toEqual(["imports:big", "imports:j1"]);
   });

   it("clear on one mount leaves the sibling mount intact", async () => {
      const cv = chunkedCloudflareKv({ base: "cv" });
      const pipeline = chunkedCloudflareKv({ base: "cv-pipeline" });
      await cv.setItem("doc:a", { id: "a" });
      await pipeline.setItem("imports:j1", { id: "j1" });
      await cv.clear();
      expect(await cv.getKeys()).toEqual([]);
      expect(await pipeline.getItem("imports:j1")).toEqual({ id: "j1" });
   });

   it("detects a missing chunk instead of returning partial data", async () => {
      const driver = chunkedCloudflareKv({ base: "cv" });
      await driver.setItem("doc:big", big("a"));
      await kv.delete((await chunkKeys())[0]!);
      await expect(driver.getItem("doc:big")).rejects.toThrow(/missing chunk|corrupt/);
   });
});
