import type { Repos } from "@infra/types";
import type { CloudRetentionConfiguration } from "@ruxt/core/domain/cloud-data/retention";
import type { CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";
import { useMediator } from "@ruxt/shared/cqrs";
import { ScryptHasher } from "@infra/crypto/scrypt-hasher";
import { registerRegisterUser } from "@ruxt/core/handlers/register-user";
import { registerLoginUser } from "@ruxt/core/handlers/login-user";
import { registerGetUser } from "@ruxt/core/handlers/get-user";
import { createGetCloudDataConsentHandler } from "@ruxt/core/handlers/get-cloud-data-consent";
import { registerAcknowledgeCloudRetention } from "@ruxt/core/handlers/acknowledge-cloud-retention";
import { registerSetCloudDataConsent } from "@ruxt/core/handlers/set-cloud-data-consent";
import { registerGetUserPreferences } from "@ruxt/core/handlers/get-user-preferences";
import { registerSetUserPreferences } from "@ruxt/core/handlers/set-user-preferences";
import "@infra/deploy/index";
import { resolveStrategy } from "@infra/deploy/strategy";

export interface InfraOptions {
   /** Deployment-configured retention; null keeps cloud consent and session copies fail-closed. */
   retentionConfiguration?: () => CloudRetentionConfiguration | null;
}

let active: Repos | undefined;

export async function bootstrap(options: InfraOptions = {}): Promise<void> {
   const strategy = await resolveStrategy();
   active = strategy.buildRepos();
   registerAll(active, options);
   console.log(`🚀 infra ready — ${strategy.label}`);
}

/** The selected strategy's cloud-copy repository, or null where cloud sync has no durable adapter. */
export function cloudCopyRepository(): CloudCopySyncRepository | null {
   return active?.cloudCopies ?? null;
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

export function registerAll(repos: Repos, options: InfraOptions = {}): void {
   const { sub, plan, iam, user, cloudConsent, preferences } = repos;
   const retentionConfiguration = options.retentionConfiguration ?? (() => null);
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

   useMediator().registerQuery(createGetCloudDataConsentHandler(cloudConsent, retentionConfiguration));
   registerSetCloudDataConsent(cloudConsent, { retentionConfiguration });
   registerAcknowledgeCloudRetention(cloudConsent, { retentionConfiguration });
   registerGetUserPreferences(preferences);
   registerSetUserPreferences(preferences);
}
