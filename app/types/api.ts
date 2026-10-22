// Exact serialized DTO vocabulary returned by the plans/subscriptions HTTP APIs.
export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD" | "SGD" | "VND";
export type BillingPeriod = "weekly" | "monthly" | "quarterly" | "biannual" | "yearly";
export type StatusCode = "trialing" | "active" | "past_due" | "paused" | "cancelled" | "expired";

export interface MoneyProps {
   amountMinor: number;
   currency: CurrencyCode;
}

// Narrow views of the CV import HTTP payloads consumed by the browser UI.
// State transitions and import-policy models remain private to the server/core.
export interface CvImportJobResponse {
   id: string;
   state: string;
   stage: string;
   progress: number;
   attempt: number;
   warnings: string[];
   error?: { code: string; message: string };
}

export interface CvImportPreviewResponse {
   markdown: string;
}

export interface CvPipelineCapabilitiesResponse {
   available: boolean;
   maxUploadBytes: number;
   degradedReason?: string;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface UIPlan {
   id: string
   name: string
   description: string
   provider: string
   source: "user" | "catalog"
   createdBy: string | null
   price: MoneyProps          // same shape Money.toJSON() emits
   billingCycle: BillingPeriod
   trialDays: number | null
   features: string[]
   isPublic: boolean
}

// ── Subscription ──────────────────────────────────────────────────────────────

export interface UISubscription {
   id: string
   userId: string
   planId: string
   status: StatusCode         // same union SubscriptionStatus enforces
   startedAt: string          // ISO-8601
   currentPeriodStart: string
   currentPeriodEnd: string
   trialEndsAt: string | null
   cancelledAt: string | null
   pausedAt: string | null
   nextIntervalPlanId: string | null
}

// ── API response envelopes ────────────────────────────────────────────────────

export interface PlansResponse {
   plans: UIPlan[]
}

export interface SubscriptionsResponse {
   subscriptions: UISubscription[]
}
