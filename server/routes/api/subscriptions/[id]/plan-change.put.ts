import { useMediator } from "@core/cqrs";
import { schedulePlanChangeCommand } from "@core/handlers/schedule-plan-change";
import { requireOwnedSubscription } from "../../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event);
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   const result = await sendApiRequest(mediator, schedulePlanChangeCommand({
      subscriptionId: id,
      newPlanId: body.newPlanId,
   }));
   // Provider seam: real checkout/webhook integration can replace this mock URL without
   // putting payment credentials or provider SDKs in the domain or persistence layers.
   return { ...(result as Record<string, unknown>), billing: { provider: "mock", action: "upgrade", status: "pending", url: `/d?checkout=mock&subscription=${encodeURIComponent(id)}` } };
});
