// Bounded, token-validated cache for manifest data (decoded chunked-storage values).
//
// A cached entry is served only when the caller presents the same validation token that was
// stored with it. The token is the manifest generation (chunked KV drivers are generation-
// stamped and write-once per generation), an HTTP etag, or a version — whichever the caller
// has freshly observed. A token mismatch evicts the entry, so data from a superseded
// generation can never be served stale. Entries also expire after a short absolute TTL and
// are bounded by item count and total bytes with LRU eviction, mirroring the recent-read
// cache in chunked-cloudflare-kv (10s / 16 items / 1 MiB).

const FORMAT = "ruxt-chunked-json-v1";
const DEFAULT_TTL_MS = 10_000;
const DEFAULT_MAX_ITEMS = 16;
const DEFAULT_MAX_BYTES = 1024 * 1024;

export type ManifestCacheToken =
   | string
   | { generation?: string | number; etag?: string | number; version?: string | number };

export interface ManifestCacheOptions {
   maxItems?: number;
   maxBytes?: number;
   ttlMs?: number;
   /** Clock override for tests; defaults to Date.now. */
   now?: () => number;
}

export interface ManifestCache<T = unknown> {
   get(key: string, token: ManifestCacheToken): T | undefined;
   has(key: string, token: ManifestCacheToken): boolean;
   set(key: string, token: ManifestCacheToken, value: T, sizeBytes?: number): boolean;
   invalidate(key: string): void;
   clear(): void;
   readonly size: number;
}

interface Entry<T> {
   token: string;
   value: T;
   bytes: number;
   storedAt: number;
}

const encoder = new TextEncoder();

function normalizeToken(token: ManifestCacheToken): string | undefined {
   if (typeof token === "string") return token.length > 0 ? token : undefined;
   if (!token || typeof token !== "object") return undefined;
   const parts: string[] = [];
   for (const field of ["generation", "etag", "version"] as const) {
      const raw = token[field];
      if (typeof raw === "string" && raw.length > 0) parts.push(`${field}=${raw}`);
      else if (typeof raw === "number" && Number.isFinite(raw)) parts.push(`${field}=${raw}`);
   }
   return parts.length > 0 ? parts.join("|") : undefined;
}

function estimateBytes(value: unknown): number {
   if (typeof value === "string") return encoder.encode(value).byteLength;
   try {
      const json = JSON.stringify(value);
      return json === undefined ? 0 : encoder.encode(json).byteLength;
   } catch {
      return 0;
   }
}

/** Generation token for a chunked-storage manifest, or undefined when the value is not one. */
export function manifestToken(value: unknown): string | undefined {
   if (!value || typeof value !== "object") return undefined;
   const manifest = value as Record<string, unknown>;
   if (manifest.$ruxtStorage !== FORMAT) return undefined;
   if (typeof manifest.generation !== "string" || manifest.generation.length === 0) return undefined;
   if (!Number.isSafeInteger(manifest.chunks) || !Number.isSafeInteger(manifest.bytes)) return undefined;
   return manifest.generation;
}

export function createManifestCache<T = unknown>(options: ManifestCacheOptions = {}): ManifestCache<T> {
   const maxItems = Math.max(0, Math.floor(options.maxItems ?? DEFAULT_MAX_ITEMS));
   const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));
   const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_TTL_MS);
   const now = options.now ?? Date.now;
   const entries = new Map<string, Entry<T>>();
   let totalBytes = 0;

   const drop = (key: string) => {
      const entry = entries.get(key);
      if (entry) {
         totalBytes -= entry.bytes;
         entries.delete(key);
      }
   };

   const expired = (entry: Entry<T>) => now() - entry.storedAt >= ttlMs;

   const pruneExpired = () => {
      for (const [key, entry] of entries) if (expired(entry)) drop(key);
   };

   // Shared lookup: returns the entry only for a live entry whose token matches.
   // A mismatched or expired entry is evicted so stale data cannot resurface.
   const lookup = (key: string, token: ManifestCacheToken): Entry<T> | undefined => {
      const normalized = normalizeToken(token);
      if (normalized === undefined) return undefined;
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (expired(entry) || entry.token !== normalized) {
         drop(key);
         return undefined;
      }
      return entry;
   };

   return {
      get(key, token) {
         const entry = lookup(key, token);
         if (!entry) return undefined;
         // Refresh LRU position without extending the absolute TTL.
         entries.delete(key);
         entries.set(key, entry);
         return entry.value;
      },
      has(key, token) {
         return lookup(key, token) !== undefined;
      },
      set(key, token, value, sizeBytes) {
         const normalized = normalizeToken(token);
         if (normalized === undefined || maxItems === 0) return false;
         const bytes = Math.max(0, Math.floor(sizeBytes ?? estimateBytes(value)));
         if (bytes > maxBytes) return false;
         drop(key);
         entries.set(key, { token: normalized, value, bytes, storedAt: now() });
         totalBytes += bytes;
         while (entries.size > maxItems || totalBytes > maxBytes) {
            const oldest = entries.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            drop(oldest);
         }
         return entries.has(key);
      },
      invalidate(key) {
         drop(key);
      },
      clear() {
         entries.clear();
         totalBytes = 0;
      },
      get size() {
         pruneExpired();
         return entries.size;
      },
   };
}

export default createManifestCache;
