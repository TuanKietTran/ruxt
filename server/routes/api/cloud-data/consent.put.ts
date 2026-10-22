import { useMediator } from "@ruxt/shared/cqrs";
import { setCloudDataConsentCommand } from "@ruxt/core/handlers/set-cloud-data-consent";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   const body = await readBody(event);
   return sendApiRequest(useMediator(), setCloudDataConsentCommand({
      userId,
      category: body?.category,
      granted: body?.granted,
   }));
});
