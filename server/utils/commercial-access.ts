import type { H3Event } from "h3";
import { clerkClient } from "@clerk/nuxt/server";
import { useMediator } from "@ruxt/shared/cqrs";
import { getPlanQuery } from "@ruxt/core/handlers/get-plan";
import { getSubscriptionQuery } from "@ruxt/core/handlers/get-subscription";
import { getAuthPrincipal, type AuthPrincipal } from "./auth-user";

/**
 * Authorization for the subscription ledger, plan catalog and IAM subjects.
 *
 * The domain handlers take caller-supplied ids, so the route boundary is where an id is tied to the
 * verified session: a caller can only reach their own subscriptions and plans, and only an
 * administrator (Clerk private metadata `role: "admin"`, the same server-managed role ruxt-admin uses)
 * can touch other owners' records, the public catalog or IAM subjects.
 */

/** The shared, read-only sample subject behind /d?userId=demo. Nobody can write to it. */
export const DEMO_SUBJECT = "demo";

interface PlanView { id: string; createdBy: string | null; isPublic: boolean; source: string }
interface SubscriptionView { id: string; userId: string; planId: string }

/** Clerk's server-managed role. Private metadata cannot be written by the user it describes. */
export function hasAdminRole(user: { privateMetadata?: unknown }): boolean {
   const metadata = user.privateMetadata;
   return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
      && Object.prototype.hasOwnProperty.call(metadata, "role")
      && (metadata as Record<string, unknown>).role === "admin";
}

const adminChecks = new WeakMap<H3Event, Promise<boolean>>();

/** True when the signed-in Clerk account is an administrator. Re-checked per request, never cached across requests. */
export function isAdmin(event: H3Event, principal: AuthPrincipal | null): Promise<boolean> {
   if (!principal || principal.provider !== "clerk") return Promise.resolve(false);
   let check = adminChecks.get(event);
   if (!check) {
      check = (async () => {
         try {
            const user = await clerkClient(event as Parameters<typeof clerkClient>[0]).users.getUser(principal.providerUserId);
            return hasAdminRole(user);
         } catch {
            throw createError({ statusCode: 503, statusMessage: "Unable to verify administrator access" });
         }
      })();
      adminChecks.set(event, check);
   }
   return check;
}

export async function requirePrincipal(event: H3Event): Promise<AuthPrincipal> {
   const principal = await getAuthPrincipal(event);
   if (!principal) throw createError({ statusCode: 401, statusMessage: "Authentication required" });
   return principal;
}

export async function requireAdminPrincipal(event: H3Event): Promise<AuthPrincipal> {
   const principal = await requirePrincipal(event);
   if (!(await isAdmin(event, principal))) throw createError({ statusCode: 403, statusMessage: "Administrator access required" });
   return principal;
}

/**
 * Resolve which subject a request acts on. Callers act as themselves; an administrator may name
 * another subject. Anonymous callers get nothing (reads of the demo subject are handled separately).
 */
export async function resolveSubject(event: H3Event, requested: unknown): Promise<{ principal: AuthPrincipal; userId: string; admin: boolean }> {
   const principal = await requirePrincipal(event);
   if (requested === undefined || requested === null || requested === "" || requested === principal.ownerId) {
      return { principal, userId: principal.ownerId, admin: false };
   }
   if (typeof requested !== "string") throw createError({ statusCode: 400, statusMessage: "userId must be a string" });
   if (!(await isAdmin(event, principal))) throw createError({ statusCode: 403, statusMessage: "You can only act on your own account" });
   return { principal, userId: requested, admin: true };
}

async function lookup<T>(request: Parameters<ReturnType<typeof useMediator>["send"]>[0]): Promise<T | null> {
   try {
      return await useMediator().send<T>(request);
   } catch (error) {
      if (/not found/i.test(error instanceof Error ? error.message : "")) return null;
      throw error;
   }
}

/**
 * Load a subscription the caller owns (or any, for an administrator). A subscription that exists but
 * belongs to someone else answers exactly like a missing one, so ids cannot be probed.
 */
export async function requireOwnedSubscription(event: H3Event, subscriptionId: string): Promise<{ principal: AuthPrincipal; subscription: SubscriptionView }> {
   const principal = await requirePrincipal(event);
   const subscription = await lookup<SubscriptionView>(getSubscriptionQuery({ subscriptionId }));
   const notFound = createError({ statusCode: 404, statusMessage: `Subscription not found: ${subscriptionId}`, data: { code: "NOT_FOUND" } });
   if (!subscription) throw notFound;
   if (subscription.userId !== principal.ownerId && !(await isAdmin(event, principal))) throw notFound;
   return { principal, subscription };
}

/** A plan is visible when it is public or the caller created it. Administrators see every plan. */
export async function planVisibleTo(event: H3Event, plan: PlanView, principal: AuthPrincipal | null): Promise<boolean> {
   // Catalog plans are shared; a plan someone made for themselves is theirs alone, whatever flag it carries.
   if (plan.isPublic && plan.source !== "user") return true;
   if (!principal) return false;
   if (plan.createdBy === principal.ownerId) return true;
   return isAdmin(event, principal);
}

export async function loadPlan(planId: string): Promise<PlanView | null> {
   return lookup<PlanView>(getPlanQuery({ planId }));
}

/** A plan the caller may subscribe to: public catalog plans and their own plans. */
export async function requireVisiblePlan(event: H3Event, planId: unknown, principal: AuthPrincipal): Promise<PlanView> {
   if (typeof planId !== "string" || !planId) throw createError({ statusCode: 400, statusMessage: "planId is required" });
   const plan = await loadPlan(planId);
   if (!plan || !(await planVisibleTo(event, plan, principal))) {
      throw createError({ statusCode: 404, statusMessage: `Plan not found: ${planId}`, data: { code: "NOT_FOUND" } });
   }
   return plan;
}
