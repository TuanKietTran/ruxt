import { assertCvId, forkCvDocument } from "../../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    const body = await readBody<{ id?: string; title?: string }>(event);
    if (!body?.id) throw createError({ statusCode: 400, statusMessage: "id is required" });
    const forked = await forkCvDocument(id, body.id, body.title);
    setResponseStatus(event, 201);
    return forked;
});
