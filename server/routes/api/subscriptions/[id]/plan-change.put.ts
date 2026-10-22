import { useMediator } from "@ruxt/shared/cqrs";
import { schedulePlanChangeCommand } from "@ruxt/core/handlers/schedule-plan-change";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event);
   const mediator = useMediator();
   return sendApiRequest(mediator, schedulePlanChangeCommand({
      subscriptionId: id,
      newPlanId: body.newPlanId,
   }));
});
