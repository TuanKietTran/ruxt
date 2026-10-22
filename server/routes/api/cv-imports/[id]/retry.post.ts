import { useMediator } from "@ruxt/shared/cqrs";
import { retryCvImportCommand } from "@ruxt/core/handlers/retry-cv-import";
import { runCvImport } from "../../../../services/cv-import-worker";
import { requireCvOwner } from "../../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   const job = await sendApiRequest<any>(useMediator(), retryCvImportCommand({ id, ownerId }));
   setResponseStatus(event, 202);
   void runCvImport(id);
   return job;
});
