import { useMediator } from "@ruxt/shared/cqrs";
import { terminateSubscriptionCommand } from "@ruxt/core/handlers/terminate-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, terminateSubscriptionCommand({ subscriptionId: id }));
});
