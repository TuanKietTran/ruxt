import { useMediator } from "@ruxt/shared/cqrs";
import { acknowledgeCloudRetentionCommand } from "@ruxt/core/handlers/acknowledge-cloud-retention";

/** Acknowledge the current retention notice. Grants no category and uploads nothing. */
export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   await sendApiRequest(useMediator(), acknowledgeCloudRetentionCommand({ userId }));
   return readCloudConsent(userId);
});
