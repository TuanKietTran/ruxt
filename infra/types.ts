import type { SubscriptionRepository } from "@core/repos/subscription.repo";
import type { PlanRepository } from "@core/repos/plan.repo";
import type { IamSubjectRepository } from "@core/repos/iam.repo";
import type { UserRepository } from "@core/repos/user.repo";
import type { CloudConsentRepository } from "@core/repos/cloud-consent.repo";
import type { UserPreferencesRepository } from "@core/repos/user-preferences.repo";

export interface Repos {
   sub: SubscriptionRepository;
   plan: PlanRepository;
   iam: IamSubjectRepository;
   user: UserRepository;
   cloudConsent: CloudConsentRepository;
   preferences: UserPreferencesRepository;
}
