import { requireOwnedSubscription } from "../../../../utils/commercial-access";
import { useMediator } from "@ruxt/shared/cqrs";
import { pauseSubscriptionCommand } from "@ruxt/core/handlers/pause-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   await requireOwnedSubscription(event, id);
   const body = await readBody(event).catch(() => ({}));
   const mediator = useMediator();
   return sendApiRequest(mediator, pauseSubscriptionCommand({
      subscriptionId: id,
      pausedAt: body.pausedAt,
   }));
});
