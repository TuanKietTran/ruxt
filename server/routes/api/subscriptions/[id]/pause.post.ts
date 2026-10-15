import { useMediator } from "@core/cqrs";
import { pauseSubscriptionCommand } from "@core/handlers/pause-subscription";
import { requireOwnedSubscription } from "../../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event).catch(() => ({}));
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   return sendApiRequest(mediator, pauseSubscriptionCommand({
      subscriptionId: id,
      pausedAt: body.pausedAt,
   }));
});
