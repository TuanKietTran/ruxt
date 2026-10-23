import { useMediator } from "@ruxt/shared/cqrs";
import { listSubscriptionsQuery } from "@ruxt/core/handlers/list-subscriptions";

export default defineEventHandler(async (event) => {
   const { userId } = getQuery(event);
   if (!userId || typeof userId !== "string") {
      throw createError({ statusCode: 400, message: "userId query param required" });
   }
   const mediator = useMediator();
   return sendApiRequest(mediator, listSubscriptionsQuery({ userId }));
});
