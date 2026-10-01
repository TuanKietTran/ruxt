const DRIVER_NAME = "ruxt-chunked-deno-kv";
const FORMAT = "ruxt-chunked-json-v1";
const CHUNKS = "__ruxt_chunks__";
const DEFAULT_CHUNK_BYTES = 48 * 1024;
const DEFAULT_MAX_ITEM_BYTES = 8 * 1024 * 1024;

interface KvEntry { key: unknown[]; value: unknown }
interface KvLike {
   get(key: unknown[]): Promise<{ value: unknown }>;
   set(key: unknown[], value: unknown, options?: { expireIn?: number }): Promise<unknown>;
   delete(key: unknown[]): Promise<void>;
   list(selector: { prefix: unknown[] }): AsyncIterable<KvEntry>;
   close?(): void;
}

export interface ChunkedDenoKvOptions {
   base?: string;
   path?: string;
   chunkBytes?: number;
   maxItemBytes?: number;
   ttl?: number;
   openKv?: () => Promise<KvLike>;
}

interface ChunkManifest {
   $ruxtStorage: typeof FORMAT;
   generation: string;
   chunks: number;
   bytes: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const normalize = (key = "") => key.split(":").filter(Boolean);
const isManifest = (value: unknown): value is ChunkManifest => {
   const candidate = value as Partial<ChunkManifest> | null;
   return candidate?.$ruxtStorage === FORMAT
      && typeof candidate.generation === "string"
      && Number.isSafeInteger(candidate.chunks)
      && Number.isSafeInteger(candidate.bytes);
};

/**
 * Deno KV storage driver with a conservative per-value guard and generation-based
 * chunking. The manifest is written last, so readers see either the old complete
 * value or the new complete value, never a partially-written document.
 */
export default function chunkedDenoKv(options: ChunkedDenoKvOptions = {}) {
   const base = normalize(options.base);
   const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
   const maxItemBytes = options.maxItemBytes ?? DEFAULT_MAX_ITEM_BYTES;
   if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1024 || chunkBytes >= 64 * 1024) {
      throw new Error(`[${DRIVER_NAME}] chunkBytes must be between 1024 and 65535`);
   }
   if (!Number.isSafeInteger(maxItemBytes) || maxItemBytes < chunkBytes) {
      throw new Error(`[${DRIVER_NAME}] maxItemBytes must be at least chunkBytes`);
   }

   const logicalKey = (key = "") => [...base, ...normalize(key)];
   const chunkPrefix = (key: string, generation: string) => [...base, CHUNKS, key, generation];
   const chunkKey = (key: string, generation: string, index: number) => [...chunkPrefix(key, generation), index];
   const ttl = (seconds = options.ttl) => typeof seconds === "number" && seconds > 0
      ? { expireIn: seconds * 1000 }
      : undefined;
   let instance: Promise<KvLike> | undefined;
   const getKv = () => {
      if (instance) return instance;
      if (options.openKv) instance = options.openKv();
      else {
         const deno = (globalThis as typeof globalThis & {
            Deno?: {
               openKv?: (path?: string) => Promise<KvLike>;
               env?: { get(name: string): string | undefined };
            };
         }).Deno;
         if (!deno?.openKv) throw new Error(`[${DRIVER_NAME}] Deno.openKv is unavailable`);
         // Separate Deno Deploy apps share KV through the same connection URL and
         // DENO_KV_ACCESS_TOKEN. Resolve the URL at runtime so it is not bundled.
         const path = options.path ?? deno.env?.get("DENO_KV_URL");
         instance = deno.openKv(path);
      }
      return instance;
   };

   const removeChunks = async (kv: KvLike, key: string, manifest: ChunkManifest) => {
      for (let index = 0; index < manifest.chunks; index += 1) {
         await kv.delete(chunkKey(key, manifest.generation, index));
      }
   };

   const read = async (key: string) => {
      const kv = await getKv();
      const stored = (await kv.get(logicalKey(key))).value;
      if (!isManifest(stored)) return stored ?? null;
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (let index = 0; index < stored.chunks; index += 1) {
         const chunk = (await kv.get(chunkKey(key, stored.generation, index))).value;
         if (!(chunk instanceof Uint8Array)) {
            throw new Error(`[${DRIVER_NAME}] missing chunk ${index + 1}/${stored.chunks} for ${key}`);
         }
         chunks.push(chunk);
         length += chunk.byteLength;
      }
      if (length !== stored.bytes) throw new Error(`[${DRIVER_NAME}] size mismatch for ${key}`);
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
         bytes.set(chunk, offset);
         offset += chunk.byteLength;
      }
      return JSON.parse(decoder.decode(bytes));
   };

   const write = async (key: string, value: unknown, writeOptions?: { ttl?: number }) => {
      const json = JSON.stringify(value);
      if (json === undefined) throw new Error(`[${DRIVER_NAME}] ${key} is not JSON serializable`);
      const bytes = encoder.encode(json);
      if (bytes.byteLength > maxItemBytes) {
         throw new Error(`[${DRIVER_NAME}] ${key} is ${bytes.byteLength} bytes; limit is ${maxItemBytes}`);
      }
      const kv = await getKv();
      const previous = (await kv.get(logicalKey(key))).value;
      const expires = ttl(writeOptions?.ttl);
      if (bytes.byteLength <= chunkBytes) {
         await kv.set(logicalKey(key), value, expires);
         if (isManifest(previous)) await removeChunks(kv, key, previous);
         return;
      }

      const generation = crypto.randomUUID();
      const chunks = Math.ceil(bytes.byteLength / chunkBytes);
      try {
         for (let index = 0; index < chunks; index += 1) {
            await kv.set(
               chunkKey(key, generation, index),
               bytes.slice(index * chunkBytes, (index + 1) * chunkBytes),
               expires,
            );
         }
         const manifest: ChunkManifest = { $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength };
         await kv.set(logicalKey(key), manifest, expires);
      } catch (error) {
         await removeChunks(kv, key, { $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength });
         throw error;
      }
      if (isManifest(previous)) await removeChunks(kv, key, previous);
   };

   return {
      name: DRIVER_NAME,
      getInstance: getKv,
      hasItem: async (key: string) => (await (await getKv()).get(logicalKey(key))).value !== null,
      getItem: read,
      getItemRaw: read,
      setItem: write,
      setItemRaw: write,
      async removeItem(key: string) {
         const kv = await getKv();
         const previous = (await kv.get(logicalKey(key))).value;
         await kv.delete(logicalKey(key));
         if (isManifest(previous)) await removeChunks(kv, key, previous);
      },
      async getKeys(prefix = "") {
         const kv = await getKv();
         const keys: string[] = [];
         for await (const entry of kv.list({ prefix: logicalKey(prefix) })) {
            const relative = entry.key.slice(base.length);
            if (relative[0] === CHUNKS) continue;
            keys.push(relative.join(":"));
         }
         return keys;
      },
      async clear(prefix = "") {
         const kv = await getKv();
         const logicalPrefix = normalize(prefix).join(":");
         for await (const entry of kv.list({ prefix: base })) {
            const relative = entry.key.slice(base.length);
            const isChunk = relative[0] === CHUNKS;
            const key = isChunk ? String(relative[1] ?? "") : relative.join(":");
            if (!logicalPrefix || key === logicalPrefix || key.startsWith(`${logicalPrefix}:`)) {
               await kv.delete(entry.key);
            }
         }
      },
      async dispose() {
         const kv = instance && await instance;
         kv?.close?.();
         instance = undefined;
      },
   };
}
