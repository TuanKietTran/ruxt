import {
    validateChunkManifest,
    type ManifestValidateRequest,
    type ManifestValidateResponse,
    type ManifestValidationOptions,
    type ManifestValidationResult,
} from "./manifest-validate";

/** The subset of the Worker interface the client needs; a real Worker satisfies it. */
export interface ManifestValidateWorkerLike {
    postMessage: (message: unknown) => void;
    addEventListener?: (type: string, listener: (event: { data: unknown }) => void) => void;
    removeEventListener?: (type: string, listener: (event: { data: unknown }) => void) => void;
    onmessage?: ((event: { data: unknown }) => void) | null;
    terminate?: () => void;
}

export type ManifestValidateWorkerFactory = () => ManifestValidateWorkerLike | null;

const defaultWorkerFactory: ManifestValidateWorkerFactory = () => {
    if (typeof Worker === "undefined") return null;
    return new Worker(new URL("./manifest-validate.worker.ts", import.meta.url), { type: "module" }) as unknown as ManifestValidateWorkerLike;
};

interface PendingValidate {
    resolve: (value: ManifestValidationResult) => void;
    reject: (error: Error) => void;
}

export interface ManifestValidator {
    validate: (value: unknown, options?: ManifestValidationOptions) => Promise<ManifestValidationResult>;
    terminate: () => void;
}

/**
 * Validate manifests in a Web Worker when one can be created, and on the main
 * thread (via the same pure module) when it cannot — Worker construction or
 * postMessage throwing counts as unavailable. A protocol error reported by
 * the worker is a real error and rejects, it is not masked by a fallback retry.
 * Validation failures are data and resolve as `{ ok: false, errors }`.
 */
export function createManifestValidator(factory: ManifestValidateWorkerFactory = defaultWorkerFactory): ManifestValidator {
    let worker: ManifestValidateWorkerLike | null = null;
    try { worker = factory(); } catch { worker = null; }
    const pending = new Map<string, PendingValidate>();
    const workerErrors = new Set<string>();
    let sequence = 0;
    let listening = false;

    const onMessage = (event: { data: unknown }) => {
        const response = event.data as ManifestValidateResponse | null;
        if (!response || response.type !== "manifest-validate-result") return;
        const entry = pending.get(response.id);
        if (!entry) return;
        pending.delete(response.id);
        if (response.ok) entry.resolve(response.result);
        else { workerErrors.add(response.id); entry.reject(new Error(response.error)); }
    };

    const ensureListening = (active: ManifestValidateWorkerLike) => {
        if (listening) return;
        listening = true;
        if (active.addEventListener) active.addEventListener("message", onMessage);
        else active.onmessage = onMessage;
    };

    return {
        async validate(value: unknown, options?: ManifestValidationOptions): Promise<ManifestValidationResult> {
            if (!worker) return validateChunkManifest(value, options);
            ensureListening(worker);
            const id = `manifest-validate-${++sequence}`;
            const request: ManifestValidateRequest = { id, type: "manifest-validate", value, options };
            try {
                return await new Promise<ManifestValidationResult>((resolve, reject) => {
                    pending.set(id, { resolve, reject });
                    try { worker!.postMessage(request); } catch (error) { pending.delete(id); reject(error as Error); }
                });
            } catch (error) {
                // A worker that answered with a protocol error reported a real failure: do not mask it.
                if (workerErrors.has(id)) { workerErrors.delete(id); throw error; }
                // A worker that cannot even accept the message is unavailable: fall back.
                return validateChunkManifest(value, options);
            }
        },
        terminate() {
            worker?.terminate?.();
            worker = null;
            pending.clear();
            workerErrors.clear();
        },
    };
}

export async function validateManifestWithFallback(value: unknown, options?: ManifestValidationOptions, factory?: ManifestValidateWorkerFactory): Promise<ManifestValidationResult> {
    const validator = createManifestValidator(factory);
    try { return await validator.validate(value, options); } finally { validator.terminate(); }
}
