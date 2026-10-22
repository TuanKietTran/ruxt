import { useMediator } from "@ruxt/core/cqrs";
import { getCvApplicationQuery } from "@ruxt/core/handlers/get-cv-application";
import { requireCvOwner } from "../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   return sendApiRequest(useMediator(), getCvApplicationQuery({ id, ownerId }));
});
