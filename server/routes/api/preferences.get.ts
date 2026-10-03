import { useMediator } from "@core/cqrs";
import { getUserPreferencesQuery } from "../../preferences/handlers";

export default defineEventHandler(async (event) => {
   const userId = await requireAuthUser(event);
   return sendApiRequest(useMediator(), getUserPreferencesQuery({ userId }));
});
