import { getKv } from "@infra/kv";
import { Plan, PlanId } from "@ruxt/core/domain/catalog";
import type { PlanRepository } from "@ruxt/core/repos/plan.repo";

// key schema:
//   ["plan", id]      → Plan JSON
//   ["plan_public", id] → "" (public index)

export class DenoKvPlanRepo implements PlanRepository {
   async findById(id: PlanId): Promise<Plan | null> {
      const kv = await getKv();
      const entry = await kv.get<ReturnType<Plan["toJSON"]>>([
         "plan",
         id.value,
      ]);
      if (entry.value === null) return null;
      return Plan.fromJSON(entry.value);
   }

   async findAll(): Promise<Plan[]> {
      const kv = await getKv();
      const results: Plan[] = [];
      for await (const entry of kv.list<ReturnType<Plan["toJSON"]>>({
         prefix: ["plan"],
      })) {
         // skip index keys (value is "")
         if (typeof entry.value === "string") continue;
         results.push(Plan.fromJSON(entry.value));
      }
      return results;
   }

   async findPublic(): Promise<Plan[]> {
      const kv = await getKv();
      const results: Plan[] = [];
      for await (const entry of kv.list<string>({ prefix: ["plan_public"] })) {
         const id = entry.key[1] as string;
         const planEntry = await kv.get<ReturnType<Plan["toJSON"]>>([
            "plan",
            id,
         ]);
         if (planEntry.value !== null)
            results.push(Plan.fromJSON(planEntry.value));
      }
      return results;
   }

   async findByUser(userId: string): Promise<Plan[]> {
      const kv = await getKv();
      const results: Plan[] = [];
      for await (const entry of kv.list<string>({ prefix: ["plan_user", userId] })) {
         const id = entry.key[2] as string;
         const planEntry = await kv.get<ReturnType<Plan["toJSON"]>>(["plan", id]);
         if (planEntry.value !== null) results.push(Plan.fromJSON(planEntry.value));
      }
      return results;
   }

   async save(plan: Plan): Promise<void> {
      const kv = await getKv();
      const op = kv.atomic().set(["plan", plan.id.value], plan.toJSON());
      if (plan.isPublic) {
         op.set(["plan_public", plan.id.value], "");
      } else {
         op.delete(["plan_public", plan.id.value]);
      }
      if (plan.isUserPlan && plan.createdBy) {
         op.set(["plan_user", plan.createdBy, plan.id.value], "");
      }
      await op.commit();
   }

   async delete(id: PlanId): Promise<void> {
      const kv = await getKv();
      const entry = await kv.get<ReturnType<Plan["toJSON"]>>(["plan", id.value]);
      const op = kv.atomic()
         .delete(["plan", id.value])
         .delete(["plan_public", id.value]);
      if (entry.value?.createdBy) {
         op.delete(["plan_user", entry.value.createdBy, id.value]);
      }
      await op.commit();
   }
}
