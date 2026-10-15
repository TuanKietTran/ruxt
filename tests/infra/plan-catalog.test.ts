import { describe, expect, it } from "vitest";
import { Plan, PlanId } from "@core/domain/catalog";
import type { PlanRepository } from "@core/repos/plan.repo";
import { CATALOG_PLAN_ID, createCatalogPlan, initializeCatalog } from "@infra/plan-catalog";

class InMemoryPlanRepo implements PlanRepository {
   private plans = new Map<string, Plan>();
   saves = 0;

   constructor(seed: Plan[] = []) {
      for (const plan of seed) this.plans.set(plan.id.value, plan);
   }

   async findById(id: PlanId): Promise<Plan | null> { return this.plans.get(id.value) ?? null; }
   async findAll(): Promise<Plan[]> { return [...this.plans.values()]; }
   async findPublic(): Promise<Plan[]> { return [...this.plans.values()].filter(plan => plan.isPublic); }
   async findByUser(userId: string): Promise<Plan[]> { return [...this.plans.values()].filter(plan => plan.createdBy === userId); }
   async save(plan: Plan): Promise<void> { this.saves++; this.plans.set(plan.id.value, plan); }
   async delete(id: PlanId): Promise<void> { this.plans.delete(id.value); }
}

describe("catalog plan initialization", () => {
   it("seeds one public catalog plan and is idempotent", async () => {
      const repo = new InMemoryPlanRepo();

      await initializeCatalog(repo);
      await initializeCatalog(repo);

      expect(repo.saves).toBe(1);
      const plans = await repo.findPublic();
      expect(plans).toHaveLength(1);
      expect(plans[0].toJSON()).toMatchObject({ id: CATALOG_PLAN_ID, source: "catalog", isPublic: true });
   });

   it("does not replace an existing plan with the catalog id", async () => {
      const existing = Plan.create({
         ...createCatalogPlan().toJSON(),
         name: "Existing plan",
      });
      const repo = new InMemoryPlanRepo([existing]);

      await initializeCatalog(repo);

      expect(repo.saves).toBe(0);
      expect((await repo.findById(existing.id))?.name).toBe("Existing plan");
   });
});
