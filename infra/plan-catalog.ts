import { Plan } from "@core/domain/catalog";
import { BillingCycle } from "@core/domain/subscription/billing-cycle";
import { Money } from "@core/domain/subscription/money";
import { PlanId } from "@core/domain/catalog/plan-id";
import type { PlanRepository } from "@core/repos/plan.repo";

export const CATALOG_PLAN_ID = "catalog-pro";

export function createCatalogPlan(): Plan {
   return Plan.create({
      id: CATALOG_PLAN_ID,
      name: "Pro",
      description: "Professional CV workspace",
      provider: "Ruxt",
      source: "catalog",
      price: Money.of(1900, "USD"),
      billingCycle: BillingCycle.MONTHLY,
      features: ["automation:read", "automation:write", "automation:profile"],
      isPublic: true,
   });
}

/** Ensure the built-in catalog is available without replacing persisted data. */
export async function initializeCatalog(repo: PlanRepository): Promise<void> {
   const id = PlanId.of(CATALOG_PLAN_ID);
   if ((await repo.findById(id)) === null) await repo.save(createCatalogPlan());
}
