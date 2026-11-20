import type { SubscriptionRepository } from "@ruxt/core/repos/subscription.repo";
import type { PlanRepository } from "@ruxt/core/repos/plan.repo";
import type { IamSubjectRepository } from "@ruxt/core/repos/iam.repo";
import type { UserRepository } from "@ruxt/core/repos/user.repo";
import type { CloudConsentRepository } from "@ruxt/core/repos/cloud-consent.repo";
import type { UserPreferencesRepository } from "@ruxt/core/repos/user-preferences.repo";
import type { CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";

export interface Repos {
   sub: SubscriptionRepository;
   plan: PlanRepository;
   iam: IamSubjectRepository;
   user: UserRepository;
   cloudConsent: CloudConsentRepository;
   preferences: UserPreferencesRepository;
   /** Durable owner-atomic cloud copies; absent where no adapter exists (cloud sync is then unavailable). */
   cloudCopies?: CloudCopySyncRepository;
}
