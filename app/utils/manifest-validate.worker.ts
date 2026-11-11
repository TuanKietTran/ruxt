import { handleManifestValidateRequest } from "./manifest-validate";

/** Web Worker entry: all logic lives in the pure manifest-validate module. */
interface ManifestValidateWorkerScope {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (message: unknown) => void;
}

const scope = globalThis as unknown as ManifestValidateWorkerScope;

scope.onmessage = (event) => {
    scope.postMessage(handleManifestValidateRequest(event.data));
};

export {};
