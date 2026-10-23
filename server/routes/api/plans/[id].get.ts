import { useMediator } from "@ruxt/shared/cqrs";
import { getPlanQuery } from "@ruxt/core/handlers/get-plan";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, getPlanQuery({ planId: id }));
});
