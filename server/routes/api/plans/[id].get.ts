import { useMediator } from "@ruxt/shared/cqrs";
import { getPlanQuery } from "@ruxt/core/handlers/get-plan";
import { getAuthPrincipal } from "../../../utils/auth-user";
import { planVisibleTo } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const plan = await sendApiRequest<{ id: string; createdBy: string | null; isPublic: boolean; source: string }>(useMediator(), getPlanQuery({ planId: id }));
   // A plan someone else keeps private answers like a missing one.
   if (!(await planVisibleTo(event, plan, await getAuthPrincipal(event)))) {
      throw createError({ statusCode: 404, statusMessage: `Plan not found: ${id}`, data: { code: "NOT_FOUND" } });
   }
   return plan;
});
