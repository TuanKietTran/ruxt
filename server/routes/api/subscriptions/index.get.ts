import { useMediator } from "@core/cqrs";
import { listSubscriptionsQuery } from "@core/handlers/list-subscriptions";
import { getAutomationEntitlements, requireAuthUser } from "../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   const mediator = useMediator();
   const subscriptions = await sendApiRequest(mediator, listSubscriptionsQuery({ userId })) as { subscriptions: unknown[] };
   if (getQuery(event).include === "entitlements") {
      return { ...subscriptions, entitlements: await getAutomationEntitlements(userId) };
   }
   return subscriptions;
});
