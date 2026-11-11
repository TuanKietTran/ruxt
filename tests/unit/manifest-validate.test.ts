import { describe, expect, it } from "vitest";
import {
   CHUNK_MANIFEST_FORMAT,
   isChunkManifest,
   validateChunkManifest,
   type ManifestValidationError,
   type ManifestValidationOptions,
} from "../../app/utils/manifest-validate";

const validManifest = {
   $ruxtStorage: CHUNK_MANIFEST_FORMAT,
   generation: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
   chunks: 3,
   bytes: 100,
};

const errorsOf = (value: unknown, options?: ManifestValidationOptions): ManifestValidationError[] => {
   const result = validateChunkManifest(value, options);
   return result.ok ? [] : result.errors;
};

const pathsAndCodes = (value: unknown, options?: ManifestValidationOptions): [string, string][] =>
   errorsOf(value, options).map(error => [error.path, error.code]);

describe("validateChunkManifest", () => {
   it("exposes the storage format shared by both chunked drivers", () => {
      expect(CHUNK_MANIFEST_FORMAT).toBe("ruxt-chunked-json-v1");
   });

   it("accepts a minimal manifest as written by the Deno driver", () => {
      const result = validateChunkManifest(validManifest);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(validManifest);
   });

   it("accepts a Cloudflare manifest carrying scalar meta", () => {
      const withMeta = { ...validManifest, meta: { title: "Quarterly report", pages: 2 } };
      const result = validateChunkManifest(withMeta);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(withMeta);
   });

   it("tolerates unknown extra fields for forward compatibility", () => {
      expect(validateChunkManifest({ ...validManifest, futureField: true }).ok).toBe(true);
   });

   it("rejects non-object values with a single not_object error at the root", () => {
      for (const value of [null, undefined, [], "manifest", 42, true]) {
         expect(pathsAndCodes(value)).toEqual([["", "not_object"]]);
      }
   });

   it("reports a missing_field error for every absent required field", () => {
      expect(pathsAndCodes({})).toEqual([
         ["$ruxtStorage", "missing_field"],
         ["generation", "missing_field"],
         ["chunks", "missing_field"],
         ["bytes", "missing_field"],
      ]);
   });

   it("reports only the absent field when the rest are valid", () => {
      const { generation: _omitted, ...rest } = validManifest;
      expect(pathsAndCodes(rest)).toEqual([["generation", "missing_field"]]);
   });

   it("rejects a non-string $ruxtStorage as invalid_type and a wrong string as invalid_value", () => {
      expect(pathsAndCodes({ ...validManifest, $ruxtStorage: 7 })).toEqual([["$ruxtStorage", "invalid_type"]]);
      expect(pathsAndCodes({ ...validManifest, $ruxtStorage: "other-format" })).toEqual([["$ruxtStorage", "invalid_value"]]);
   });

   it("rejects a non-string generation as invalid_type and an empty generation as invalid_value", () => {
      expect(pathsAndCodes({ ...validManifest, generation: 42 })).toEqual([["generation", "invalid_type"]]);
      expect(pathsAndCodes({ ...validManifest, generation: "" })).toEqual([["generation", "invalid_value"]]);
   });

   it("rejects non-number chunk counts as invalid_type and non-integers as invalid_value", () => {
      expect(pathsAndCodes({ ...validManifest, chunks: "3" })).toEqual([["chunks", "invalid_type"]]);
      expect(pathsAndCodes({ ...validManifest, chunks: 1.5 })).toEqual([["chunks", "invalid_value"]]);
      expect(pathsAndCodes({ ...validManifest, chunks: Number.NaN })).toEqual([["chunks", "invalid_value"]]);
   });

   it("rejects chunk counts below 1 as out_of_range", () => {
      expect(pathsAndCodes({ ...validManifest, chunks: 0 })).toEqual([["chunks", "out_of_range"]]);
      expect(pathsAndCodes({ ...validManifest, chunks: -2 })).toEqual([["chunks", "out_of_range"]]);
   });

   it("rejects fractional bytes as invalid_value and negative bytes as out_of_range", () => {
      expect(pathsAndCodes({ ...validManifest, bytes: "100" })).toEqual([["bytes", "invalid_type"]]);
      expect(pathsAndCodes({ ...validManifest, bytes: 2.5 })).toEqual([["bytes", "invalid_value"]]);
      expect(pathsAndCodes({ ...validManifest, bytes: -1 })).toEqual([["bytes", "out_of_range"]]);
   });

   it("accumulates errors across fields instead of stopping at the first", () => {
      expect(pathsAndCodes({ $ruxtStorage: "nope", generation: "", chunks: 0, bytes: -1 })).toEqual([
         ["$ruxtStorage", "invalid_value"],
         ["generation", "invalid_value"],
         ["chunks", "out_of_range"],
         ["bytes", "out_of_range"],
      ]);
   });

   it("rejects a meta that is not a plain object, and treats an absent meta as valid", () => {
      expect(pathsAndCodes({ ...validManifest, meta: "title" })).toEqual([["meta", "invalid_type"]]);
      expect(pathsAndCodes({ ...validManifest, meta: [] })).toEqual([["meta", "invalid_type"]]);
      expect(pathsAndCodes({ ...validManifest, meta: null })).toEqual([["meta", "invalid_type"]]);
      expect(validateChunkManifest({ ...validManifest, meta: undefined }).ok).toBe(true);
   });

   it("checks the chunk count against chunkBytes when provided", () => {
      expect(validateChunkManifest(validManifest, { chunkBytes: 48 }).ok).toBe(true);
      expect(validateChunkManifest({ ...validManifest, bytes: 96, chunks: 2 }, { chunkBytes: 48 }).ok).toBe(true);
      expect(pathsAndCodes({ ...validManifest, chunks: 2 }, { chunkBytes: 48 })).toEqual([["chunks", "chunk_count_mismatch"]]);
   });

   it("ignores a non-positive chunkBytes option", () => {
      expect(validateChunkManifest({ ...validManifest, chunks: 2 }, { chunkBytes: 0 }).ok).toBe(true);
   });

   it("rejects byte counts above maxBytes as out_of_range", () => {
      expect(pathsAndCodes(validManifest, { maxBytes: 99 })).toEqual([["bytes", "out_of_range"]]);
      expect(validateChunkManifest(validManifest, { maxBytes: 100 }).ok).toBe(true);
   });

   it("gives every error a non-empty human-readable message", () => {
      const errors = errorsOf({});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.every(error => typeof error.message === "string" && error.message.length > 0)).toBe(true);
   });
});

describe("isChunkManifest", () => {
   it("accepts valid manifests with or without meta", () => {
      expect(isChunkManifest(validManifest)).toBe(true);
      expect(isChunkManifest({ ...validManifest, meta: { title: "x" } })).toBe(true);
   });

   it("rejects values validateChunkManifest rejects", () => {
      for (const value of [null, {}, { ...validManifest, chunks: 0 }, { ...validManifest, generation: "" }]) {
         expect(isChunkManifest(value)).toBe(false);
      }
   });
});
