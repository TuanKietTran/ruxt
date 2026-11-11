/**
 * Pure validation of chunked-KV manifests (the `$ruxtStorage` records written by
 * server/storage/chunked-deno-kv.ts and server/storage/chunked-cloudflare-kv.ts).
 * No DOM or worker globals, so the same module runs on the main thread, in a Web
 * Worker, and in unit tests. Stricter than the drivers' boolean guards: every
 * problem is reported as a structured error and all field errors accumulate.
 */

export const CHUNK_MANIFEST_FORMAT = "ruxt-chunked-json-v1";

export interface ChunkManifest {
   $ruxtStorage: typeof CHUNK_MANIFEST_FORMAT;
   generation: string;
   chunks: number;
   bytes: number;
   /** Top-level scalar fields copied in by the Cloudflare driver so getMeta answers without reading chunks. */
   meta?: Record<string, unknown>;
}

export type ManifestValidationErrorCode =
   | "not_object"
   | "missing_field"
   | "invalid_type"
   | "invalid_value"
   | "out_of_range"
   | "chunk_count_mismatch";

export interface ManifestValidationError {
   /** Field name the error belongs to; "" for the manifest value itself. */
   path: string;
   code: ManifestValidationErrorCode;
   message: string;
}

export interface ManifestValidationOptions {
   /** When a positive safe integer, `chunks` must equal ceil(bytes / chunkBytes) (48 KiB Deno, 24 KiB Cloudflare). */
   chunkBytes?: number;
   /** When a non-negative safe integer, `bytes` must not exceed it (both drivers cap items at 8 MiB). */
   maxBytes?: number;
}

export type ManifestValidationResult =
   | { ok: true; value: ChunkManifest }
   | { ok: false; errors: ManifestValidationError[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
   typeof value === "object" && value !== null && !Array.isArray(value);

/** Integer field shared by chunks/bytes: pushes exactly one error and returns undefined when invalid. */
const integerField = (
   candidate: Record<string, unknown>,
   field: "chunks" | "bytes",
   errors: ManifestValidationError[],
): number | undefined => {
   const value = candidate[field];
   if (value === undefined) {
      errors.push({ path: field, code: "missing_field", message: `Chunk manifest is missing ${field}.` });
      return undefined;
   }
   if (typeof value !== "number") {
      errors.push({ path: field, code: "invalid_type", message: `Chunk manifest ${field} must be a number.` });
      return undefined;
   }
   if (!Number.isSafeInteger(value)) {
      errors.push({ path: field, code: "invalid_value", message: `Chunk manifest ${field} must be a safe integer.` });
      return undefined;
   }
   return value;
};

export function validateChunkManifest(value: unknown, options: ManifestValidationOptions = {}): ManifestValidationResult {
   if (!isRecord(value)) {
      return { ok: false, errors: [{ path: "", code: "not_object", message: "Chunk manifest must be an object." }] };
   }
   const errors: ManifestValidationError[] = [];

   const format = value.$ruxtStorage;
   if (format === undefined) {
      errors.push({ path: "$ruxtStorage", code: "missing_field", message: "Chunk manifest is missing the $ruxtStorage format marker." });
   } else if (typeof format !== "string") {
      errors.push({ path: "$ruxtStorage", code: "invalid_type", message: "Chunk manifest $ruxtStorage must be a string." });
   } else if (format !== CHUNK_MANIFEST_FORMAT) {
      errors.push({ path: "$ruxtStorage", code: "invalid_value", message: `Chunk manifest $ruxtStorage must be "${CHUNK_MANIFEST_FORMAT}".` });
   }

   const generation = value.generation;
   if (generation === undefined) {
      errors.push({ path: "generation", code: "missing_field", message: "Chunk manifest is missing generation." });
   } else if (typeof generation !== "string") {
      errors.push({ path: "generation", code: "invalid_type", message: "Chunk manifest generation must be a string." });
   } else if (generation === "") {
      errors.push({ path: "generation", code: "invalid_value", message: "Chunk manifest generation must not be empty." });
   }

   const chunks = integerField(value, "chunks", errors);
   if (chunks !== undefined && chunks < 1) {
      errors.push({ path: "chunks", code: "out_of_range", message: "Chunk manifest chunks must be at least 1." });
   }

   const bytes = integerField(value, "bytes", errors);
   if (bytes !== undefined && bytes < 0) {
      errors.push({ path: "bytes", code: "out_of_range", message: "Chunk manifest bytes must not be negative." });
   }

   if (value.meta !== undefined && !isRecord(value.meta)) {
      errors.push({ path: "meta", code: "invalid_type", message: "Chunk manifest meta must be an object when present." });
   }

   if (bytes !== undefined && bytes >= 0 && options.maxBytes !== undefined
      && Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0 && bytes > options.maxBytes) {
      errors.push({ path: "bytes", code: "out_of_range", message: `Chunk manifest bytes exceeds the ${options.maxBytes}-byte limit.` });
   }

   if (chunks !== undefined && chunks >= 1 && bytes !== undefined && bytes >= 0 && options.chunkBytes !== undefined
      && Number.isSafeInteger(options.chunkBytes) && options.chunkBytes > 0) {
      const expected = Math.ceil(bytes / options.chunkBytes);
      if (chunks !== expected) {
         errors.push({ path: "chunks", code: "chunk_count_mismatch", message: `Chunk manifest chunks is ${chunks} but ${bytes} bytes at ${options.chunkBytes} bytes per chunk needs ${expected}.` });
      }
   }

   return errors.length > 0 ? { ok: false, errors } : { ok: true, value: value as unknown as ChunkManifest };
}

export function isChunkManifest(value: unknown): value is ChunkManifest {
   return validateChunkManifest(value).ok;
}

export interface ManifestValidateRequest {
   id: string;
   type: "manifest-validate";
   value: unknown;
   options?: ManifestValidationOptions;
}

export type ManifestValidateResponse =
   | { id: string; type: "manifest-validate-result"; ok: true; result: ManifestValidationResult }
   | { id: string; type: "manifest-validate-result"; ok: false; error: string };

/** Worker protocol handler: answers one request, converting every failure into `ok: false`. Validation failures are data: they arrive as `ok: true` with `result.ok: false`. */
export function handleManifestValidateRequest(request: unknown): ManifestValidateResponse {
   const candidate = request as Partial<ManifestValidateRequest> | null;
   const id = candidate && typeof candidate.id === "string" ? candidate.id : "";
   try {
      if (!candidate || typeof candidate !== "object" || candidate.type !== "manifest-validate") {
         throw new Error("unknown manifest-validate request");
      }
      return { id, type: "manifest-validate-result", ok: true, result: validateChunkManifest(candidate.value, candidate.options) };
   } catch (error) {
      return { id, type: "manifest-validate-result", ok: false, error: error instanceof Error ? error.message : String(error) };
   }
}
