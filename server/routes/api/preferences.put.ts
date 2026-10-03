import { useMediator } from "@core/cqrs";
import { setUserPreferencesCommand } from "../../preferences/handlers";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   const body = await readBody(event);
   return sendApiRequest(useMediator(), setUserPreferencesCommand({ userId, preferences: body?.preferences }));
});
