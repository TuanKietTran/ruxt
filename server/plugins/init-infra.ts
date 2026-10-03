import { bootstrap } from "@infra/registry";
import { registerUserPreferencesHandlers } from "../preferences/handlers";

export default defineNitroPlugin(async () => {
   const repos = await bootstrap();
   registerUserPreferencesHandlers(repos.preferences);
});
