import { createDeployStrategy } from "@infra/deploy/strategy";
import { DenoKvSubscriptionRepo } from "./subscription-repo-kv";
import { DenoKvPlanRepo } from "./plan-repo-kv";
import { DenoKvIamRepo } from "./iam-repo-kv";
import { DenoKvUserRepo } from "./user-repo-kv";
import { DenoKvCloudConsentRepo } from "./cloud-consent-repo-kv";
import { DenoKvUserPreferencesRepo } from "./user-preferences-repo-kv";

createDeployStrategy({
   label: "DenoKV",
   importPath: "@infra/deploy/deno/repos",
   weight: 10,

   predicate() {
      return typeof globalThis.Deno !== "undefined";
   },

   buildRepos() {
      return {
         sub: new DenoKvSubscriptionRepo(),
         plan: new DenoKvPlanRepo(),
         iam: new DenoKvIamRepo(),
         user: new DenoKvUserRepo(),
         cloudConsent: new DenoKvCloudConsentRepo(),
         preferences: new DenoKvUserPreferencesRepo(),
      };
   },
});
