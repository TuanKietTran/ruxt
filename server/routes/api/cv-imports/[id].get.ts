import { useMediator } from "@ruxt/shared/cqrs";
import { getCvImportQuery } from "@ruxt/core/handlers/get-cv-import";
import { requireCvOwner } from "../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   return sendApiRequest(useMediator(), getCvImportQuery({ id, ownerId }));
});
