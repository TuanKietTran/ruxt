import { describe, expect, it } from "vitest";
import {
    MANIFEST_FORMAT,
    handleManifestParseRequest,
    isChunkManifest,
    parseManifestChunks,
    parseManifestValue,
    reassembleManifestChunks,
    type ChunkManifest,
} from "../../app/utils/manifest-parse";
import { createManifestParser, parseManifestWithFallback } from "../../app/utils/manifest-parse-client";

const encoder = new TextEncoder();
const manifestFor = (value: unknown, chunkBytes = 8) => {
    const bytes = encoder.encode(JSON.stringify(value));
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.byteLength; i += chunkBytes) chunks.push(bytes.slice(i, i + chunkBytes));
    const manifest: ChunkManifest = { $ruxtStorage: MANIFEST_FORMAT, generation: "gen-1", chunks: chunks.length, bytes: bytes.byteLength };
    return { manifest, chunks };
};

describe("manifest-parse pure core", () => {
    it("recognises only well-formed chunk manifests", () => {
        const { manifest } = manifestFor({ id: "a" });
        expect(isChunkManifest(manifest)).toBe(true);
        expect(isChunkManifest({ ...manifest, $ruxtStorage: "other" })).toBe(false);
        expect(isChunkManifest({ ...manifest, generation: "" })).toBe(false);
        expect(isChunkManifest({ ...manifest, chunks: 1.5 })).toBe(false);
        expect(isChunkManifest({ ...manifest, bytes: -1 })).toBe(false);
        expect(isChunkManifest(null)).toBe(false);
        expect(isChunkManifest({ id: "a" })).toBe(false);
    });

    it("passes plain (unchunked) values through unchanged", () => {
        const value = { id: "doc", markdown: "hello" };
        expect(parseManifestValue(value)).toBe(value);
        expect(parseManifestValue(null)).toBe(null);
        expect(parseManifestValue(42)).toBe(42);
    });

    it("reassembles chunks in order and parses the JSON payload, splitting inside multi-byte characters", () => {
        const value = { id: "doc", title: "Adélaïde — résumé", markdown: "x".repeat(64) };
        const { manifest, chunks } = manifestFor(value, 8);
        expect(chunks.length).toBeGreaterThan(1);
        expect(reassembleManifestChunks(manifest, chunks)).toBe(JSON.stringify(value));
        expect(parseManifestChunks(manifest, chunks)).toEqual(value);
        expect(parseManifestValue(manifest, chunks)).toEqual(value);
    });

    it("accepts ArrayBuffer chunks as delivered by KV reads", () => {
        const value = { id: "doc", n: 3 };
        const { manifest, chunks } = manifestFor(value, 5);
        const buffers = chunks.map(chunk => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
        expect(parseManifestChunks(manifest, buffers)).toEqual(value);
    });

    it("throws on a missing chunk and on a byte-count mismatch", () => {
        const { manifest, chunks } = manifestFor({ id: "doc", markdown: "y".repeat(40) }, 8);
        expect(() => parseManifestChunks(manifest, chunks.slice(0, -1))).toThrow(/missing chunk/);
        expect(() => parseManifestChunks(manifest, chunks.map((c, i) => i === 0 ? c.slice(0, 2) : c))).toThrow(/corrupt chunk set/);
        expect(() => parseManifestValue(manifest)).toThrow(/missing chunk/);
    });

    it("parses a raw JSON manifest string before reassembling", () => {
        const value = { id: "doc", ok: true };
        const { manifest, chunks } = manifestFor(value, 8);
        expect(parseManifestValue(JSON.stringify(manifest), chunks)).toEqual(value);
        expect(parseManifestValue(JSON.stringify(value))).toEqual(value);
    });
});

describe("manifest-parse worker protocol", () => {
    it("answers a parse request with the parsed value and the same id", () => {
        const value = { id: "doc", markdown: "z".repeat(32) };
        const { manifest, chunks } = manifestFor(value, 8);
        const response = handleManifestParseRequest({ id: "req-1", type: "manifest-parse", value: manifest, chunks });
        expect(response).toEqual({ id: "req-1", type: "manifest-parse-result", ok: true, value });
    });

    it("never throws: bad requests and corrupt chunks become ok:false responses", () => {
        expect(handleManifestParseRequest(null)).toMatchObject({ ok: false });
        expect(handleManifestParseRequest({ id: "r", type: "nope", value: 1 })).toMatchObject({ id: "r", ok: false });
        const { manifest, chunks } = manifestFor({ id: "x", markdown: "q".repeat(24) }, 8);
        const response = handleManifestParseRequest({ id: "req-2", type: "manifest-parse", value: manifest, chunks: chunks.slice(1) });
        expect(response.ok).toBe(false);
        if (!response.ok) expect(response.error).toMatch(/missing chunk|corrupt chunk set/);
    });
});

class FakeWorker {
    private listeners = new Set<(event: { data: unknown }) => void>();
    terminated = false;
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.add(listener); }
    removeEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.delete(listener); }
    postMessage(message: unknown) {
        const response = handleManifestParseRequest(message);
        queueMicrotask(() => { for (const listener of this.listeners) listener({ data: response }); });
    }
    terminate() { this.terminated = true; }
}

describe("manifest-parse client fallback", () => {
    it("parses on the main thread when no Worker is available", async () => {
        const value = { id: "doc", markdown: "m".repeat(32) };
        const { manifest, chunks } = manifestFor(value, 8);
        await expect(parseManifestWithFallback(manifest, chunks, () => null)).resolves.toEqual(value);
        await expect(parseManifestWithFallback(value, undefined, () => null)).resolves.toBe(value);
    });

    it("falls back when the Worker constructor throws", async () => {
        const value = { id: "doc" };
        await expect(parseManifestWithFallback(value, undefined, () => { throw new Error("no worker"); })).resolves.toBe(value);
    });

    it("uses the worker when one is available and terminates it", async () => {
        const value = { id: "doc", markdown: "w".repeat(32) };
        const { manifest, chunks } = manifestFor(value, 8);
        const fake = new FakeWorker();
        const parser = createManifestParser(() => fake as never);
        await expect(parser.parse(manifest, chunks)).resolves.toEqual(value);
        parser.terminate();
        expect(fake.terminated).toBe(true);
    });

    it("rejects with the worker's parse error instead of masking it", async () => {
        const { manifest, chunks } = manifestFor({ id: "x", markdown: "q".repeat(24) }, 8);
        const fake = new FakeWorker();
        const parser = createManifestParser(() => fake as never);
        await expect(parser.parse(manifest, chunks.slice(1))).rejects.toThrow(/missing chunk|corrupt chunk set/);
        parser.terminate();
    });
});
