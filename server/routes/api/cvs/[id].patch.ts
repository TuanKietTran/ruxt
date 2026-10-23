import { assertCvId, renameCvDocument } from "../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    const body = await readBody<{ title?: string }>(event);
    if (!body?.title?.trim()) throw createError({ statusCode: 400, statusMessage: "title is required" });
    return renameCvDocument(id, body.title);
});
