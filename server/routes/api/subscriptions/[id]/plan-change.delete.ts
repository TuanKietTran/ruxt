import { requireOwnedSubscription } from "../../../../utils/commercial-access";
import { useMediator } from "@ruxt/shared/cqrs";
import { cancelPlanChangeCommand } from "@ruxt/core/handlers/cancel-plan-change";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   await requireOwnedSubscription(event, id);
   const mediator = useMediator();
   return sendApiRequest(mediator, cancelPlanChangeCommand({ subscriptionId: id }));
});
