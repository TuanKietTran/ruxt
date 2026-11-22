import { useMediator } from "@ruxt/shared/cqrs";
import { listSubscriptionsQuery } from "@ruxt/core/handlers/list-subscriptions";
import { DEMO_SUBJECT, resolveSubject } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const { userId } = getQuery(event);
   if (!userId || typeof userId !== "string") {
      throw createError({ statusCode: 400, message: "userId query param required" });
   }
   setPrivateCache(event);
   // The sample subject behind /d?userId=demo is world-readable and read-only; every other subject is the caller's own.
   if (userId !== DEMO_SUBJECT) await resolveSubject(event, userId);
   return sendApiRequest(useMediator(), listSubscriptionsQuery({ userId }));
});
