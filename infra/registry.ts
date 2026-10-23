import type { Repos } from "@infra/types";
import { ScryptHasher } from "@infra/crypto/scrypt-hasher";
import { registerRegisterUser } from "@ruxt/core/handlers/register-user";
import { registerLoginUser } from "@ruxt/core/handlers/login-user";
import { registerGetUser } from "@ruxt/core/handlers/get-user";
import { registerGetCloudDataConsent } from "@ruxt/core/handlers/get-cloud-data-consent";
import { registerSetCloudDataConsent } from "@ruxt/core/handlers/set-cloud-data-consent";
import { registerGetUserPreferences } from "@ruxt/core/handlers/get-user-preferences";
import { registerSetUserPreferences } from "@ruxt/core/handlers/set-user-preferences";
import "@infra/deploy/index";
import { resolveStrategy } from "@infra/deploy/strategy";

export async function bootstrap(): Promise<void> {
   const strategy = await resolveStrategy();
   registerAll(strategy.buildRepos());
   console.log(`🚀 infra ready — ${strategy.label}`);
}

import { registerCreateSubscription } from "@ruxt/core/handlers/create-subscription";
import { registerCancelSubscription } from "@ruxt/core/handlers/cancel-subscription";
import { registerPauseSubscription } from "@ruxt/core/handlers/pause-subscription";
import { registerResumeSubscription } from "@ruxt/core/handlers/resume-subscription";
import { registerRenewSubscription } from "@ruxt/core/handlers/renew-subscription";
import { registerGetSubscription } from "@ruxt/core/handlers/get-subscription";
import { registerListSubscriptions } from "@ruxt/core/handlers/list-subscriptions";
import { registerSchedulePlanChange } from "@ruxt/core/handlers/schedule-plan-change";
import { registerCancelPlanChange } from "@ruxt/core/handlers/cancel-plan-change";
import { registerTerminateSubscription } from "@ruxt/core/handlers/terminate-subscription";

import { registerGetPlan } from "@ruxt/core/handlers/get-plan";
import { registerListPlans } from "@ruxt/core/handlers/list-plans";
import { registerUpsertPlan } from "@ruxt/core/handlers/upsert-plan";
import { registerDeletePlan } from "@ruxt/core/handlers/delete-plan";

import { registerCheckAccess } from "@ruxt/core/handlers/check-access";
import { registerGetSubject } from "@ruxt/core/handlers/get-subject";
import { registerUpsertSubject } from "@ruxt/core/handlers/upsert-subject";
import { registerDeleteSubject } from "@ruxt/core/handlers/delete-subject";

export function registerAll(repos: Repos): void {
   const { sub, plan, iam, user, cloudConsent, preferences } = repos;
   const hasher = new ScryptHasher();

   registerCreateSubscription(sub);
   registerCancelSubscription(sub);
   registerPauseSubscription(sub);
   registerResumeSubscription(sub);
   registerRenewSubscription(sub);
   registerGetSubscription(sub);
   registerListSubscriptions(sub);
   registerSchedulePlanChange(sub);
   registerCancelPlanChange(sub);
   registerTerminateSubscription(sub);

   registerGetPlan(plan);
   registerListPlans(plan);
   registerUpsertPlan(plan);
   registerDeletePlan(plan);

   registerCheckAccess(iam);
   registerGetSubject(iam);
   registerUpsertSubject(iam);
   registerDeleteSubject(iam);

   registerRegisterUser(user, hasher);
   registerLoginUser(user, hasher);
   registerGetUser(user);

   registerGetCloudDataConsent(cloudConsent);
   registerSetCloudDataConsent(cloudConsent);
   registerGetUserPreferences(preferences);
   registerSetUserPreferences(preferences);
}
