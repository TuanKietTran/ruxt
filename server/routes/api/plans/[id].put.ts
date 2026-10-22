import { useMediator } from "@ruxt/shared/cqrs";
import { upsertPlanCommand } from "@ruxt/core/handlers/upsert-plan";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event);
   const mediator = useMediator();
   return sendApiRequest(mediator, upsertPlanCommand({
      id,
      name: body.name,
      description: body.description,
      provider: body.provider,
      source: body.source,
      createdBy: body.createdBy,
      amountMinor: body.amountMinor,
      currency: body.currency,
      billingPeriod: body.billingPeriod,
      trialDays: body.trialDays,
      features: body.features,
      isPublic: body.isPublic,
   }));
});
