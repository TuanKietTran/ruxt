import { useMediator } from "@ruxt/shared/cqrs";
import { commitCvImportCommand } from "@ruxt/core/handlers/commit-cv-import";
import { requireCvOwner } from "../../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   const body = await readBody<{ documentId?: string }>(event);
   if (!body?.documentId) throw createError({ statusCode: 400, statusMessage: "documentId is required" });
   const document = await sendApiRequest(useMediator(), commitCvImportCommand({ id, ownerId, documentId: body.documentId }));
   setResponseStatus(event, 201);
   return document;
});
