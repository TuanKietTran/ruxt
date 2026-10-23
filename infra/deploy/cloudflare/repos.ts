import { createDeployStrategy } from "@infra/deploy/strategy";
import { D1CloudConsentRepo, D1IamRepo, D1PlanRepo, D1SubscriptionRepo, D1UserPreferencesRepo, D1UserRepo } from "./repository-adapters";

createDeployStrategy({
   label: "Cloudflare D1",
   importPath: "@infra/deploy/cloudflare/repos",
   // Deno remains preferred if ever co-hosted; on-prem remains the fallback.
   weight: 5,
   predicate() {
      const env = (globalThis as typeof globalThis & { __env__?: { RUXT_DB?: unknown } }).__env__;
      return Boolean(env?.RUXT_DB);
   },
   buildRepos() {
      return {
         sub: new D1SubscriptionRepo(),
         plan: new D1PlanRepo(),
         iam: new D1IamRepo(),
         user: new D1UserRepo(),
         cloudConsent: new D1CloudConsentRepo(),
         preferences: new D1UserPreferencesRepo(),
      };
   },
});
