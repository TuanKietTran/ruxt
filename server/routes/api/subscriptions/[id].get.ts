import { useMediator } from "@ruxt/core/cqrs";
import { getSubscriptionQuery } from "@ruxt/core/handlers/get-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, getSubscriptionQuery({ subscriptionId: id }));
});
