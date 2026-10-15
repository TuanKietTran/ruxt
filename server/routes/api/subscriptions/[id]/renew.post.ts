import { useMediator } from "@core/cqrs";
import { renewSubscriptionCommand } from "@core/handlers/renew-subscription";
import { requireOwnedSubscription } from "../../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event).catch(() => ({}));
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   return sendApiRequest(mediator, renewSubscriptionCommand({
      subscriptionId: id,
      renewedAt: body.renewedAt,
      billingPeriod: body.billingPeriod,
   }));
});
