import { requireOwnedSubscription } from "../../../utils/commercial-access";
import { useMediator } from "@ruxt/shared/cqrs";
import { terminateSubscriptionCommand } from "@ruxt/core/handlers/terminate-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   await requireOwnedSubscription(event, id);
   const mediator = useMediator();
   return sendApiRequest(mediator, terminateSubscriptionCommand({ subscriptionId: id }));
});
