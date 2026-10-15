import { useMediator } from "@core/cqrs";
import { cancelPlanChangeCommand } from "@core/handlers/cancel-plan-change";
import { requireOwnedSubscription } from "../../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   return sendApiRequest(mediator, cancelPlanChangeCommand({ subscriptionId: id }));
});
