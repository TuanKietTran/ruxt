import { afterAll, describe, expect, it, vi } from "vitest";
import { clerkFetcher, clerkTestSecret, createClerkTestUser, deleteClerkTestUser, grantAdminRole, type ClerkTestUser } from "../helpers/clerk-e2e";

/**
 * Subscription, plan and IAM routes against a real server and real Clerk session tokens (no mocks).
 * Skipped unless SMOKE_BASE_URL points at a local server and a Clerk dev secret is available
 * (see tests/helpers/clerk-e2e.ts). A skipped run establishes no coverage.
 */
const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("These tests create Clerk users and plans and need a local server");
const secret = clerkTestSecret();
const suite = base && secret ? describe : describe.skip;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 30_000 });

const users: ClerkTestUser[] = [];
afterAll(async () => { await Promise.all(users.map(user => deleteClerkTestUser(secret!, user))); });

const anonymous = async (path: string, init: { method?: string; body?: unknown } = {}) => {
   const response = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
   });
   return { status: response.status, json: await response.json().catch(() => null) };
};

const planBody = (name: string, extra: object = {}) => ({ name, description: "e2e", provider: "e2e", amountMinor: 500, currency: "USD", billingPeriod: "monthly", features: [], ...extra });

suite("commercial APIs enforce the session", () => {
   it("refuses anonymous callers everywhere except the public catalog and the read-only demo", async () => {
      expect((await anonymous("/api/subscriptions", { method: "POST", body: { userId: "demo", planId: "p" } })).status).toBe(401);
      expect((await anonymous("/api/subscriptions?userId=someone")).status).toBe(401);
      expect((await anonymous("/api/subscriptions/abc")).status).toBe(401);
      expect((await anonymous("/api/subscriptions/abc/cancel", { method: "POST" })).status).toBe(401);
      expect((await anonymous("/api/subscriptions/abc", { method: "DELETE" })).status).toBe(401);
      expect((await anonymous("/api/plans/abc", { method: "PUT", body: planBody("x") })).status).toBe(401);
      expect((await anonymous("/api/plans/abc", { method: "DELETE" })).status).toBe(401);
      expect((await anonymous("/api/plans?all=true")).status).toBe(401);
      expect((await anonymous("/api/plans?userId=someone")).status).toBe(401);
      expect((await anonymous("/api/iam/subjects/x", { method: "PUT", body: { tier: "enterprise" } })).status).toBe(401);
      expect((await anonymous("/api/iam/subjects/x")).status).toBe(401);
      expect((await anonymous("/api/iam/subjects/x", { method: "DELETE" })).status).toBe(401);
      expect((await anonymous("/api/iam/check-access", { method: "POST", body: { userId: "x" } })).status).toBe(401);

      const catalog = await anonymous("/api/plans");
      expect(catalog.status).toBe(200);
      expect(catalog.json.plans.every((plan: { source: string }) => plan.source !== "user")).toBe(true);
      expect((await anonymous("/api/subscriptions?userId=demo")).status).toBe(200);
   });

   it("keeps one account's plans and subscriptions invisible and untouchable to another", async () => {
      const alice = await createClerkTestUser(secret!, "alice"); users.push(alice);
      const bob = await createClerkTestUser(secret!, "bob"); users.push(bob);
      const asAlice = clerkFetcher(secret!, base!, alice);
      const asBob = clerkFetcher(secret!, base!, bob);
      const planId = crypto.randomUUID();

      // Alice may try to publish to the shared catalog; the server stores a private plan she owns.
      const created = await asAlice(`/api/plans/${planId}`, { method: "PUT", body: planBody("Alice only", { source: "catalog", isPublic: true, createdBy: "someone-else" }) });
      expect(created.status).toBe(200);
      const stored = await asAlice(`/api/plans/${planId}`);
      expect(stored.json).toMatchObject({ source: "user", isPublic: false, createdBy: alice.ownerId });
      expect((await anonymous("/api/plans")).json.plans.some((plan: { id: string }) => plan.id === planId)).toBe(false);
      expect((await asAlice("/api/plans?all=true")).json.plans.some((plan: { id: string }) => plan.id === planId)).toBe(true);
      expect((await asBob("/api/plans?all=true")).json.plans.some((plan: { id: string }) => plan.id === planId)).toBe(false);
      expect((await asBob(`/api/plans/${planId}`)).status).toBe(404);
      expect((await asBob(`/api/plans/${planId}`, { method: "PUT", body: planBody("Bob takes over") })).status).toBe(404);
      expect((await asBob(`/api/plans/${planId}`, { method: "DELETE" })).status).toBe(404);
      expect((await asBob(`/api/plans?userId=${encodeURIComponent(alice.ownerId)}`)).status).toBe(403);

      // Subscriptions: created for the caller whatever userId the body names.
      expect((await asBob("/api/subscriptions", { method: "POST", body: { planId, billingPeriod: "monthly" } })).status).toBe(404);
      expect((await asAlice("/api/subscriptions", { method: "POST", body: { userId: bob.ownerId, planId, billingPeriod: "monthly" } })).status).toBe(403);
      const subscription = await asAlice("/api/subscriptions", { method: "POST", body: { planId, billingPeriod: "monthly" } });
      expect(subscription.status).toBe(201);
      const subscriptionId = subscription.json.subscriptionId ?? subscription.json.id;
      expect(subscriptionId).toBeTruthy();

      expect((await asAlice(`/api/subscriptions?userId=${encodeURIComponent(alice.ownerId)}`)).json.subscriptions).toHaveLength(1);
      expect((await asBob(`/api/subscriptions?userId=${encodeURIComponent(alice.ownerId)}`)).status).toBe(403);
      expect((await asBob(`/api/subscriptions?userId=${encodeURIComponent(bob.ownerId)}`)).json.subscriptions).toHaveLength(0);
      expect((await asBob(`/api/subscriptions/${subscriptionId}`)).status).toBe(404);
      for (const action of ["cancel", "pause", "resume", "renew"]) {
         expect((await asBob(`/api/subscriptions/${subscriptionId}/${action}`, { method: "POST" })).status).toBe(404);
      }
      expect((await asBob(`/api/subscriptions/${subscriptionId}/plan-change`, { method: "PUT", body: { newPlanId: planId } })).status).toBe(404);
      expect((await asBob(`/api/subscriptions/${subscriptionId}`, { method: "DELETE" })).status).toBe(404);
      expect((await asAlice(`/api/subscriptions/${subscriptionId}`)).json).toMatchObject({ userId: alice.ownerId, planId });
      expect((await asAlice(`/api/subscriptions/${subscriptionId}/cancel`, { method: "POST" })).status).toBe(200);
      expect((await asAlice(`/api/subscriptions/${subscriptionId}`, { method: "DELETE" })).status).toBe(200);
      expect((await asAlice(`/api/plans/${planId}`, { method: "DELETE" })).status).toBe(200);
   });

   it("lets only an administrator write IAM subjects, publish catalog plans, or act for another account", async () => {
      const member = await createClerkTestUser(secret!, "member"); users.push(member);
      const admin = await createClerkTestUser(secret!, "admin"); users.push(admin);
      await grantAdminRole(secret!, admin);
      const asMember = clerkFetcher(secret!, base!, member);
      const asAdmin = clerkFetcher(secret!, base!, admin);

      // A member cannot grant themselves a tier or read other subjects.
      expect((await asMember(`/api/iam/subjects/${encodeURIComponent(member.ownerId)}`, { method: "PUT", body: { tier: "enterprise" } })).status).toBe(403);
      expect((await asMember(`/api/iam/subjects/${encodeURIComponent(member.ownerId)}`, { method: "DELETE" })).status).toBe(403);
      expect((await asMember(`/api/iam/subjects/${encodeURIComponent(admin.ownerId)}`)).status).toBe(403);
      const check = { action: "subscription:read", resourceType: "subscription", resourceId: "r1", ownerUserId: member.ownerId };
      expect((await asMember("/api/iam/check-access", { method: "POST", body: { ...check, userId: admin.ownerId } })).status).toBe(403);
      // Without a subject record the domain answers "not found"; with one, a member can ask about themselves.
      expect((await asMember("/api/iam/check-access", { method: "POST", body: check })).status).toBe(404);
      expect((await asAdmin(`/api/iam/subjects/${encodeURIComponent(member.ownerId)}`, { method: "PUT", body: { tier: "free" } })).status).toBe(200);
      expect((await asMember("/api/iam/check-access", { method: "POST", body: check })).status).toBe(200);
      expect((await asMember(`/api/iam/subjects/${encodeURIComponent(member.ownerId)}`)).json.tier).toBe("free");
      expect((await asAdmin(`/api/iam/subjects/${encodeURIComponent(member.ownerId)}`, { method: "DELETE" })).status).toBe(200);

      const subject = `e2e-subject-${Date.now()}`;
      expect((await asAdmin(`/api/iam/subjects/${subject}`, { method: "PUT", body: { tier: "pro" } })).status).toBe(200);
      expect((await asAdmin(`/api/iam/subjects/${subject}`)).json.tier).toBe("pro");
      expect((await asAdmin(`/api/iam/subjects/${subject}`, { method: "DELETE" })).status).toBe(200);

      // An administrator can publish a catalog plan; it then appears in the public catalog for everyone.
      const planId = crypto.randomUUID();
      expect((await asAdmin(`/api/plans/${planId}`, { method: "PUT", body: planBody("Catalog e2e", { source: "catalog", isPublic: true }) })).status).toBe(200);
      expect((await anonymous("/api/plans")).json.plans.some((plan: { id: string }) => plan.id === planId)).toBe(true);
      expect((await asMember(`/api/plans/${planId}`, { method: "DELETE" })).status).toBe(404);
      expect((await asMember(`/api/plans/${planId}`)).status).toBe(200);
      expect((await asAdmin(`/api/plans/${planId}`, { method: "DELETE" })).status).toBe(200);
      expect((await anonymous("/api/plans")).json.plans.some((plan: { id: string }) => plan.id === planId)).toBe(false);
   });
});
