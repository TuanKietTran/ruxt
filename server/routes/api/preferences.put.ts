import { useMediator } from "@ruxt/core/cqrs";
import { setUserPreferencesCommand } from "@ruxt/core/handlers/set-user-preferences";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   const body = await readBody(event);
   return sendApiRequest(useMediator(), setUserPreferencesCommand({ userId, preferences: body?.preferences }));
});
