import { useMediator } from "@core/cqrs";
import { createSubscriptionCommand } from "@core/handlers/create-subscription";
import { requireAuthUser } from "../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const body = await readBody(event);
   const userId = await requireAuthUser(event);
   const mediator = useMediator();
   const data = await sendApiRequest(mediator, createSubscriptionCommand({
      userId,
      planId: body.planId,
      billingPeriod: body.billingPeriod,
      startAt: body.startAt,
      trialDays: body.trialDays,
   }));
   setResponseStatus(event, 201);
   return data;
});
