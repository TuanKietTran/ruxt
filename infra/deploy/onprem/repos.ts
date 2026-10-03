import { createDeployStrategy } from "@infra/deploy/strategy";
import { SqliteSubscriptionRepo } from "./subscription-repo-sqlite";
import { SqlitePlanRepo } from "./plan-repo-sqlite";
import { SqliteIamRepo } from "./iam-repo-sqlite";
import { SqliteUserRepo } from "./user-repo-sqlite";
import { SqliteCloudConsentRepo } from "./cloud-consent-repo-sqlite";
import { SqliteUserPreferencesRepo } from "./user-preferences-repo-sqlite";

createDeployStrategy({
   label: "SQLite",
   importPath: "@infra/deploy/onprem/repos",
   weight: 1,

   predicate() {
      return true; // fallback
   },

   buildRepos() {
      return {
         sub: new SqliteSubscriptionRepo(),
         plan: new SqlitePlanRepo(),
         iam: new SqliteIamRepo(),
         user: new SqliteUserRepo(),
         cloudConsent: new SqliteCloudConsentRepo(),
         preferences: new SqliteUserPreferencesRepo(),
      };
   },
});
