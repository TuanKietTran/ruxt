const DRIVER_NAME = "ruxt-chunked-cloudflare-kv";
const FORMAT = "ruxt-chunked-json-v1";
const CHUNKS = "__ruxt_chunks__";
const CHUNK_BYTES = 24 * 1024;
const MAX_ITEM_BYTES = 8 * 1024 * 1024;
// Chunked items read again within this window reuse the decoded copy when the manifest still names the
// same generation; generations are write-once, so a hit can never be stale. Bounded per driver instance.
const RECENT_TTL_MS = 10_000;
const RECENT_MAX_ITEMS = 16;
const RECENT_MAX_BYTES = 1024 * 1024;
type ReadType = "json" | "arrayBuffer";
interface KVBinding {
   get(key: string, options?: ReadType | { type?: ReadType; cacheTtl?: number }): Promise<any>;
   put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { expirationTtl?: number }): Promise<void>;
   delete(key: string): Promise<void>;
   list(options?: { prefix?: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}
interface Manifest { $ruxtStorage: typeof FORMAT; generation: string; chunks: number; bytes: number; meta?: Record<string, unknown> }
interface Options {
   base?: string;
   binding?: string;
   /** Top-level scalar fields copied into chunk manifests so `getMeta` answers without reading chunks. */
   metaFields?: string[];
   /** Logical key prefixes that are written rarely (seeded templates); their reads use the KV edge cache. */
   cachedPrefixes?: string[];
   /** Seconds a cached-prefix read may be served from the KV edge cache (KV minimum is 60). */
   cacheTtl?: number;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const prefix = (key: string) => key.split(":").filter(Boolean).join(":");
const manifest = (v: any): v is Manifest => v?.$ruxtStorage === FORMAT && typeof v.generation === "string" && Number.isSafeInteger(v.chunks) && Number.isSafeInteger(v.bytes);

/** Workers KV-backed Nitro storage with a conservative item ceiling and generation-swapped chunks. */
export default function chunkedCloudflareKv(options: Options = {}) {
   const base = [options.base, ""].filter(Boolean).join(":");
   const env = () => (globalThis as typeof globalThis & { __env__?: Record<string, unknown> }).__env__;
   const kv = (): KVBinding => {
      const binding = env()?.[options.binding ?? "RUXT_KV"] as KVBinding | undefined;
      if (!binding) throw new Error(`[${DRIVER_NAME}] KV binding ${options.binding ?? "RUXT_KV"} is unavailable`);
      return binding;
   };
   const key = (k: string) => [base, prefix(k)].filter(Boolean).join(":");
   const chunkKey = (k: string, generation: string, n: number) => `${base}${base ? ":" : ""}${CHUNKS}:${encodeURIComponent(k)}:${generation}:${n}`;
   const cacheTtl = Math.max(60, options.cacheTtl ?? 300);
   const readOptions = (k: string, type: ReadType) => options.cachedPrefixes?.some(p => prefix(k).startsWith(p)) ? { type, cacheTtl } : type;
   const pickMeta = (value: unknown) => {
      if (!options.metaFields?.length || !value || typeof value !== "object") return undefined;
      const entries = options.metaFields
         .map(field => [field, (value as Record<string, unknown>)[field]] as const)
         .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || typeof v === "string" && v.length <= 256);
      return entries.length ? Object.fromEntries(entries) : undefined;
   };
   const recent = new Map<string, { generation: string; text: string; expires: number }>();
   const remember = (k: string, generation: string, text: string) => {
      recent.delete(k);
      if (text.length > RECENT_MAX_BYTES) return;
      recent.set(k, { generation, text, expires: Date.now() + RECENT_TTL_MS });
      while (recent.size > RECENT_MAX_ITEMS) recent.delete(recent.keys().next().value!);
   };
   const recalled = (k: string, generation: string) => {
      const hit = recent.get(k);
      if (hit?.generation === generation && hit.expires > Date.now()) return hit.text;
      if (hit) recent.delete(k);
      return undefined;
   };
   // Writes and removals must see the current manifest, so only plain reads may use the edge cache.
   const getManifest = (k: string, cached = false) => kv().get(key(k), cached ? readOptions(k, "json") : "json");
   const removeChunks = async (k: string, m: Manifest) => Promise.all(Array.from({ length: m.chunks }, (_, n) => kv().delete(chunkKey(k, m.generation, n))));
   // One read for the plain key or manifest, then every chunk in parallel: 1 + chunks reads per item,
   // or exactly 1 when the same generation was read or written by this isolate moments ago.
   const read = async (k: string) => {
      const stored = await getManifest(k, true);
      if (!manifest(stored)) return stored ?? null;
      const known = recalled(k, stored.generation);
      if (known !== undefined) return JSON.parse(known);
      const parts = await Promise.all(Array.from({ length: stored.chunks }, async (_, i) => {
         const part = await kv().get(chunkKey(k, stored.generation, i), readOptions(k, "arrayBuffer")) as ArrayBuffer | null;
         if (!part) throw new Error(`[${DRIVER_NAME}] missing chunk ${i + 1}/${stored.chunks} for ${k}`);
         return new Uint8Array(part);
      }));
      const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
      if (length !== stored.bytes) throw new Error(`[${DRIVER_NAME}] corrupt chunk set for ${k}`);
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      const text = decoder.decode(bytes);
      remember(k, stored.generation, text);
      return JSON.parse(text);
   };
   const write = async (k: string, value: unknown) => {
      const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error(`[${DRIVER_NAME}] value is not JSON serializable`);
      const bytes = encoder.encode(encoded); if (bytes.byteLength > MAX_ITEM_BYTES) throw new Error(`[${DRIVER_NAME}] ${k} exceeds ${MAX_ITEM_BYTES} bytes`);
      const old = await getManifest(k);
      recent.delete(k);
      if (bytes.byteLength <= CHUNK_BYTES) {
         await kv().put(key(k), encoded);
      } else {
         const generation = crypto.randomUUID(); const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
         try {
            for (let i = 0; i < chunks; i++) await kv().put(chunkKey(k, generation, i), bytes.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
            await kv().put(key(k), JSON.stringify({ $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength, meta: pickMeta(value) } satisfies Manifest));
         } catch (error) { await removeChunks(k, { $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength }); throw error; }
         remember(k, generation, encoded);
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
      /** Configured `metaFields` from one key read: the manifest of a chunked item, or a small item itself. */
      async getMeta(k: string) {
         const stored = await getManifest(k, true);
         return (manifest(stored) ? stored.meta : pickMeta(stored)) ?? {};
      },
      setItem: write,
      setItemRaw: write,
      async removeItem(k: string) { const old = await getManifest(k); recent.delete(k); await kv().delete(key(k)); if (manifest(old)) await removeChunks(k, old); },
      getKeys: keys,
      async clear(k = "") { await Promise.all((await keys(k)).map(name => kv().delete(key(name)))); recent.clear(); },
   };
}
