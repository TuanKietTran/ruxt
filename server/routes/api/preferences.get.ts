import { useMediator } from "@ruxt/shared/cqrs";
import { getUserPreferencesQuery } from "@ruxt/core/handlers/get-user-preferences";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   return sendApiRequest(useMediator(), getUserPreferencesQuery({ userId }));
});
