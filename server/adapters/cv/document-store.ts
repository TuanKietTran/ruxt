import type { CvDocument, CvDocumentSummary, CvUpdateEvent, UpdateCvDocumentInput } from "@ruxt/shared/cv";

/**
 * The shared, ownerless CV store is retired. Do not open, seed, migrate or modify its keys.
 * Keep the repository port fail-closed for server workflows until owner-scoped cloud sessions exist.
 */
const unavailable = (): never => {
    throw createError({ statusCode: 404, statusMessage: "CV document not found" });
};

export function assertCvId(id: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) {
        throw createError({ statusCode: 400, statusMessage: "Invalid CV document id" });
    }
    return id;
}

export async function listCvDocuments(): Promise<CvDocumentSummary[]> { return []; }
export async function peekCvDocument(_id: string): Promise<undefined> { return undefined; }
export async function getCvDocument(_id: string): Promise<CvDocument> { return unavailable(); }
export async function createCvDocument(_id: string, _input: Pick<UpdateCvDocumentInput, "title" | "markdown" | "css" | "sourceId">): Promise<CvDocument> { return unavailable(); }
export async function updateCvDocument(_id: string, _input: UpdateCvDocumentInput): Promise<CvDocument> { return unavailable(); }
export async function renameCvDocument(_id: string, _title: string): Promise<CvDocument> { return unavailable(); }
export async function forkCvDocument(_id: string, _nextId: string, _title?: string): Promise<CvDocument> { return unavailable(); }
export async function deleteCvDocument(_id: string): Promise<void> { return unavailable(); }
export function subscribeToCv(_id: string, _listener: (update: CvUpdateEvent) => void): () => void { return unavailable(); }
