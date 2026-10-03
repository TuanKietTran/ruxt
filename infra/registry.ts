import type { Repos } from "@infra/types";
import { ScryptHasher } from "@infra/crypto/scrypt-hasher";
import { registerRegisterUser } from "@core/handlers/register-user";
import { registerLoginUser } from "@core/handlers/login-user";
import { registerGetUser } from "@core/handlers/get-user";
import { registerGetCloudDataConsent } from "@core/handlers/get-cloud-data-consent";
import { registerSetCloudDataConsent } from "@core/handlers/set-cloud-data-consent";
import "@infra/deploy/index";
import { resolveStrategy } from "@infra/deploy/strategy";

export async function bootstrap(): Promise<Repos> {
   const strategy = await resolveStrategy();
   const repos = strategy.buildRepos();
   registerAll(repos);
   console.log(`🚀 infra ready — ${strategy.label}`);
   return repos;
}

import { registerCreateSubscription } from "@core/handlers/create-subscription";
import { registerCancelSubscription } from "@core/handlers/cancel-subscription";
import { registerPauseSubscription } from "@core/handlers/pause-subscription";
import { registerResumeSubscription } from "@core/handlers/resume-subscription";
import { registerRenewSubscription } from "@core/handlers/renew-subscription";
import { registerGetSubscription } from "@core/handlers/get-subscription";
import { registerListSubscriptions } from "@core/handlers/list-subscriptions";
import { registerSchedulePlanChange } from "@core/handlers/schedule-plan-change";
import { registerCancelPlanChange } from "@core/handlers/cancel-plan-change";
import { registerTerminateSubscription } from "@core/handlers/terminate-subscription";

import { registerGetPlan } from "@core/handlers/get-plan";
import { registerListPlans } from "@core/handlers/list-plans";
import { registerUpsertPlan } from "@core/handlers/upsert-plan";
import { registerDeletePlan } from "@core/handlers/delete-plan";

import { registerCheckAccess } from "@core/handlers/check-access";
import { registerGetSubject } from "@core/handlers/get-subject";
import { registerUpsertSubject } from "@core/handlers/upsert-subject";
import { registerDeleteSubject } from "@core/handlers/delete-subject";

export function registerAll(repos: Repos): void {
   const { sub, plan, iam, user, cloudConsent } = repos;
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
}
