import { describe, expect, it, vi } from "vitest";
import {
   classifyManifestError,
   isEmptyManifestValue,
   loadManifestWithFallback,
   manifestLoadMessage,
} from "../../app/utils/manifest-fallback";

describe("classifyManifestError", () => {
   it("classifies missing-chunk and size-mismatch driver errors as corrupt and not retryable on the same path", () => {
      for (const message of [
         "[ruxt-chunked-deno-kv] missing chunk 2/3 for documents:one",
         "[ruxt-chunked-cloudflare-kv] missing chunk 1/2 for documents:one",
         "[ruxt-chunked-deno-kv] size mismatch for documents:one",
         "[ruxt-chunked-cloudflare-kv] corrupt chunk set for documents:one",
      ]) {
         const failure = classifyManifestError(new Error(message));
         expect(failure.kind).toBe("corrupt");
         expect(failure.retryable).toBe(false);
         expect(failure.message).toBe(message);
      }
   });

   it("classifies undecodable chunk bytes as corrupt", () => {
      const failure = classifyManifestError(new SyntaxError("Unexpected token < in JSON at position 0"));
      expect(failure.kind).toBe("corrupt");
      expect(failure.retryable).toBe(false);
   });

   it("classifies fetch failures and unavailable storage backends as network and retryable", () => {
      for (const error of [
         new TypeError("fetch failed"),
         new Error("[ruxt-chunked-cloudflare-kv] KV binding RUXT_KV is unavailable"),
         new Error("[ruxt-chunked-deno-kv] Deno.openKv is unavailable"),
         new Error("request timed out after 10000ms"),
      ]) {
         const failure = classifyManifestError(error);
         expect(failure.kind).toBe("network");
         expect(failure.retryable).toBe(true);
      }
   });

   it("classifies an explicit empty-manifest error as empty and not retryable", () => {
      const failure = classifyManifestError(new Error("empty manifest for documents:one"));
      expect(failure.kind).toBe("empty");
      expect(failure.retryable).toBe(false);
   });

   it("treats unknown errors as transient network failures and preserves non-Error causes", () => {
      expect(classifyManifestError(new Error("boom")).kind).toBe("network");
      const failure = classifyManifestError("socket closed");
      expect(failure.kind).toBe("network");
      expect(failure.message).toBe("socket closed");
   });
});

describe("isEmptyManifestValue", () => {
   it("treats missing values and zero-chunk/zero-byte manifests as empty", () => {
      expect(isEmptyManifestValue(null)).toBe(true);
      expect(isEmptyManifestValue(undefined)).toBe(true);
      expect(isEmptyManifestValue("")).toBe(true);
      expect(isEmptyManifestValue({ $ruxtStorage: "ruxt-chunked-json-v1", generation: "g1", chunks: 0, bytes: 0 })).toBe(true);
      expect(isEmptyManifestValue({ $ruxtStorage: "ruxt-chunked-json-v1", generation: "g1", chunks: 2, bytes: 0 })).toBe(true);
   });

   it("treats real manifests and plain values as non-empty", () => {
      expect(isEmptyManifestValue({ $ruxtStorage: "ruxt-chunked-json-v1", generation: "g1", chunks: 2, bytes: 10 })).toBe(false);
      expect(isEmptyManifestValue({ id: "one", markdown: "hello" })).toBe(false);
      expect(isEmptyManifestValue("hello")).toBe(false);
      expect(isEmptyManifestValue(0)).toBe(false);
   });
});

describe("loadManifestWithFallback", () => {
   it("returns the primary value without touching the fallback", async () => {
      const fallbackLoad = vi.fn(async () => ({ id: "fallback" }));
      const result = await loadManifestWithFallback({ load: async () => ({ id: "one" }), fallbackLoad });
      expect(result).toEqual({ status: "ready", value: { id: "one" }, source: "primary", attempts: 1 });
      expect(fallbackLoad).not.toHaveBeenCalled();
   });

   it("retries a network failure on the primary path before falling back", async () => {
      const load = vi.fn()
         .mockRejectedValueOnce(new TypeError("fetch failed"))
         .mockResolvedValueOnce({ id: "one" });
      const fallbackLoad = vi.fn(async () => ({ id: "fallback" }));
      const result = await loadManifestWithFallback({ load, fallbackLoad });
      expect(result).toEqual({ status: "ready", value: { id: "one" }, source: "primary", attempts: 2 });
      expect(fallbackLoad).not.toHaveBeenCalled();
   });

   it("falls back to the main-thread loader when the network keeps failing", async () => {
      const load = vi.fn(async () => { throw new TypeError("fetch failed"); });
      const result = await loadManifestWithFallback({ load, fallbackLoad: async () => ({ id: "local" }) });
      expect(result).toEqual({ status: "ready", value: { id: "local" }, source: "fallback", attempts: 3 });
      expect(load).toHaveBeenCalledTimes(2);
   });

   it("reports a retryable network error when there is no fallback", async () => {
      const result = await loadManifestWithFallback({ load: async () => { throw new TypeError("fetch failed"); }, retries: 0 });
      expect(result.status).toBe("error");
      if (result.status === "error") {
         expect(result.failure.kind).toBe("network");
         expect(result.failure.retryable).toBe(true);
         expect(result.attempts).toBe(1);
      }
   });

   it("does not retry a corrupt primary on the same path, but a clean fallback still succeeds", async () => {
      const load = vi.fn(async () => { throw new Error("[ruxt-chunked-deno-kv] missing chunk 2/3 for documents:one"); });
      const result = await loadManifestWithFallback({ load, fallbackLoad: async () => ({ id: "local" }) });
      expect(result).toEqual({ status: "ready", value: { id: "local" }, source: "fallback", attempts: 2 });
      expect(load).toHaveBeenCalledTimes(1);
   });

   it("reports a non-retryable corrupt error when the fallback is corrupt too", async () => {
      const result = await loadManifestWithFallback({
         load: async () => { throw new Error("[ruxt-chunked-cloudflare-kv] corrupt chunk set for documents:one"); },
         fallbackLoad: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
      });
      expect(result.status).toBe("error");
      if (result.status === "error") {
         expect(result.failure.kind).toBe("corrupt");
         expect(result.failure.retryable).toBe(false);
      }
   });

   it("returns the empty state for a missing value without calling the fallback", async () => {
      const fallbackLoad = vi.fn(async () => ({ id: "fallback" }));
      const result = await loadManifestWithFallback({ load: async () => null, fallbackLoad });
      expect(result).toEqual({ status: "empty", attempts: 1 });
      expect(fallbackLoad).not.toHaveBeenCalled();
   });

   it("returns the empty state for a zero-chunk manifest and for an empty-manifest error", async () => {
      const zeroChunk = await loadManifestWithFallback({
         load: async () => ({ $ruxtStorage: "ruxt-chunked-json-v1", generation: "g1", chunks: 0, bytes: 0 }),
      });
      expect(zeroChunk).toEqual({ status: "empty", attempts: 1 });
      const thrown = await loadManifestWithFallback({
         load: async () => { throw new Error("empty manifest for documents:one"); },
         fallbackLoad: async () => ({ id: "fallback" }),
      });
      expect(thrown).toEqual({ status: "empty", attempts: 1 });
   });

   it("returns the empty state when the fallback finds nothing, instead of an error", async () => {
      const result = await loadManifestWithFallback({
         load: async () => { throw new TypeError("fetch failed"); },
         fallbackLoad: async () => null,
         retries: 0,
      });
      expect(result).toEqual({ status: "empty", attempts: 2 });
   });
});

describe("manifestLoadMessage", () => {
   it("gives a distinct, clear message per state", () => {
      const network = manifestLoadMessage({ status: "error", failure: classifyManifestError(new TypeError("fetch failed")), attempts: 1 });
      const corrupt = manifestLoadMessage({ status: "error", failure: classifyManifestError(new Error("missing chunk 1/2 for k")), attempts: 1 });
      const empty = manifestLoadMessage({ status: "empty", attempts: 1 });
      expect(network).toMatch(/connection|reached/i);
      expect(corrupt).toMatch(/damaged|chunk/i);
      expect(empty).toMatch(/nothing|no data|empty/i);
      expect(new Set([network, corrupt, empty]).size).toBe(3);
   });
});
