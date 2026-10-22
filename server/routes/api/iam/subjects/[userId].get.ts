import { useMediator } from "@ruxt/core/cqrs";
import { getSubjectQuery } from "@ruxt/core/handlers/get-subject";

export default defineEventHandler(async (event) => {
   const userId = getRouterParam(event, "userId")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, getSubjectQuery({ userId }));
});
