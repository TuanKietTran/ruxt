import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Plan } from "@ruxt/core/domain/catalog";
import { Money } from "@ruxt/core/domain/subscription/money";
import { BillingCycle } from "@ruxt/core/domain/subscription/billing-cycle";
import { Subscription } from "@ruxt/core/domain/subscription/subscription";
import { Instant } from "@ruxt/core/domain/datetime/instant";
import { UserId } from "@ruxt/core/domain/iam/user-id";
import { D1CloudConsentRepo, D1IamRepo, D1PlanRepo, D1SubscriptionRepo, D1UserPreferencesRepo, D1UserRepo } from "../../infra/deploy/cloudflare/repository-adapters";
import { createBindings, globalEnv, migrationStatements } from "./miniflare";

let mf: ReturnType<typeof createBindings>;
let db: Awaited<ReturnType<ReturnType<typeof createBindings>["getD1Database"]>>;

beforeAll(async () => {
   mf = createBindings();
   db = await mf.getD1Database("RUXT_DB");
   await db.batch(migrationStatements().map(sql => db.prepare(sql)));
   globalEnv.__env__ = { RUXT_DB: db };
});
afterAll(async () => {
   delete globalEnv.__env__;
   await mf.dispose();
});
beforeEach(async () => {
   const tables = ["subscriptions", "plans", "users", "iam_subjects", "cloud_consent_states", "cloud_consent_events", "user_preferences"];
   await db.batch(tables.map(t => db.prepare(`DELETE FROM ${t}`)));
});

const from = Instant.fromISO("2026-01-01T00:00:00.000Z");
const plan = (id: string, over: Record<string, unknown> = {}) => Plan.create({
   id, name: id, description: "plan", price: Money.of(2500, "USD"), billingCycle: BillingCycle.MONTHLY,
   source: "catalog", isPublic: true, features: ["export"], ...over,
} as any);

describe("D1 repositories on workerd", () => {
   it("applies the checked-in migration", async () => {
      const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>();
      expect(results.map(r => r.name)).toEqual(["cloud_consent_events", "cloud_consent_states", "iam_subjects", "plans", "subscriptions", "user_preferences", "users"]);
   });

   it("users: save, upsert by id and lookup by email/id", async () => {
      const repo = new D1UserRepo();
      const user = { id: "u1", email: "a@example.test", passwordHash: "h1", createdAt: "2026-01-01T00:00:00.000Z" };
      await repo.save(user);
      expect(await repo.findByEmail(user.email)).toEqual(user);
      await repo.save({ ...user, email: "b@example.test", passwordHash: "h2" });
      expect(await repo.findById("u1")).toEqual({ ...user, email: "b@example.test", passwordHash: "h2" });
      expect(await repo.findByEmail(user.email)).toBeNull();
      expect(await repo.findById("missing")).toBeNull();
   });

   it("users: email is unique across ids", async () => {
      const repo = new D1UserRepo();
      await repo.save({ id: "u1", email: "dup@example.test", passwordHash: "h", createdAt: "2026-01-01T00:00:00.000Z" });
      await expect(repo.save({ id: "u2", email: "dup@example.test", passwordHash: "h", createdAt: "2026-01-01T00:00:00.000Z" })).rejects.toThrow();
   });

   it("iam subjects: upsert, null org, service account flag, delete", async () => {
      const repo = new D1IamRepo();
      const subject = { userId: "u1", orgId: "org_1", tier: "pro" as const, isServiceAccount: false };
      await repo.save(subject);
      expect(await repo.findByUserId(UserId.of("u1"))).toEqual(subject);
      const updated = { userId: "u1", orgId: null, tier: "free" as const, isServiceAccount: true };
      await repo.save(updated as any);
      expect(await repo.findByUserId(UserId.of("u1"))).toEqual(updated);
      await repo.delete(UserId.of("u1"));
      expect(await repo.findByUserId(UserId.of("u1"))).toBeNull();
   });

   it("plans: upsert, findAll, findPublic, findByUser, delete", async () => {
      const repo = new D1PlanRepo();
      const pub = plan("plan_pub");
      const priv = plan("plan_priv", { isPublic: false });
      const mine = plan("plan_mine", { source: "user", createdBy: "owner_1", isPublic: false });
      for (const p of [pub, priv, mine]) await repo.save(p);
      expect((await repo.findById(pub.id))?.toJSON()).toEqual(pub.toJSON());
      expect((await repo.findAll()).map(p => p.id.value).sort()).toEqual(["plan_mine", "plan_priv", "plan_pub"]);
      expect((await repo.findPublic()).map(p => p.id.value)).toEqual(["plan_pub"]);
      expect((await repo.findByUser("owner_1")).map(p => p.id.value)).toEqual(["plan_mine"]);
      expect(await repo.findByUser("other")).toEqual([]);

      const renamed = plan("plan_pub", { name: "Renamed", features: ["a", "b"], price: Money.of(990, "EUR") });
      await repo.save(renamed);
      expect((await repo.findById(pub.id))?.toJSON()).toEqual(renamed.toJSON());
      expect(await repo.findAll()).toHaveLength(3);
      await repo.delete(pub.id);
      expect(await repo.findById(pub.id)).toBeNull();
   });

   it("subscriptions: round trip, upsert, findByUser, delete", async () => {
      const repo = new D1SubscriptionRepo();
      const make = (id: string, userId: string) => Subscription.create({ id, userId, planId: "plan_1", startAt: from, periodEnd: from.plusDays(30) });
      const s1 = make("sub_1", "user_1");
      await repo.save(s1);
      await repo.save(make("sub_2", "user_1"));
      await repo.save(make("sub_3", "user_2"));
      expect((await repo.findById(s1.id))?.toJSON()).toEqual(s1.toJSON());
      expect((await repo.findByUser("user_1")).map(s => s.id.value).sort()).toEqual(["sub_1", "sub_2"]);

      const changed = Subscription.fromJSON({ ...s1.toJSON(), status: "cancelled", cancelledAt: from.plusDays(1).toISO() } as any);
      await repo.save(changed);
      expect((await repo.findById(s1.id))?.toJSON()).toEqual(changed.toJSON());
      expect(await repo.findByUser("user_1")).toHaveLength(2);

      await repo.delete(s1.id);
      expect(await repo.findById(s1.id)).toBeNull();
      expect(await repo.findByUser("nobody")).toEqual([]);
   });

   it("cloud consent: upsert projection per category, append-only events ordered by time", async () => {
      const repo = new D1CloudConsentRepo();
      const state = (granted: boolean, changedAt: string, category = "cloudSessions") => ({ ownerId: "o1", category: category as any, granted, policyVersion: "v1", changedAt });
      const event = (id: string, s: ReturnType<typeof state>) => ({ ...s, id, actorUserId: "o1" });

      const first = state(true, "2026-01-01T00:00:00.000Z");
      const second = state(false, "2026-01-02T00:00:00.000Z");
      const other = state(true, "2026-01-03T00:00:00.000Z", "cloudCv");
      await repo.saveChange(first, event("e1", first));
      await repo.saveChange(other, event("e3", other));
      await repo.saveChange(second, event("e2", second));

      const current = await repo.listCurrent("o1");
      expect(current).toHaveLength(2);
      expect(current).toContainEqual(second);
      expect(current).toContainEqual(other);
      expect((await repo.listEvents("o1")).map(e => e.id)).toEqual(["e1", "e2", "e3"]);
      expect(await repo.listCurrent("o2")).toEqual([]);
      expect(await repo.listEvents("o2")).toEqual([]);
   });

   it("cloud consent: failed event insert rolls back the projection (transactional batch)", async () => {
      const repo = new D1CloudConsentRepo();
      const s = { ownerId: "o1", category: "cloudSessions" as const, granted: true, policyVersion: "v1", changedAt: "2026-01-01T00:00:00.000Z" };
      await repo.saveChange(s, { ...s, id: "dup", actorUserId: "o1" });
      const changed = { ...s, granted: false, changedAt: "2026-01-02T00:00:00.000Z" };
      await expect(repo.saveChange(changed, { ...changed, id: "dup", actorUserId: "o1" })).rejects.toThrow();
      expect(await repo.listCurrent("o1")).toEqual([s]);
      expect(await repo.listEvents("o1")).toHaveLength(1);
   });

   it("user preferences: upsert, miss and corrupt JSON fall back safely", async () => {
      const repo = new D1UserPreferencesRepo();
      expect(await repo.get("o1")).toBeNull();
      const record = { ownerId: "o1", preferences: { profileSaveMode: "manual" as const }, updatedAt: "2026-01-01T00:00:00.000Z" } as any;
      await repo.save(record);
      expect(await repo.get("o1")).toEqual(record);
      const next = { ...record, preferences: { profileSaveMode: "auto" as const }, updatedAt: "2026-01-02T00:00:00.000Z" } as any;
      await repo.save(next);
      expect((await repo.get("o1"))?.updatedAt).toBe(next.updatedAt);
      expect(await db.prepare("SELECT COUNT(*) AS n FROM user_preferences").first<{ n: number }>()).toEqual({ n: 1 });

      await db.prepare("UPDATE user_preferences SET preferences='{not json' WHERE owner_id='o1'").run();
      const corrupt = await repo.get("o1");
      expect(corrupt?.ownerId).toBe("o1");
      expect(corrupt?.preferences).toBeTypeOf("object");
   });
});
