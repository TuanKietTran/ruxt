import { useMediator } from "@ruxt/shared/cqrs";
import { getCloudDataConsentQuery } from "@ruxt/core/handlers/get-cloud-data-consent";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   return sendApiRequest(useMediator(), getCloudDataConsentQuery({ userId }));
});
