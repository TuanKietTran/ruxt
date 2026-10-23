import { assertCvId, deleteCvDocument } from "../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    await deleteCvDocument(id);
    setResponseStatus(event, 204);
    return null;
});
