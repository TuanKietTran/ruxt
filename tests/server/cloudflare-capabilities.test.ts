import { afterEach, describe, expect, it } from "vitest";
import { cvPipelineExtractor } from "../../server/adapters/cv/pipeline-extractor";

afterEach(() => {
   delete (globalThis as typeof globalThis & { __env__?: unknown }).__env__;
});

describe("Cloudflare CV extraction capability", () => {
   it("reports extraction and OCR unavailable without probing host Python", async () => {
      (globalThis as typeof globalThis & { __env__?: unknown }).__env__ = { RUXT_KV: {} };
      const capabilities = await cvPipelineExtractor.capabilities();
      expect(capabilities.available).toBe(false);
      expect(capabilities.ocr).toBe(false);
      expect(capabilities.degradedReason).toContain("unavailable on Cloudflare Workers");
   });
});
