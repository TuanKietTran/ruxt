import { useMediator } from "@core/cqrs";
import { getUserPreferencesQuery } from "@core/handlers/get-user-preferences";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   return sendApiRequest(useMediator(), getUserPreferencesQuery({ userId }));
});
