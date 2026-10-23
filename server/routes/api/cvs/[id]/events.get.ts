import { assertCvId, getCvDocument, subscribeToCv } from "../../../../adapters/cv/document-store";
import type { CvUpdateEvent } from "@ruxt/shared/cv";

const encoder = new TextEncoder();
const encodeEvent = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export default defineEventHandler(async (event) => {
    // Workers KV has no cross-isolate event hub; long-lived SSE is self-hosted only.
    if (import.meta.preset === "cloudflare-module") {
        throw createError({ statusCode: 501, statusMessage: "CV live events are unavailable on Cloudflare Workers; use document polling" });
    }
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    const initial = await getCvDocument(id);
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encodeEvent("ready", { document: initial }));
            unsubscribe = subscribeToCv(initial.id, (update: CvUpdateEvent) => {
                controller.enqueue(encodeEvent("cv:update", update));
            });
            heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 20_000);
        },
        cancel() {
            unsubscribe();
            if (heartbeat) clearInterval(heartbeat);
        },
    });

    setResponseHeaders(event, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
    });
    return sendStream(event, stream);
});
