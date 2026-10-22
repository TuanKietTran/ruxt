import { useMediator } from "@ruxt/core/cqrs";
import { previewCvImportQuery } from "@ruxt/core/handlers/preview-cv-import";
import { requireCvOwner } from "../../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   return sendApiRequest(useMediator(), previewCvImportQuery({ id, ownerId }));
});
