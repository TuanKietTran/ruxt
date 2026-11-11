import { handleManifestParseRequest } from "./manifest-parse";

/** Web Worker entry: all logic lives in the pure manifest-parse module. */
interface ManifestWorkerScope {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (message: unknown) => void;
}

const scope = globalThis as unknown as ManifestWorkerScope;

scope.onmessage = (event) => {
    scope.postMessage(handleManifestParseRequest(event.data));
};

export {};
