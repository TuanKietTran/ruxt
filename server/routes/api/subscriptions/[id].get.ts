import { useMediator } from "@core/cqrs";
import { requireOwnedSubscription } from "../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   const subscription = await requireOwnedSubscription(event, mediator, id);
   if (getQuery(event).manage === "true") {
      return { subscription, billing: { provider: "mock", action: "manage", status: "available", url: `/d?manage=mock&subscription=${encodeURIComponent(id)}` } };
   }
   return subscription;
});
