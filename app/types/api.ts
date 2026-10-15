import type { MoneyProps, BillingPeriod, StatusCode } from '@core/domain'

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

export interface AutomationEntitlements {
   planId: string | null
   planName: string
   status: string
   capabilities: ("read" | "write" | "profile")[]
   monthlyQuota: number
   used: number
   remaining: number
   metering: "monthly"
}

export interface SubscriptionsResponse {
   subscriptions: UISubscription[]
   entitlements?: AutomationEntitlements
}
