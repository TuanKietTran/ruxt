import { requireOwnedSubscription } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   setPrivateCache(event);
   return (await requireOwnedSubscription(event, id)).subscription;
});
