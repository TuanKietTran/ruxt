import { useMediator } from "@core/cqrs";
import { upsertPlanCommand } from "@core/handlers/upsert-plan";
import { requireAuthUser } from "../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event);
   const createdBy = await requireAuthUser(event);
   const mediator = useMediator();
   return sendApiRequest(mediator, upsertPlanCommand({
      id,
      name: body.name,
      description: body.description,
      provider: body.provider,
      source: body.source,
      createdBy,
      amountMinor: body.amountMinor,
      currency: body.currency,
      billingPeriod: body.billingPeriod,
      trialDays: body.trialDays,
      features: body.features,
      isPublic: body.isPublic,
   }));
});
