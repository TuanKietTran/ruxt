import { useMediator } from "@ruxt/shared/cqrs";
import { getCvCapabilitiesQuery } from "@ruxt/core/handlers/get-cv-capabilities";
import { requireCvOwner } from "../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   // Capabilities change only with a deployment; the route stays signed-in only, so never shared caches.
   setPrivateCache(event, 300);
   return sendApiRequest(useMediator(), getCvCapabilitiesQuery());
});
