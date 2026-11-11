// Pure, serialize-safe protocol for a language worker.
// No Worker, DOM, or CodeMirror dependency: messages are plain JSON values
// and the dispatcher below is an in-memory stand-in for a real worker port,
// so the whole contract can be unit-tested in Node.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const LANG_WORKER_REQUEST_TYPES = ["didOpen", "didChange", "didClose", "completions", "diagnostics", "hover", "cancel"] as const;
export type LangWorkerRequestType = (typeof LANG_WORKER_REQUEST_TYPES)[number];

export interface LangWorkerRequest {
    kind: "request";
    seq: number;
    type: string;
    payload?: JsonValue;
}

export interface LangWorkerError {
    code: string;
    message: string;
}

export interface LangWorkerResponse {
    kind: "response";
    seq: number;
    ok: boolean;
    result?: JsonValue;
    error?: LangWorkerError;
}

export type LangWorkerMessage = LangWorkerRequest | LangWorkerResponse;

export interface LangSequence {
    next(): number;
    peek(): number;
    reset(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const assertSeq = (seq: number): void => {
    if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`seq must be a positive integer, got ${String(seq)}`);
};

const assertPayload = (payload: JsonValue): void => {
    if (!isJsonValue(payload)) throw new TypeError("payload must be a JSON value");
};

export function createSequence(start = 1): LangSequence {
    assertSeq(start);
    let current = start;
    return {
        next: () => current++,
        peek: () => current,
        reset: () => {
            current = start;
        },
    };
}

export function createLangWorkerRequest(seq: number, type: string, payload?: JsonValue): LangWorkerRequest {
    assertSeq(seq);
    if (typeof type !== "string" || !type) throw new TypeError("type must be a non-empty string");
    if (payload !== undefined) assertPayload(payload);
    return payload === undefined ? { kind: "request", seq, type } : { kind: "request", seq, type, payload };
}

export function createCancelRequest(seq: number, targetSeq: number): LangWorkerRequest {
    assertSeq(targetSeq);
    return createLangWorkerRequest(seq, "cancel", { targetSeq });
}

export function createOkResponse(seq: number, result: JsonValue = null): LangWorkerResponse {
    assertSeq(seq);
    assertPayload(result);
    return { kind: "response", seq, ok: true, result };
}

export function createErrorResponse(seq: number, code: string, message: string): LangWorkerResponse {
    assertSeq(seq);
    if (!code) throw new TypeError("code must be a non-empty string");
    return { kind: "response", seq, ok: false, error: { code, message } };
}

export function isJsonValue(value: unknown, seen: ReadonlySet<object> = new Set()): boolean {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object") return false;
    if (seen.has(value)) return false;
    const nextSeen = new Set(seen).add(value);
    if (Array.isArray(value)) return value.every((item) => isJsonValue(item, nextSeen));
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every((item) => isJsonValue(item, nextSeen));
}

export function isLangWorkerMessage(value: unknown): value is LangWorkerMessage {
    if (!isRecord(value) || !isJsonValue(value)) return false;
    if (!Number.isInteger(value.seq) || (value.seq as number) < 1) return false;
    if (value.kind === "request") return typeof value.type === "string" && value.type.length > 0;
    if (value.kind !== "response" || typeof value.ok !== "boolean") return false;
    if (value.ok) return value.error === undefined;
    if (!isRecord(value.error)) return false;
    return typeof value.error.code === "string" && value.error.code.length > 0 && typeof value.error.message === "string";
}

export function serializeLangWorkerMessage(message: LangWorkerMessage): string {
    if (!isLangWorkerMessage(message)) throw new TypeError("message is not a serialize-safe language worker message");
    return JSON.stringify(message);
}

export function parseLangWorkerMessage(input: unknown): LangWorkerMessage | null {
    let value: unknown = input;
    if (typeof input === "string") {
        try {
            value = JSON.parse(input);
        } catch {
            return null;
        }
    }
    return isLangWorkerMessage(value) ? value : null;
}

export interface LangTextDocument {
    uri: string;
    text: string;
    version: number;
    languageId?: string;
}

export interface LangDocumentStore {
    open(input: { uri: string; text: string; version?: number; languageId?: string }): LangTextDocument;
    change(uri: string, text: string, version: number): LangTextDocument | null;
    close(uri: string): boolean;
    get(uri: string): LangTextDocument | undefined;
    list(): LangTextDocument[];
}

export function createLangDocumentStore(): LangDocumentStore {
    const documents = new Map<string, LangTextDocument>();
    const copy = (doc: LangTextDocument): LangTextDocument => ({ ...doc });
    return {
        open: (input) => {
            if (!input?.uri) throw new TypeError("uri must be a non-empty string");
            if (typeof input.text !== "string") throw new TypeError("text must be a string");
            const version = input.version ?? 1;
            assertSeq(version);
            const doc: LangTextDocument = input.languageId === undefined
                ? { uri: input.uri, text: input.text, version }
                : { uri: input.uri, text: input.text, version, languageId: input.languageId };
            documents.set(doc.uri, doc);
            return copy(doc);
        },
        change: (uri, text, version) => {
            const doc = documents.get(uri);
            if (!doc || version <= doc.version) return null;
            doc.text = text;
            doc.version = version;
            return copy(doc);
        },
        close: (uri) => documents.delete(uri),
        get: (uri) => {
            const doc = documents.get(uri);
            return doc ? copy(doc) : undefined;
        },
        list: () => [...documents.values()].sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0)).map(copy),
    };
}

export interface LangWorkerHandlerContext {
    seq: number;
    type: string;
    documents: LangDocumentStore;
    isCancelled(): boolean;
}

export type LangWorkerHandler = (
    payload: JsonValue | undefined,
    context: LangWorkerHandlerContext,
) => JsonValue | undefined | Promise<JsonValue | undefined>;

export interface LangWorkerDispatcher {
    documents: LangDocumentStore;
    dispatch(message: unknown): Promise<LangWorkerResponse>;
    isCancelled(seq: number): boolean;
}

const errorResponse = (seq: number, code: string, message: string): LangWorkerResponse =>
    ({ kind: "response", seq, ok: false, error: { code, message } });

const payloadField = (payload: JsonValue | undefined, field: string): JsonValue | undefined =>
    isRecord(payload) ? (payload[field] as JsonValue | undefined) : undefined;

export function createLangWorkerDispatcher(
    handlers: Record<string, LangWorkerHandler> = {},
    options: { documents?: LangDocumentStore } = {},
): LangWorkerDispatcher {
    const documents = options.documents ?? createLangDocumentStore();
    const cancelled = new Set<number>();
    const builtins = new Set<string>(["didOpen", "didChange", "didClose"]);

    const syncBuiltin = (request: LangWorkerRequest): LangWorkerResponse => {
        const uri = payloadField(request.payload, "uri");
        if (typeof uri !== "string" || !uri) return errorResponse(request.seq, "invalid_payload", "payload.uri must be a non-empty string");
        if (request.type === "didClose") {
            return { kind: "response", seq: request.seq, ok: true, result: { uri, closed: documents.close(uri) } };
        }
        const text = payloadField(request.payload, "text");
        if (typeof text !== "string") return errorResponse(request.seq, "invalid_payload", "payload.text must be a string");
        const rawVersion = payloadField(request.payload, "version");
        const version = rawVersion === undefined && request.type === "didOpen" ? 1 : rawVersion;
        if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
            return errorResponse(request.seq, "invalid_payload", "payload.version must be a positive integer");
        }
        if (request.type === "didOpen") {
            const languageId = payloadField(request.payload, "languageId");
            const doc = documents.open({ uri, text, version, ...(typeof languageId === "string" ? { languageId } : {}) });
            return { kind: "response", seq: request.seq, ok: true, result: { uri: doc.uri, version: doc.version } };
        }
        const existing = documents.get(uri);
        if (!existing) return errorResponse(request.seq, "document_not_open", `document is not open: ${uri}`);
        if (version <= existing.version) return errorResponse(request.seq, "stale_version", `version ${version} is not newer than ${existing.version}`);
        const doc = documents.change(uri, text, version);
        return { kind: "response", seq: request.seq, ok: true, result: { uri, version: doc?.version ?? version } };
    };

    const dispatch = async (message: unknown): Promise<LangWorkerResponse> => {
        if (!isLangWorkerMessage(message) || message.kind !== "request") {
            const seq = isRecord(message) && Number.isInteger(message.seq) && (message.seq as number) >= 0 ? (message.seq as number) : 0;
            return errorResponse(seq, "invalid_message", "expected a language worker request message");
        }
        if (message.type === "cancel") {
            const targetSeq = payloadField(message.payload, "targetSeq");
            if (typeof targetSeq !== "number" || !Number.isInteger(targetSeq) || targetSeq < 1) {
                return errorResponse(message.seq, "invalid_payload", "payload.targetSeq must be a positive integer");
            }
            cancelled.add(targetSeq);
            return { kind: "response", seq: message.seq, ok: true, result: { cancelled: targetSeq } };
        }
        if (cancelled.has(message.seq)) return errorResponse(message.seq, "cancelled", `request ${message.seq} was cancelled`);
        const handler = handlers[message.type];
        if (!handler && builtins.has(message.type)) return syncBuiltin(message);
        if (!handler) return errorResponse(message.seq, "unknown_request", `no handler for request type: ${message.type}`);
        const context: LangWorkerHandlerContext = {
            seq: message.seq,
            type: message.type,
            documents,
            isCancelled: () => cancelled.has(message.seq),
        };
        let result: JsonValue | undefined;
        try {
            result = await handler(message.payload, context);
        } catch (error) {
            return errorResponse(message.seq, "handler_error", error instanceof Error ? error.message : String(error));
        }
        if (context.isCancelled()) return errorResponse(message.seq, "cancelled", `request ${message.seq} was cancelled`);
        const value = result ?? null;
        if (!isJsonValue(value)) return errorResponse(message.seq, "unserializable_result", "handler result is not a JSON value");
        return { kind: "response", seq: message.seq, ok: true, result: value };
    };

    return { documents, dispatch, isCancelled: (seq) => cancelled.has(seq) };
}
