import {
    parseManifestValue,
    type ManifestChunk,
    type ManifestParseRequest,
    type ManifestParseResponse,
} from "./manifest-parse";

/** The subset of the Worker interface the client needs; a real Worker satisfies it. */
export interface ManifestWorkerLike {
    postMessage: (message: unknown) => void;
    addEventListener?: (type: string, listener: (event: { data: unknown }) => void) => void;
    removeEventListener?: (type: string, listener: (event: { data: unknown }) => void) => void;
    onmessage?: ((event: { data: unknown }) => void) | null;
    terminate?: () => void;
}

export type ManifestWorkerFactory = () => ManifestWorkerLike | null;

const defaultWorkerFactory: ManifestWorkerFactory = () => {
    if (typeof Worker === "undefined") return null;
    return new Worker(new URL("./manifest-parse.worker.ts", import.meta.url), { type: "module" }) as unknown as ManifestWorkerLike;
};

interface PendingParse {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
}

export interface ManifestParser {
    parse: (value: unknown, chunks?: readonly ManifestChunk[]) => Promise<unknown>;
    terminate: () => void;
}

/**
 * Parse manifests in a Web Worker when one can be created, and on the main
 * thread (via the same pure module) when it cannot — Worker construction
 * throwing counts as unavailable. A parse error reported by the worker is a
 * real error and rejects, it is not masked by a fallback retry.
 */
export function createManifestParser(factory: ManifestWorkerFactory = defaultWorkerFactory): ManifestParser {
    let worker: ManifestWorkerLike | null = null;
    try { worker = factory(); } catch { worker = null; }
    const pending = new Map<string, PendingParse>();
    let sequence = 0;
    let listening = false;

    const onMessage = (event: { data: unknown }) => {
        const response = event.data as ManifestParseResponse | null;
        if (!response || response.type !== "manifest-parse-result") return;
        const entry = pending.get(response.id);
        if (!entry) return;
        pending.delete(response.id);
        if (response.ok) entry.resolve(response.value);
        else entry.reject(new Error(response.error));
    };

    const ensureListening = (active: ManifestWorkerLike) => {
        if (listening) return;
        listening = true;
        if (active.addEventListener) active.addEventListener("message", onMessage);
        else active.onmessage = onMessage;
    };

    return {
        async parse(value: unknown, chunks?: readonly ManifestChunk[]): Promise<unknown> {
            if (!worker) return parseManifestValue(value, chunks);
            ensureListening(worker);
            const id = `manifest-parse-${++sequence}`;
            const request: ManifestParseRequest = { id, type: "manifest-parse", value, chunks };
            try {
                return await new Promise<unknown>((resolve, reject) => {
                    pending.set(id, { resolve, reject });
                    try { worker!.postMessage(request); } catch (error) { pending.delete(id); reject(error as Error); }
                });
            } catch (error) {
                // A worker that cannot even accept the message is unavailable: fall back.
                if (pending.has(id)) throw error;
                if (error instanceof Error && /missing chunk|corrupt chunk set/.test(error.message)) throw error;
                return parseManifestValue(value, chunks);
            }
        },
        terminate() {
            worker?.terminate?.();
            worker = null;
            pending.clear();
        },
    };
}

export async function parseManifestWithFallback(value: unknown, chunks?: readonly ManifestChunk[], factory?: ManifestWorkerFactory): Promise<unknown> {
    const parser = createManifestParser(factory);
    try { return await parser.parse(value, chunks); } finally { parser.terminate(); }
}
