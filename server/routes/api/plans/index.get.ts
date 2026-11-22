import { useMediator } from "@ruxt/shared/cqrs";
import { listPlansQuery } from "@ruxt/core/handlers/list-plans";
import { getAuthPrincipal } from "../../../utils/auth-user";
import { isAdmin, planVisibleTo } from "../../../utils/commercial-access";

interface ListedPlan { id: string; createdBy: string | null; isPublic: boolean; source: string }

export default defineEventHandler(async (event) => {
   const { all, userId } = getQuery(event);
   // Anonymous callers get the shared catalog, and only that: the public list is cached for everyone.
   if (all === undefined && userId === undefined) {
      return cachePublicJson(event, async () => {
         const result = await sendApiRequest<{ plans: ListedPlan[] }>(useMediator(), listPlansQuery({ publicOnly: true }));
         // Plans people created for themselves are never part of the shared catalog, whatever flag they carry.
         return { ...result, plans: result.plans.filter(plan => plan.source !== "user") };
      });
   }
   const principal = await getAuthPrincipal(event);
   if (!principal) throw createError({ statusCode: 401, statusMessage: "Authentication required" });
   setPrivateCache(event);
   const admin = await isAdmin(event, principal);
   if (typeof userId === "string" && userId !== principal.ownerId && !admin) {
      throw createError({ statusCode: 403, statusMessage: "You can only list your own plans" });
   }
   const result = await sendApiRequest<{ plans: ListedPlan[] }>(useMediator(), listPlansQuery({
      publicOnly: all !== "true",
      userId: typeof userId === "string" ? userId : undefined,
   }));
   // `all=true` is every plan the caller may see: the catalog plus their own, never other people's.
   const visible = [];
   for (const plan of result.plans) if (await planVisibleTo(event, plan, principal)) visible.push(plan);
   return { ...result, plans: visible };
});
