import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Plan } from "@ruxt/core/domain/catalog";
import { Money } from "@ruxt/core/domain/subscription/money";
import { BillingCycle } from "@ruxt/core/domain/subscription/billing-cycle";
import { Subscription } from "@ruxt/core/domain/subscription/subscription";
import { Instant } from "@ruxt/core/domain/datetime/instant";
import type { D1Database, D1PreparedStatement, D1Result } from "../../infra/deploy/cloudflare/d1";
import { D1CloudConsentRepo, D1IamRepo, D1PlanRepo, D1SubscriptionRepo, D1UserPreferencesRepo, D1UserRepo } from "../../infra/deploy/cloudflare/repository-adapters";
import { UserId } from "@ruxt/core/domain/iam/user-id";

const requireFromInfra = createRequire(resolve(process.cwd(), "infra/package.json"));
const Database = requireFromInfra("better-sqlite3");
const globalEnv = globalThis as typeof globalThis & { __env__?: Record<string, unknown> };

class LocalStatement implements D1PreparedStatement {
   private args: unknown[] = [];
   constructor(private readonly database: any, private readonly sql: string) {}
   bind(...values: unknown[]) { this.args = values; return this; }
   async first<T>() { return (this.database.prepare(this.sql).get(...this.args) as T | undefined) ?? null; }
   async all<T>() { return { success: true, results: this.database.prepare(this.sql).all(...this.args) as T[] }; }
   async run() { this.database.prepare(this.sql).run(...this.args); return { success: true }; }
}

class LocalD1 implements D1Database {
   constructor(readonly database: any) {}
   prepare(sql: string) { return new LocalStatement(this.database, sql); }
   async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const transaction = this.database.transaction(() => statements.map((statement: any) => {
         statement.database.prepare(statement.sql).run(...statement.args);
         return { success: true };
      }));
      return transaction() as D1Result<T>[];
   }
}

let sqlite: any;
afterEach(() => {
   delete globalEnv.__env__;
   sqlite?.close();
   sqlite = undefined;
});

function setup() {
   sqlite = new Database(":memory:");
   sqlite.exec(readFileSync(new URL("../../infra/deploy/cloudflare/migrations/0001_init.sql", import.meta.url), "utf8"));
   globalEnv.__env__ = { RUXT_DB: new LocalD1(sqlite) };
}

describe("Cloudflare D1 repository parity contract", () => {
   it("round-trips subscriptions and removes them", async () => {
      setup();
      const repo = new D1SubscriptionRepo();
      const from = Instant.fromISO("2026-01-01T00:00:00.000Z");
      const sub = Subscription.create({ id: "sub_1", userId: "user_1", planId: "plan_1", startAt: from, periodEnd: from.plusDays(30) });
      await repo.save(sub);
      expect((await repo.findById(sub.id))?.toJSON()).toEqual(sub.toJSON());
      expect((await repo.findByUser("user_1")).map(x => x.id.value)).toEqual(["sub_1"]);
      await repo.delete(sub.id);
      expect(await repo.findById(sub.id)).toBeNull();
   });

   it("supports plan public/user indexes and updates", async () => {
      setup();
      const repo = new D1PlanRepo();
      const plan = Plan.create({ id: "plan_1", name: "Pro", description: "plan", price: Money.of(2500, "USD"), billingCycle: BillingCycle.MONTHLY, source: "user", createdBy: "owner_1", isPublic: true, features: ["export"] });
      await repo.save(plan);
      expect((await repo.findById(plan.id))?.toJSON()).toEqual(plan.toJSON());
      expect((await repo.findAll()).length).toBe(1);
      expect((await repo.findPublic()).map(x => x.id.value)).toEqual(["plan_1"]);
      expect((await repo.findByUser("owner_1")).map(x => x.id.value)).toEqual(["plan_1"]);
      await repo.delete(plan.id);
      expect(await repo.findAll()).toEqual([]);
   });

   it("round-trips IAM, users and preferences", async () => {
      setup();
      const iam = new D1IamRepo();
      const subject = { userId: "owner_1", orgId: "org_1", tier: "pro" as const, isServiceAccount: false };
      await iam.save(subject);
      expect(await iam.findByUserId(UserId.of("owner_1"))).toEqual(subject);
      await iam.delete(UserId.of("owner_1"));
      expect(await iam.findByUserId(UserId.of("owner_1"))).toBeNull();

      const users = new D1UserRepo();
      const user = { id: "owner_1", email: "owner@example.test", passwordHash: "hash", createdAt: "2026-01-01T00:00:00.000Z" };
      await users.save(user);
      expect(await users.findByEmail(user.email)).toEqual(user);
      expect(await users.findById(user.id)).toEqual(user);

      const preferences = new D1UserPreferencesRepo();
      const record = { ownerId: "owner_1", preferences: { profileSaveMode: "manual" as const }, updatedAt: "2026-01-01T00:00:00.000Z" } as any;
      await preferences.save(record);
      expect(await preferences.get(record.ownerId)).toEqual(record);
   });

   it("updates consent projection and writes audit events atomically", async () => {
      setup();
      const repo = new D1CloudConsentRepo();
      const state = { ownerId: "owner_1", category: "cloudSessions" as const, granted: true, policyVersion: "v1", changedAt: "2026-01-01T00:00:00.000Z" };
      const event = { ...state, id: "event_1", actorUserId: "owner_1" };
      await repo.saveChange(state, event);
      expect(await repo.listCurrent(state.ownerId)).toEqual([state]);
      expect(await repo.listEvents(state.ownerId)).toEqual([event]);
   });
});
