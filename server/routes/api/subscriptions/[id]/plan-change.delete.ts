import { useMediator } from "@ruxt/core/cqrs";
import { cancelPlanChangeCommand } from "@ruxt/core/handlers/cancel-plan-change";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, cancelPlanChangeCommand({ subscriptionId: id }));
});
