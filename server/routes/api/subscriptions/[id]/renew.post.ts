import { useMediator } from "@ruxt/core/cqrs";
import { renewSubscriptionCommand } from "@ruxt/core/handlers/renew-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event).catch(() => ({}));
   const mediator = useMediator();
   return sendApiRequest(mediator, renewSubscriptionCommand({
      subscriptionId: id,
      renewedAt: body.renewedAt,
      billingPeriod: body.billingPeriod,
   }));
});
