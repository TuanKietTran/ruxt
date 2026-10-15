import { useMediator } from "@core/cqrs";
import { cancelSubscriptionCommand } from "@core/handlers/cancel-subscription";
import { requireOwnedSubscription } from "../../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = (await readBody(event).catch(() => undefined)) ?? {};
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   return sendApiRequest(mediator, cancelSubscriptionCommand({
      subscriptionId: id,
      cancelledAt: body.cancelledAt,
   }));
});
