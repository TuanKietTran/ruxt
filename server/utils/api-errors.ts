import { createError } from "h3";

interface MediatorLike {
    send<T = unknown>(request: unknown): Promise<T>;
}

const statusForMessage = (message: string): number => {
    const normalized = message.toLowerCase();
    if (normalized.includes("not found")) return 404;
    if (normalized.includes("too large")) return 413;
    if (/already|duplicate|conflict/.test(normalized)) return 409;
    if (/invalid transition|no pending|must differ|cannot /.test(normalized)) return 409;
    if (/invalid|unknown|must|required|empty|non-negative|finite|out of range/.test(normalized)) return 400;
    return 500;
};

/** Convert CQRS/domain failures into stable HTTP errors at the transport boundary. */
export async function sendApiRequest<T>(mediator: MediatorLike, request: unknown): Promise<T> {
    try {
        return await mediator.send<T>(request);
    } catch (error: any) {
        if (Number.isInteger(error?.statusCode)) throw error;

        const message = error instanceof Error ? error.message : "Unexpected application error";
        const statusCode = statusForMessage(message);
        throw createError({
            statusCode,
            statusMessage: statusCode === 500 ? "Internal server error" : message,
            data: { code: statusCode === 404 ? "NOT_FOUND" : statusCode === 409 ? "CONFLICT" : statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR" },
            cause: error,
        });
    }
}
