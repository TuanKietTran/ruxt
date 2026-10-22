import { useMediator } from "@ruxt/core/cqrs";
import { cancelCvImportCommand } from "@ruxt/core/handlers/cancel-cv-import";
import { requestActiveCvImportCancellation } from "../../../../services/cv-import-worker";
import { requireCvOwner } from "../../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   const job = await sendApiRequest<any>(useMediator(), cancelCvImportCommand({ id, ownerId }));
   requestActiveCvImportCancellation(id);
   return job;
});
