import { useMediator } from "@ruxt/shared/cqrs";
import { createSubscriptionCommand } from "@ruxt/core/handlers/create-subscription";
import { requireVisiblePlan, resolveSubject } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const body = await readBody(event);
   // The subject is the caller; naming anyone else needs the administrator role.
   const { principal, userId } = await resolveSubject(event, body?.userId);
   await requireVisiblePlan(event, body?.planId, principal);
   const data = await sendApiRequest(useMediator(), createSubscriptionCommand({
      userId,
      planId: body.planId,
      billingPeriod: body.billingPeriod,
      startAt: body.startAt,
      trialDays: body.trialDays,
   }));
   setResponseStatus(event, 201);
   return data;
});
