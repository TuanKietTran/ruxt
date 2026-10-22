import { useMediator } from "@ruxt/core/cqrs";
import { listPlansQuery } from "@ruxt/core/handlers/list-plans";

export default defineEventHandler(async (event) => {
   const { all, userId } = getQuery(event);
   const mediator = useMediator();
   return sendApiRequest(mediator, listPlansQuery({
      publicOnly: all !== "true",
      userId: userId as string | undefined,
   }));
});
