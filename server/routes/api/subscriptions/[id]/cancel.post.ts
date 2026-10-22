import { useMediator } from "@ruxt/shared/cqrs";
import { cancelSubscriptionCommand } from "@ruxt/core/handlers/cancel-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = (await readBody(event).catch(() => undefined)) ?? {};
   const mediator = useMediator();
   return sendApiRequest(mediator, cancelSubscriptionCommand({
      subscriptionId: id,
      cancelledAt: body.cancelledAt,
   }));
});
