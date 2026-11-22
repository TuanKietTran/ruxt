import { useMediator } from "@ruxt/shared/cqrs";
import { deletePlanCommand } from "@ruxt/core/handlers/delete-plan";
import { isAdmin, loadPlan, requirePrincipal } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const principal = await requirePrincipal(event);
   const id = getRouterParam(event, "id")!;
   const existing = await loadPlan(id);
   if (existing && existing.createdBy !== principal.ownerId && !(await isAdmin(event, principal))) {
      throw createError({ statusCode: 404, statusMessage: `Plan not found: ${id}`, data: { code: "NOT_FOUND" } });
   }
   const result = await sendApiRequest(useMediator(), deletePlanCommand({ planId: id }));
   await purgePublicJson(event, "/api/plans");
   return result;
});
