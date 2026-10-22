import { useMediator } from "@ruxt/core/cqrs";
import { getCvCapabilitiesQuery } from "@ruxt/core/handlers/get-cv-capabilities";
import { requireCvOwner } from "../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   return sendApiRequest(useMediator(), getCvCapabilitiesQuery());
});
