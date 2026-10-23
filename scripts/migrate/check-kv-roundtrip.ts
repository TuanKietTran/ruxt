// Reads a kv-bulk-*.json set through the production Workers KV driver and prints item counts and sizes.
//   deno run -A scripts/migrate/check-kv-roundtrip.ts <outDir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import chunkedCloudflareKv from "../../server/storage/chunked-cloudflare-kv.ts";

const outDir = (globalThis as any).Deno.args[0] as string;
const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
const store = new Map<string, { value: string; base64?: boolean }>();
for (const file of manifest.kv.files) for (const r of JSON.parse(readFileSync(join(outDir, file), "utf8"))) store.set(r.key, r);
const bytes = (r: { value: string; base64?: boolean }) => r.base64 ? Uint8Array.from(atob(r.value), (c) => c.charCodeAt(0)) : new TextEncoder().encode(r.value);
(globalThis as any).__env__ = { RUXT_KV: {
   get: async (k: string, type?: string) => { const r = store.get(k); if (!r) return null; return type === "arrayBuffer" ? bytes(r).buffer : JSON.parse(r.value); },
   list: async ({ prefix = "" } = {}) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
} };
let items = 0;
for (const base of Object.keys(manifest.kv.byBase)) {
   const driver = chunkedCloudflareKv({ base });
   for (const key of await driver.getKeys()) {
      const value = await driver.getItem(key);
      if (value === null) throw new Error(`${base}:${key} read back null`);
      items += 1;
      console.log(`${base}:${key} ok (${JSON.stringify(value).length} chars)`);
   }
}
if (items !== manifest.kv.logicalItems) throw new Error(`read ${items} items, manifest has ${manifest.kv.logicalItems}`);
console.log(`roundtrip ok: ${items} logical items`);
