import { eq } from "drizzle-orm";
import { getSqliteDb } from "@infra/db/sqlite";
import { subscriptions } from "@infra/db/schema";
import type { SubscriptionRepository } from "@ruxt/core/repos/subscription.repo";
import { Subscription, SubscriptionId } from "@ruxt/core/domain/subscription/subscription";

export class SqliteSubscriptionRepo implements SubscriptionRepository {
   private get db() {
      return getSqliteDb();
   }

   async findById(id: SubscriptionId): Promise<Subscription | null> {
      const row = this.db
         .select()
         .from(subscriptions)
         .where(eq(subscriptions.id, id.value))
         .get();

      if (!row) return null;
      return Subscription.fromJSON(rowToJson(row));
   }

   async save(sub: Subscription): Promise<void> {
      const json = sub.toJSON();
      this.db
         .insert(subscriptions)
         .values(jsonToRow(json))
         .onConflictDoUpdate({
            target: subscriptions.id,
            set: jsonToRow(json),
         })
         .run();
   }

   async delete(id: SubscriptionId): Promise<void> {
      this.db.delete(subscriptions).where(eq(subscriptions.id, id.value)).run();
   }

   async findByUser(userId: string): Promise<Subscription[]> {
      const rows = this.db
         .select()
         .from(subscriptions)
         .where(eq(subscriptions.userId, userId))
         .all();

      return rows.map((row) => Subscription.fromJSON(rowToJson(row)));
   }
}

type Row = typeof subscriptions.$inferSelect;
type Json = ReturnType<Subscription["toJSON"]>;

function rowToJson(row: Row): Json {
   return {
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      status: row.status as Json["status"],
      startedAt: row.startedAt,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      trialEndsAt: row.trialEndsAt ?? null,
      cancelledAt: row.cancelledAt ?? null,
      pausedAt: row.pausedAt ?? null,
      nextIntervalPlanId: row.nextIntervalPlanId ?? null,
   };
}

function jsonToRow(json: Json): typeof subscriptions.$inferInsert {
   return {
      id: json.id,
      userId: json.userId,
      planId: json.planId,
      status: json.status,
      startedAt: json.startedAt,
      currentPeriodStart: json.currentPeriodStart,
      currentPeriodEnd: json.currentPeriodEnd,
      trialEndsAt: json.trialEndsAt ?? null,
      cancelledAt: json.cancelledAt ?? null,
      pausedAt: json.pausedAt ?? null,
      nextIntervalPlanId: json.nextIntervalPlanId ?? null,
   };
}
