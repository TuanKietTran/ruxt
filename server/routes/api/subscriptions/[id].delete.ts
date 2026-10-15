import { useMediator } from "@core/cqrs";
import { terminateSubscriptionCommand } from "@core/handlers/terminate-subscription";
import { requireOwnedSubscription } from "../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   return sendApiRequest(mediator, terminateSubscriptionCommand({ subscriptionId: id }));
});
