import { useMediator } from "@ruxt/shared/cqrs";
import { listPlansQuery } from "@ruxt/core/handlers/list-plans";

export default defineEventHandler(async (event) => {
   const { all, userId } = getQuery(event);
   const load = () => sendApiRequest(useMediator(), listPlansQuery({
      publicOnly: all !== "true",
      userId: userId as string | undefined,
   }));
   // Only the plain public catalog is shared; filtered views (all plans, one creator) stay uncached.
   if (all === undefined && userId === undefined) return cachePublicJson(event, load);
   setPrivateCache(event);
   return load();
});
