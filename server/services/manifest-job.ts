/**
 * Server-side manifest job: parse, validate, and migrate chunked-storage
 * manifests (`ruxt-chunked-json-v1`, written by server/storage/chunked-*.ts)
 * without reading any chunk payloads. Pure and storage-agnostic: callers
 * supply raw stored values (objects, or JSON strings as in Workers KV) as
 * { key, value } entries; values that are not manifest candidates are
 * inline (unchunked) values and are classified, not rejected.
 */
export const MANIFEST_FORMAT = "ruxt-chunked-json-v1";
/** Both chunked drivers cap a stored item at 8 MiB. */
export const MANIFEST_MAX_ITEM_BYTES = 8 * 1024 * 1024;

export interface ChunkManifest {
   $ruxtStorage: typeof MANIFEST_FORMAT;
   generation: string;
   chunks: number;
   bytes: number;
   meta?: Record<string, unknown>;
}

export type ManifestIssueCode =
   | "not-an-object" | "wrong-format" | "invalid-generation" | "invalid-chunks"
   | "invalid-bytes" | "bytes-exceeds-max" | "chunks-mismatch" | "invalid-meta";

export interface ManifestIssue { code: ManifestIssueCode; message: string }

export interface ManifestValidateOptions { chunkBytes?: number; maxItemBytes?: number }

export interface ManifestJobEntry { key: string; value: unknown }

export type ManifestJobStatus = "valid" | "migrated" | "invalid" | "inline";

export interface ManifestJobResult {
   key: string;
   status: ManifestJobStatus;
   manifest?: ChunkManifest;
   issues: ManifestIssue[];
}

export interface ManifestJobSummary {
   processed: number;
   valid: number;
   migrated: number;
   invalid: number;
   inline: number;
   results: ManifestJobResult[];
}

export interface ManifestJobOptions extends ManifestValidateOptions {
   limit?: number;
   migrate?: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
   typeof value === "object" && value !== null && !Array.isArray(value);

const decode = (input: unknown): unknown => {
   if (typeof input !== "string") return input;
   try { return JSON.parse(input); } catch { return null; }
};

/** Loose guard mirroring the chunked drivers' own manifest check. */
export function isChunkManifest(value: unknown): value is ChunkManifest {
   if (!isPlainObject(value)) return false;
   return value.$ruxtStorage === MANIFEST_FORMAT
      && typeof value.generation === "string"
      && Number.isSafeInteger(value.chunks)
      && Number.isSafeInteger(value.bytes);
}

/** Parse a raw stored value (object or JSON string) into a manifest, or null when it is not one. */
export function parseManifest(input: unknown): ChunkManifest | null {
   const value = decode(input);
   return isChunkManifest(value) ? value : null;
}

export function validateManifest(input: unknown, options: ManifestValidateOptions = {}): ManifestIssue[] {
   if (!isPlainObject(input)) return [{ code: "not-an-object", message: "manifest is not an object" }];
   const issues: ManifestIssue[] = [];
   if (input.$ruxtStorage !== MANIFEST_FORMAT) issues.push({ code: "wrong-format", message: `expected $ruxtStorage ${MANIFEST_FORMAT}` });
   if (typeof input.generation !== "string" || !input.generation.trim()) issues.push({ code: "invalid-generation", message: "generation must be a non-empty string" });
   const chunksValid = Number.isSafeInteger(input.chunks) && (input.chunks as number) >= 1;
   if (!chunksValid) issues.push({ code: "invalid-chunks", message: "chunks must be a safe integer >= 1" });
   const bytesValid = Number.isSafeInteger(input.bytes) && (input.bytes as number) >= 1;
   if (!bytesValid) issues.push({ code: "invalid-bytes", message: "bytes must be a safe integer >= 1" });
   const maxItemBytes = options.maxItemBytes ?? MANIFEST_MAX_ITEM_BYTES;
   if (bytesValid && (input.bytes as number) > maxItemBytes) issues.push({ code: "bytes-exceeds-max", message: `bytes exceeds the ${maxItemBytes}-byte driver ceiling` });
   if (options.chunkBytes && chunksValid && bytesValid) {
      const expected = Math.ceil((input.bytes as number) / options.chunkBytes);
      if (input.chunks !== expected) issues.push({ code: "chunks-mismatch", message: `chunks ${String(input.chunks)} != ceil(bytes / chunkBytes) = ${expected}` });
   }
   if (input.meta !== undefined && !isPlainObject(input.meta)) issues.push({ code: "invalid-meta", message: "meta must be a plain object when present" });
   return issues;
}

const coerceCount = (value: unknown): unknown =>
   typeof value === "string" && value.trim() && Number.isSafeInteger(Number(value)) ? Number(value) : value;

/**
 * Repair a legacy manifest into the current format: add a missing
 * $ruxtStorage tag, coerce numeric-string chunks/bytes, trim the
 * generation, and drop a non-object meta. Returns null when the value
 * cannot be repaired into a valid manifest. Never mutates its input.
 */
export function migrateManifest(input: unknown): ChunkManifest | null {
   const value = decode(input);
   if (!isPlainObject(value)) return null;
   if (!("generation" in value) || !("chunks" in value) || !("bytes" in value)) return null;
   if (value.$ruxtStorage !== undefined && value.$ruxtStorage !== MANIFEST_FORMAT) return null;
   const migrated: Record<string, unknown> = {
      ...value,
      $ruxtStorage: MANIFEST_FORMAT,
      generation: typeof value.generation === "string" ? value.generation.trim() : value.generation,
      chunks: coerceCount(value.chunks),
      bytes: coerceCount(value.bytes),
   };
   if (!isPlainObject(migrated.meta)) delete migrated.meta;
   return validateManifest(migrated).length === 0 ? migrated as unknown as ChunkManifest : null;
}

const isManifestCandidate = (value: unknown): value is Record<string, unknown> =>
   isPlainObject(value) && ("$ruxtStorage" in value || ("generation" in value && "chunks" in value && "bytes" in value));

/** Run parse/validate/migrate over a bounded batch of raw stored entries. */
export function runManifestJob(entries: readonly ManifestJobEntry[], options: ManifestJobOptions = {}): ManifestJobSummary {
   const limit = Number.isSafeInteger(options.limit) && (options.limit as number) >= 0 ? (options.limit as number) : 50;
   const results: ManifestJobResult[] = entries.slice(0, limit).map(({ key, value }) => {
      const decoded = decode(value);
      if (!isManifestCandidate(decoded)) return { key, status: "inline", issues: [] };
      const issues = validateManifest(decoded, options);
      if (issues.length === 0) return { key, status: "valid", manifest: decoded as unknown as ChunkManifest, issues: [] };
      if (options.migrate !== false) {
         const migrated = migrateManifest(decoded);
         if (migrated && validateManifest(migrated, options).length === 0) return { key, status: "migrated", manifest: migrated, issues: [] };
      }
      return { key, status: "invalid", issues };
   });
   const count = (status: ManifestJobStatus) => results.filter((r) => r.status === status).length;
   return { processed: results.length, valid: count("valid"), migrated: count("migrated"), invalid: count("invalid"), inline: count("inline"), results };
}
