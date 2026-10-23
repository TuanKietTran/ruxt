const DRIVER_NAME = "ruxt-chunked-cloudflare-kv";
const FORMAT = "ruxt-chunked-json-v1";
const CHUNKS = "__ruxt_chunks__";
const CHUNK_BYTES = 24 * 1024;
const MAX_ITEM_BYTES = 8 * 1024 * 1024;
interface KVBinding {
   get(key: string, type?: "json" | "arrayBuffer"): Promise<any>;
   put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { expirationTtl?: number }): Promise<void>;
   delete(key: string): Promise<void>;
   list(options?: { prefix?: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}
interface Manifest { $ruxtStorage: typeof FORMAT; generation: string; chunks: number; bytes: number }
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const prefix = (key: string) => key.split(":").filter(Boolean).join(":");
const manifest = (v: any): v is Manifest => v?.$ruxtStorage === FORMAT && typeof v.generation === "string" && Number.isSafeInteger(v.chunks) && Number.isSafeInteger(v.bytes);

/** Workers KV-backed Nitro storage with a conservative item ceiling and generation-swapped chunks. */
export default function chunkedCloudflareKv(options: { base?: string; binding?: string } = {}) {
   const base = [options.base, ""].filter(Boolean).join(":");
   const env = () => (globalThis as typeof globalThis & { __env__?: Record<string, unknown> }).__env__;
   const kv = (): KVBinding => {
      const binding = env()?.[options.binding ?? "RUXT_KV"] as KVBinding | undefined;
      if (!binding) throw new Error(`[${DRIVER_NAME}] KV binding ${options.binding ?? "RUXT_KV"} is unavailable`);
      return binding;
   };
   const key = (k: string) => [base, prefix(k)].filter(Boolean).join(":");
   const chunkKey = (k: string, generation: string, n: number) => `${base}${base ? ":" : ""}${CHUNKS}:${encodeURIComponent(k)}:${generation}:${n}`;
   const getManifest = async (k: string) => { const value = await kv().get(key(k), "json"); return manifest(value) ? value : value; };
   const removeChunks = async (k: string, m: Manifest) => Promise.all(Array.from({ length: m.chunks }, (_, n) => kv().delete(chunkKey(k, m.generation, n))));
   const read = async (k: string) => {
      const stored = await getManifest(k);
      if (!manifest(stored)) return stored ?? null;
      const parts: Uint8Array[] = []; let length = 0;
      for (let i = 0; i < stored.chunks; i++) {
         const part = await kv().get(chunkKey(k, stored.generation, i), "arrayBuffer") as ArrayBuffer | null;
         if (!part) throw new Error(`[${DRIVER_NAME}] missing chunk ${i + 1}/${stored.chunks} for ${k}`);
         const bytes = new Uint8Array(part); parts.push(bytes); length += bytes.byteLength;
      }
      if (length !== stored.bytes) throw new Error(`[${DRIVER_NAME}] corrupt chunk set for ${k}`);
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return JSON.parse(decoder.decode(bytes));
   };
   const write = async (k: string, value: unknown) => {
      const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error(`[${DRIVER_NAME}] value is not JSON serializable`);
      const bytes = encoder.encode(encoded); if (bytes.byteLength > MAX_ITEM_BYTES) throw new Error(`[${DRIVER_NAME}] ${k} exceeds ${MAX_ITEM_BYTES} bytes`);
      const old = await getManifest(k);
      if (bytes.byteLength <= CHUNK_BYTES) {
         await kv().put(key(k), encoded);
      } else {
         const generation = crypto.randomUUID(); const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
         try {
            for (let i = 0; i < chunks; i++) await kv().put(chunkKey(k, generation, i), bytes.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
            await kv().put(key(k), JSON.stringify({ $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength } satisfies Manifest));
         } catch (error) { await removeChunks(k, { $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength }); throw error; }
      }
      if (manifest(old)) await removeChunks(k, old);
   };
   const keys = async (k = "") => {
      // Match whole path segments like Deno KV array prefixes: base "cv" must not list "cv-pipeline:*".
      const p = key(k); const result: string[] = []; let cursor: string | undefined;
      const owns = (name: string) => !p || name === p || name.startsWith(`${p}:`);
      do { const page = await kv().list({ prefix: p || undefined, cursor }); result.push(...page.keys.map(x => x.name).filter(owns)); cursor = page.list_complete ? undefined : page.cursor; } while (cursor);
      return result.filter(x => !x.slice(base.length + (base ? 1 : 0)).startsWith(`${CHUNKS}:`)).map(x => x.slice(base.length + (base ? 1 : 0)));
   };
   return {
      name: DRIVER_NAME,
      getInstance: kv,
      hasItem: async (k: string) => (await kv().get(key(k))) !== null,
      getItem: read,
      getItemRaw: read,
      setItem: write,
      setItemRaw: write,
      async removeItem(k: string) { const old = await getManifest(k); await kv().delete(key(k)); if (manifest(old)) await removeChunks(k, old); },
      getKeys: keys,
      async clear(k = "") { await Promise.all((await keys(k)).map(name => kv().delete(key(name)))); },
   };
}
