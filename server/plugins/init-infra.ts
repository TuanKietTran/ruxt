import { bootstrap } from "@infra/registry";

export default defineNitroPlugin(async () => {
   await bootstrap();
});
