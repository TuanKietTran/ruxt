import type { H3Event } from "h3";
import { getSubscriptionQuery } from "@core/handlers/get-subscription";
import type { GetSubscriptionOutput } from "@core/handlers/get-subscription";
import { useMediator } from "@core/cqrs";

export type AuthProvider = "clerk" | "legacy";

export interface AuthPrincipal {
   ownerId: string;
   provider: AuthProvider;
   providerUserId: string;
}

/** Namespace broker ids so they can never collide with legacy UUID owners. */
export function clerkOwnerId(clerkUserId: string): string {
   if (!clerkUserId) throw new Error("Clerk user id is required");
   return `clerk:${clerkUserId}`;
}

export async function getAuthPrincipal(event: H3Event): Promise<AuthPrincipal | null> {
   const clerkAuth = event.context.auth ? await event.context.auth() : null;
   if (clerkAuth?.userId) {
      return {
         ownerId: clerkOwnerId(clerkAuth.userId),
         provider: "clerk",
         providerUserId: clerkAuth.userId,
      };
   }

   const session = await getAuthSession(event);
   const legacyUserId = session.data?.userId;
   return legacyUserId
      ? { ownerId: legacyUserId, provider: "legacy", providerUserId: legacyUserId }
      : null;
}

export async function requireAuthUser(event: H3Event): Promise<string> {
   const principal = await getAuthPrincipal(event);
   if (!principal) throw createError({ statusCode: 401, statusMessage: "Authentication required" });
   return principal.ownerId;
}

export async function requireOwnedSubscription(
   event: H3Event,
   mediator: ReturnType<typeof useMediator>,
   subscriptionId: string,
): Promise<GetSubscriptionOutput> {
   const ownerId = await requireAuthUser(event);
   const subscription = await sendApiRequest<GetSubscriptionOutput>(mediator, getSubscriptionQuery({ subscriptionId }));
   if (subscription.userId !== ownerId) {
      throw createError({ statusCode: 404, message: "Subscription not found" });
   }
   return subscription;
}

export type AutomationCapability = "read" | "write" | "profile";

export interface AutomationEntitlements {
   planId: string | null;
   planName: string;
   status: string;
   capabilities: AutomationCapability[];
   monthlyQuota: number;
   used: number;
   remaining: number;
   metering: "monthly";
}

const FREE_AUTOMATION = { planId: null, planName: "Free", status: "none", capabilities: ["read"] as AutomationCapability[], monthlyQuota: 25 };
const usageMonth = () => new Date().toISOString().slice(0, 7);

/** Plan features are provider-neutral: automation:read|write|profile and automation:quota=N. */
export function parseAutomationFeatures(features: string[]) {
   const capabilities = features.filter((f) => f.startsWith("automation:") && ["read", "write", "profile"].includes(f.slice(11)))
      .map((f) => f.slice(11) as AutomationCapability);
   const quotaFeature = features.find((f) => f.startsWith("automation:quota="));
   const parsedQuota = quotaFeature ? Number(quotaFeature.slice(17)) : 25;
   return { capabilities: capabilities.length ? capabilities : ["read" as AutomationCapability], monthlyQuota: Number.isFinite(parsedQuota) && parsedQuota >= 0 ? Math.floor(parsedQuota) : 25 };
}

export async function getAutomationEntitlements(ownerId: string): Promise<AutomationEntitlements> {
   const { useMediator } = await import("@core/cqrs");
   const { listPlansQuery } = await import("@core/handlers/list-plans");
   const { listSubscriptionsQuery } = await import("@core/handlers/list-subscriptions");
   const [plans, subscriptions] = await Promise.all([
      useMediator().send(listPlansQuery({ publicOnly: false })) as Promise<{ plans: Array<{ id: string; name: string; features: string[] }> }>,
      useMediator().send(listSubscriptionsQuery({ userId: ownerId })) as Promise<{ subscriptions: Array<{ planId: string; status: string }> }>,
   ]);
   const active = subscriptions.subscriptions.find((s) => s.status === "active" || s.status === "trialing");
   const plan = active && plans.plans.find((p: { id: string; name: string; features: string[] }) => p.id === active.planId);
   const { capabilities, monthlyQuota } = parseAutomationFeatures(plan?.features ?? []);
   const storage = useStorage("analytics");
   const used = (await storage.getItem<number>(`automation-usage:${ownerId}:${usageMonth()}`)) ?? 0;
   return { ...(plan ? { planId: plan.id, planName: plan.name, status: active!.status, capabilities, monthlyQuota } : FREE_AUTOMATION), used, remaining: Math.max(0, (plan ? monthlyQuota : FREE_AUTOMATION.monthlyQuota) - used), metering: "monthly" };
}

export async function assertAutomationAccess(ownerId: string, capability: AutomationCapability, requestId?: string) {
   const entitlements = await getAutomationEntitlements(ownerId);
   const storage = useStorage("analytics");
   const alreadyCounted = requestId && await storage.getItem<boolean>(`automation-request:${ownerId}:${usageMonth()}:${requestId}`);
   if (!entitlements.capabilities.includes(capability)) throw new Error(`The ${entitlements.planName} plan does not allow automation:${capability}.`);
   if (!alreadyCounted && entitlements.remaining < 1) throw new Error(`Monthly automation quota exhausted for the ${entitlements.planName} plan.`);
   return entitlements;
}

/** Meter successful calls only; request ids make client retries idempotent. */
export async function meterAutomation(ownerId: string, requestId: string) {
   const storage = useStorage("analytics");
   const requestKey = `automation-request:${ownerId}:${usageMonth()}:${requestId}`;
   if (await storage.getItem<boolean>(requestKey)) return;
   const countKey = `automation-usage:${ownerId}:${usageMonth()}`;
   const used = (await storage.getItem<number>(countKey)) ?? 0;
   await storage.setItem(requestKey, true);
   await storage.setItem(countKey, used + 1);
}
