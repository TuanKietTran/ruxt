import { eq, and } from "drizzle-orm";
import { getSqliteDb } from "@infra/db/sqlite";
import { plans } from "@infra/db/schema";
import { Plan, PlanId } from "@ruxt/core/domain/catalog";
import type { PlanRepository } from "@ruxt/core/repos/plan.repo";

export class SqlitePlanRepo implements PlanRepository {
   private get db() { return getSqliteDb(); }

   async findById(id: PlanId): Promise<Plan | null> {
      const row = this.db.select().from(plans).where(eq(plans.id, id.value)).get();
      if (!row) return null;
      return Plan.fromJSON(rowToJson(row));
   }

   async findAll(): Promise<Plan[]> {
      return this.db.select().from(plans).all().map(r => Plan.fromJSON(rowToJson(r)));
   }

   async findPublic(): Promise<Plan[]> {
      return this.db.select().from(plans).where(eq(plans.isPublic, true)).all()
         .map(r => Plan.fromJSON(rowToJson(r)));
   }

   async findByUser(userId: string): Promise<Plan[]> {
      return this.db.select().from(plans)
         .where(and(eq(plans.source, "user"), eq(plans.createdBy, userId)))
         .all().map(r => Plan.fromJSON(rowToJson(r)));
   }

   async save(plan: Plan): Promise<void> {
      const row = jsonToRow(plan.toJSON());
      this.db.insert(plans).values(row).onConflictDoUpdate({ target: plans.id, set: row }).run();
   }

   async delete(id: PlanId): Promise<void> {
      this.db.delete(plans).where(eq(plans.id, id.value)).run();
   }
}

type Row = typeof plans.$inferSelect;
type Json = ReturnType<Plan["toJSON"]>;

function rowToJson(row: Row): Json {
   return {
      id: row.id,
      name: row.name,
      description: row.description,
      provider: row.provider,
      source: (row.source ?? "catalog") as Json["source"],
      createdBy: row.createdBy ?? null,
      price: { amountMinor: row.amountMinor, currency: row.currency as Json["price"]["currency"] },
      billingCycle: row.billingCycle as Json["billingCycle"],
      trialDays: row.trialDays ?? null,
      features: JSON.parse(row.features) as string[],
      isPublic: row.isPublic,
   };
}

function jsonToRow(json: Json): typeof plans.$inferInsert {
   return {
      id: json.id,
      name: json.name,
      description: json.description,
      provider: json.provider,
      source: json.source,
      createdBy: json.createdBy ?? null,
      amountMinor: json.price.amountMinor,
      currency: json.price.currency,
      billingCycle: json.billingCycle,
      trialDays: json.trialDays ?? null,
      features: JSON.stringify(json.features),
      isPublic: json.isPublic,
   };
}
