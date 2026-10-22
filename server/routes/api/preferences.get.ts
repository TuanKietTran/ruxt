import { useMediator } from "@ruxt/core/cqrs";
import { getUserPreferencesQuery } from "@ruxt/core/handlers/get-user-preferences";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   return sendApiRequest(useMediator(), getUserPreferencesQuery({ userId }));
});
