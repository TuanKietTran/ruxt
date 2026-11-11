import { describe, expect, it } from "vitest";
import {
   CHUNK_MANIFEST_FORMAT,
   handleManifestValidateRequest,
} from "../../app/utils/manifest-validate";
import {
   createManifestValidator,
   validateManifestWithFallback,
} from "../../app/utils/manifest-validate-client";

const validManifest = {
   $ruxtStorage: CHUNK_MANIFEST_FORMAT,
   generation: "gen-1",
   chunks: 3,
   bytes: 100,
};

describe("manifest-validate worker protocol", () => {
   it("answers a validate request with the result and the same id", () => {
      const response = handleManifestValidateRequest({ id: "req-1", type: "manifest-validate", value: validManifest });
      expect(response).toEqual({
         id: "req-1",
         type: "manifest-validate-result",
         ok: true,
         result: { ok: true, value: validManifest },
      });
   });

   it("passes validation failures through as data, not protocol errors", () => {
      const response = handleManifestValidateRequest({ id: "req-2", type: "manifest-validate", value: { ...validManifest, chunks: 0 } });
      expect(response.ok).toBe(true);
      if (response.ok && !response.result.ok) {
         expect(response.result.errors).toEqual([
            { path: "chunks", code: "out_of_range", message: expect.any(String) },
         ]);
      } else {
         throw new Error("expected a failed validation result");
      }
   });

   it("forwards options to the validator", () => {
      const response = handleManifestValidateRequest({ id: "req-3", type: "manifest-validate", value: validManifest, options: { chunkBytes: 48 } });
      expect(response.ok).toBe(true);
      if (response.ok) expect(response.result.ok).toBe(true);
      const mismatch = handleManifestValidateRequest({ id: "req-4", type: "manifest-validate", value: { ...validManifest, chunks: 2 }, options: { chunkBytes: 48 } });
      expect(mismatch.ok).toBe(true);
      if (mismatch.ok && !mismatch.result.ok) {
         expect(mismatch.result.errors.map(error => error.code)).toEqual(["chunk_count_mismatch"]);
      } else {
         throw new Error("expected a chunk_count_mismatch result");
      }
   });

   it("never throws: bad requests become ok:false responses", () => {
      expect(handleManifestValidateRequest(null)).toMatchObject({ id: "", ok: false });
      expect(handleManifestValidateRequest({ id: "r", type: "nope", value: 1 })).toMatchObject({ id: "r", ok: false });
   });
});

class FakeWorker {
   private listeners = new Set<(event: { data: unknown }) => void>();
   terminated = false;
   addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.add(listener); }
   removeEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.delete(listener); }
   postMessage(message: unknown) {
      const response = handleManifestValidateRequest(message);
      queueMicrotask(() => { for (const listener of this.listeners) listener({ data: response }); });
   }
   terminate() { this.terminated = true; }
}

class ThrowingWorker extends FakeWorker {
   postMessage(): void { throw new Error("cannot post"); }
}

class ErrorWorker {
   private listeners = new Set<(event: { data: unknown }) => void>();
   terminated = false;
   addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.add(listener); }
   removeEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.delete(listener); }
   postMessage(message: unknown) {
      const request = message as { id: string };
      const response = { id: request.id, type: "manifest-validate-result", ok: false, error: "boom" };
      queueMicrotask(() => { for (const listener of this.listeners) listener({ data: response }); });
   }
   terminate() { this.terminated = true; }
}

describe("manifest-validate client fallback", () => {
   it("validates on the main thread when no Worker is available", async () => {
      await expect(validateManifestWithFallback(validManifest, undefined, () => null)).resolves.toEqual({ ok: true, value: validManifest });
      const failed = await validateManifestWithFallback({ ...validManifest, bytes: -1 }, undefined, () => null);
      expect(failed.ok).toBe(false);
   });

   it("falls back when the Worker constructor throws", async () => {
      await expect(validateManifestWithFallback(validManifest, undefined, () => { throw new Error("no worker"); })).resolves.toEqual({ ok: true, value: validManifest });
   });

   it("uses the worker when one is available and terminates it", async () => {
      const fake = new FakeWorker();
      const validator = createManifestValidator(() => fake as never);
      await expect(validator.validate({ ...validManifest, chunks: 0 })).resolves.toMatchObject({ ok: false });
      await expect(validator.validate(validManifest)).resolves.toEqual({ ok: true, value: validManifest });
      validator.terminate();
      expect(fake.terminated).toBe(true);
   });

   it("rejects with the worker's protocol error instead of masking it", async () => {
      const validator = createManifestValidator(() => new ErrorWorker() as never);
      await expect(validator.validate(validManifest)).rejects.toThrow("boom");
      validator.terminate();
   });

   it("falls back when the worker cannot accept a message", async () => {
      const validator = createManifestValidator(() => new ThrowingWorker() as never);
      await expect(validator.validate(validManifest)).resolves.toEqual({ ok: true, value: validManifest });
      validator.terminate();
   });
});
