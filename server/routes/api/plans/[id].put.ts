import { useMediator } from "@ruxt/shared/cqrs";
import { upsertPlanCommand } from "@ruxt/core/handlers/upsert-plan";
import { isAdmin, loadPlan, requirePrincipal } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const principal = await requirePrincipal(event);
   const id = getRouterParam(event, "id")!;
   const body = await readBody(event);
   const admin = await isAdmin(event, principal);
   const existing = await loadPlan(id);
   if (existing && !admin && existing.createdBy !== principal.ownerId) {
      // Someone else's plan, or a catalog plan: not yours to replace, and not revealed to you either.
      throw createError({ statusCode: 404, statusMessage: `Plan not found: ${id}`, data: { code: "NOT_FOUND" } });
   }
   const mediator = useMediator();
   // Callers manage their own private plans. Only an administrator publishes catalog plans or sets owners.
   const plan = await sendApiRequest(mediator, upsertPlanCommand({
      id,
      name: body.name,
      description: body.description,
      provider: body.provider,
      source: admin ? body.source : "user",
      createdBy: admin ? body.createdBy : principal.ownerId,
      amountMinor: body.amountMinor,
      currency: body.currency,
      billingPeriod: body.billingPeriod,
      trialDays: body.trialDays,
      features: body.features,
      isPublic: admin ? body.isPublic : false,
   }));
   await purgePublicJson(event, "/api/plans");
   return plan;
});
