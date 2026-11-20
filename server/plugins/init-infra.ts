import { bootstrap } from "@infra/registry";

export default defineNitroPlugin(async () => {
   // Read per call: Worker bindings are attached per request, and missing values keep cloud consent fail-closed.
   await bootstrap({ retentionConfiguration: () => cloudRetentionConfiguration() });
});
