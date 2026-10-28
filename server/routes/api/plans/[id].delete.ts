import { useMediator } from "@ruxt/shared/cqrs";
import { deletePlanCommand } from "@ruxt/core/handlers/delete-plan";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   const result = await sendApiRequest(mediator, deletePlanCommand({ planId: id }));
   await purgePublicJson(event, "/api/plans");
   return result;
});
