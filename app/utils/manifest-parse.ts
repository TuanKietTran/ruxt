/**
 * Pure parsing for chunked storage manifests (`ruxt-chunked-json-v1`, see
 * server/storage/chunked-deno-kv.ts and chunked-cloudflare-kv.ts): the value
 * stored at a key is either the JSON value itself or a manifest naming the
 * byte chunks (raw UTF-8 slices of the JSON text, in index order) that hold
 * it. This module has no DOM or Worker globals so it runs identically on the
 * main thread, in a Web Worker, and in unit tests.
 */
export const MANIFEST_FORMAT = "ruxt-chunked-json-v1" as const;

export interface ChunkManifest {
    $ruxtStorage: typeof MANIFEST_FORMAT;
    generation: string;
    chunks: number;
    bytes: number;
    meta?: Record<string, unknown>;
}

export type ManifestChunk = Uint8Array | ArrayBuffer;

export interface ManifestParseRequest {
    id: string;
    type: "manifest-parse";
    value: unknown;
    chunks?: readonly ManifestChunk[];
}

export type ManifestParseResponse =
    | { id: string; type: "manifest-parse-result"; ok: true; value: unknown }
    | { id: string; type: "manifest-parse-result"; ok: false; error: string };

const decoder = new TextDecoder();

export function isChunkManifest(value: unknown): value is ChunkManifest {
    const candidate = value as Partial<ChunkManifest> | null;
    return !!candidate && typeof candidate === "object"
        && candidate.$ruxtStorage === MANIFEST_FORMAT
        && typeof candidate.generation === "string" && candidate.generation.length > 0
        && Number.isSafeInteger(candidate.chunks) && (candidate.chunks as number) >= 0
        && Number.isSafeInteger(candidate.bytes) && (candidate.bytes as number) >= 0;
}

const asBytes = (chunk: ManifestChunk, index: number, total: number): Uint8Array => {
    if (chunk instanceof Uint8Array) return chunk;
    if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
    throw new Error(`missing chunk ${index + 1}/${total}`);
};

/** Join a manifest's byte chunks back into its JSON text, verifying count and byte length. */
export function reassembleManifestChunks(manifest: ChunkManifest, chunks?: readonly ManifestChunk[]): string {
    const provided = chunks?.length ?? 0;
    if (provided < manifest.chunks) throw new Error(`missing chunk ${provided + 1}/${manifest.chunks}`);
    if (provided > manifest.chunks) throw new Error(`corrupt chunk set: expected ${manifest.chunks} chunks, got ${provided}`);
    const parts = Array.from({ length: manifest.chunks }, (_, i) => asBytes(chunks![i]!, i, manifest.chunks));
    const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
    if (length !== manifest.bytes) throw new Error(`corrupt chunk set: expected ${manifest.bytes} bytes, got ${length}`);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return decoder.decode(bytes);
}

export function parseManifestChunks(manifest: ChunkManifest, chunks?: readonly ManifestChunk[]): unknown {
    return JSON.parse(reassembleManifestChunks(manifest, chunks));
}

/**
 * Resolve a stored value to the value it represents: plain values pass
 * through, a chunk manifest (as an object or as raw JSON text) is joined
 * from `chunks` and parsed, and raw JSON text is parsed.
 */
export function parseManifestValue(value: unknown, chunks?: readonly ManifestChunk[]): unknown {
    if (typeof value === "string") return parseManifestValue(JSON.parse(value), chunks);
    if (!isChunkManifest(value)) return value;
    return parseManifestChunks(value, chunks);
}

/** Worker protocol handler: answers one request, converting every failure into `ok: false`. */
export function handleManifestParseRequest(request: unknown): ManifestParseResponse {
    const candidate = request as Partial<ManifestParseRequest> | null;
    const id = candidate && typeof candidate.id === "string" ? candidate.id : "";
    try {
        if (!candidate || typeof candidate !== "object" || candidate.type !== "manifest-parse") {
            throw new Error("unknown manifest-parse request");
        }
        return { id, type: "manifest-parse-result", ok: true, value: parseManifestValue(candidate.value, candidate.chunks) };
    } catch (error) {
        return { id, type: "manifest-parse-result", ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
